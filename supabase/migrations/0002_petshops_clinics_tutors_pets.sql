-- ==============================================================================
-- 0002_petshops_clinics_tutors_pets.sql
-- Fase 1: Pet Shops, Clínicas, Tutores e Pets
-- ==============================================================================

DO $$ BEGIN
    CREATE TYPE pet_species_type AS ENUM (
        'canine',
        'feline',
        'avian',
        'reptile',
        'rodent',
        'other'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE pet_sex_type AS ENUM (
        'male',
        'female',
        'unknown'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 1. TABELA: petshops (Entidade de Pet Shop vinculada ao Tenant)
CREATE TABLE IF NOT EXISTS public.petshops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255),
    tax_id_cnpj VARCHAR(18),
    phone VARCHAR(32),
    email VARCHAR(255),
    address JSONB NOT NULL DEFAULT '{
        "street": null,
        "number": null,
        "complement": null,
        "neighborhood": null,
        "city": null,
        "state": null,
        "postal_code": null
    }'::jsonb,
    commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 10.00, -- % de comissão padrão do Pet Shop
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. TABELA: clinics (Clínicas físicas ou digitais vinculadas ao Pet Shop / Tenant)
CREATE TABLE IF NOT EXISTS public.clinics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    petshop_id UUID REFERENCES public.petshops(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    technical_manager_name VARCHAR(255),
    technical_manager_crmv VARCHAR(32),
    sanitary_license VARCHAR(64),
    phone VARCHAR(32),
    email VARCHAR(255),
    address JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. TABELA: tutors (Cadastro de Tutores no Tenant)
CREATE TABLE IF NOT EXISTS public.tutors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(32),
    address JSONB NOT NULL DEFAULT '{}'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_tenant_tutor UNIQUE(tenant_id, user_id)
);

-- 4. TABELA: pets (Animais de estimação associados ao Tutor e ao Tenant)
CREATE TABLE IF NOT EXISTS public.pets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    tutor_id UUID NOT NULL REFERENCES public.tutors(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    species pet_species_type NOT NULL DEFAULT 'canine',
    breed VARCHAR(128),
    sex pet_sex_type NOT NULL DEFAULT 'unknown',
    birth_date DATE,
    weight_kg NUMERIC(6, 2),
    microchip_number VARCHAR(64),
    is_neutered BOOLEAN DEFAULT FALSE,
    allergies TEXT,
    chronic_conditions TEXT,
    photo_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para buscas rápidas
CREATE INDEX IF NOT EXISTS idx_petshops_tenant_id ON public.petshops(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clinics_tenant_id ON public.clinics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clinics_petshop_id ON public.clinics(petshop_id);
CREATE INDEX IF NOT EXISTS idx_tutors_tenant_id ON public.tutors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tutors_user_id ON public.tutors(user_id);
CREATE INDEX IF NOT EXISTS idx_pets_tenant_id ON public.pets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pets_tutor_id ON public.pets(tutor_id);
CREATE INDEX IF NOT EXISTS idx_pets_microchip ON public.pets(microchip_number);

-- Triggers de atualização
CREATE OR REPLACE TRIGGER trg_petshops_updated_at
BEFORE UPDATE ON public.petshops
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE OR REPLACE TRIGGER trg_clinics_updated_at
BEFORE UPDATE ON public.clinics
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE OR REPLACE TRIGGER trg_tutors_updated_at
BEFORE UPDATE ON public.tutors
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE OR REPLACE TRIGGER trg_pets_updated_at
BEFORE UPDATE ON public.pets
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
