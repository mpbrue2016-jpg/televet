-- ============================================================================== 
-- 0027_telemedicine_cfmv_compliance.sql
-- Fase 7: Conformidade CFMV de telemedicina veterinária (RPVAR, urgência e consentimento)
-- ============================================================================== 

BEGIN;

ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS telemedicine_consent_required BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS telemedicine_consent_signed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS telemedicine_triage_passed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS telemedicine_triage_completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS telemedicine_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS telemedicine_technology JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.care_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    tutor_id UUID NOT NULL REFERENCES public.tutors(id) ON DELETE CASCADE,
    veterinarian_id UUID REFERENCES public.veterinarians(id) ON DELETE CASCADE,
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
    established_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    relationship_form TEXT NOT NULL CHECK (relationship_form IN ('presential_registered', 'imported_with_proof')),
    evidence_document_url TEXT,
    evidence_reference TEXT,
    validated_by UUID REFERENCES public.users(id),
    valid_until TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked', 'pending_review')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (veterinarian_id IS NOT NULL OR clinic_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.telemedicine_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
    pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    tutor_id UUID NOT NULL REFERENCES public.tutors(id) ON DELETE CASCADE,
    veterinarian_id UUID NOT NULL REFERENCES public.veterinarians(id) ON DELETE CASCADE,
    terms_version TEXT NOT NULL DEFAULT 'CFMV_2022_v1',
    consented BOOLEAN NOT NULL,
    signed_at TIMESTAMPTZ,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (consented = TRUE OR signed_at IS NULL OR signed_at <= NOW())
);

CREATE TABLE IF NOT EXISTS public.telemedicine_triage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
    pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    tutor_id UUID NOT NULL REFERENCES public.tutors(id) ON DELETE CASCADE,
    veterinarian_id UUID NOT NULL REFERENCES public.veterinarians(id) ON DELETE CASCADE,
    signals JSONB NOT NULL DEFAULT '{}'::jsonb,
    emergency_detected BOOLEAN NOT NULL DEFAULT FALSE,
    recommended_action TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.care_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemedicine_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemedicine_triage_records ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_care_relationships_pet_vet_active
    ON public.care_relationships(pet_id, veterinarian_id, status, valid_until);
CREATE INDEX IF NOT EXISTS idx_care_relationships_tutor_active
    ON public.care_relationships(tutor_id, status, valid_until);
CREATE INDEX IF NOT EXISTS idx_telemedicine_consents_appointment_id
    ON public.telemedicine_consents(appointment_id);
CREATE INDEX IF NOT EXISTS idx_telemedicine_triage_records_appointment_id
    ON public.telemedicine_triage_records(appointment_id);

CREATE POLICY "care_relationships_read_access" ON public.care_relationships
FOR SELECT
USING (
    tutor_id IN (SELECT id FROM public.tutors WHERE user_id = auth.uid())
    OR veterinarian_id IN (SELECT id FROM public.veterinarians WHERE user_id = auth.uid())
    OR public.is_admin()
);

CREATE POLICY "care_relationships_write_access" ON public.care_relationships
FOR INSERT WITH CHECK (
    public.is_admin() OR veterinarian_id IN (SELECT id FROM public.veterinarians WHERE user_id = auth.uid())
);

CREATE POLICY "care_relationships_update_access" ON public.care_relationships
FOR UPDATE USING (
    public.is_admin() OR validated_by = auth.uid() OR veterinarian_id IN (SELECT id FROM public.veterinarians WHERE user_id = auth.uid())
);

CREATE POLICY "telemedicine_consents_read_access" ON public.telemedicine_consents
FOR SELECT USING (
    tutor_id IN (SELECT id FROM public.tutors WHERE user_id = auth.uid())
    OR veterinarian_id IN (SELECT id FROM public.veterinarians WHERE user_id = auth.uid())
    OR public.is_admin()
);

CREATE POLICY "telemedicine_consents_insert_access" ON public.telemedicine_consents
FOR INSERT WITH CHECK (
    tutor_id IN (SELECT id FROM public.tutors WHERE user_id = auth.uid())
    OR veterinarian_id IN (SELECT id FROM public.veterinarians WHERE user_id = auth.uid())
    OR public.is_admin()
);

CREATE POLICY "telemedicine_triage_read_access" ON public.telemedicine_triage_records
FOR SELECT USING (
    tutor_id IN (SELECT id FROM public.tutors WHERE user_id = auth.uid())
    OR veterinarian_id IN (SELECT id FROM public.veterinarians WHERE user_id = auth.uid())
    OR public.is_admin()
);

CREATE POLICY "telemedicine_triage_insert_access" ON public.telemedicine_triage_records
FOR INSERT WITH CHECK (
    tutor_id IN (SELECT id FROM public.tutors WHERE user_id = auth.uid())
    OR veterinarian_id IN (SELECT id FROM public.veterinarians WHERE user_id = auth.uid())
    OR public.is_admin()
);

CREATE OR REPLACE FUNCTION public.can_book_teleconsultation(p_pet_id UUID, p_veterinarian_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
    WITH vet AS (
        SELECT v.id, v.is_active, v.is_verified
        FROM public.veterinarians v
        WHERE v.id = p_veterinarian_id
    )
    SELECT jsonb_build_object(
        'allowed', (
            EXISTS (
                SELECT 1
                FROM public.care_relationships cr
                WHERE cr.pet_id = p_pet_id
                  AND cr.veterinarian_id = p_veterinarian_id
                  AND cr.status = 'active'
                  AND (cr.valid_until IS NULL OR cr.valid_until > NOW())
            )
            AND EXISTS (SELECT 1 FROM vet WHERE is_active = TRUE AND is_verified = TRUE)
        ),
        'reason', CASE
            WHEN NOT EXISTS (SELECT 1 FROM vet WHERE is_active = TRUE AND is_verified = TRUE) THEN
                'Veterinário inativo ou não verificado não pode atender teleconsulta.'
            WHEN EXISTS (
                SELECT 1
                FROM public.care_relationships cr
                WHERE cr.pet_id = p_pet_id
                  AND cr.veterinarian_id = p_veterinarian_id
                  AND cr.status = 'active'
                  AND (cr.valid_until IS NULL OR cr.valid_until > NOW())
            ) THEN
                'Relação prévia veterinário-animal-responsável válida.'
            ELSE
                'Teleconsulta bloqueada: RPVAR inexistente, expirada ou inválida.'
            END
    );
$$;

CREATE OR REPLACE FUNCTION public.validate_telemedicine_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_booking_check JSONB;
BEGIN
    IF NEW.type = 'teleconsultation' THEN
        SELECT public.can_book_teleconsultation(NEW.pet_id, NEW.veterinarian_id)
        INTO v_booking_check;

        IF ((v_booking_check->>'allowed')::boolean IS FALSE) THEN
            RAISE EXCEPTION 'Teleconsulta bloqueada: RPVAR inválida ou ausente para o pet e veterinário.';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM public.veterinarians v
            WHERE v.id = NEW.veterinarian_id
              AND (v.is_active = FALSE OR v.is_verified = FALSE)
        ) THEN
            RAISE EXCEPTION 'Somente veterinário ativo e verificado pode realizar telemedicina.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_telemedicine_booking ON public.appointments;
CREATE TRIGGER trg_validate_telemedicine_booking
BEFORE INSERT OR UPDATE OF type, pet_id, veterinarian_id
ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.validate_telemedicine_booking();

CREATE OR REPLACE FUNCTION public.register_telemedicine_triage(
    p_appointment_id UUID,
    p_signals JSONB,
    p_emergency_detected BOOLEAN,
    p_recommended_action TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_appointment RECORD;
BEGIN
    SELECT * INTO v_appointment
    FROM public.appointments
    WHERE id = p_appointment_id;

    IF v_appointment.id IS NULL THEN
        RAISE EXCEPTION 'Agendamento não encontrado para a triagem.';
    END IF;

    IF v_appointment.type <> 'teleconsultation' THEN
        RAISE EXCEPTION 'A triagem de urgência só se aplica a teleconsulta.';
    END IF;

    INSERT INTO public.telemedicine_triage_records (
        tenant_id,
        appointment_id,
        pet_id,
        tutor_id,
        veterinarian_id,
        signals,
        emergency_detected,
        recommended_action
    ) VALUES (
        v_appointment.tenant_id,
        v_appointment.id,
        v_appointment.pet_id,
        v_appointment.tutor_id,
        v_appointment.veterinarian_id,
        COALESCE(p_signals, '{}'::jsonb),
        COALESCE(p_emergency_detected, FALSE),
        p_recommended_action
    );

    UPDATE public.appointments
    SET
        telemedicine_triage_passed = NOT COALESCE(p_emergency_detected, FALSE),
        telemedicine_triage_completed_at = NOW(),
        telemedicine_signals = COALESCE(p_signals, '{}'::jsonb)
    WHERE id = p_appointment_id;

    IF COALESCE(p_emergency_detected, FALSE) THEN
        RAISE EXCEPTION 'Triagem de urgência bloqueou a teleconsulta. Oriente atendimento presencial imediato e emergência.';
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'appointment_id', p_appointment_id,
        'emergency_detected', FALSE,
        'recommended_action', p_recommended_action,
        'triage_passed', TRUE
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.register_telemedicine_consent(
    p_appointment_id UUID,
    p_consented BOOLEAN,
    p_terms_version TEXT DEFAULT 'CFMV_2022_v1',
    p_ip_address TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_appointment RECORD;
    v_tutor_id UUID;
    v_vet_id UUID;
    v_user_id UUID := auth.uid();
BEGIN
    SELECT * INTO v_appointment
    FROM public.appointments
    WHERE id = p_appointment_id;

    IF v_appointment.id IS NULL THEN
        RAISE EXCEPTION 'Agendamento para consentimento não encontrado.';
    END IF;

    SELECT id INTO v_tutor_id
    FROM public.tutors
    WHERE tenant_id = v_appointment.tenant_id AND id = v_appointment.tutor_id
    LIMIT 1;

    SELECT id INTO v_vet_id
    FROM public.veterinarians
    WHERE id = v_appointment.veterinarian_id
    LIMIT 1;

    IF v_user_id IS NULL OR (
        v_tutor_id IS NULL AND v_vet_id IS NULL
    ) THEN
        RAISE EXCEPTION 'Usuário sem permissão para registrar consentimento.';
    END IF;

    INSERT INTO public.telemedicine_consents (
        tenant_id,
        appointment_id,
        pet_id,
        tutor_id,
        veterinarian_id,
        terms_version,
        consented,
        signed_at,
        ip_address,
        user_agent
    ) VALUES (
        v_appointment.tenant_id,
        v_appointment.id,
        v_appointment.pet_id,
        v_appointment.tutor_id,
        v_appointment.veterinarian_id,
        p_terms_version,
        p_consented,
        CASE WHEN p_consented THEN NOW() ELSE NULL END,
        CASE WHEN p_ip_address IS NOT NULL AND p_ip_address <> '' THEN p_ip_address::inet ELSE NULL END,
        p_user_agent
    );

    UPDATE public.appointments
    SET
        telemedicine_consent_required = TRUE,
        telemedicine_consent_signed = COALESCE(p_consented, FALSE)
    WHERE id = p_appointment_id;

    IF NOT p_consented THEN
        RAISE EXCEPTION 'Consentimento de telemedicina obrigatório antes do início do atendimento.';
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'appointment_id', p_appointment_id,
        'consented', TRUE,
        'terms_version', p_terms_version
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.register_care_relationship(
    p_pet_id UUID,
    p_tutor_id UUID,
    p_veterinarian_id UUID,
    p_clinic_id UUID DEFAULT NULL,
    p_relationship_form TEXT DEFAULT 'presential_registered',
    p_evidence_document_url TEXT DEFAULT NULL,
    p_evidence_reference TEXT DEFAULT NULL,
    p_valid_until TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant_id UUID;
    v_id UUID;
BEGIN
    SELECT tenant_id INTO v_tenant_id
    FROM public.pets
    WHERE id = p_pet_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Pet não encontrado para registrar a relação prévia.';
    END IF;

    INSERT INTO public.care_relationships (
        tenant_id,
        pet_id,
        tutor_id,
        veterinarian_id,
        clinic_id,
        relationship_form,
        evidence_document_url,
        evidence_reference,
        validated_by,
        valid_until,
        status,
        established_at
    ) VALUES (
        v_tenant_id,
        p_pet_id,
        p_tutor_id,
        p_veterinarian_id,
        p_clinic_id,
        p_relationship_form,
        p_evidence_document_url,
        p_evidence_reference,
        auth.uid(),
        p_valid_until,
        'active',
        NOW()
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

COMMIT;
