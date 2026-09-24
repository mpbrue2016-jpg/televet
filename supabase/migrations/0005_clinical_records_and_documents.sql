-- ==============================================================================
-- 0005_clinical_records_and_documents.sql
-- Fase 1: Prontuários Médicos, Prescrições, Exames, Encaminhamentos e Documentos
-- ==============================================================================

DO $$ BEGIN
    CREATE TYPE exam_status_type AS ENUM (
        'requested',
        'sample_collected',
        'analyzing',
        'completed',
        'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE referral_priority_type AS ENUM (
        'routine',
        'urgent',
        'emergency'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 1. TABELA: medical_records (Histórico do prontuário veterinário do Pet)
CREATE TABLE IF NOT EXISTS public.medical_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    consultation_id UUID REFERENCES public.consultations(id) ON DELETE SET NULL,
    veterinarian_id UUID REFERENCES public.veterinarians(id) ON DELETE SET NULL,
    entry_type VARCHAR(64) NOT NULL DEFAULT 'clinical_note', -- anamnesis, vaccine, surgery, weight_check, note
    title VARCHAR(255) NOT NULL,
    details TEXT NOT NULL,
    vital_signs JSONB NOT NULL DEFAULT '{
        "temperature_celsius": null,
        "heart_rate_bpm": null,
        "respiratory_rate_rpm": null,
        "blood_pressure": null,
        "body_condition_score": null
    }'::jsonb,
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. TABELA: prescriptions (Receitas digitais assinadas)
CREATE TABLE IF NOT EXISTS public.prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    consultation_id UUID REFERENCES public.consultations(id) ON DELETE SET NULL,
    veterinarian_id UUID NOT NULL REFERENCES public.veterinarians(id) ON DELETE CASCADE,
    pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    tutor_id UUID NOT NULL REFERENCES public.tutors(id) ON DELETE CASCADE,
    medications JSONB NOT NULL DEFAULT '[]'::jsonb, -- array de {name, dosage, frequency, duration, route, instructions}
    general_recommendations TEXT,
    validation_code VARCHAR(64) UNIQUE NOT NULL, -- Código público para farmácia validar
    digital_signature_hash TEXT, -- ICP-Brasil ou assinatura digital
    signed_at TIMESTAMPTZ,
    pdf_url TEXT,
    expires_at DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. TABELA: exams (Solicitação e Laudo de Exames laboratoriais/imagem)
CREATE TABLE IF NOT EXISTS public.exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    consultation_id UUID REFERENCES public.consultations(id) ON DELETE SET NULL,
    pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    veterinarian_id UUID REFERENCES public.veterinarians(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(64) NOT NULL DEFAULT 'blood', -- blood, imaging, urine, biopsy, cardiology, other
    clinical_justification TEXT,
    status exam_status_type NOT NULL DEFAULT 'requested',
    results_text TEXT,
    file_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. TABELA: referrals_clinical (Encaminhamentos para especialistas)
CREATE TABLE IF NOT EXISTS public.referrals_clinical (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    consultation_id UUID REFERENCES public.consultations(id) ON DELETE SET NULL,
    veterinarian_id UUID NOT NULL REFERENCES public.veterinarians(id) ON DELETE CASCADE,
    pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    specialty_id UUID REFERENCES public.specialties(id) ON DELETE SET NULL,
    target_clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    clinical_summary TEXT,
    priority referral_priority_type NOT NULL DEFAULT 'routine',
    status VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending, attended, expired
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. TABELA: documents (Atestados, Laudos, Termos de Consentimento e Arquivos Médicos)
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    pet_id UUID REFERENCES public.pets(id) ON DELETE CASCADE,
    tutor_id UUID REFERENCES public.tutors(id) ON DELETE CASCADE,
    consultation_id UUID REFERENCES public.consultations(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    document_type VARCHAR(64) NOT NULL DEFAULT 'medical_certificate', -- consent_form, health_certificate, travel_cert, other
    file_path TEXT NOT NULL,
    file_size_bytes BIGINT,
    mime_type VARCHAR(128),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_medical_records_tenant_id ON public.medical_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_pet_id ON public.medical_records(pet_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_tenant_id ON public.prescriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_validation ON public.prescriptions(validation_code);
CREATE INDEX IF NOT EXISTS idx_exams_tenant_id ON public.exams(tenant_id);
CREATE INDEX IF NOT EXISTS idx_exams_pet_id ON public.exams(pet_id);
CREATE INDEX IF NOT EXISTS idx_referrals_clinical_tenant_id ON public.referrals_clinical(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON public.documents(tenant_id);

-- Triggers de atualização
CREATE OR REPLACE TRIGGER trg_medical_records_updated_at
BEFORE UPDATE ON public.medical_records
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE OR REPLACE TRIGGER trg_prescriptions_updated_at
BEFORE UPDATE ON public.prescriptions
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE OR REPLACE TRIGGER trg_exams_updated_at
BEFORE UPDATE ON public.exams
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE OR REPLACE TRIGGER trg_referrals_clinical_updated_at
BEFORE UPDATE ON public.referrals_clinical
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
