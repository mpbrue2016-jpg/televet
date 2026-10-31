-- ==============================================================================
-- 0039_ad_billing_subscriptions_and_invoices.sql
-- FASE 18: Checkout de Anúncios, Assinaturas e Administração Financeira de Ads
-- Contabilidade Separada: ad_invoices, ad_subscriptions, ad_coupons, ad_payment_ledger
-- ==============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. ENUMS E TIPOS CUSTOMIZADOS
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE ad_subscription_status AS ENUM (
        'pending',      -- Aguardando confirmação do primeiro pagamento
        'active',       -- Em dia, anúncios veiculando normalmente
        'past_due',     -- Vencido, em tolerância de carência (campanhas ainda ativas)
        'suspended',    -- Tolerância esgotada; campanhas congeladas (sem apagar histórico)
        'cancelled',    -- Cancelamento voluntário ou administrativo
        'expired'       -- Período expirado sem renovação
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE ad_invoice_status AS ENUM (
        'pending',      -- Aguardando pagamento pelo anunciante
        'paid',         -- Pagamento capturado e confirmado pelo gateway
        'failed',       -- Pagamento recusado ou cartão negado
        'cancelled',    -- Fatura cancelada / substituída
        'refunded'      -- Fatura estornada
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE ad_billing_period AS ENUM (
        'monthly',      -- Mensal (1 mês)
        'quarterly',    -- Trimestral (3 meses, com desconto padrão)
        'semiannual',   -- Semestral (6 meses, com desconto padrão)
        'yearly'        -- Anual (12 meses, com desconto padrão)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE ad_nf_status AS ENUM (
        'pending_integration', -- Estruturado no banco, aguardando gateway emissor (Prefeitura / SEFAZ)
        'issued',              -- Emitida com sucesso
        'error',               -- Erro de emissão
        'cancelled'            -- Cancelada
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- 2. TABELA: ad_period_discounts (Descontos por Período Editáveis pelo Admin)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_period_discounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period ad_billing_period UNIQUE NOT NULL,
    months_count INT NOT NULL CHECK (months_count > 0),
    discount_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.ad_period_discounts (period, months_count, discount_percentage, description)
VALUES
    ('monthly', 1, 0.00, 'Cobrança mensal regular sem desconto adicional'),
    ('quarterly', 3, 5.00, 'Trimestral com 5% de desconto promocional'),
    ('semiannual', 6, 10.00, 'Semestral com 10% de economia'),
    ('yearly', 12, 20.00, 'Anual com 20% de desconto institucional')
ON CONFLICT (period) DO UPDATE
SET discount_percentage = EXCLUDED.discount_percentage,
    description = EXCLUDED.description,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 3. TABELA: ad_coupons (Cupons de Desconto para Anunciantes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(64) UNIQUE NOT NULL,
    description TEXT,
    discount_percent NUMERIC(5,2) DEFAULT 0.00 CHECK (discount_percent >= 0 AND discount_percent <= 100),
    discount_fixed_cents INT DEFAULT 0 CHECK (discount_fixed_cents >= 0),
    min_purchase_cents INT DEFAULT 0,
    max_uses INT DEFAULT NULL,
    current_uses INT NOT NULL DEFAULT 0,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_coupons_code ON public.ad_coupons(code);

INSERT INTO public.ad_coupons (code, description, discount_percent, max_uses, valid_until)
VALUES
    ('BEMVINDOADS', 'Cupom de 10% para novos anunciantes na plataforma', 10.00, 100, NOW() + INTERVAL '1 year'),
    ('TELEVETVIP', 'Cupom VIP de 25% para parceiros estratégicos', 25.00, 50, NOW() + INTERVAL '1 year')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. TABELA: ad_subscriptions (Ciclo de Vida das Assinaturas de Ads)
-- SEPARADA DE SAAS PETSHOP E DE CONSULTAS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advertiser_id UUID NOT NULL REFERENCES public.advertisers(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.ad_plans(id) ON DELETE RESTRICT,
    campaign_id UUID REFERENCES public.ad_campaigns(id) ON DELETE SET NULL,
    
    billing_period ad_billing_period NOT NULL DEFAULT 'monthly',
    status ad_subscription_status NOT NULL DEFAULT 'pending',
    
    base_price_cents INT NOT NULL, -- Valor unitário do plano * quantidade de meses
    period_discount_cents INT NOT NULL DEFAULT 0,
    coupon_discount_cents INT NOT NULL DEFAULT 0,
    final_price_cents INT NOT NULL,
    
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    grace_period_until TIMESTAMPTZ, -- Tolerância de 5 dias após vencimento
    
    auto_renew BOOLEAN NOT NULL DEFAULT true,
    failed_charge_attempts INT NOT NULL DEFAULT 0,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_subscriptions_advertiser ON public.ad_subscriptions(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_ad_subscriptions_status ON public.ad_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_ad_subscriptions_period_end ON public.ad_subscriptions(current_period_end);

-- ---------------------------------------------------------------------------
-- 5. TABELA: ad_invoices (Faturas dos Anúncios com Estrutura Fiscal e Recibo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(64) UNIQUE NOT NULL,
    advertiser_id UUID NOT NULL REFERENCES public.advertisers(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.ad_subscriptions(id) ON DELETE SET NULL,
    campaign_id UUID REFERENCES public.ad_campaigns(id) ON DELETE SET NULL,
    plan_id UUID REFERENCES public.ad_plans(id) ON DELETE SET NULL,
    
    -- Valores Contábeis
    gross_amount_cents INT NOT NULL,
    discount_cents INT NOT NULL DEFAULT 0,
    net_amount_cents INT NOT NULL,
    
    status ad_invoice_status NOT NULL DEFAULT 'pending',
    payment_method VARCHAR(32) NOT NULL DEFAULT 'pix' CHECK (payment_method IN ('pix', 'credit_card', 'boleto')),
    
    -- Dados de Cobrança PIX
    pix_qr_code TEXT,
    pix_copy_paste TEXT,
    pix_expires_at TIMESTAMPTZ,
    
    -- Gateway Real
    provider_name VARCHAR(64) NOT NULL DEFAULT 'mercadopago',
    provider_transaction_id VARCHAR(255),
    provider_status VARCHAR(64) NOT NULL DEFAULT 'pending',
    provider_status_reason TEXT,
    provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    due_date TIMESTAMPTZ NOT NULL,
    paid_at TIMESTAMPTZ,
    
    -- Estrutura de Nota Fiscal (PENDENTE DE INTEGRAÇÃO COM SEFAZ/PREFEITURA)
    nf_status ad_nf_status NOT NULL DEFAULT 'pending_integration',
    nf_number VARCHAR(64),
    nf_series VARCHAR(16),
    nf_verification_code VARCHAR(64),
    nf_xml_url TEXT,
    nf_pdf_url TEXT,
    nf_error_message TEXT,
    tax_id_cnpj VARCHAR(18),
    municipal_tax_code VARCHAR(32),
    nf_issued_at TIMESTAMPTZ,
    
    -- Recibo e Comprovante com Hash SHA256
    receipt_token UUID NOT NULL DEFAULT gen_random_uuid(),
    receipt_auth_hash VARCHAR(64),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_invoices_advertiser ON public.ad_invoices(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_ad_invoices_status ON public.ad_invoices(status);
CREATE INDEX IF NOT EXISTS idx_ad_invoices_provider_tx ON public.ad_invoices(provider_name, provider_transaction_id);

-- ---------------------------------------------------------------------------
-- 6. TABELA: ad_webhook_events (Deduplicação e Idempotência Estrita de Webhook)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_name VARCHAR(64) NOT NULL,
    provider_event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    invoice_id UUID REFERENCES public.ad_invoices(id) ON DELETE SET NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider_name, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_ad_webhook_provider_event ON public.ad_webhook_events(provider_name, provider_event_id);

-- ---------------------------------------------------------------------------
-- 7. TABELA: ad_payment_ledger (Livro Razão Contábil Exclusivo de Publicidade)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_payment_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advertiser_id UUID NOT NULL REFERENCES public.advertisers(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES public.ad_invoices(id) ON DELETE SET NULL,
    subscription_id UUID REFERENCES public.ad_subscriptions(id) ON DELETE SET NULL,
    
    event_type VARCHAR(64) NOT NULL CHECK (
        event_type IN (
            'invoice_created',
            'payment_succeeded',
            'payment_failed',
            'subscription_activated',
            'subscription_past_due',
            'subscription_suspended',
            'subscription_reactivated',
            'subscription_cancelled',
            'refund'
        )
    ),
    amount_cents INT NOT NULL DEFAULT 0,
    direction VARCHAR(16) NOT NULL CHECK (direction IN ('credit', 'debit', 'none')),
    balance_after_cents BIGINT NOT NULL DEFAULT 0,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_ledger_advertiser ON public.ad_payment_ledger(advertiser_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_ledger_invoice ON public.ad_payment_ledger(invoice_id);

-- ---------------------------------------------------------------------------
-- 8. EXPANSÃO: Empresas Verificadas no Diretório Nacional (service_providers)
-- ---------------------------------------------------------------------------
ALTER TABLE public.service_providers
    ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES public.users(id),
    ADD COLUMN IF NOT EXISTS verification_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_service_providers_verified ON public.service_providers(is_verified);

-- ---------------------------------------------------------------------------
-- 9. FUNÇÃO: create_ad_checkout
-- Gera fatura, aplica desconto de período e cupom com idempotência contábil
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_ad_checkout(
    p_advertiser_id UUID,
    p_plan_id UUID,
    p_campaign_id UUID,
    p_billing_period VARCHAR(32) DEFAULT 'monthly',
    p_coupon_code VARCHAR(64) DEFAULT NULL,
    p_payment_method VARCHAR(32) DEFAULT 'pix'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_plan RECORD;
    v_advertiser RECORD;
    v_period_discount RECORD;
    v_coupon RECORD;
    v_months INT := 1;
    v_period_discount_pct NUMERIC := 0.00;
    v_base_price_cents INT;
    v_period_discount_cents INT := 0;
    v_coupon_discount_cents INT := 0;
    v_final_price_cents INT;
    v_subscription_id UUID;
    v_invoice_id UUID;
    v_invoice_num VARCHAR(64);
    v_pix_code TEXT;
    v_qr_url TEXT;
BEGIN
    -- 1. Validar anunciante
    SELECT * INTO v_advertiser FROM public.advertisers WHERE id = p_advertiser_id;
    IF v_advertiser.id IS NULL THEN
        RAISE EXCEPTION 'Anunciante não encontrado.' USING ERRCODE = 'P0002';
    END IF;

    -- 2. Validar plano
    SELECT * INTO v_plan FROM public.ad_plans WHERE id = p_plan_id AND is_active = true;
    IF v_plan.id IS NULL THEN
        RAISE EXCEPTION 'Plano de publicidade inválido ou inativo.' USING ERRCODE = 'P0002';
    END IF;

    -- 3. Obter desconto do período
    SELECT * INTO v_period_discount FROM public.ad_period_discounts WHERE period::TEXT = p_billing_period AND is_active = true;
    IF v_period_discount.id IS NOT NULL THEN
        v_months := v_period_discount.months_count;
        v_period_discount_pct := v_period_discount.discount_percentage;
    ELSE
        v_months := 1;
        v_period_discount_pct := 0.00;
    END IF;

    -- Cálculo bruto
    v_base_price_cents := v_plan.price_cents * v_months;
    v_period_discount_cents := ROUND(v_base_price_cents * (v_period_discount_pct / 100.00));
    v_final_price_cents := v_base_price_cents - v_period_discount_cents;

    -- 4. Validar e aplicar cupom se fornecido
    IF p_coupon_code IS NOT NULL AND trim(p_coupon_code) <> '' THEN
        SELECT * INTO v_coupon 
        FROM public.ad_coupons 
        WHERE code = upper(trim(p_coupon_code))
          AND is_active = true
          AND (valid_until IS NULL OR valid_until >= NOW())
          AND (max_uses IS NULL OR current_uses < max_uses);

        IF v_coupon.id IS NOT NULL THEN
            IF v_coupon.discount_percent > 0 THEN
                v_coupon_discount_cents := ROUND(v_final_price_cents * (v_coupon.discount_percent / 100.00));
            ELSIF v_coupon.discount_fixed_cents > 0 THEN
                v_coupon_discount_cents := LEAST(v_coupon.discount_fixed_cents, v_final_price_cents);
            END IF;
            v_final_price_cents := GREATEST(0, v_final_price_cents - v_coupon_discount_cents);

            -- Incrementa uso do cupom
            UPDATE public.ad_coupons SET current_uses = current_uses + 1 WHERE id = v_coupon.id;
        END IF;
    END IF;

    -- 5. Criar registro de assinatura
    INSERT INTO public.ad_subscriptions (
        advertiser_id,
        plan_id,
        campaign_id,
        billing_period,
        status,
        base_price_cents,
        period_discount_cents,
        coupon_discount_cents,
        final_price_cents,
        auto_renew
    ) VALUES (
        p_advertiser_id,
        p_plan_id,
        p_campaign_id,
        p_billing_period::public.ad_billing_period,
        'pending',
        v_base_price_cents,
        v_period_discount_cents,
        v_coupon_discount_cents,
        v_final_price_cents,
        true
    ) RETURNING id INTO v_subscription_id;

    -- 6. Gerar número de fatura amigável
    v_invoice_num := 'INV-ADS-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 6);

    -- Simulação de payload PIX Copia e Cola / QR Code para demonstração
    v_pix_code := '00020126580014br.gov.bcb.pix0136televet-ads-' || v_subscription_id::TEXT || '520400005303986540' || (v_final_price_cents::NUMERIC / 100.00)::TEXT || '5802BR5920TELEVET ADS PUBLICIDADE6009SAO PAULO62070503***6304';
    v_qr_url := 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' || v_pix_code;

    -- 7. Inserir fatura
    INSERT INTO public.ad_invoices (
        invoice_number,
        advertiser_id,
        subscription_id,
        campaign_id,
        plan_id,
        gross_amount_cents,
        discount_cents,
        net_amount_cents,
        status,
        payment_method,
        pix_qr_code,
        pix_copy_paste,
        pix_expires_at,
        due_date,
        tax_id_cnpj
    ) VALUES (
        v_invoice_num,
        p_advertiser_id,
        v_subscription_id,
        p_campaign_id,
        p_plan_id,
        v_base_price_cents,
        (v_period_discount_cents + v_coupon_discount_cents),
        v_final_price_cents,
        'pending',
        p_payment_method,
        v_qr_url,
        v_pix_code,
        NOW() + INTERVAL '2 days',
        NOW() + INTERVAL '2 days',
        v_advertiser.cnpj
    ) RETURNING id INTO v_invoice_id;

    -- 8. Registrar evento de criação no Ledger
    INSERT INTO public.ad_payment_ledger (
        advertiser_id,
        invoice_id,
        subscription_id,
        event_type,
        amount_cents,
        direction,
        balance_after_cents,
        description
    ) VALUES (
        p_advertiser_id,
        v_invoice_id,
        v_subscription_id,
        'invoice_created',
        v_final_price_cents,
        'none',
        v_advertiser.balance_cents,
        'Fatura de anúncio ' || v_invoice_num || ' emitida para o plano ' || v_plan.name
    );

    RETURN jsonb_build_object(
        'success', true,
        'subscription_id', v_subscription_id,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_num,
        'final_price_cents', v_final_price_cents,
        'pix_copy_paste', v_pix_code,
        'pix_qr_code', v_qr_url,
        'due_date', NOW() + INTERVAL '2 days'
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. FUNÇÃO: process_ad_webhook
-- Idempotência Total, Deduplicação de Webhook e Ativação Real de Campanha
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_ad_webhook(
    p_provider_name VARCHAR(64),
    p_provider_event_id VARCHAR(255),
    p_event_type VARCHAR(64),
    p_provider_status VARCHAR(64),
    p_invoice_id UUID,
    p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_existing_event RECORD;
    v_invoice RECORD;
    v_subscription RECORD;
    v_campaign RECORD;
    v_advertiser RECORD;
    v_months INT := 1;
    v_period_interval INTERVAL;
    v_auth_hash VARCHAR(64);
BEGIN
    -- 1. Deduplicação do Webhook
    SELECT * INTO v_existing_event 
    FROM public.ad_webhook_events 
    WHERE provider_name = p_provider_name AND provider_event_id = p_provider_event_id;

    IF v_existing_event.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'duplicate', true,
            'message', 'Evento do provedor já processado anteriormente com idempotência.'
        );
    END IF;

    -- 2. Registrar evento bruto para auditoria
    INSERT INTO public.ad_webhook_events (
        provider_name,
        provider_event_id,
        event_type,
        invoice_id,
        payload
    ) VALUES (
        p_provider_name,
        p_provider_event_id,
        p_event_type,
        p_invoice_id,
        p_payload
    );

    -- 3. Buscar fatura correspondente
    SELECT * INTO v_invoice FROM public.ad_invoices WHERE id = p_invoice_id;
    IF v_invoice.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Fatura não encontrada.');
    END IF;

    -- 4. Processar CONFIRMAÇÃO REAL DE SUCESSO (NUNCA ATIVAR SEM SUCESSO REAL)
    IF p_provider_status = 'succeeded' OR p_provider_status = 'approved' OR p_provider_status = 'paid' THEN
        
        -- Gerar hash de autenticidade do recibo
        v_auth_hash := encode(digest(v_invoice.id::TEXT || NOW()::TEXT || v_invoice.net_amount_cents::TEXT, 'sha256'), 'hex');

        -- Atualizar fatura para paga
        UPDATE public.ad_invoices
        SET status = 'paid',
            provider_status = 'succeeded',
            paid_at = NOW(),
            receipt_auth_hash = v_auth_hash,
            updated_at = NOW()
        WHERE id = v_invoice.id;

        -- Buscar assinatura vinculada
        IF v_invoice.subscription_id IS NOT NULL THEN
            SELECT * INTO v_subscription FROM public.ad_subscriptions WHERE id = v_invoice.subscription_id;

            -- Calcular duração do período
            IF v_subscription.billing_period = 'yearly' THEN
                v_period_interval := INTERVAL '1 year';
            ELSIF v_subscription.billing_period = 'semiannual' THEN
                v_period_interval := INTERVAL '6 months';
            ELSIF v_subscription.billing_period = 'quarterly' THEN
                v_period_interval := INTERVAL '3 months';
            ELSE
                v_period_interval := INTERVAL '1 month';
            END IF;

            -- Ativar assinatura
            UPDATE public.ad_subscriptions
            SET status = 'active',
                current_period_start = NOW(),
                current_period_end = NOW() + v_period_interval,
                grace_period_until = NOW() + v_period_interval + INTERVAL '5 days',
                failed_charge_attempts = 0,
                updated_at = NOW()
            WHERE id = v_subscription.id;
        END IF;

        -- Atualizar status de pagamento da campanha vinculada
        IF v_invoice.campaign_id IS NOT NULL THEN
            SELECT * INTO v_campaign FROM public.ad_campaigns WHERE id = v_invoice.campaign_id;
            
            -- Se a campanha já estava aprovada pelo admin, passa diretamente a 'ativo'
            -- Se estava em rascunho, avança para 'aguardando_aprovacao'
            IF v_campaign.status = 'aprovado' THEN
                UPDATE public.ad_campaigns
                SET payment_status = 'paid',
                    status = 'ativo',
                    updated_at = NOW()
                WHERE id = v_campaign.id;
            ELSE
                UPDATE public.ad_campaigns
                SET payment_status = 'paid',
                    status = CASE WHEN v_campaign.status = 'rascunho' THEN 'aguardando_aprovacao' ELSE v_campaign.status END,
                    updated_at = NOW()
                WHERE id = v_campaign.id;
            END IF;
        END IF;

        -- Registrar no Ledger Contábil de Publicidade
        INSERT INTO public.ad_payment_ledger (
            advertiser_id,
            invoice_id,
            subscription_id,
            event_type,
            amount_cents,
            direction,
            balance_after_cents,
            description
        ) VALUES (
            v_invoice.advertiser_id,
            v_invoice.id,
            v_invoice.subscription_id,
            'payment_succeeded',
            v_invoice.net_amount_cents,
            'credit',
            0,
            'Pagamento de fatura ' || v_invoice.invoice_number || ' confirmado via gateway ' || p_provider_name
        );

        RETURN jsonb_build_object(
            'success', true,
            'status', 'paid',
            'subscription_activated', true,
            'campaign_paid', true,
            'receipt_hash', v_auth_hash
        );

    -- Processar FALHA ou EXPIRAÇÃO
    ELSIF p_provider_status = 'failed' OR p_provider_status = 'cancelled' OR p_provider_status = 'expired' THEN
        
        UPDATE public.ad_invoices
        SET status = 'failed',
            provider_status = p_provider_status,
            updated_at = NOW()
        WHERE id = v_invoice.id;

        -- Registrar no Ledger
        INSERT INTO public.ad_payment_ledger (
            advertiser_id,
            invoice_id,
            subscription_id,
            event_type,
            amount_cents,
            direction,
            balance_after_cents,
            description
        ) VALUES (
            v_invoice.advertiser_id,
            v_invoice.id,
            v_invoice.subscription_id,
            'payment_failed',
            v_invoice.net_amount_cents,
            'none',
            0,
            'Tentativa de pagamento da fatura ' || v_invoice.invoice_number || ' recusada/expirada no gateway ' || p_provider_name
        );

        RETURN jsonb_build_object(
            'success', true,
            'status', 'failed',
            'subscription_activated', false
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'status', p_provider_status);
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. FUNÇÃO: check_and_suspend_overdue_ad_subscriptions
-- Inadimplência, Tolerância (Grace Period), Suspensão Automática e Outbox
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_and_suspend_overdue_ad_subscriptions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_sub RECORD;
    v_suspended_count INT := 0;
    v_past_due_count INT := 0;
BEGIN
    -- 1. Transicionar de active para past_due se expirou o período normal
    FOR v_sub IN
        SELECT s.*, a.contact_email, a.contact_name, a.razao_social
        FROM public.ad_subscriptions s
        JOIN public.advertisers a ON a.id = s.advertiser_id
        WHERE s.status = 'active'
          AND s.current_period_end < NOW()
          AND s.grace_period_until >= NOW()
    LOOP
        UPDATE public.ad_subscriptions
        SET status = 'past_due',
            updated_at = NOW()
        WHERE id = v_sub.id;

        -- Registrar no Ledger
        INSERT INTO public.ad_payment_ledger (
            advertiser_id,
            subscription_id,
            event_type,
            amount_cents,
            direction,
            balance_after_cents,
            description
        ) VALUES (
            v_sub.advertiser_id,
            NULL,
            v_sub.id,
            'subscription_past_due',
            0,
            'none',
            0,
            'Assinatura em tolerância de pagamento (past_due) até ' || TO_CHAR(v_sub.grace_period_until, 'DD/MM/YYYY')
        );

        -- Enviar notificação de aviso de vencimento para Outbox (Fase 14)
        INSERT INTO public.notifications_outbox (
            channel,
            recipient_address,
            subject,
            body_text,
            status
        ) VALUES (
            'email',
            v_sub.contact_email,
            'Aviso de Renovação - TeleVet Ads',
            'Olá ' || v_sub.contact_name || ', sua assinatura de anúncios para ' || v_sub.razao_social || ' venceu. Você está em período de carência até ' || TO_CHAR(v_sub.grace_period_until, 'DD/MM/YYYY') || '. Efetue o pagamento para evitar a interrupção das suas campanhas.',
            'pending'
        );

        v_past_due_count := v_past_due_count + 1;
    END LOOP;

    -- 2. Transicionar de past_due para suspended se esgotou a tolerância
    FOR v_sub IN
        SELECT s.*, a.contact_email, a.contact_name, a.razao_social
        FROM public.ad_subscriptions s
        JOIN public.advertisers a ON a.id = s.advertiser_id
        WHERE (s.status = 'active' OR s.status = 'past_due')
          AND s.grace_period_until < NOW()
    LOOP
        UPDATE public.ad_subscriptions
        SET status = 'suspended',
            updated_at = NOW()
        WHERE id = v_sub.id;

        -- Suspender campanhas vinculadas (deixam de ser servidas)
        IF v_sub.campaign_id IS NOT NULL THEN
            UPDATE public.ad_campaigns
            SET payment_status = 'failed',
                status = 'pausado',
                updated_at = NOW()
            WHERE id = v_sub.campaign_id;
        ELSE
            UPDATE public.ad_campaigns
            SET payment_status = 'failed',
                status = 'pausado',
                updated_at = NOW()
            WHERE advertiser_id = v_sub.advertiser_id AND status = 'ativo';
        END IF;

        -- Registrar no Ledger
        INSERT INTO public.ad_payment_ledger (
            advertiser_id,
            subscription_id,
            event_type,
            amount_cents,
            direction,
            balance_after_cents,
            description
        ) VALUES (
            v_sub.advertiser_id,
            NULL,
            v_sub.id,
            'subscription_suspended',
            0,
            'none',
            0,
            'Assinatura suspensa por tolerância de pagamento esgotada. Campanhas pausadas.'
        );

        v_suspended_count := v_suspended_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'past_due_count', v_past_due_count,
        'suspended_count', v_suspended_count
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. FUNÇÃO: admin_toggle_directory_verified
-- Ativação ou Revogação do Selo de Empresa Verificada com Auditoria
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_toggle_directory_verified(
    p_provider_id UUID,
    p_is_verified BOOLEAN,
    p_verification_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.service_providers
    SET is_verified = p_is_verified,
        verified_at = CASE WHEN p_is_verified THEN NOW() ELSE NULL END,
        verification_notes = p_verification_notes,
        updated_at = NOW()
    WHERE id = p_provider_id;

    RETURN jsonb_build_object(
        'success', true,
        'provider_id', p_provider_id,
        'is_verified', p_is_verified
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 13. POLÍTICAS RLS (Row Level Security)
-- Isolamento Rígido: Anunciante A NUNCA tem acesso às faturas/assinaturas do B
-- ---------------------------------------------------------------------------
ALTER TABLE public.ad_period_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_payment_ledger ENABLE ROW LEVEL SECURITY;

-- 13.1 ad_period_discounts
CREATE POLICY "Leitura pública de descontos ativos por período"
    ON public.ad_period_discounts FOR SELECT
    USING (is_active = true);

CREATE POLICY "Admin Master gerencia descontos de período"
    ON public.ad_period_discounts FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

-- 13.2 ad_coupons
CREATE POLICY "Leitura pública de cupons válidos"
    ON public.ad_coupons FOR SELECT
    USING (is_active = true);

CREATE POLICY "Admin Master gerencia cupons"
    ON public.ad_coupons FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

-- 13.3 ad_subscriptions
CREATE POLICY "Anunciante visualiza suas próprias assinaturas"
    ON public.ad_subscriptions FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.advertisers a
            WHERE a.id = ad_subscriptions.advertiser_id
              AND a.owner_user_id = auth.uid()
        )
        OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
    );

-- 13.4 ad_invoices
CREATE POLICY "Anunciante visualiza suas próprias faturas"
    ON public.ad_invoices FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.advertisers a
            WHERE a.id = ad_invoices.advertiser_id
              AND a.owner_user_id = auth.uid()
        )
        OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
    );

-- 13.5 ad_payment_ledger
CREATE POLICY "Anunciante visualiza seu próprio extrato contábil de ads"
    ON public.ad_payment_ledger FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.advertisers a
            WHERE a.id = ad_payment_ledger.advertiser_id
              AND a.owner_user_id = auth.uid()
        )
        OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
    );

-- 13.6 ad_webhook_events
CREATE POLICY "Apenas Admin Master visualiza webhooks de ads"
    ON public.ad_webhook_events FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

COMMIT;
