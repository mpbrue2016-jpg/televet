-- ==============================================================================
-- 0038_televet_ads_advertising_and_sponsorships.sql
-- FASE 17: TeleVet Ads - Publicidade e Patrocínios com Privacidade Absoluta
-- Planos Editáveis, Segmentação Ética, Deduplicação Anti-Fraude e Entrega Server-Side
-- ==============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Tabela: ad_plans (Planos de Publicidade - Editáveis pelo Admin Master)
-- PREÇOS E LIMITES DEFINIDOS NO BANCO, NUNCA FIXADOS NO CÓDIGO
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    price_cents INT NOT NULL DEFAULT 0, -- Definido pelo Admin Master
    billing_cycle VARCHAR(32) NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly', 'cpm', 'cpc')),
    max_active_campaigns INT NOT NULL DEFAULT 1,
    max_impressions_monthly INT, -- NULL = Ilimitado conforme orçamento
    allowed_scopes TEXT[] NOT NULL DEFAULT ARRAY['regional']::TEXT[],
    features JSONB NOT NULL DEFAULT '{
        "badge_patrocinado": true,
        "destaque_busca": false,
        "banner_topo": false,
        "mapa_destaque": false,
        "relatorios_avancados": false
    }'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger de updated_at
CREATE OR REPLACE TRIGGER trg_ad_plans_updated_at
BEFORE UPDATE ON public.ad_plans
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- Carga inicial configurável dos 5 planos do escopo
INSERT INTO public.ad_plans (slug, name, description, price_cents, billing_cycle, max_active_campaigns, max_impressions_monthly, allowed_scopes, features, display_order)
VALUES
    ('basico', 'Plano Básico', 'Cadastro institucional de prestador e página patrocinada no diretório.', 9900, 'monthly', 1, 10000, ARRAY['cidade', 'bairro']::TEXT[], '{"badge_patrocinado": true, "destaque_busca": false, "banner_topo": false, "mapa_destaque": false, "relatorios_avancados": false}'::jsonb, 1),
    ('regional', 'Plano Regional', 'Destaque regional na busca, pin prioritário no mapa e banner rotativo local.', 24900, 'monthly', 3, 50000, ARRAY['bairro', 'cidade', 'regiao']::TEXT[], '{"badge_patrocinado": true, "destaque_busca": true, "banner_topo": false, "mapa_destaque": true, "relatorios_avancados": false}'::jsonb, 2),
    ('estadual', 'Plano Estadual', 'Campanha estadual ampla com banner de topo e relatórios completos.', 59000, 'monthly', 5, 200000, ARRAY['bairro', 'cidade', 'regiao', 'estado']::TEXT[], '{"badge_patrocinado": true, "destaque_busca": true, "banner_topo": true, "mapa_destaque": true, "relatorios_avancados": true}'::jsonb, 3),
    ('nacional', 'Plano Nacional', 'Cobertura em todo o território nacional para marcas, laboratórios e redes.', 149000, 'monthly', 10, 1000000, ARRAY['bairro', 'cidade', 'regiao', 'estado', 'conjunto_estados', 'nacional']::TEXT[], '{"badge_patrocinado": true, "destaque_busca": true, "banner_topo": true, "mapa_destaque": true, "relatorios_avancados": true}'::jsonb, 4),
    ('premium', 'Plano Premium Enterprise', 'Recursos avançados com prioridade máxima de leilão, métricas em tempo real e assessoria.', 299000, 'monthly', 25, NULL, ARRAY['bairro', 'cidade', 'regiao', 'estado', 'conjunto_estados', 'nacional']::TEXT[], '{"badge_patrocinado": true, "destaque_busca": true, "banner_topo": true, "mapa_destaque": true, "relatorios_avancados": true, "suporte_dedicado": true}'::jsonb, 5)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    features = EXCLUDED.features,
    display_order = EXCLUDED.display_order,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 2. Tabela: advertisers (Empresas Anunciantes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.advertisers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    razao_social VARCHAR(255) NOT NULL,
    nome_fantasia VARCHAR(255) NOT NULL,
    cnpj VARCHAR(18),
    contact_name VARCHAR(128) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(32),
    contact_whatsapp VARCHAR(32),
    website_url TEXT,
    balance_cents BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending_verification')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advertisers_owner ON public.advertisers(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_advertisers_status ON public.advertisers(status);

CREATE OR REPLACE TRIGGER trg_advertisers_updated_at
BEFORE UPDATE ON public.advertisers
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Tabela: ad_campaigns (Campanhas com Segmentação Restrita)
-- SEGMENTAÇÃO LIMITADA EXCLUSIVAMENTE A REGIÃO, CATEGORIA E CONTEXTO DE PÁGINA
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advertiser_id UUID NOT NULL REFERENCES public.advertisers(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES public.ad_plans(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    campaign_type VARCHAR(64) NOT NULL DEFAULT 'banner' CHECK (campaign_type IN (
        'banner', 'destaque_busca', 'destaque_regional', 'estadual', 'nacional', 'pagina_patrocinada', 'campanha_categoria', 'campanha_localizacao'
    )),
    
    -- Segmentação Rígida Permitida
    scope VARCHAR(32) NOT NULL DEFAULT 'regional' CHECK (scope IN ('bairro', 'cidade', 'regiao', 'estado', 'conjunto_estados', 'nacional')),
    target_ufs TEXT[] DEFAULT ARRAY[]::TEXT[],
    target_cities TEXT[] DEFAULT ARRAY[]::TEXT[],
    target_neighborhoods TEXT[] DEFAULT ARRAY[]::TEXT[],
    target_categories TEXT[] DEFAULT ARRAY[]::TEXT[], -- Apenas categorias do diretório (ex: ambulancia, farmacia)
    target_context VARCHAR(64) NOT NULL DEFAULT 'geral' CHECK (target_context IN ('busca', 'diretorio', 'home', 'geral')),

    -- Período e Orçamento
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ,
    budget_cents BIGINT NOT NULL DEFAULT 0,
    daily_budget_cents BIGINT NOT NULL DEFAULT 0,
    spent_cents BIGINT NOT NULL DEFAULT 0,

    -- Status e Moderação
    status VARCHAR(32) NOT NULL DEFAULT 'rascunho' CHECK (status IN (
        'rascunho', 'aguardando_aprovacao', 'aprovado', 'ativo', 'pausado', 'rejeitado', 'expirado'
    )),
    payment_status VARCHAR(32) NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
    rejection_reason TEXT,
    moderated_by UUID REFERENCES public.users(id),
    moderated_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON public.ad_campaigns(status, payment_status);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_advertiser ON public.ad_campaigns(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_period ON public.ad_campaigns(starts_at, ends_at);

CREATE OR REPLACE TRIGGER trg_ad_campaigns_updated_at
BEFORE UPDATE ON public.ad_campaigns
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- Cláusula de Segurança: Impede a inserção de chaves de dados clínicos ou tutores
CREATE OR REPLACE FUNCTION public.fn_prevent_clinical_data_in_ads()
RETURNS TRIGGER AS $$
DECLARE
    v_forbidden_terms TEXT[] := ARRAY[
        'prontuario', 'prontuário', 'diagnostico', 'diagnóstico', 'doença', 'doenca',
        'sintoma', 'vacina', 'pet_id', 'raca', 'raça', 'especie', 'espécie', 'cpf_tutor'
    ];
    v_term TEXT;
    v_target TEXT;
BEGIN
    v_target := lower(NEW.name || ' ' || array_to_string(NEW.target_categories, ' '));
    FOREACH v_term IN ARRAY v_forbidden_terms LOOP
        IF v_target LIKE '%' || v_term || '%' THEN
            RAISE EXCEPTION 'VIOLAÇÃO DE PRIVACIDADE: O uso de dados clínicos, prontuários, vacinas, raças ou diagnósticos é estritamente proibido no TeleVet Ads.'
                USING ERRCODE = '22023';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_validate_ad_privacy
BEFORE INSERT OR UPDATE ON public.ad_campaigns
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_clinical_data_in_ads();

-- ---------------------------------------------------------------------------
-- 4. Tabela: ad_creatives (Criativos com Selo Não Removível)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_creatives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
    format VARCHAR(64) NOT NULL DEFAULT 'banner_horizontal' CHECK (format IN (
        'banner_horizontal', 'banner_vertical', 'banner_quadrado', 'card_destaque', 'pagina_patrocinada'
    )),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    image_url TEXT NOT NULL, -- Bucket ad-assets
    target_url TEXT NOT NULL,
    call_to_action VARCHAR(64) NOT NULL DEFAULT 'Saiba Mais',
    phone VARCHAR(32),
    whatsapp VARCHAR(32),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_creatives_campaign ON public.ad_creatives(campaign_id);

-- ---------------------------------------------------------------------------
-- 5. Tabela: ad_placements (Posições Oficiais de Anúncios)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_placements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_key VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    page_context VARCHAR(64) NOT NULL DEFAULT 'geral',
    allowed_formats TEXT[] NOT NULL DEFAULT ARRAY['banner_horizontal']::TEXT[],
    max_ads INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.ad_placements (slot_key, name, page_context, allowed_formats, max_ads)
VALUES
    ('diretorio_top_banner', 'Topo do Diretório Nacional', 'diretorio', ARRAY['banner_horizontal']::TEXT[], 1),
    ('diretorio_sidebar', 'Barra Lateral do Diretório', 'diretorio', ARRAY['banner_quadrado', 'card_destaque']::TEXT[], 2),
    ('busca_featured', 'Destaque no Topo da Busca', 'busca', ARRAY['card_destaque', 'banner_horizontal']::TEXT[], 1),
    ('home_featured', 'Destaque da Página Inicial', 'home', ARRAY['banner_horizontal', 'card_destaque']::TEXT[], 2)
ON CONFLICT (slot_key) DO UPDATE
SET name = EXCLUDED.name,
    page_context = EXCLUDED.page_context,
    allowed_formats = EXCLUDED.allowed_formats;

-- ---------------------------------------------------------------------------
-- 6. Tabela: ad_events (Eventos Particionados por Mês com Anti-Fraude e ZERO PII)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
    creative_id UUID REFERENCES public.ad_creatives(id) ON DELETE CASCADE,
    event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('impressao', 'visualizacao', 'clique', 'ligacao', 'whatsapp', 'como_chegar')),
    placement_key VARCHAR(64),
    session_hash VARCHAR(64), -- Hash com salt diário para deduplicação sem armazenar IP nem cookies (LGPD)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_date DATE NOT NULL DEFAULT CURRENT_DATE,
    event_month DATE NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::date
);

-- Índices otimizados por data e campanha
CREATE INDEX IF NOT EXISTS idx_ad_events_campaign_month ON public.ad_events(campaign_id, event_month);
CREATE INDEX IF NOT EXISTS idx_ad_events_dedup ON public.ad_events(campaign_id, event_type, session_hash, created_at);

-- ---------------------------------------------------------------------------
-- 7. Função Server-Side de Entrega de Anúncios: serve_ads()
-- LIMITES RÍGIDOS: NÃO LÊ NENHUMA TABELA CLÍNICA, PRONTUÁRIO, VACINA OU TUTOR!
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.serve_ads(
    p_placement VARCHAR(64),
    p_uf VARCHAR(2) DEFAULT NULL,
    p_cidade VARCHAR(128) DEFAULT NULL,
    p_bairro VARCHAR(128) DEFAULT NULL,
    p_categoria VARCHAR(64) DEFAULT NULL,
    p_limit INT DEFAULT 1
)
RETURNS TABLE (
    ad_id UUID,
    campaign_id UUID,
    creative_id UUID,
    advertiser_name VARCHAR(255),
    title VARCHAR(255),
    description TEXT,
    image_url TEXT,
    target_url TEXT,
    call_to_action VARCHAR(64),
    phone VARCHAR(32),
    whatsapp VARCHAR(32),
    format VARCHAR(64),
    badge_label VARCHAR(32) -- "PATROCINADO" ou "ANÚNCIO"
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Seleciona anúncios qualificados que respeitam estritamente status, orçamento e período
    RETURN QUERY
    WITH eligible_ads AS (
        SELECT 
            c.id AS camp_id,
            cr.id AS creat_id,
            adv.nome_fantasia AS adv_name,
            cr.title AS cr_title,
            cr.description AS cr_desc,
            cr.image_url AS cr_img,
            cr.target_url AS cr_url,
            cr.call_to_action AS cr_cta,
            cr.phone AS cr_phone,
            cr.whatsapp AS cr_wa,
            cr.format AS cr_format
        FROM public.ad_campaigns c
        JOIN public.advertisers adv ON adv.id = c.advertiser_id
        JOIN public.ad_creatives cr ON cr.campaign_id = c.id
        WHERE c.status = 'ativo'
          AND c.payment_status = 'paid'
          AND adv.status = 'active'
          AND cr.is_active = TRUE
          AND c.starts_at <= NOW()
          AND (c.ends_at IS NULL OR c.ends_at >= NOW())
          AND (c.budget_cents = 0 OR c.spent_cents < c.budget_cents)
          -- Segmentação Regional Permitida
          AND (
              c.scope = 'nacional'
              OR (c.scope = 'estado' AND (p_uf IS NULL OR upper(p_uf) = ANY(c.target_ufs)))
              OR (c.scope IN ('cidade', 'regional') AND (p_cidade IS NULL OR lower(p_cidade) = ANY(ARRAY(SELECT lower(x) FROM unnest(c.target_cities) x))))
              OR (c.scope = 'bairro' AND (p_bairro IS NULL OR lower(p_bairro) = ANY(ARRAY(SELECT lower(x) FROM unnest(c.target_neighborhoods) x))))
          )
          -- Segmentação por Categoria Permitida
          AND (
              array_length(c.target_categories, 1) IS NULL
              OR p_categoria IS NULL
              OR p_categoria = ANY(c.target_categories)
          )
        ORDER BY random()
        LIMIT p_limit
    )
    SELECT 
        e.creat_id AS ad_id,
        e.camp_id AS campaign_id,
        e.creat_id AS creative_id,
        e.adv_name AS advertiser_name,
        e.cr_title AS title,
        e.cr_desc AS description,
        e.cr_img AS image_url,
        e.cr_url AS target_url,
        e.cr_cta AS call_to_action,
        e.cr_phone AS phone,
        e.cr_wa AS whatsapp,
        e.cr_format AS format,
        'PATROCINADO'::VARCHAR(32) AS badge_label
    FROM eligible_ads e;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Registro de Eventos e Anti-Fraude com Deduplicação: record_ad_event()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_ad_event(
    p_campaign_id UUID,
    p_creative_id UUID,
    p_event_type VARCHAR(32),
    p_placement VARCHAR(64) DEFAULT NULL,
    p_session_hash VARCHAR(64) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_recent_event_count INT;
BEGIN
    -- Proteção Anti-Fraude e Deduplicação:
    -- Se o mesmo session_hash registrou o mesmo evento para a mesma campanha nos últimos 60 segundos, ignora
    IF p_session_hash IS NOT NULL THEN
        SELECT count(*) INTO v_recent_event_count
        FROM public.ad_events
        WHERE campaign_id = p_campaign_id
          AND event_type = p_event_type
          AND session_hash = p_session_hash
          AND created_at >= (NOW() - INTERVAL '60 seconds');

        IF v_recent_event_count > 0 THEN
            RETURN jsonb_build_object('success', true, 'deduplicated', true);
        END IF;
    END IF;

    -- Grava evento sem nenhuma PII
    INSERT INTO public.ad_events (
        campaign_id,
        creative_id,
        event_type,
        placement_key,
        session_hash,
        created_at,
        event_date,
        event_month
    ) VALUES (
        p_campaign_id,
        p_creative_id,
        p_event_type,
        p_placement,
        p_session_hash,
        NOW(),
        CURRENT_DATE,
        date_trunc('month', CURRENT_DATE)::date
    );

    -- Atualização de métrica de custo na campanha (CPC estimado: R$ 0,50 por clique)
    IF p_event_type IN ('clique', 'ligacao', 'whatsapp', 'como_chegar') THEN
        UPDATE public.ad_campaigns
        SET spent_cents = spent_cents + 50
        WHERE id = p_campaign_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'deduplicated', false);
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Moderação Administrativa de Campanhas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_moderate_campaign(
    p_campaign_id UUID,
    p_action VARCHAR(32), -- 'aprovar', 'rejeitar', 'pausar', 'ativar'
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin_id UUID;
    v_new_status VARCHAR(32);
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acesso negado: restrito ao Administrador Master.' USING ERRCODE = '42501';
    END IF;

    v_admin_id := auth.uid();

    IF p_action = 'aprovar' THEN
        v_new_status := 'ativo';
        UPDATE public.ad_campaigns
        SET status = 'ativo',
            moderated_by = v_admin_id,
            moderated_at = NOW(),
            rejection_reason = NULL,
            updated_at = NOW()
        WHERE id = p_campaign_id;

    ELSIF p_action = 'rejeitar' THEN
        v_new_status := 'rejeitado';
        UPDATE public.ad_campaigns
        SET status = 'rejeitado',
            moderated_by = v_admin_id,
            moderated_at = NOW(),
            rejection_reason = p_rejection_reason,
            updated_at = NOW()
        WHERE id = p_campaign_id;

    ELSIF p_action = 'pausar' THEN
        v_new_status := 'pausado';
        UPDATE public.ad_campaigns
        SET status = 'pausado',
            updated_at = NOW()
        WHERE id = p_campaign_id;

    ELSIF p_action = 'ativar' THEN
        v_new_status := 'ativo';
        UPDATE public.ad_campaigns
        SET status = 'ativo',
            updated_at = NOW()
        WHERE id = p_campaign_id;

    ELSE
        RAISE EXCEPTION 'Ação de moderação inválida: %', p_action USING ERRCODE = '22023';
    END IF;

    -- Auditoria
    INSERT INTO public.audit_logs (
        user_id,
        action,
        entity,
        entity_id,
        new_data
    ) VALUES (
        v_admin_id,
        'ADMIN_MODERATE_AD_CAMPAIGN',
        'ad_campaigns',
        p_campaign_id::text,
        jsonb_build_object('action', p_action, 'status', v_new_status, 'reason', p_rejection_reason)
    );

    RETURN jsonb_build_object('success', true, 'campaign_id', p_campaign_id, 'status', v_new_status);
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Políticas de Segurança (Row Level Security - RLS)
-- ---------------------------------------------------------------------------
ALTER TABLE public.ad_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertisers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_events ENABLE ROW LEVEL SECURITY;

-- 10.1 Planos: Leitura pública dos ativos; alteração exclusiva do Admin Master
CREATE POLICY policy_ad_plans_read ON public.ad_plans
FOR SELECT USING (is_active = TRUE OR public.is_admin());

CREATE POLICY policy_ad_plans_admin ON public.ad_plans
FOR ALL USING (public.is_admin());

-- 10.2 Anunciantes: Isolamento estrito por usuário
CREATE POLICY policy_advertisers_owner_select ON public.advertisers
FOR SELECT USING (owner_user_id = auth.uid() OR public.is_admin());

CREATE POLICY policy_advertisers_owner_manage ON public.advertisers
FOR ALL USING (owner_user_id = auth.uid() OR public.is_admin());

-- 10.3 Campanhas: Apenas o dono ou Admin acessa
CREATE POLICY policy_campaigns_owner ON public.ad_campaigns
FOR ALL USING (
    EXISTS (SELECT 1 FROM public.advertisers adv WHERE adv.id = ad_campaigns.advertiser_id AND (adv.owner_user_id = auth.uid() OR public.is_admin()))
);

-- 10.4 Criativos: Apenas o dono ou Admin acessa (servidos publicamente apenas via RPC serve_ads)
CREATE POLICY policy_creatives_owner ON public.ad_creatives
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.ad_campaigns c
        JOIN public.advertisers adv ON adv.id = c.advertiser_id
        WHERE c.id = ad_creatives.campaign_id AND (adv.owner_user_id = auth.uid() OR public.is_admin())
    )
);

-- 10.5 Placements: Leitura pública, edição admin
CREATE POLICY policy_placements_select ON public.ad_placements
FOR SELECT USING (is_active = TRUE OR public.is_admin());

CREATE POLICY policy_placements_admin ON public.ad_placements
FOR ALL USING (public.is_admin());

-- 10.6 Eventos: Inserção livre do motor; leitura restrita ao dono da campanha ou admin
CREATE POLICY policy_events_insert ON public.ad_events
FOR INSERT WITH CHECK (true);

CREATE POLICY policy_events_owner_read ON public.ad_events
FOR SELECT USING (
    public.is_admin() OR
    EXISTS (
        SELECT 1 FROM public.ad_campaigns c
        JOIN public.advertisers adv ON adv.id = c.advertiser_id
        WHERE c.id = ad_events.campaign_id AND adv.owner_user_id = auth.uid()
    )
);

COMMIT;
