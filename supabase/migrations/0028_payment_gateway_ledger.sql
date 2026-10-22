-- ==============================================================================
-- 0028_payment_gateway_ledger.sql
-- Fase 8: Pagamentos reais, gateway abstrato, deduplicação de webhook e ledger
-- ============================================================================== 

BEGIN;

DO $$ BEGIN
    CREATE TYPE payment_provider_status_type AS ENUM (
        'pending',
        'requires_action',
        'processing',
        'succeeded',
        'failed',
        'canceled',
        'refunded'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS provider_status payment_provider_status_type NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS provider_reference_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS provider_status_reason TEXT,
    ADD COLUMN IF NOT EXISTS provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS last_gateway_event_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS payment_currency VARCHAR(3) NOT NULL DEFAULT 'BRL';

CREATE TABLE IF NOT EXISTS public.payment_gateways (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    provider_name VARCHAR(64) NOT NULL,
    provider_account_id VARCHAR(128),
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    webhook_secret TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, provider_name)
);

CREATE TABLE IF NOT EXISTS public.payment_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
    provider_name VARCHAR(64) NOT NULL DEFAULT 'manual',
    provider_event_id VARCHAR(255),
    event_type VARCHAR(32) NOT NULL CHECK (
        event_type IN (
            'created',
            'authorized',
            'processing',
            'requires_action',
            'captured',
            'failed',
            'refunded',
            'webhook',
            'updated',
            'canceled'
        )
    ),
    amount_cents INTEGER NOT NULL DEFAULT 0,
    ledger_balance_cents BIGINT NOT NULL DEFAULT 0,
    direction VARCHAR(16) NOT NULL CHECK (direction IN ('credit', 'debit', 'none')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
    provider_name VARCHAR(64) NOT NULL,
    provider_event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider_name, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_gateways_tenant_provider
    ON public.payment_gateways(tenant_id, provider_name);
CREATE INDEX IF NOT EXISTS idx_payment_ledger_payment_id
    ON public.payment_ledger(payment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_provider_event
    ON public.payment_webhook_events(provider_name, provider_event_id);

CREATE OR REPLACE FUNCTION public.register_payment_gateway_config(
    p_tenant_id UUID,
    p_provider_name VARCHAR(64),
    p_is_enabled BOOLEAN DEFAULT FALSE,
    p_config JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_record RECORD;
BEGIN
    INSERT INTO public.payment_gateways (
        tenant_id,
        provider_name,
        is_enabled,
        config
    ) VALUES (
        p_tenant_id,
        p_provider_name,
        COALESCE(p_is_enabled, FALSE),
        COALESCE(p_config, '{}'::jsonb)
    )
    ON CONFLICT (tenant_id, provider_name)
    DO UPDATE SET
        is_enabled = EXCLUDED.is_enabled,
        config = EXCLUDED.config,
        updated_at = NOW()
    RETURNING * INTO v_record;

    RETURN jsonb_build_object(
        'success', TRUE,
        'provider_name', v_record.provider_name,
        'is_enabled', v_record.is_enabled,
        'config', v_record.config
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.register_payment_webhook_event(
    p_tenant_id UUID,
    p_payment_id UUID,
    p_provider_name VARCHAR(64),
    p_provider_event_id VARCHAR(255),
    p_event_type VARCHAR(64),
    p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_existing RECORD;
BEGIN
    IF p_provider_event_id IS NULL OR p_provider_event_id = '' THEN
        RAISE EXCEPTION 'provider_event_id é obrigatório para deduplicação do webhook.';
    END IF;

    SELECT * INTO v_existing
    FROM public.payment_webhook_events
    WHERE provider_name = p_provider_name
      AND provider_event_id = p_provider_event_id
    LIMIT 1;

    IF v_existing.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'duplicate', TRUE,
            'event_id', v_existing.id,
            'payment_id', v_existing.payment_id
        );
    END IF;

    INSERT INTO public.payment_webhook_events (
        tenant_id,
        payment_id,
        provider_name,
        provider_event_id,
        event_type,
        payload
    ) VALUES (
        p_tenant_id,
        p_payment_id,
        p_provider_name,
        p_provider_event_id,
        p_event_type,
        COALESCE(p_payload, '{}'::jsonb)
    )
    RETURNING * INTO v_existing;

    UPDATE public.payments
    SET
        provider_metadata = COALESCE(provider_metadata, '{}'::jsonb) || jsonb_build_object(
            'last_webhook_event', p_event_type,
            'last_provider_event_id', p_provider_event_id,
            'last_webhook_received_at', NOW()
        ),
        last_gateway_event_at = NOW()
    WHERE id = p_payment_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'duplicate', FALSE,
        'event_id', v_existing.id,
        'payment_id', v_existing.payment_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_provider_status_update(
    p_payment_id UUID,
    p_provider_name VARCHAR(64),
    p_provider_status payment_provider_status_type,
    p_provider_event_id VARCHAR(255) DEFAULT NULL,
    p_reason TEXT DEFAULT NULL,
    p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_payment RECORD;
BEGIN
    SELECT * INTO v_payment
    FROM public.payments
    WHERE id = p_payment_id;

    IF v_payment.id IS NULL THEN
        RAISE EXCEPTION 'Pagamento não encontrado para atualização de gateway.';
    END IF;

    IF v_payment.provider_status = 'succeeded' AND p_provider_status IN ('pending', 'requires_action', 'processing') THEN
        RAISE EXCEPTION 'Status do gateway não pode voltar após sucesso do pagamento.';
    END IF;

    UPDATE public.payments
    SET
        gateway = COALESCE(gateway, p_provider_name),
        provider_status = p_provider_status,
        provider_reference_id = COALESCE(provider_reference_id, p_provider_event_id),
        provider_status_reason = p_reason,
        provider_metadata = jsonb_strip_nulls(
            COALESCE(provider_metadata, '{}'::jsonb)
            || COALESCE(p_payload, '{}'::jsonb)
            || jsonb_build_object(
                'provider', p_provider_name,
                'last_provider_event_id', p_provider_event_id,
                'last_provider_status', p_provider_status::TEXT
            )
        ),
        last_gateway_event_at = NOW(),
        gateway_transaction_id = COALESCE(gateway_transaction_id, p_provider_event_id)
    WHERE id = p_payment_id;

    IF p_provider_status = 'succeeded' THEN
        UPDATE public.payments
        SET status = 'captured', paid_at = COALESCE(paid_at, NOW())
        WHERE id = p_payment_id;
    ELSIF p_provider_status = 'failed' THEN
        UPDATE public.payments
        SET status = 'failed'
        WHERE id = p_payment_id;
    ELSIF p_provider_status = 'refunded' THEN
        UPDATE public.payments
        SET status = 'refunded', paid_at = COALESCE(paid_at, NOW())
        WHERE id = p_payment_id;
    ELSIF p_provider_status IN ('requires_action', 'processing') THEN
        UPDATE public.payments
        SET status = 'pending'
        WHERE id = p_payment_id;
    END IF;

    SELECT * INTO v_payment
    FROM public.payments
    WHERE id = p_payment_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'payment_id', v_payment.id,
        'provider_name', p_provider_name,
        'provider_status', v_payment.provider_status,
        'payment_status', v_payment.status
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.write_payment_ledger_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.payment_ledger (
            tenant_id,
            payment_id,
            provider_name,
            provider_event_id,
            event_type,
            amount_cents,
            ledger_balance_cents,
            direction,
            metadata
        ) VALUES (
            NEW.tenant_id,
            NEW.id,
            COALESCE(NEW.gateway, 'manual'),
            NEW.gateway_transaction_id,
            'created',
            COALESCE(NEW.amount_cents, 0),
            COALESCE(NEW.amount_cents, 0)::BIGINT,
            'credit',
            jsonb_build_object(
                'source', 'payment_created',
                'gateway', NEW.gateway,
                'payment_status', NEW.status
            )
        );

        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND (
        OLD.status IS DISTINCT FROM NEW.status
        OR OLD.provider_status IS DISTINCT FROM NEW.provider_status
        OR OLD.amount_cents IS DISTINCT FROM NEW.amount_cents
    ) THEN
        INSERT INTO public.payment_ledger (
            tenant_id,
            payment_id,
            provider_name,
            provider_event_id,
            event_type,
            amount_cents,
            ledger_balance_cents,
            direction,
            metadata
        ) VALUES (
            NEW.tenant_id,
            NEW.id,
            COALESCE(NEW.gateway, 'manual'),
            NEW.gateway_transaction_id,
            CASE
                WHEN NEW.status = 'captured' OR NEW.provider_status = 'succeeded' THEN 'captured'
                WHEN NEW.status = 'refunded' OR NEW.provider_status = 'refunded' THEN 'refunded'
                WHEN NEW.status = 'failed' OR NEW.provider_status = 'failed' THEN 'failed'
                WHEN NEW.provider_status = 'processing' THEN 'processing'
                WHEN NEW.provider_status = 'requires_action' THEN 'requires_action'
                ELSE 'updated'
            END,
            COALESCE(NEW.amount_cents, 0),
            COALESCE(NEW.amount_cents, 0)::BIGINT,
            CASE
                WHEN NEW.status IN ('captured', 'refunded') THEN 'credit'
                WHEN NEW.status = 'failed' THEN 'none'
                ELSE 'none'
            END,
            jsonb_build_object(
                'source', 'payment_status_update',
                'gateway', NEW.gateway,
                'previous_status', OLD.status,
                'new_status', NEW.status,
                'provider_status', NEW.provider_status
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_ledger_event ON public.payments;
CREATE TRIGGER trg_payments_ledger_event
AFTER INSERT OR UPDATE OF status, provider_status, amount_cents, gateway_transaction_id, gateway
ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.write_payment_ledger_event();

CREATE OR REPLACE TRIGGER trg_payment_gateways_updated_at
BEFORE UPDATE ON public.payment_gateways
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

COMMIT;
