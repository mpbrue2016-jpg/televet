-- =============================================================================
-- 0034_partners_whitelabel_saas.sql
-- Fase 13: Pet Shops Parceiros, White Label, QR Code de Balcão e Planos SaaS
--
-- Requisitos atendidos:
-- 1. Página individual de cada pet shop com logotipo, identidade visual e dados.
-- 2. Identificação do parceiro responsável pela indicação.
-- 3. QR Code e links de indicação rastreáveis (balcão físico).
-- 4. Associação da indicação ao agendamento e transação com trava anti-duplicação (UNIQUE).
-- 5. Painel do parceiro com métricas, consultas atribuídas e comissões calculadas.
-- 6. Planos de assinatura mensal e anual com desconto de fidelidade.
-- 7. Situação da assinatura, vencimento e histórico com flag sandbox_mode (sem cobrança real).
-- 8. Painel administrativo para gerenciar parceiros, planos e comissões (editáveis pelo admin).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Configurações Globais do Sistema de Parceiros (Editáveis pelo Admin)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    default_commission_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00 CHECK (default_commission_rate >= 0 AND default_commission_rate <= 100),
    attribution_window_days INTEGER NOT NULL DEFAULT 30 CHECK (attribution_window_days BETWEEN 1 AND 365),
    min_payout_cents INTEGER NOT NULL DEFAULT 5000 CHECK (min_payout_cents >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Inserir registro inicial se não existir
INSERT INTO public.partner_system_settings (default_commission_rate, attribution_window_days, min_payout_cents)
SELECT 10.00, 30, 5000
WHERE NOT EXISTS (SELECT 1 FROM public.partner_system_settings);

-- -----------------------------------------------------------------------------
-- 2. Customização White Label e Comissão na Tabela petshops
-- -----------------------------------------------------------------------------
ALTER TABLE public.petshops
    ADD COLUMN IF NOT EXISTS custom_commission_rate NUMERIC(5,2) CHECK (custom_commission_rate IS NULL OR (custom_commission_rate >= 0 AND custom_commission_rate <= 100)),
    ADD COLUMN IF NOT EXISTS brand_primary_color VARCHAR(32) DEFAULT '#2563EB',
    ADD COLUMN IF NOT EXISTS brand_secondary_color VARCHAR(32) DEFAULT '#1E40AF',
    ADD COLUMN IF NOT EXISTS custom_welcome_text TEXT,
    ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active';

-- -----------------------------------------------------------------------------
-- 3. Planos SaaS Anuais (Complemento à tabela saas_plans)
-- -----------------------------------------------------------------------------
INSERT INTO public.saas_plans (
    name, slug, description, price_cents, billing_interval,
    max_team_users, max_veterinarians, max_consultations_month,
    has_reports, has_marketing_tools, has_coupons, has_whatsapp_integration,
    has_custom_domain, has_white_label, has_api_access, support_level,
    is_active
) VALUES
(
    'Parceiro Básico (Anual - 20% OFF)', 'basico-anual',
    'Plano anual com desconto de fidelidade para pequenos pet shops', 191040, 'yearly',
    3, 2, 30,
    true, false, false, false,
    false, true, false, 'email_standard',
    true
),
(
    'Parceiro Profissional (Anual - 20% OFF)', 'profissional-anual',
    'Plano anual consolidado para pet shops com equipe, campanhas e marketing', 383040, 'yearly',
    10, 10, 150,
    true, true, true, true,
    false, true, false, 'priority',
    true
),
(
    'Parceiro Premium (Anual - 20% OFF)', 'premium-anual',
    'Plano anual corporativo com domínio próprio, White-Label completo e API', 671040, 'yearly',
    9999, 9999, 9999,
    true, true, true, true,
    true, true, true, 'dedicated_manager',
    true
)
ON CONFLICT (slug) DO UPDATE SET
    price_cents = EXCLUDED.price_cents,
    description = EXCLUDED.description,
    billing_interval = EXCLUDED.billing_interval;

-- -----------------------------------------------------------------------------
-- 4. Tabela de Assinaturas de Parceiros (com proteção Sandbox ativa)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    petshop_id UUID NOT NULL REFERENCES public.petshops(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES public.saas_plans(id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled')),
    billing_cycle VARCHAR(16) NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
    price_cents INTEGER NOT NULL DEFAULT 19900,
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    current_period_end TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + INTERVAL '30 days'),
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    sandbox_mode BOOLEAN NOT NULL DEFAULT true, -- Proteção estrita contra cobranças reais em produção
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_partner_subscription UNIQUE (petshop_id)
);

-- -----------------------------------------------------------------------------
-- 5. Atribuições de Indicação e Comissões (TRAVA ANTI-DUPLICAÇÃO)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_attributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    petshop_id UUID NOT NULL REFERENCES public.petshops(id) ON DELETE RESTRICT,
    referral_code VARCHAR(64) NOT NULL,
    tutor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    appointment_id UUID NOT NULL UNIQUE, -- Restrição UNIQUE que impossibilita matematicamente dupla comissão
    consultation_value_cents INTEGER NOT NULL CHECK (consultation_value_cents >= 0),
    commission_rate_applied NUMERIC(5,2) NOT NULL CHECK (commission_rate_applied >= 0 AND commission_rate_applied <= 100),
    commission_amount_cents INTEGER NOT NULL CHECK (commission_amount_cents >= 0),
    status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'paid', 'canceled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_partner_attributions_petshop ON public.partner_attributions(petshop_id);
CREATE INDEX IF NOT EXISTS idx_partner_attributions_appointment ON public.partner_attributions(appointment_id);
CREATE INDEX IF NOT EXISTS idx_partner_attributions_status ON public.partner_attributions(status);

-- -----------------------------------------------------------------------------
-- 6. RPC: fn_attribute_partner_commission (Atribuição e Comissionamento Seguro)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_attribute_partner_commission(
    p_appointment_id UUID,
    p_referral_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_petshop RECORD;
    v_appointment RECORD;
    v_settings RECORD;
    v_rate NUMERIC(5,2);
    v_consultation_cents INTEGER;
    v_commission_cents INTEGER;
    v_attribution_id UUID;
    v_cleaned_code TEXT;
BEGIN
    IF p_appointment_id IS NULL OR p_referral_code IS NULL OR trim(p_referral_code) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Parâmetros inválidos.');
    END IF;

    v_cleaned_code := trim(p_referral_code);

    -- 1. Anti-duplicação: rejeita se a consulta já recebeu comissão
    IF EXISTS (SELECT 1 FROM public.partner_attributions WHERE appointment_id = p_appointment_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ALREADY_ATTRIBUTED',
            'message', 'Consulta já comissionada anteriormente.'
        );
    END IF;

    -- 2. Localizar o parceiro pelo código de indicação, referral cadastrado ou slug
    SELECT p.id, p.tenant_id, p.name, p.custom_commission_rate, p.status
    INTO v_petshop
    FROM public.petshops p
    LEFT JOIN public.tenants t ON t.id = p.tenant_id
    LEFT JOIN public.referrals r ON r.referrer_id = p.id AND r.is_active = true
    WHERE (
        r.code = v_cleaned_code
        OR t.slug = v_cleaned_code
        OR lower(p.name) = lower(v_cleaned_code)
        OR p.phone = v_cleaned_code
        OR p.id::text = v_cleaned_code
    )
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'PARTNER_NOT_FOUND',
            'message', 'Código de parceiro inválido ou não encontrado.'
        );
    END IF;

    IF v_petshop.status != 'active' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'PARTNER_INACTIVE',
            'message', 'Parceiro encontra-se inativo ou suspenso.'
        );
    END IF;

    -- 3. Buscar a consulta no banco de dados para obter o valor real (zero confiança no cliente)
    SELECT id, tutor_id, COALESCE(price_cents, 15000) AS price_cents
    INTO v_appointment
    FROM public.appointments
    WHERE id = p_appointment_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'APPOINTMENT_NOT_FOUND',
            'message', 'Agendamento não encontrado.'
        );
    END IF;

    v_consultation_cents := v_appointment.price_cents;

    -- 4. Definir taxa: prioridade para taxa customizada do pet shop; fallback para taxa global admin
    SELECT * INTO v_settings FROM public.partner_system_settings LIMIT 1;
    v_rate := COALESCE(v_petshop.custom_commission_rate, v_settings.default_commission_rate, 10.00);

    -- 5. Calcular valor da comissão em centavos
    v_commission_cents := ROUND((v_consultation_cents * v_rate) / 100.0);

    -- 6. Persistir atribuição de forma atômica
    INSERT INTO public.partner_attributions (
        tenant_id,
        petshop_id,
        referral_code,
        tutor_id,
        appointment_id,
        consultation_value_cents,
        commission_rate_applied,
        commission_amount_cents,
        status,
        created_at
    ) VALUES (
        v_petshop.tenant_id,
        v_petshop.id,
        v_cleaned_code,
        v_appointment.tutor_id,
        p_appointment_id,
        v_consultation_cents,
        v_rate,
        v_commission_cents,
        'available',
        timezone('utc'::text, now())
    )
    RETURNING id INTO v_attribution_id;

    RETURN jsonb_build_object(
        'success', true,
        'attribution_id', v_attribution_id,
        'partner_id', v_petshop.id,
        'partner_name', v_petshop.name,
        'consultation_value_cents', v_consultation_cents,
        'commission_rate_applied', v_rate,
        'commission_amount_cents', v_commission_cents
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC: fn_get_partner_dashboard (Métricas e Extrato para o Painel do Parceiro)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_partner_dashboard(
    p_petshop_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_partner RECORD;
    v_sub RECORD;
    v_clicks_count INTEGER := 0;
    v_referred_tutors INTEGER := 0;
    v_completed_appointments INTEGER := 0;
    v_available_cents BIGINT := 0;
    v_pending_cents BIGINT := 0;
    v_paid_cents BIGINT := 0;
    v_history JSONB;
BEGIN
    SELECT p.id, p.name, COALESCE(t.slug, 'parceiro') as slug, p.custom_commission_rate, p.status
    INTO v_partner
    FROM public.petshops p
    LEFT JOIN public.tenants t ON t.id = p.tenant_id
    WHERE p.id = p_petshop_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Parceiro não encontrado.');
    END IF;

    -- Cliques em visitas rastreadas
    SELECT COALESCE(COUNT(*), 0) INTO v_clicks_count
    FROM public.partner_visits
    WHERE petshop_id = p_petshop_id;

    -- Tutores indicados
    SELECT COALESCE(COUNT(DISTINCT tutor_id), 0) INTO v_referred_tutors
    FROM public.partner_attributions
    WHERE petshop_id = p_petshop_id AND tutor_id IS NOT NULL;

    -- Consultas concluídas com comissão
    SELECT COALESCE(COUNT(*), 0) INTO v_completed_appointments
    FROM public.partner_attributions
    WHERE petshop_id = p_petshop_id;

    -- Saldos
    SELECT
        COALESCE(SUM(CASE WHEN status = 'available' THEN commission_amount_cents ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status = 'pending' THEN commission_amount_cents ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status = 'paid' THEN commission_amount_cents ELSE 0 END), 0)
    INTO v_available_cents, v_pending_cents, v_paid_cents
    FROM public.partner_attributions
    WHERE petshop_id = p_petshop_id;

    -- Assinatura atual
    SELECT s.status, s.billing_cycle, s.price_cents, s.current_period_end, s.sandbox_mode, COALESCE(p.name, 'Plano Parceiro') as plan_name
    INTO v_sub
    FROM public.partner_subscriptions s
    LEFT JOIN public.saas_plans p ON p.id = s.plan_id
    WHERE s.petshop_id = p_petshop_id;

    -- Extrato dos últimos 20 atendimentos
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', a.id,
            'created_at', a.created_at,
            'consultation_value_cents', a.consultation_value_cents,
            'commission_rate_applied', a.commission_rate_applied,
            'commission_amount_cents', a.commission_amount_cents,
            'status', a.status
        ) ORDER BY a.created_at DESC
    ) INTO v_history
    FROM (
        SELECT * FROM public.partner_attributions
        WHERE petshop_id = p_petshop_id
        ORDER BY created_at DESC
        LIMIT 20
    ) a;

    RETURN jsonb_build_object(
        'success', true,
        'partner', jsonb_build_object(
            'id', v_partner.id,
            'name', v_partner.name,
            'slug', v_partner.slug
        ),
        'metrics', jsonb_build_object(
            'clicks_count', v_clicks_count,
            'referred_tutors_count', v_referred_tutors,
            'completed_appointments_count', v_completed_appointments,
            'available_balance_cents', v_available_cents,
            'pending_balance_cents', v_pending_cents,
            'total_paid_cents', v_paid_cents
        ),
        'subscription', jsonb_build_object(
            'plan_name', COALESCE(v_sub.plan_name, 'Plano Básico Parceiro'),
            'billing_cycle', COALESCE(v_sub.billing_cycle, 'monthly'),
            'price_cents', COALESCE(v_sub.price_cents, 19900),
            'status', COALESCE(v_sub.status, 'active'),
            'current_period_end', COALESCE(v_sub.current_period_end, timezone('utc'::text, now()) + INTERVAL '30 days'),
            'sandbox_mode', COALESCE(v_sub.sandbox_mode, true)
        ),
        'history', COALESCE(v_history, '[]'::jsonb)
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. Funções de Gestão Administrativa
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_update_partner_system_settings(
    p_default_rate NUMERIC,
    p_window_days INTEGER,
    p_min_payout_cents INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.partner_system_settings
    SET default_commission_rate = p_default_rate,
        attribution_window_days = p_window_days,
        min_payout_cents = p_min_payout_cents,
        updated_at = timezone('utc'::text, now()),
        updated_by = auth.uid();

    RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_update_partner_custom_commission(
    p_petshop_id UUID,
    p_custom_rate NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.petshops
    SET custom_commission_rate = p_custom_rate
    WHERE id = p_petshop_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- -----------------------------------------------------------------------------
-- 9. Row Level Security (RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.partner_system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_attributions ENABLE ROW LEVEL SECURITY;

-- Configurações: leitura para autenticados, alteração por admin
CREATE POLICY policy_partner_settings_read ON public.partner_system_settings
    FOR SELECT TO authenticated USING (true);

-- Atribuições: parceiro visualiza apenas registros do seu petshop; admin vê tudo
CREATE POLICY policy_partner_attributions_read ON public.partner_attributions
    FOR SELECT TO authenticated
    USING (
        petshop_id IN (
            SELECT p.id FROM public.petshops p
            JOIN public.tenants t ON t.id = p.tenant_id
            WHERE t.owner_id = auth.uid() OR auth.uid() = p.tenant_id
        )
        OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.system_role = 'admin'
        )
    );

-- Assinaturas: parceiro lê a sua; admin lê tudo
CREATE POLICY policy_partner_subscriptions_read ON public.partner_subscriptions
    FOR SELECT TO authenticated
    USING (
        petshop_id IN (
            SELECT p.id FROM public.petshops p
            JOIN public.tenants t ON t.id = p.tenant_id
            WHERE t.owner_id = auth.uid() OR auth.uid() = p.tenant_id
        )
        OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.system_role = 'admin'
        )
    );

-- Grants revogados de anon/public e concedidos a authenticated
REVOKE ALL ON public.partner_system_settings FROM PUBLIC, anon;
REVOKE ALL ON public.partner_subscriptions FROM PUBLIC, anon;
REVOKE ALL ON public.partner_attributions FROM PUBLIC, anon;

GRANT SELECT ON public.partner_system_settings TO authenticated;
GRANT SELECT ON public.partner_subscriptions TO authenticated;
GRANT SELECT ON public.partner_attributions TO authenticated;

COMMIT;
