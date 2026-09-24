-- ==============================================================================
-- 0003_veterinarians_and_crm.sql
-- Fase 1: Veterinários, Especialidades, CRMV e Validação de CRM
-- ==============================================================================

DO $$ BEGIN
    CREATE TYPE crm_status_type AS ENUM (
        'pending_verification',
        'active_regular',
        'suspended',
        'cancelled',
        'transferred',
        'rejected'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 1. TABELA: specialties (Catálogo de Especialidades Veterinárias)
CREATE TABLE IF NOT EXISTS public.specialties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) UNIQUE NOT NULL,
    description TEXT,
    icon_name VARCHAR(64),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. TABELA: veterinarians (Perfil profissional do Médico Veterinário)
CREATE TABLE IF NOT EXISTS public.veterinarians (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    bio TEXT,
    consultation_fee_cents INTEGER NOT NULL DEFAULT 0,
    rating_average NUMERIC(3, 2) NOT NULL DEFAULT 5.00,
    total_reviews INTEGER NOT NULL DEFAULT 0,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. TABELA: veterinarian_tenants (Vínculo de credenciamento Veterinário <-> Pet Shop/Tenant)
CREATE TABLE IF NOT EXISTS public.veterinarian_tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    veterinarian_id UUID NOT NULL REFERENCES public.veterinarians(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT FALSE,
    custom_commission_rate NUMERIC(5, 2), -- Sobrescrita de comissão opcional
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_vet_tenant UNIQUE(tenant_id, veterinarian_id)
);

-- 4. TABELA: veterinarian_specialties (Relação N:N Veterinário <-> Especialidades)
CREATE TABLE IF NOT EXISTS public.veterinarian_specialties (
    veterinarian_id UUID NOT NULL REFERENCES public.veterinarians(id) ON DELETE CASCADE,
    specialty_id UUID NOT NULL REFERENCES public.specialties(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(veterinarian_id, specialty_id)
);

-- 5. TABELA: professional_registrations (Registros CRMV com estado emissor)
CREATE TABLE IF NOT EXISTS public.professional_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    veterinarian_id UUID NOT NULL REFERENCES public.veterinarians(id) ON DELETE CASCADE,
    crmv_number VARCHAR(32) NOT NULL,
    state_uf VARCHAR(2) NOT NULL, -- Ex: SP, RJ, MG
    issue_date DATE,
    status crm_status_type NOT NULL DEFAULT 'pending_verification',
    document_proof_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_crmv_state UNIQUE(crmv_number, state_uf)
);

-- 6. TABELA: crm_validation (Histórico e Logs de Validações Automáticas e Manuais do CRMV)
CREATE TABLE IF NOT EXISTS public.crm_validation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id UUID NOT NULL REFERENCES public.professional_registrations(id) ON DELETE CASCADE,
    validated_by_user_id UUID REFERENCES public.users(id),
    validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    validation_source VARCHAR(64) NOT NULL DEFAULT 'cfmv_api', -- cfmv_api, manual_admin, third_party
    is_valid BOOLEAN NOT NULL DEFAULT FALSE,
    raw_response JSONB NOT NULL DEFAULT '{}'::jsonb,
    validation_notes TEXT,
    status crm_status_type NOT NULL DEFAULT 'pending_verification'
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_vets_user_id ON public.veterinarians(user_id);
CREATE INDEX IF NOT EXISTS idx_vet_tenants_tenant_id ON public.veterinarian_tenants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vet_tenants_vet_id ON public.veterinarian_tenants(veterinarian_id);
CREATE INDEX IF NOT EXISTS idx_prof_reg_vet_id ON public.professional_registrations(veterinarian_id);
CREATE INDEX IF NOT EXISTS idx_prof_reg_crmv ON public.professional_registrations(crmv_number, state_uf);
CREATE INDEX IF NOT EXISTS idx_crm_val_reg_id ON public.crm_validation(registration_id);

-- Triggers
CREATE OR REPLACE TRIGGER trg_veterinarians_updated_at
BEFORE UPDATE ON public.veterinarians
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE OR REPLACE TRIGGER trg_prof_registrations_updated_at
BEFORE UPDATE ON public.professional_registrations
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
