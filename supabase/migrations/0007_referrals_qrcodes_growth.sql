-- ==============================================================================
-- 0007_referrals_qrcodes_growth.sql
-- Fase 1: Indicação de Tutores/Pet Shops, Atribuição de Vendas e QR Codes de Acesso
-- ==============================================================================

-- 1. TABELA: referrals (Códigos de convite e indicação gerados por Pet Shops ou Tutores)
CREATE TABLE IF NOT EXISTS public.referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    code VARCHAR(64) NOT NULL,
    referrer_type VARCHAR(32) NOT NULL DEFAULT 'petshop', -- petshop, tutor, veterinarian, influencer
    referrer_id UUID NOT NULL, -- ID correspondente na tabela petshops, tutors, etc.
    campaign_name VARCHAR(128),
    discount_percentage NUMERIC(5, 2) DEFAULT 0.00,
    commission_percentage NUMERIC(5, 2) DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_tenant_referral_code UNIQUE(tenant_id, code)
);

-- 2. TABELA: referral_attributions (Vínculo e conversão de novos usuários indicados)
CREATE TABLE IF NOT EXISTS public.referral_attributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    referral_id UUID NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
    referred_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
    conversion_value_cents INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'attributed', -- attributed, converted, rewarded
    attributed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. TABELA: qr_codes (QR Codes físicos para balcão de Pet Shop, crachás ou embalagens)
CREATE TABLE IF NOT EXISTS public.qr_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    petshop_id UUID REFERENCES public.petshops(id) ON DELETE SET NULL,
    referral_id UUID REFERENCES public.referrals(id) ON DELETE SET NULL,
    label VARCHAR(255) NOT NULL, -- Ex: 'Display de Balcão Loja Centro'
    code_hash VARCHAR(64) UNIQUE NOT NULL,
    destination_url TEXT NOT NULL,
    scans_count INTEGER NOT NULL DEFAULT 0,
    last_scanned_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_referrals_tenant_id ON public.referrals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON public.referrals(code);
CREATE INDEX IF NOT EXISTS idx_referral_attributions_tenant_id ON public.referral_attributions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_referral_attributions_user ON public.referral_attributions(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_tenant_id ON public.qr_codes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_hash ON public.qr_codes(code_hash);

-- Triggers de atualização
CREATE OR REPLACE TRIGGER trg_qr_codes_updated_at
BEFORE UPDATE ON public.qr_codes
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
