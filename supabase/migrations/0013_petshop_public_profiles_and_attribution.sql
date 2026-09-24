-- ==============================================================================
-- 0013_petshop_public_profiles_and_attribution.sql
-- Fase 3: Perfil Público do Pet Shop, White-Label, Subdomínios e Rastreamento
-- ==============================================================================

-- 1. Ampliação do Perfil do Pet Shop com dados visuais e comerciais
ALTER TABLE public.petshops
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS banner_url TEXT,
ADD COLUMN IF NOT EXISTS gallery_images JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(32),
ADD COLUMN IF NOT EXISTS business_hours JSONB NOT NULL DEFAULT '{
    "monday_friday": "08:00 - 19:00",
    "saturday": "08:00 - 18:00",
    "sunday": "Fechado"
}'::jsonb,
ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{
    "instagram": null,
    "facebook": null,
    "website": null
}'::jsonb,
ADD COLUMN IF NOT EXISTS commercial_info TEXT,
ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(255) UNIQUE;

-- 2. Tabela de Visitas e Rastreamento de Leads/Tutores (Partner Visits)
CREATE TABLE IF NOT EXISTS public.partner_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    petshop_id UUID NOT NULL REFERENCES public.petshops(id) ON DELETE CASCADE,
    session_token VARCHAR(128) NOT NULL,
    referral_code VARCHAR(64),
    source_url TEXT,
    ip_address INET,
    user_agent TEXT,
    converted_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_visits_tenant ON public.partner_visits(tenant_id);
CREATE INDEX IF NOT EXISTS idx_partner_visits_session ON public.partner_visits(session_token);

-- Habilita RLS na nova tabela
ALTER TABLE public.partner_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY policy_partner_visits_isolation ON public.partner_visits
FOR ALL USING (
    public.is_admin() OR tenant_id = public.current_tenant_id()
);

-- Permissão anônima para registrar visitas de rastreamento
CREATE POLICY policy_partner_visits_anon_insert ON public.partner_visits
FOR INSERT WITH CHECK (true);

-- 3. Função RPC para Obter Perfil Público do Pet Shop (Acesso Seguro sem autenticação)
-- Permite lookup por slug ou por custom_domain
CREATE OR REPLACE FUNCTION public.get_public_petshop_profile(p_identifier TEXT)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'tenant_id', t.id,
        'petshop_id', p.id,
        'slug', t.slug,
        'name', p.name,
        'trade_name', COALESCE(p.trade_name, p.name),
        'phone', p.phone,
        'whatsapp', p.whatsapp,
        'email', p.email,
        'address', p.address,
        'logo_url', COALESCE(p.logo_url, (t.white_label_config->>'logo_url')),
        'banner_url', p.banner_url,
        'gallery_images', p.gallery_images,
        'business_hours', p.business_hours,
        'social_links', p.social_links,
        'commercial_info', p.commercial_info,
        'white_label_config', t.white_label_config,
        'custom_domain', p.custom_domain,
        'referral_code', (
            SELECT code FROM public.referrals r 
            WHERE r.tenant_id = t.id AND r.referrer_id = p.id AND r.is_active = TRUE 
            LIMIT 1
        )
    ) INTO v_result
    FROM public.petshops p
    JOIN public.tenants t ON t.id = p.tenant_id
    WHERE (t.slug = p_identifier OR p.custom_domain = p_identifier)
      AND t.status = 'active'
      AND p.is_active = TRUE
    LIMIT 1;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Função RPC para Registrar Rastreamento e Atribuição Permanente
CREATE OR REPLACE FUNCTION public.track_partner_attribution(
    p_tenant_id UUID,
    p_petshop_id UUID,
    p_session_token VARCHAR(128),
    p_referral_code VARCHAR(64) DEFAULT NULL,
    p_source_url TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_visit_id UUID;
BEGIN
    INSERT INTO public.partner_visits (
        tenant_id,
        petshop_id,
        session_token,
        referral_code,
        source_url,
        ip_address,
        user_agent
    ) VALUES (
        p_tenant_id,
        p_petshop_id,
        p_session_token,
        p_referral_code,
        p_source_url,
        inet_client_addr(),
        p_user_agent
    ) RETURNING id INTO v_visit_id;

    -- Incrementa contador de scans de QR Code se for o caso
    IF p_referral_code IS NOT NULL THEN
        UPDATE public.qr_codes
        SET scans_count = scans_count + 1,
            last_scanned_at = NOW()
        WHERE tenant_id = p_tenant_id 
          AND petshop_id = p_petshop_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'visit_id', v_visit_id,
        'tenant_id', p_tenant_id,
        'petshop_id', p_petshop_id,
        'session_token', p_session_token
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Função RPC para Associar Tutor no Onboarding usando o Token de Sessão/Cookie
CREATE OR REPLACE FUNCTION public.bind_tutor_to_partner(
    p_user_id UUID,
    p_session_token VARCHAR(128)
)
RETURNS JSONB AS $$
DECLARE
    v_tenant_id UUID;
    v_petshop_id UUID;
    v_referral_code VARCHAR(64);
    v_referral_id UUID;
BEGIN
    -- Busca a visita mais recente vinculada ao token de sessão
    SELECT tenant_id, petshop_id, referral_code
    INTO v_tenant_id, v_petshop_id, v_referral_code
    FROM public.partner_visits
    WHERE session_token = p_session_token
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_tenant_id IS NULL THEN
        RETURN jsonb_build_object('bound', false, 'reason', 'Token de sessão não localizado.');
    END IF;

    -- Vincula o usuário ao tenant_users
    INSERT INTO public.tenant_users (tenant_id, user_id, role)
    VALUES (v_tenant_id, p_user_id, 'tutor')
    ON CONFLICT (tenant_id, user_id) DO NOTHING;

    -- Cria ou atualiza o tutor associando-o ao tenant do Pet Shop
    INSERT INTO public.tutors (tenant_id, user_id)
    VALUES (v_tenant_id, p_user_id)
    ON CONFLICT (tenant_id, user_id) DO NOTHING;

    -- Atualiza a visita com o ID do usuário convertido
    UPDATE public.partner_visits
    SET converted_user_id = p_user_id
    WHERE session_token = p_session_token;

    -- Se houver código de indicação, registra a atribuição de comissão futura
    IF v_referral_code IS NOT NULL THEN
        SELECT id INTO v_referral_id 
        FROM public.referrals 
        WHERE tenant_id = v_tenant_id AND code = v_referral_code;

        IF v_referral_id IS NOT NULL THEN
            INSERT INTO public.referral_attributions (
                tenant_id,
                referral_id,
                referred_user_id,
                status
            ) VALUES (
                v_tenant_id,
                v_referral_id,
                p_user_id,
                'attributed'
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'bound', true,
        'tenant_id', v_tenant_id,
        'petshop_id', v_petshop_id,
        'user_id', p_user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
