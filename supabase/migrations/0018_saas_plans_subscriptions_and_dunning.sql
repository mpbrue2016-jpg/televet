-- ==============================================================================
-- 0018_saas_plans_subscriptions_and_dunning.sql
-- Fase 8: Modelo SaaS dos Pet Shops, Mensalidades, Planos, Inadimplência e Segregação Contábil
-- ==============================================================================

-- 1. Enum Estrito de Status da Assinatura SaaS do Pet Shop (8 Estados)
DO $$ BEGIN
    CREATE TYPE saas_subscription_status AS ENUM (
        'em_cadastro',          -- Onboarding inicial
        'aguardando_pagamento', -- Primeira fatura gerada
        'trial',                -- Período de avaliação gratuita
        'ativo',                -- Em dia com as mensalidades
        'pagamento_pendente',   -- Fatura aberta em processamento
        'inadimplente',         -- Falha de cobrança registrada (em carência/tolerância)
        'suspenso',             -- Tolerância esgotada; recursos congelados (sem apagar dados)
        'cancelado'             -- Rescisão contratual
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. TABELA: saas_plans (Planos B2B para Pet Shops configuráveis pelo Administrador)
CREATE TABLE IF NOT EXISTS public.saas_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    slug VARCHAR(64) UNIQUE NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL, -- Valor em centavos (ex: 19900 = R$ 199,00)
    billing_interval VARCHAR(32) NOT NULL DEFAULT 'monthly', -- monthly, yearly
    
    -- Matriz de Limites e Recursos
    max_team_users INTEGER NOT NULL DEFAULT 3,
    max_veterinarians INTEGER NOT NULL DEFAULT 2,
    max_consultations_month INTEGER NOT NULL DEFAULT 30,
    has_reports BOOLEAN NOT NULL DEFAULT TRUE,
    has_marketing_tools BOOLEAN NOT NULL DEFAULT FALSE,
    has_coupons BOOLEAN NOT NULL DEFAULT FALSE,
    has_whatsapp_integration BOOLEAN NOT NULL DEFAULT FALSE,
    has_custom_domain BOOLEAN NOT NULL DEFAULT FALSE,
    has_white_label BOOLEAN NOT NULL DEFAULT FALSE,
    has_api_access BOOLEAN NOT NULL DEFAULT FALSE,
    support_level VARCHAR(64) NOT NULL DEFAULT 'standard', -- email_standard, priority, dedicated_manager
    
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inserção dos 3 Planos Padrão Solicitados
INSERT INTO public.saas_plans (
    name, slug, description, price_cents, 
    max_team_users, max_veterinarians, max_consultations_month,
    has_reports, has_marketing_tools, has_coupons, has_whatsapp_integration,
    has_custom_domain, has_white_label, has_api_access, support_level
) VALUES
(
    'Básico', 'basico', 'Ideal para pequenos pet shops iniciando na telemedicina', 19900,
    3, 2, 30,
    true, false, false, false,
    false, false, false, 'email_standard'
),
(
    'Profissional', 'profissional', 'Para pet shops consolidados com equipe e marketing', 39900,
    10, 10, 150,
    true, true, true, true,
    false, true, false, 'priority'
),
(
    'Premium', 'premium', 'Acesso total, domínio próprio, White-Label e API aberta', 69900,
    9999, 9999, 9999,
    true, true, true, true,
    true, true, true, 'dedicated_manager'
)
ON CONFLICT (slug) DO UPDATE SET
    price_cents = EXCLUDED.price_cents,
    description = EXCLUDED.description;

-- 3. TABELA: tenant_subscriptions (Controle do Ciclo de Vida da Assinatura do Pet Shop)
CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    petshop_id UUID REFERENCES public.petshops(id) ON DELETE SET NULL,
    plan_id UUID NOT NULL REFERENCES public.saas_plans(id) ON DELETE RESTRICT,
    status saas_subscription_status NOT NULL DEFAULT 'em_cadastro',
    contracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    trial_ends_at TIMESTAMPTZ,
    grace_period_until TIMESTAMPTZ, -- Fim do período de tolerância antes de suspender
    failed_attempts_count INTEGER NOT NULL DEFAULT 0,
    last_payment_error TEXT,
    auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
    canceled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_tenant_active_sub UNIQUE (tenant_id)
);

-- 4. CENTRO DE ASSINATURAS (Segregação Contábil Estrita das Transações de Consultas)
-- Esta tabela armazena exclusivamente mensalidades de software B2B
CREATE TABLE IF NOT EXISTS public.saas_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    subscription_id UUID NOT NULL REFERENCES public.tenant_subscriptions(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL,
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,
    due_date DATE NOT NULL,
    paid_at TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'open', -- open, paid, past_due, void
    payment_method VARCHAR(64) DEFAULT 'credit_card',
    gateway_invoice_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_sub_tenant ON public.tenant_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_saas_invoices_sub ON public.saas_invoices(subscription_id);

-- 5. Função RPC: Contratação / Upgrade de Plano SaaS
CREATE OR REPLACE FUNCTION public.subscribe_tenant_saas_plan(
    p_tenant_id UUID,
    p_petshop_id UUID,
    p_plan_id UUID,
    p_payment_method VARCHAR(64) DEFAULT 'credit_card'
)
RETURNS JSONB AS $$
DECLARE
    v_plan RECORD;
    v_sub_id UUID;
    v_invoice_id UUID;
BEGIN
    SELECT * INTO v_plan FROM public.saas_plans WHERE id = p_plan_id AND is_active = TRUE;

    IF v_plan.id IS NULL THEN
        RAISE EXCEPTION 'Plano SaaS não encontrado ou inativo.' USING ERRCODE = 'P0002';
    END IF;

    -- Cria ou atualiza a assinatura do Tenant
    INSERT INTO public.tenant_subscriptions (
        tenant_id,
        petshop_id,
        plan_id,
        status,
        current_period_start,
        current_period_end,
        grace_period_until,
        failed_attempts_count
    ) VALUES (
        p_tenant_id,
        p_petshop_id,
        p_plan_id,
        'ativo',
        NOW(),
        NOW() + INTERVAL '30 days',
        NULL,
        0
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        status = 'ativo',
        current_period_start = NOW(),
        current_period_end = NOW() + INTERVAL '30 days',
        grace_period_until = NULL,
        failed_attempts_count = 0,
        updated_at = NOW()
    RETURNING id INTO v_sub_id;

    -- Gera a fatura no CENTRO DE ASSINATURAS
    INSERT INTO public.saas_invoices (
        tenant_id,
        subscription_id,
        amount_cents,
        billing_period_start,
        billing_period_end,
        due_date,
        paid_at,
        status,
        payment_method
    ) VALUES (
        p_tenant_id,
        v_sub_id,
        v_plan.price_cents,
        CURRENT_DATE,
        CURRENT_DATE + 30,
        CURRENT_DATE,
        NOW(), -- Simula liquidação imediata da mensalidade
        'paid',
        p_payment_method
    ) RETURNING id INTO v_invoice_id;

    RETURN jsonb_build_object(
        'success', true,
        'subscription_id', v_sub_id,
        'invoice_id', v_invoice_id,
        'plan_name', v_plan.name,
        'price_cents', v_plan.price_cents,
        'status', 'ativo'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Função RPC: Motor de Régua de Inadimplência e Tolerância
-- D+0: Notificação | D+3: Retentativa | D+7: Suspensão SEM APAGAR DADOS
CREATE OR REPLACE FUNCTION public.handle_saas_payment_failure(
    p_tenant_id UUID,
    p_error_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_sub RECORD;
    v_new_status public.saas_subscription_status;
    v_grace_date TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_sub 
    FROM public.tenant_subscriptions 
    WHERE tenant_id = p_tenant_id;

    IF v_sub.id IS NULL THEN
        RAISE EXCEPTION 'Assinatura não encontrada para o tenant.' USING ERRCODE = 'P0002';
    END IF;

    -- Incrementa tentativas falhas
    IF v_sub.failed_attempts_count >= 2 THEN
        -- Tolerância esgotada: transita para 'suspenso' (CONGELA ACESSO, MAS PRESERVA 100% DOS DADOS)
        v_new_status := 'suspenso';
        v_grace_date := v_sub.grace_period_until;
    ELSE
        -- Em tolerância de 7 dias
        v_new_status := 'inadimplente';
        v_grace_date := COALESCE(v_sub.grace_period_until, NOW() + INTERVAL '7 days');
    END IF;

    UPDATE public.tenant_subscriptions
    SET 
        status = v_new_status,
        failed_attempts_count = failed_attempts_count + 1,
        last_payment_error = p_error_reason,
        grace_period_until = v_grace_date,
        updated_at = NOW()
    WHERE id = v_sub.id;

    -- Registra evento de auditoria
    INSERT INTO public.audit_logs (
        tenant_id,
        action,
        entity,
        entity_id,
        old_data,
        new_data
    ) VALUES (
        p_tenant_id,
        'SAAS_DUNNING_FAILURE',
        'tenant_subscriptions',
        v_sub.id::text,
        jsonb_build_object('previous_status', v_sub.status),
        jsonb_build_object('new_status', v_new_status, 'grace_until', v_grace_date, 'reason', p_error_reason)
    );

    RETURN jsonb_build_object(
        'success', true,
        'subscription_id', v_sub.id,
        'status', v_new_status,
        'grace_period_until', v_grace_date,
        'failed_attempts', v_sub.failed_attempts_count + 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Função RPC: Validação Granular de Recursos do Plano
CREATE OR REPLACE FUNCTION public.check_tenant_feature_permission(
    p_tenant_id UUID,
    p_feature_key VARCHAR(64)
)
RETURNS BOOLEAN AS $$
DECLARE
    v_sub RECORD;
    v_plan RECORD;
BEGIN
    SELECT * INTO v_sub FROM public.tenant_subscriptions WHERE tenant_id = p_tenant_id;

    -- Se não tem assinatura ou está suspenso/cancelado, acesso bloqueado
    IF v_sub.id IS NULL OR v_sub.status IN ('suspenso', 'cancelado') THEN
        RETURN FALSE;
    END IF;

    SELECT * INTO v_plan FROM public.saas_plans WHERE id = v_sub.plan_id;

    IF v_plan.id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Verificação por chave de recurso
    CASE p_feature_key
        WHEN 'custom_domain' THEN RETURN v_plan.has_custom_domain;
        WHEN 'white_label' THEN RETURN v_plan.has_white_label;
        WHEN 'api_access' THEN RETURN v_plan.has_api_access;
        WHEN 'whatsapp_integration' THEN RETURN v_plan.has_whatsapp_integration;
        WHEN 'coupons' THEN RETURN v_plan.has_coupons;
        WHEN 'marketing_tools' THEN RETURN v_plan.has_marketing_tools;
        ELSE RETURN TRUE;
    END CASE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
