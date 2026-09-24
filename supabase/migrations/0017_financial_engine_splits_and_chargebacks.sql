-- ==============================================================================
-- 0017_financial_engine_splits_and_chargebacks.sql
-- Fase 7: Motor Financeiro, Split Tripartido, Prioridade de Comissões e Idempotência
-- ==============================================================================

-- 1. Enums Financeiros para Regras e Disputas
DO $$ BEGIN
    CREATE TYPE commission_scope_type AS ENUM (
        'veterinarian',  -- Prioridade 1
        'petshop',       -- Prioridade 2
        'specialty',     -- Prioridade 3
        'campaign',      -- Prioridade 4
        'default'        -- Prioridade 5
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE split_calc_model AS ENUM (
        'percentage',    -- Split por percentual
        'fixed_amount'   -- Split por valor monetário fixo
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE chargeback_status_type AS ENUM (
        'dispute_opened',
        'under_review',
        'evidence_submitted',
        'won',
        'lost'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. TABELA: commission_rules (Matriz de Regras de Comissionamento Configuráveis)
CREATE TABLE IF NOT EXISTS public.commission_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    scope commission_scope_type NOT NULL DEFAULT 'default',
    target_id UUID, -- ID do Vet, Pet Shop ou Especialidade conforme o scope
    campaign_code VARCHAR(64),
    model split_calc_model NOT NULL DEFAULT 'percentage',
    
    -- Valores das fatias (se for percentage: 0 a 100 / se for fixed_amount: em centavos)
    vet_share NUMERIC(10, 2) NOT NULL DEFAULT 70.00,
    petshop_share NUMERIC(10, 2) NOT NULL DEFAULT 10.00,
    platform_share NUMERIC(10, 2) NOT NULL DEFAULT 20.00,
    
    priority_level SMALLINT NOT NULL DEFAULT 5, -- 1 = maior prioridade ... 5 = menor
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Regra Padrão Global (Fallback de 70 / 10 / 20)
INSERT INTO public.commission_rules (scope, priority_level, vet_share, petshop_share, platform_share)
VALUES ('default', 5, 70.00, 10.00, 20.00)
ON CONFLICT DO NOTHING;

-- 3. TABELA: payment_idempotency_keys (Garantia de Não-Duplicação de Pagamentos)
CREATE TABLE IF NOT EXISTS public.payment_idempotency_keys (
    idempotency_key VARCHAR(128) PRIMARY KEY,
    tenant_id UUID NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    response_payload JSONB,
    status VARCHAR(32) NOT NULL DEFAULT 'processing', -- processing, completed, failed
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

-- 4. TABELA: chargeback_disputes (Gestão Completa de Contestações e Defesas)
CREATE TABLE IF NOT EXISTS public.chargeback_disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
    gateway_dispute_id VARCHAR(255) NOT NULL,
    amount_cents INTEGER NOT NULL,
    status chargeback_status_type NOT NULL DEFAULT 'dispute_opened',
    reason TEXT NOT NULL,
    evidence_documents JSONB NOT NULL DEFAULT '[]'::jsonb,
    participants_impacted JSONB NOT NULL DEFAULT '{}'::jsonb,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ajustes na tabela de pagamentos para transparência total e rastreabilidade da regra
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS gross_amount_cents INTEGER,
ADD COLUMN IF NOT EXISTS net_veterinarian_cents INTEGER,
ADD COLUMN IF NOT EXISTS petshop_commission_cents INTEGER,
ADD COLUMN IF NOT EXISTS platform_commission_cents INTEGER,
ADD COLUMN IF NOT EXISTS applied_rule_source VARCHAR(64);

-- 5. Função RPC: Cálculo de Split com Hierarquia de 5 Níveis de Prioridade
CREATE OR REPLACE FUNCTION public.calculate_split_shares(
    p_veterinarian_id UUID,
    p_petshop_id UUID,
    p_specialty_id UUID,
    p_campaign_code VARCHAR(64),
    p_gross_cents INTEGER
)
RETURNS TABLE (
    rule_source VARCHAR(64),
    vet_amount_cents INTEGER,
    petshop_amount_cents INTEGER,
    platform_amount_cents INTEGER
) AS $$
DECLARE
    v_rule RECORD;
BEGIN
    -- Hierarquia em 5 Níveis (SELECT ordenado por prioridade crescente: 1 -> 5)
    SELECT * INTO v_rule
    FROM public.commission_rules
    WHERE is_active = TRUE AND (
        (scope = 'veterinarian' AND target_id = p_veterinarian_id AND priority_level = 1) OR
        (scope = 'petshop' AND target_id = p_petshop_id AND priority_level = 2) OR
        (scope = 'specialty' AND target_id = p_specialty_id AND priority_level = 3) OR
        (scope = 'campaign' AND campaign_code = p_campaign_code AND priority_level = 4) OR
        (scope = 'default' AND priority_level = 5)
    )
    ORDER BY priority_level ASC
    LIMIT 1;

    -- Se nenhuma regra for encontrada, aplica 70 / 10 / 20
    IF v_rule.id IS NULL THEN
        rule_source := 'hardcoded_fallback';
        vet_amount_cents := (p_gross_cents * 0.70)::INTEGER;
        petshop_amount_cents := (p_gross_cents * 0.10)::INTEGER;
        platform_amount_cents := p_gross_cents - vet_amount_cents - petshop_amount_cents;
        RETURN NEXT;
        RETURN;
    END IF;

    rule_source := v_rule.scope::text;

    IF v_rule.model = 'percentage' THEN
        vet_amount_cents := (p_gross_cents * (v_rule.vet_share / 100.0))::INTEGER;
        petshop_amount_cents := (p_gross_cents * (v_rule.petshop_share / 100.0))::INTEGER;
        platform_amount_cents := p_gross_cents - vet_amount_cents - petshop_amount_cents;
    ELSE
        -- Fixed amount (centavos)
        vet_amount_cents := v_rule.vet_share::INTEGER;
        petshop_amount_cents := v_rule.petshop_share::INTEGER;
        platform_amount_cents := p_gross_cents - vet_amount_cents - petshop_amount_cents;
    END IF;

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 6. Função RPC: Processamento Atômico do Pagamento e Aplicação do Split (com Idempotência)
CREATE OR REPLACE FUNCTION public.process_appointment_payment_split(
    p_appointment_id UUID,
    p_gateway VARCHAR(64),
    p_gateway_tx_id VARCHAR(255),
    p_payment_method VARCHAR(64),
    p_idempotency_key VARCHAR(128),
    p_campaign_code VARCHAR(64) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_app RECORD;
    v_gateway_fee INTEGER := 0;
    v_split RECORD;
    v_payment_id UUID;
    v_existing_payload JSONB;
BEGIN
    -- 1. Checagem de Idempotência: Se já processou esta chave, retorna o resultado salvo sem duplicar
    SELECT response_payload INTO v_existing_payload
    FROM public.payment_idempotency_keys
    WHERE idempotency_key = p_idempotency_key AND status = 'completed';

    IF v_existing_payload IS NOT NULL THEN
        RETURN v_existing_payload;
    END IF;

    -- 2. Busca dados da consulta no backend
    SELECT * INTO v_app
    FROM public.appointments
    WHERE id = p_appointment_id;

    IF v_app.id IS NULL THEN
        RAISE EXCEPTION 'Agendamento não encontrado.' USING ERRCODE = 'P0002';
    END IF;

    -- Calcula taxa estimada do gateway (ex: 2.99% para cartão, 0.99% para pix)
    IF p_payment_method = 'pix' THEN
        v_gateway_fee := (v_app.price_cents * 0.0099)::INTEGER;
    ELSE
        v_gateway_fee := (v_app.price_cents * 0.0299)::INTEGER;
    END IF;

    -- 3. Executa o cálculo autoritativo do split
    SELECT * INTO v_split
    FROM public.calculate_split_shares(
        v_app.veterinarian_id,
        v_app.petshop_id,
        v_app.specialty_id,
        p_campaign_code,
        v_app.price_cents
    );

    -- 4. Grava o pagamento com total transparência
    INSERT INTO public.payments (
        tenant_id,
        appointment_id,
        tutor_id,
        gateway,
        gateway_transaction_id,
        payment_method,
        amount_cents,
        gross_amount_cents,
        gateway_fee_cents,
        net_amount_cents,
        net_veterinarian_cents,
        petshop_commission_cents,
        platform_commission_cents,
        applied_rule_source,
        status,
        paid_at
    ) VALUES (
        v_app.tenant_id,
        p_appointment_id,
        v_app.tutor_id,
        p_gateway,
        p_gateway_tx_id,
        p_payment_method,
        v_app.price_cents,
        v_app.price_cents,
        v_gateway_fee,
        v_app.price_cents - v_gateway_fee,
        v_split.vet_amount_cents,
        v_split.petshop_amount_cents,
        v_split.platform_amount_cents,
        v_split.rule_source,
        'captured',
        NOW()
    ) RETURNING id INTO v_payment_id;

    -- 5. Grava os registros detalhados de payment_splits
    INSERT INTO public.payment_splits (tenant_id, payment_id, recipient_type, recipient_id, amount_cents, status) VALUES
    (v_app.tenant_id, v_payment_id, 'veterinarian', v_app.veterinarian_id, v_split.vet_amount_cents, 'processed'),
    (v_app.tenant_id, v_payment_id, 'petshop', COALESCE(v_app.petshop_id, v_app.tenant_id), v_split.petshop_amount_cents, 'processed'),
    (v_app.tenant_id, v_payment_id, 'platform', v_app.tenant_id, v_split.platform_amount_cents, 'processed');

    -- 6. Atualiza saldos nas Wallets
    -- Carteira do Veterinário
    INSERT INTO public.wallets (tenant_id, owner_type, owner_id, balance_cents)
    VALUES (v_app.tenant_id, 'veterinarian', v_app.veterinarian_id, v_split.vet_amount_cents)
    ON CONFLICT (tenant_id, owner_type, owner_id)
    DO UPDATE SET balance_cents = public.wallets.balance_cents + EXCLUDED.balance_cents;

    -- Carteira do Pet Shop
    IF v_app.petshop_id IS NOT NULL THEN
        INSERT INTO public.wallets (tenant_id, owner_type, owner_id, balance_cents)
        VALUES (v_app.tenant_id, 'petshop', v_app.petshop_id, v_split.petshop_amount_cents)
        ON CONFLICT (tenant_id, owner_type, owner_id)
        DO UPDATE SET balance_cents = public.wallets.balance_cents + EXCLUDED.balance_cents;
    END IF;

    -- 7. Confirma o agendamento
    UPDATE public.appointments
    SET lifecycle_status = 'confirmado', updated_at = NOW()
    WHERE id = p_appointment_id;

    -- Monta a resposta final
    v_existing_payload := jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'gross_amount_cents', v_app.price_cents,
        'gateway_fee_cents', v_gateway_fee,
        'net_amount_cents', v_app.price_cents - v_gateway_fee,
        'split', jsonb_build_object(
            'rule_applied', v_split.rule_source,
            'veterinarian_cents', v_split.vet_amount_cents,
            'petshop_cents', v_split.petshop_amount_cents,
            'platform_cents', v_split.platform_amount_cents
        )
    );

    -- Salva na tabela de idempotência
    INSERT INTO public.payment_idempotency_keys (
        idempotency_key, tenant_id, request_hash, response_payload, status
    ) VALUES (
        p_idempotency_key, v_app.tenant_id, md5(p_appointment_id::text), v_existing_payload, 'completed'
    ) ON CONFLICT (idempotency_key) DO UPDATE SET response_payload = EXCLUDED.response_payload, status = 'completed';

    RETURN v_existing_payload;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Função RPC: Processamento de Reembolso com Reversão Proporcional
CREATE OR REPLACE FUNCTION public.process_refund_split(
    p_payment_id UUID,
    p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_pay RECORD;
    v_split RECORD;
BEGIN
    SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id;

    IF v_pay.id IS NULL THEN
        RAISE EXCEPTION 'Pagamento não encontrado.' USING ERRCODE = 'P0002';
    END IF;

    -- Registra na tabela de refunds
    INSERT INTO public.refunds (
        tenant_id, payment_id, amount_cents, reason, status, processed_at
    ) VALUES (
        v_pay.tenant_id, p_payment_id, v_pay.amount_cents, p_reason, 'succeeded', NOW()
    );

    -- Atualiza status do pagamento
    UPDATE public.payments
    SET status = 'refunded', updated_at = NOW()
    WHERE id = p_payment_id;

    -- Reverte os saldos nas carteiras de cada participante
    FOR v_split IN SELECT * FROM public.payment_splits WHERE payment_id = p_payment_id LOOP
        UPDATE public.wallets
        SET balance_cents = balance_cents - v_split.amount_cents,
            updated_at = NOW()
        WHERE tenant_id = v_pay.tenant_id 
          AND owner_type = v_split.recipient_type 
          AND owner_id = v_split.recipient_id;
    END LOOP;

    -- Atualiza o agendamento para reembolsado
    UPDATE public.appointments
    SET lifecycle_status = 'reembolsado', updated_at = NOW()
    WHERE id = v_pay.appointment_id;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', p_payment_id,
        'refund_amount_cents', v_pay.amount_cents,
        'status', 'refunded'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
