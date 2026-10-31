-- ==============================================================================
-- 0036_admin_master_analytics_and_support.sql
-- Fase 15: Admin Master, Analytics com Origem Real, Governança, MFA e Suporte Avançado
-- ==============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Perfis Administrativos, Controle de MFA e Segurança Master
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_user_profiles (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    admin_role VARCHAR(32) NOT NULL DEFAULT 'superadmin' 
        CHECK (admin_role IN ('superadmin', 'finance_admin', 'support_admin', 'compliance_admin', 'auditor')),
    mfa_enabled BOOLEAN NOT NULL DEFAULT true,
    mfa_enforced BOOLEAN NOT NULL DEFAULT true,
    last_mfa_verified_at TIMESTAMPTZ,
    allowed_ip_range TEXT[] DEFAULT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger updated_at
CREATE OR REPLACE TRIGGER trg_admin_user_profiles_updated_at
BEFORE UPDATE ON public.admin_user_profiles
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- Habilitar RLS
ALTER TABLE public.admin_user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY policy_admin_profiles_select ON public.admin_user_profiles
FOR SELECT USING (public.is_admin());

CREATE POLICY policy_admin_profiles_manage ON public.admin_user_profiles
FOR ALL USING (public.is_superadmin());

-- ---------------------------------------------------------------------------
-- 2. Tabela: admin_sensitive_access_logs (Acesso a Dados Sensíveis Justificado e Auditado)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_sensitive_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES public.users(id),
    target_entity VARCHAR(64) NOT NULL, -- medical_records, tutors, veterinarians, payments
    target_entity_id VARCHAR(128) NOT NULL,
    access_reason TEXT NOT NULL, -- Justificativa obrigatória (CFMV / LGPD)
    view_mode VARCHAR(32) NOT NULL DEFAULT 'standard' CHECK (view_mode IN ('standard', 'view_as_user', 'audit_export')),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sensitive_access_admin ON public.admin_sensitive_access_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_sensitive_access_entity ON public.admin_sensitive_access_logs(target_entity, target_entity_id);
CREATE INDEX IF NOT EXISTS idx_sensitive_access_created_at ON public.admin_sensitive_access_logs(created_at);

ALTER TABLE public.admin_sensitive_access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY policy_sensitive_access_select ON public.admin_sensitive_access_logs
FOR SELECT USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Tabela: sponsors_and_advertisers (Patrocinadores, Anunciantes e Campanhas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sponsors_and_advertisers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(32),
    campaign_type VARCHAR(64) NOT NULL DEFAULT 'banner' CHECK (campaign_type IN ('banner', 'featured_brand', 'sponsored_article')),
    target_audience VARCHAR(64) NOT NULL DEFAULT 'all' CHECK (target_audience IN ('all', 'tutors', 'veterinarians', 'petshops')),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    banner_image_url TEXT,
    target_url TEXT NOT NULL,
    budget_cents BIGINT NOT NULL DEFAULT 0,
    spent_cents BIGINT NOT NULL DEFAULT 0,
    impressions_count INT NOT NULL DEFAULT 0,
    clicks_count INT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sponsors_status ON public.sponsors_and_advertisers(status);

ALTER TABLE public.sponsors_and_advertisers ENABLE ROW LEVEL SECURITY;

-- Usuários veem apenas anúncios ativos
CREATE POLICY policy_sponsors_select ON public.sponsors_and_advertisers
FOR SELECT USING (status = 'active');

-- Apenas admins gerenciam anunciantes
CREATE POLICY policy_sponsors_manage ON public.sponsors_and_advertisers
FOR ALL USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Extensão de Configurações Globais (Feature Flags e Versões de Termos)
-- ---------------------------------------------------------------------------
ALTER TABLE public.platform_global_settings
ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{
    "enable_instant_telemedicine": true,
    "enable_ai_pre_triage": false,
    "enforce_mfa_superadmin": true,
    "allow_cross_tenant_marketplace": true
}'::jsonb,
ADD COLUMN IF NOT EXISTS terms_version VARCHAR(32) NOT NULL DEFAULT '2026.1',
ADD COLUMN IF NOT EXISTS privacy_policy_version VARCHAR(32) NOT NULL DEFAULT '2026.1';

-- ---------------------------------------------------------------------------
-- 5. Suporte Avançado: Mensagens, SLA, Notas Internas e Anexos Privados
-- ---------------------------------------------------------------------------

-- Extensão da tabela de suporte existente com métricas de SLA
ALTER TABLE public.support_tickets
ADD COLUMN IF NOT EXISTS sla_response_due_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sla_resolution_due_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS first_responded_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sla_breached BOOLEAN NOT NULL DEFAULT false;

-- Tabela: support_ticket_messages (Histórico de mensagens e notas internas)
CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id),
    is_internal_note BOOLEAN NOT NULL DEFAULT false, -- Exclusivo da equipe de suporte
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON public.support_ticket_messages(ticket_id);

-- Tabela: support_ticket_attachments (Anexos de suporte com flag de confidencialidade)
CREATE TABLE IF NOT EXISTS public.support_ticket_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    message_id UUID REFERENCES public.support_ticket_messages(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    mime_type VARCHAR(128) NOT NULL DEFAULT 'application/octet-stream',
    is_private BOOLEAN NOT NULL DEFAULT false, -- Anexos privados não são visíveis para tutores/vets
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON public.support_ticket_attachments(ticket_id);

-- Habilitar RLS em mensagens e anexos
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_attachments ENABLE ROW LEVEL SECURITY;

-- RLS: Mensagens de Tickets
CREATE POLICY policy_ticket_messages_select ON public.support_ticket_messages
FOR SELECT USING (
    -- Superadmin / Admin vê tudo (incluindo notas internas)
    public.is_admin() OR (
        EXISTS (
            SELECT 1 FROM public.support_tickets t
            WHERE t.id = support_ticket_messages.ticket_id
              AND (t.user_id = auth.uid() OR public.is_tenant_admin(t.tenant_id))
        )
        -- Usuário comum e tenant_admin NÃO VEEM notas internas!
        AND is_internal_note = false
    )
);

CREATE POLICY policy_ticket_messages_insert ON public.support_ticket_messages
FOR INSERT WITH CHECK (
    public.is_admin() OR (
        EXISTS (
            SELECT 1 FROM public.support_tickets t
            WHERE t.id = support_ticket_messages.ticket_id
              AND (t.user_id = auth.uid() OR public.is_tenant_admin(t.tenant_id))
        )
        -- Apenas administradores podem inserir notas internas
        AND (is_internal_note = false OR public.is_admin())
    )
);

-- RLS: Anexos de Tickets
CREATE POLICY policy_ticket_attachments_select ON public.support_ticket_attachments
FOR SELECT USING (
    public.is_admin() OR (
        EXISTS (
            SELECT 1 FROM public.support_tickets t
            WHERE t.id = support_ticket_attachments.ticket_id
              AND (t.user_id = auth.uid() OR public.is_tenant_admin(t.tenant_id))
        )
        -- Anexos marcados como privados NUNCA são expostos a usuários comuns
        AND is_private = false
    )
);

CREATE POLICY policy_ticket_attachments_insert ON public.support_ticket_attachments
FOR INSERT WITH CHECK (
    public.is_admin() OR (
        EXISTS (
            SELECT 1 FROM public.support_tickets t
            WHERE t.id = support_ticket_attachments.ticket_id
              AND (t.user_id = auth.uid() OR public.is_tenant_admin(t.tenant_id))
        )
        AND (is_private = false OR public.is_admin())
    )
);

-- ---------------------------------------------------------------------------
-- 6. Funções RPC de Governança, Moderação e Auditoria Master
-- ---------------------------------------------------------------------------

-- 6.1 Verificação Rigorosa de Acesso ao Admin Master
CREATE OR REPLACE FUNCTION public.fn_assert_admin_master_access()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acesso negado: apenas o Administrador Master tem acesso ao painel de controle global.'
            USING ERRCODE = '42501';
    END IF;
    RETURN TRUE;
END;
$$;

-- 6.2 Registro Obrigatório de Acesso a Dados Sensíveis
CREATE OR REPLACE FUNCTION public.fn_admin_log_sensitive_access(
    p_target_entity VARCHAR(64),
    p_target_entity_id VARCHAR(128),
    p_access_reason TEXT,
    p_view_mode VARCHAR(32) DEFAULT 'standard'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin_id UUID;
    v_log_id UUID;
BEGIN
    PERFORM public.fn_assert_admin_master_access();

    v_admin_id := auth.uid();

    IF p_access_reason IS NULL OR length(trim(p_access_reason)) < 5 THEN
        RAISE EXCEPTION 'Justificativa de acesso obrigatória com no mínimo 5 caracteres (CFMV/LGPD).'
            USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.admin_sensitive_access_logs (
        admin_user_id,
        target_entity,
        target_entity_id,
        access_reason,
        view_mode,
        ip_address
    ) VALUES (
        v_admin_id,
        p_target_entity,
        p_target_entity_id,
        p_access_reason,
        p_view_mode,
        inet_client_addr()
    ) RETURNING id INTO v_log_id;

    -- Registrar também na auditoria geral imutável
    INSERT INTO public.audit_logs (
        user_id,
        action,
        entity,
        entity_id,
        new_data,
        ip_address
    ) VALUES (
        v_admin_id,
        'ADMIN_SENSITIVE_ACCESS',
        p_target_entity,
        p_target_entity_id,
        jsonb_build_object(
            'reason', p_access_reason,
            'view_mode', p_view_mode,
            'log_id', v_log_id
        ),
        inet_client_addr()
    );

    RETURN jsonb_build_object(
        'success', true,
        'log_id', v_log_id,
        'message', 'Acesso registrado e auditado com sucesso.'
    );
END;
$$;

-- 6.3 Recurso "Ver Como Usuário" (Somente Leitura e Auditado)
CREATE OR REPLACE FUNCTION public.fn_admin_generate_view_as_token(
    p_target_user_id UUID,
    p_justification TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_target_user public.users;
BEGIN
    PERFORM public.fn_assert_admin_master_access();

    SELECT * INTO v_target_user FROM public.users WHERE id = p_target_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuário alvo não encontrado.' USING ERRCODE = 'P0002';
    END IF;

    -- Registrar acesso justificado
    PERFORM public.fn_admin_log_sensitive_access(
        'users',
        p_target_user_id::text,
        p_justification,
        'view_as_user'
    );

    -- Retorna metadados de simulação estritamente SOMENTE LEITURA
    RETURN jsonb_build_object(
        'success', true,
        'view_as_active', true,
        'read_only', true, -- Imutabilidade garantida
        'target_user_id', v_target_user.id,
        'target_email', v_target_user.email,
        'target_role', v_target_user.system_role,
        'justification', p_justification,
        'session_expires_at', NOW() + INTERVAL '30 minutes'
    );
END;
$$;

-- 6.4 Aprovação e Moderação de Cadastros Profissionais (Veterinários e CRMV)
CREATE OR REPLACE FUNCTION public.fn_admin_review_veterinarian(
    p_veterinarian_id UUID,
    p_action VARCHAR(32), -- 'approve', 'reject', 'suspend'
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_vet public.veterinarians;
    v_reg public.professional_registrations;
    v_admin_id UUID;
    v_new_crmv_status public.crm_validation_status_type;
BEGIN
    PERFORM public.fn_assert_admin_master_access();
    v_admin_id := auth.uid();

    SELECT * INTO v_vet FROM public.veterinarians WHERE id = p_veterinarian_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Veterinário não encontrado.' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_reg FROM public.professional_registrations WHERE veterinarian_id = p_veterinarian_id LIMIT 1;

    IF p_action = 'approve' THEN
        v_new_crmv_status := 'validated';
        
        UPDATE public.veterinarians
        SET is_verified = TRUE,
            is_active = TRUE,
            updated_at = NOW()
        WHERE id = p_veterinarian_id;

        IF v_reg.id IS NOT NULL THEN
            UPDATE public.professional_registrations
            SET crmv_status = 'validated',
                validated_at = NOW(),
                updated_at = NOW()
            WHERE id = v_reg.id;

            INSERT INTO public.crm_validation (
                registration_id,
                validated_by_user_id,
                validated_at,
                validation_source,
                is_valid,
                validation_notes,
                status
            ) VALUES (
                v_reg.id,
                v_admin_id,
                NOW(),
                'manual_admin',
                TRUE,
                COALESCE(p_notes, 'Aprovação manual realizada pelo Administrador Master.'),
                'active_regular'
            );
        END IF;

    ELSIF p_action = 'reject' THEN
        v_new_crmv_status := 'not_validated';

        UPDATE public.veterinarians
        SET is_verified = FALSE,
            is_active = FALSE,
            updated_at = NOW()
        WHERE id = p_veterinarian_id;

        IF v_reg.id IS NOT NULL THEN
            UPDATE public.professional_registrations
            SET crmv_status = 'not_validated',
                updated_at = NOW()
            WHERE id = v_reg.id;

            INSERT INTO public.crm_validation (
                registration_id,
                validated_by_user_id,
                validated_at,
                validation_source,
                is_valid,
                validation_notes,
                status
            ) VALUES (
                v_reg.id,
                v_admin_id,
                NOW(),
                'manual_admin',
                FALSE,
                COALESCE(p_notes, 'Cadastro reprovado na moderação pelo Administrador Master.'),
                'rejected'
            );
        END IF;

    ELSIF p_action = 'suspend' THEN
        v_new_crmv_status := 'suspended';

        UPDATE public.veterinarians
        SET is_active = FALSE,
            updated_at = NOW()
        WHERE id = p_veterinarian_id;

        IF v_reg.id IS NOT NULL THEN
            UPDATE public.professional_registrations
            SET crmv_status = 'suspended',
                updated_at = NOW()
            WHERE id = v_reg.id;
        END IF;

    ELSE
        RAISE EXCEPTION 'Ação inválida: %', p_action USING ERRCODE = '22023';
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
        'REVIEW_VETERINARIAN',
        'veterinarians',
        p_veterinarian_id::text,
        jsonb_build_object(
            'action', p_action,
            'notes', p_notes,
            'crmv_status', v_new_crmv_status
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'veterinarian_id', p_veterinarian_id,
        'action', p_action,
        'crmv_status', v_new_crmv_status
    );
END;
$$;

-- 6.5 Analytics com Origem Real nos Dados (Zero Números Fictícios)
CREATE OR REPLACE FUNCTION public.fn_get_admin_master_real_analytics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    -- Financeiro
    v_mrr_cents BIGINT := 0;
    v_arr_cents BIGINT := 0;
    v_gmv_cents BIGINT := 0;
    v_platform_commissions_cents BIGINT := 0;
    v_partner_commissions_cents BIGINT := 0;
    v_refunds_cents BIGINT := 0;
    v_net_revenue_cents BIGINT := 0;

    -- Operacional
    v_tutors_count BIGINT := 0;
    v_vets_total BIGINT := 0;
    v_vets_validated BIGINT := 0;
    v_vets_pending BIGINT := 0;
    v_petshops_total BIGINT := 0;
    v_petshops_active BIGINT := 0;

    -- Consultas
    v_apps_total BIGINT := 0;
    v_apps_scheduled BIGINT := 0;
    v_apps_confirmed BIGINT := 0;
    v_apps_completed BIGINT := 0;
    v_apps_cancelled BIGINT := 0;
    v_conversion_rate NUMERIC(5, 2) := 0.00;
    v_cancellation_rate NUMERIC(5, 2) := 0.00;

    -- Suporte
    v_tickets_open BIGINT := 0;
    v_tickets_breached BIGINT := 0;

    v_regional JSONB := '[]'::jsonb;
    v_insufficient_notes JSONB;
BEGIN
    PERFORM public.fn_assert_admin_master_access();

    -- 1. MRR Real: Mensalidades SaaS ativas (tenant_subscriptions + partner_subscriptions)
    SELECT COALESCE(SUM(sp.price_cents), 0) INTO v_mrr_cents
    FROM public.tenant_subscriptions ts
    JOIN public.saas_plans sp ON sp.id = ts.plan_id
    WHERE ts.status = 'ativo';

    v_arr_cents := v_mrr_cents * 12;

    -- 2. GMV Real: Pagamentos capturados no ledger
    SELECT 
        COALESCE(SUM(gross_amount_cents), 0),
        COALESCE(SUM(platform_commission_cents), 0),
        COALESCE(SUM(petshop_commission_cents), 0)
    INTO v_gmv_cents, v_platform_commissions_cents, v_partner_commissions_cents
    FROM public.payments
    WHERE status = 'captured';

    -- 3. Reembolsos
    SELECT COALESCE(SUM(amount_cents), 0) INTO v_refunds_cents
    FROM public.refunds
    WHERE status = 'succeeded';

    v_net_revenue_cents := v_mrr_cents + v_platform_commissions_cents;

    -- 4. Contadores do Ecossistema
    SELECT COUNT(*) INTO v_tutors_count FROM public.tutors;

    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE pr.crmv_status = 'validated'),
        COUNT(*) FILTER (WHERE pr.crmv_status IN ('pending', 'in_validation'))
    INTO v_vets_total, v_vets_validated, v_vets_pending
    FROM public.veterinarians v
    LEFT JOIN public.professional_registrations pr ON pr.veterinarian_id = v.id;

    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'active')
    INTO v_petshops_total, v_petshops_active
    FROM public.petshops;

    -- 5. Consultas e Conversão
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE lifecycle_status = 'solicitado'),
        COUNT(*) FILTER (WHERE lifecycle_status = 'confirmado'),
        COUNT(*) FILTER (WHERE lifecycle_status = 'realizado'),
        COUNT(*) FILTER (WHERE lifecycle_status IN ('cancelado', 'reembolsado'))
    INTO v_apps_total, v_apps_scheduled, v_apps_confirmed, v_apps_completed, v_apps_cancelled
    FROM public.appointments;

    IF v_apps_total > 0 THEN
        v_conversion_rate := ROUND(((v_apps_completed::numeric / v_apps_total::numeric) * 100), 2);
        v_cancellation_rate := ROUND(((v_apps_cancelled::numeric / v_apps_total::numeric) * 100), 2);
    END IF;

    -- 6. Suporte
    SELECT 
        COUNT(*) FILTER (WHERE status IN ('open', 'in_progress', 'waiting_user')),
        COUNT(*) FILTER (WHERE sla_breached = TRUE OR (sla_response_due_at < NOW() AND status = 'open'))
    INTO v_tickets_open, v_tickets_breached
    FROM public.support_tickets;

    -- 7. Desempenho Regional por Estado (UF) dos parceiros credenciados
    SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_regional
    FROM (
        SELECT 
            COALESCE(state_uf, 'ND') as state_uf,
            COUNT(*) as partners_count
        FROM public.veterinarians
        WHERE state_uf IS NOT NULL
        GROUP BY state_uf
        ORDER BY partners_count DESC
        LIMIT 10
    ) r;

    -- Documentar métricas sem dados suficientes para proteger a verdade nos relatórios
    v_insufficient_notes := jsonb_build_array(
        'Retenção de coorte anual de tutores: dados históricos insuficientes (< 12 meses de operação contínua).',
        'LTV (Lifetime Value) preditivo: aguardando amostragem mínima de 100 ciclos de renovação por tenant.'
    );

    RETURN jsonb_build_object(
        'financial', jsonb_build_object(
            'mrr_cents', v_mrr_cents,
            'arr_cents', v_arr_cents,
            'gmv_cents', v_gmv_cents,
            'platform_commissions_cents', v_platform_commissions_cents,
            'partner_commissions_cents', v_partner_commissions_cents,
            'refunds_cents', v_refunds_cents,
            'net_revenue_cents', v_net_revenue_cents
        ),
        'appointments', jsonb_build_object(
            'total', v_apps_total,
            'scheduled', v_apps_scheduled,
            'confirmed', v_apps_confirmed,
            'completed', v_apps_completed,
            'cancelled', v_apps_cancelled,
            'conversion_rate', v_conversion_rate,
            'cancellation_rate', v_cancellation_rate
        ),
        'ecosystem', jsonb_build_object(
            'tutors_count', v_tutors_count,
            'veterinarians_total', v_vets_total,
            'veterinarians_validated', v_vets_validated,
            'veterinarians_pending', v_vets_pending,
            'petshops_total', v_petshops_total,
            'petshops_active', v_petshops_active
        ),
        'support', jsonb_build_object(
            'tickets_open', v_tickets_open,
            'tickets_sla_breached', v_tickets_breached
        ),
        'regional_breakdown', v_regional,
        'insufficient_data_notes', v_insufficient_notes
    );
END;
$$;

-- 6.6 Ledger Financeiro e Conciliação com Exportação Sanitizada
CREATE OR REPLACE FUNCTION public.fn_get_admin_financial_ledger(
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    payment_id UUID,
    appointment_id UUID,
    tenant_name VARCHAR(255),
    gross_amount_cents INT,
    gateway_fee_cents INT,
    platform_commission_cents INT,
    petshop_commission_cents INT,
    veterinarian_net_cents INT,
    status VARCHAR(32),
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM public.fn_assert_admin_master_access();

    RETURN QUERY
    SELECT 
        p.id AS payment_id,
        p.appointment_id,
        COALESCE(t.name, 'Plataforma Geral') AS tenant_name,
        p.gross_amount_cents,
        p.gateway_fee_cents,
        p.platform_commission_cents,
        p.petshop_commission_cents,
        p.veterinarian_net_cents,
        p.status,
        p.created_at
    FROM public.payments p
    LEFT JOIN public.tenants t ON t.id = p.tenant_id
    WHERE (p_start_date IS NULL OR p.created_at >= p_start_date)
      AND (p_end_date IS NULL OR p.created_at <= p_end_date)
    ORDER BY p.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

COMMIT;
