-- ==============================================================================
-- 0004_appointments_and_consultations.sql
-- Fase 1: Agendamentos, Atendimentos e Teleconsultas
-- ==============================================================================

DO $$ BEGIN
    CREATE TYPE appointment_status_type AS ENUM (
        'requested',
        'confirmed',
        'in_progress',
        'completed',
        'rescheduled',
        'cancelled_by_tutor',
        'cancelled_by_vet',
        'no_show'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE appointment_type_type AS ENUM (
        'teleconsultation',
        'presential_clinic',
        'presential_home',
        'triage_chat'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE consultation_status_type AS ENUM (
        'waiting_room',
        'active',
        'finished',
        'interrupted',
        'abandoned'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 1. TABELA: appointments (Agendamentos com vínculo estrito ao Tenant)
CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    tutor_id UUID NOT NULL REFERENCES public.tutors(id) ON DELETE CASCADE,
    veterinarian_id UUID NOT NULL REFERENCES public.veterinarians(id) ON DELETE CASCADE,
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
    specialty_id UUID REFERENCES public.specialties(id) ON DELETE SET NULL,
    type appointment_type_type NOT NULL DEFAULT 'teleconsultation',
    status appointment_status_type NOT NULL DEFAULT 'requested',
    scheduled_for TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    price_cents INTEGER NOT NULL DEFAULT 0,
    reason_for_visit TEXT,
    notes TEXT,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. TABELA: consultations (Sessão clínica da consulta / sala de telemedicina)
CREATE TABLE IF NOT EXISTS public.consultations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    appointment_id UUID UNIQUE NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    status consultation_status_type NOT NULL DEFAULT 'waiting_room',
    room_token VARCHAR(255),
    room_url TEXT,
    recording_url TEXT,
    chief_complaint TEXT,
    anamnesis TEXT,
    physical_exam TEXT,
    suspected_diagnosis TEXT,
    definitive_diagnosis TEXT,
    clinical_conduct TEXT,
    private_veterinarian_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para buscas operacionais
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_id ON public.appointments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointments_pet_id ON public.appointments(pet_id);
CREATE INDEX IF NOT EXISTS idx_appointments_tutor_id ON public.appointments(tutor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_vet_id ON public.appointments(veterinarian_id);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_for ON public.appointments(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);
CREATE INDEX IF NOT EXISTS idx_consultations_tenant_id ON public.consultations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_consultations_appointment_id ON public.consultations(appointment_id);

-- Triggers de atualização
CREATE OR REPLACE TRIGGER trg_appointments_updated_at
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE OR REPLACE TRIGGER trg_consultations_updated_at
BEFORE UPDATE ON public.consultations
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
