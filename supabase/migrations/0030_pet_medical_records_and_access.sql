-- ==============================================================================
-- 0030_pet_medical_records_and_access.sql
-- Fase 10: Prontuario do pet, acesso assistencial, SOAP, receitas e exames
-- ==============================================================================

BEGIN;

ALTER TABLE public.medical_records
    ADD COLUMN IF NOT EXISTS complaint TEXT,
    ADD COLUMN IF NOT EXISTS anamnesis TEXT,
    ADD COLUMN IF NOT EXISTS physical_exam TEXT,
    ADD COLUMN IF NOT EXISTS assessment TEXT,
    ADD COLUMN IF NOT EXISTS diagnosis TEXT,
    ADD COLUMN IF NOT EXISTS plan TEXT,
    ADD COLUMN IF NOT EXISTS return_recommended_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS observations TEXT,
    ADD COLUMN IF NOT EXISTS author_crmv_number TEXT,
    ADD COLUMN IF NOT EXISTS author_crmv_uf VARCHAR(2),
    ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS signed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1 CHECK (version_number > 0),
    ADD COLUMN IF NOT EXISTS technology_used JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.prescriptions
    ADD COLUMN IF NOT EXISTS signed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS signature_kind TEXT NOT NULL DEFAULT 'internal'
        CHECK (signature_kind IN ('internal', 'qualified_icp_brasil')),
    ADD COLUMN IF NOT EXISTS requires_qualified_signature BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS medical_record_id UUID REFERENCES public.medical_records(id) ON DELETE SET NULL;

ALTER TABLE public.exams
    ADD COLUMN IF NOT EXISTS medical_record_id UUID REFERENCES public.medical_records(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS result_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.documents
    ADD COLUMN IF NOT EXISTS medical_record_id UUID REFERENCES public.medical_records(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.record_access_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    tutor_id UUID NOT NULL REFERENCES public.tutors(id) ON DELETE CASCADE,
    veterinarian_id UUID NOT NULL REFERENCES public.veterinarians(id) ON DELETE CASCADE,
    scopes TEXT[] NOT NULL DEFAULT ARRAY['read_clinical']::TEXT[],
    granted_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
        CHECK (cardinality(scopes) > 0),
        CHECK ('read_clinical' = ANY(scopes) OR 'all' = ANY(scopes)),
    CHECK (scopes <@ ARRAY['read_clinical', 'write_clinical', 'prescriptions', 'exams', 'documents', 'all']::TEXT[]),
    CHECK (expires_at > granted_at),
    CHECK (expires_at <= granted_at + INTERVAL '365 days')
);

CREATE TABLE IF NOT EXISTS public.record_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('read', 'write', 'addendum', 'exam_request', 'document_upload', 'prescription', 'pdf_export', 'document_download')),
    purpose TEXT NOT NULL,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.medical_record_addenda (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    medical_record_id UUID NOT NULL REFERENCES public.medical_records(id) ON DELETE RESTRICT,
    pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    veterinarian_id UUID NOT NULL REFERENCES public.veterinarians(id) ON DELETE RESTRICT,
    author_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    author_crmv_number TEXT,
    author_crmv_uf VARCHAR(2),
    version_number INTEGER NOT NULL CHECK (version_number > 1),
    reason TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (medical_record_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.clinical_medication_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    active_ingredient TEXT NOT NULL,
    presentation TEXT NOT NULL DEFAULT '',
    species TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    requires_qualified_signature BOOLEAN NOT NULL DEFAULT FALSE,
    regulatory_reference TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (name, active_ingredient, presentation)
);

CREATE TABLE IF NOT EXISTS public.veterinarian_medication_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    veterinarian_id UUID NOT NULL REFERENCES public.veterinarians(id) ON DELETE CASCADE,
    medication_id UUID NOT NULL REFERENCES public.clinical_medication_catalog(id) ON DELETE RESTRICT,
    dosage TEXT NOT NULL,
    frequency TEXT NOT NULL,
    duration TEXT NOT NULL,
    route TEXT NOT NULL CHECK (route IN ('oral', 'topical', 'injectable', 'ophthalmic', 'otic', 'other')),
    instructions TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (veterinarian_id, medication_id, dosage, frequency, duration)
);

CREATE TABLE IF NOT EXISTS public.prescription_signature_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    consultation_id UUID REFERENCES public.consultations(id) ON DELETE SET NULL,
    pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    tutor_id UUID NOT NULL REFERENCES public.tutors(id) ON DELETE CASCADE,
    veterinarian_id UUID NOT NULL REFERENCES public.veterinarians(id) ON DELETE RESTRICT,
    requested_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    medications JSONB NOT NULL,
    recommendations TEXT,
    status TEXT NOT NULL DEFAULT 'pending_configuration'
        CHECK (status IN ('pending_configuration', 'pending_provider', 'signed', 'rejected', 'failed')),
    provider_name TEXT,
    provider_reference TEXT,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.teleconsultation_status_updates (
    consultation_id UUID PRIMARY KEY REFERENCES public.consultations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    consultation_status public.consultation_status_type NOT NULL,
    video_room_status TEXT NOT NULL,
    video_room_started_at TIMESTAMPTZ,
    video_room_ended_at TIMESTAMPTZ,
    video_actual_duration_seconds INTEGER NOT NULL DEFAULT 0,
    video_connection_drop_count INTEGER NOT NULL DEFAULT 0,
    recording_status public.consultation_recording_status_type,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_record_access_grants_active
    ON public.record_access_grants(pet_id, veterinarian_id, expires_at)
    WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_record_access_log_pet_time
    ON public.record_access_log(pet_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_record_access_log_user_time
    ON public.record_access_log(user_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_medical_record_addenda_record_version
    ON public.medical_record_addenda(medical_record_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_medical_records_search
    ON public.medical_records USING GIN (
        to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(details, '') || ' ' || coalesce(diagnosis, '') || ' ' || coalesce(anamnesis, ''))
    );
CREATE INDEX IF NOT EXISTS idx_exams_record_pet ON public.exams(pet_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_record_pet ON public.documents(pet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prescriptions_record_pet ON public.prescriptions(pet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_medication_catalog_active ON public.clinical_medication_catalog(name) WHERE is_active;

ALTER TABLE public.record_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.record_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_record_addenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_medication_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.veterinarian_medication_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_signature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teleconsultation_status_updates ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sync_teleconsultation_status_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.teleconsultation_status_updates (
        consultation_id, tenant_id, consultation_status, video_room_status,
        video_room_started_at, video_room_ended_at, video_actual_duration_seconds,
        video_connection_drop_count, recording_status, updated_at
    ) VALUES (
        NEW.id, NEW.tenant_id, NEW.status, NEW.video_room_status,
        NEW.video_room_started_at, NEW.video_room_ended_at, NEW.video_actual_duration_seconds,
        NEW.video_connection_drop_count, NEW.recording_status, NOW()
    )
    ON CONFLICT (consultation_id) DO UPDATE SET
        consultation_status = EXCLUDED.consultation_status,
        video_room_status = EXCLUDED.video_room_status,
        video_room_started_at = EXCLUDED.video_room_started_at,
        video_room_ended_at = EXCLUDED.video_room_ended_at,
        video_actual_duration_seconds = EXCLUDED.video_actual_duration_seconds,
        video_connection_drop_count = EXCLUDED.video_connection_drop_count,
        recording_status = EXCLUDED.recording_status,
        updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_teleconsultation_status_update ON public.consultations;
CREATE TRIGGER trg_sync_teleconsultation_status_update
AFTER INSERT OR UPDATE OF status, video_room_status, video_room_started_at, video_room_ended_at,
    video_actual_duration_seconds, video_connection_drop_count, recording_status
ON public.consultations
FOR EACH ROW EXECUTE FUNCTION public.sync_teleconsultation_status_update();

INSERT INTO public.teleconsultation_status_updates (
    consultation_id, tenant_id, consultation_status, video_room_status,
    video_room_started_at, video_room_ended_at, video_actual_duration_seconds,
    video_connection_drop_count, recording_status, updated_at
)
SELECT c.id, c.tenant_id, c.status, c.video_room_status,
       c.video_room_started_at, c.video_room_ended_at, c.video_actual_duration_seconds,
       c.video_connection_drop_count, c.recording_status, NOW()
FROM public.consultations c
ON CONFLICT (consultation_id) DO UPDATE SET
    consultation_status = EXCLUDED.consultation_status,
    video_room_status = EXCLUDED.video_room_status,
    video_room_started_at = EXCLUDED.video_room_started_at,
    video_room_ended_at = EXCLUDED.video_room_ended_at,
    video_actual_duration_seconds = EXCLUDED.video_actual_duration_seconds,
    video_connection_drop_count = EXCLUDED.video_connection_drop_count,
    recording_status = EXCLUDED.recording_status,
    updated_at = NOW();

CREATE OR REPLACE FUNCTION public.can_access_pet_record(
    p_pet_id UUID,
    p_scope TEXT DEFAULT 'read_clinical'
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE
        WHEN auth.uid() IS NULL THEN FALSE
        WHEN public.is_admin() THEN TRUE
        WHEN EXISTS (
            SELECT 1
            FROM public.pets p
            JOIN public.tutors t ON t.id = p.tutor_id
            WHERE p.id = p_pet_id AND t.user_id = auth.uid()
        ) THEN p_scope IN ('read_clinical', 'prescriptions', 'exams', 'documents', 'all')
        ELSE EXISTS (
            SELECT 1
            FROM public.veterinarians v
            WHERE v.user_id = auth.uid()
              AND (
                  EXISTS (
                      SELECT 1
                      FROM public.appointments a
                      WHERE a.pet_id = p_pet_id
                        AND a.veterinarian_id = v.id
                        AND (
                            a.lifecycle_status IN ('confirmado', 'realizado')
                            OR a.reservation_status IN ('confirmed', 'in_attendance', 'completed')
                        )
                  )
                  OR EXISTS (
                      SELECT 1
                      FROM public.referrals_clinical r
                      WHERE r.pet_id = p_pet_id
                        AND r.veterinarian_id = v.id
                        AND r.status IN ('accepted', 'attended')
                  )
                  OR EXISTS (
                      SELECT 1
                      FROM public.record_access_grants g
                      WHERE g.pet_id = p_pet_id
                        AND g.veterinarian_id = v.id
                        AND g.revoked_at IS NULL
                        AND g.expires_at > NOW()
                        AND (p_scope = ANY(g.scopes) OR 'all' = ANY(g.scopes))
                  )
              )
        )
    END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_signed_medical_record_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.signed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Registro assinado é imutável; correções devem ser feitas por adendo.' USING ERRCODE = '55000';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Registros clínicos não podem ser excluídos; use adendo de correção.' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_signed_medical_record_immutable ON public.medical_records;
CREATE TRIGGER trg_signed_medical_record_immutable
BEFORE UPDATE OR DELETE ON public.medical_records
FOR EACH ROW EXECUTE FUNCTION public.prevent_signed_medical_record_mutation();

CREATE OR REPLACE FUNCTION public.sign_consultation_summary_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_consultation RECORD;
    v_registration RECORD;
BEGIN
    IF NEW.entry_type <> 'consultation_summary' THEN RETURN NEW; END IF;

    SELECT c.video_provider, c.appointment_id
    INTO v_consultation
    FROM public.consultations c WHERE c.id = NEW.consultation_id;

    SELECT pr.crmv_number, pr.state_uf
    INTO v_registration
    FROM public.professional_registrations pr
    WHERE pr.veterinarian_id = NEW.veterinarian_id AND pr.crmv_status = 'validated'
    ORDER BY pr.validated_at DESC NULLS LAST LIMIT 1;
    IF v_registration.crmv_number IS NULL THEN
        RAISE EXCEPTION 'CRMV validado é obrigatório para assinar o resumo clínico.' USING ERRCODE = 'P0003';
    END IF;

    NEW.author_crmv_number := v_registration.crmv_number;
    NEW.author_crmv_uf := v_registration.state_uf;
    NEW.signed_at := COALESCE(NEW.signed_at, NOW());
    NEW.signed_by := COALESCE(NEW.signed_by, auth.uid());
    NEW.technology_used := COALESCE(NEW.technology_used, '{}'::jsonb)
        || jsonb_build_object('provider', COALESCE(v_consultation.video_provider, 'unknown'));
    NEW.details := concat_ws(E'\n', NULLIF(NEW.details, ''),
        'Tecnologia utilizada: ' || COALESCE(v_consultation.video_provider, 'não informada'));
    NEW.version_number := 1;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sign_consultation_summary_record ON public.medical_records;
CREATE TRIGGER trg_sign_consultation_summary_record
BEFORE INSERT ON public.medical_records
FOR EACH ROW EXECUTE FUNCTION public.sign_consultation_summary_record();

CREATE OR REPLACE FUNCTION public.finish_video_consultation(
    p_consultation_id UUID,
    p_anamnesis TEXT,
    p_physical_exam TEXT,
    p_diagnosis TEXT,
    p_clinical_conduct TEXT,
    p_private_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_consultation RECORD;
    v_duration INTEGER;
BEGIN
    SELECT c.id, c.status, c.video_room_started_at, c.video_room_name,
           v.user_id AS veterinarian_user_id
    INTO v_consultation
    FROM public.consultations c
    JOIN public.appointments a ON a.id = c.appointment_id
    JOIN public.veterinarians v ON v.id = a.veterinarian_id
    WHERE c.id = p_consultation_id
    FOR UPDATE OF c;

    IF v_consultation.id IS NULL OR v_consultation.veterinarian_user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Somente o veterinário responsável pode encerrar a teleconsulta.' USING ERRCODE = '42501';
    END IF;
    IF v_consultation.status <> 'active' THEN
        RAISE EXCEPTION 'A teleconsulta precisa estar ativa para ser encerrada.' USING ERRCODE = 'P0003';
    END IF;

    PERFORM public.finish_teleconsultation(
        p_consultation_id, p_anamnesis, p_physical_exam, p_diagnosis, p_clinical_conduct, p_private_notes
    );

    v_duration := CASE
        WHEN v_consultation.video_room_started_at IS NULL THEN 0
        ELSE GREATEST(0, EXTRACT(EPOCH FROM (NOW() - v_consultation.video_room_started_at))::INTEGER)
    END;
    UPDATE public.consultations
    SET video_room_status = 'finished', video_room_ended_at = NOW(),
        video_actual_duration_seconds = v_duration, updated_at = NOW()
    WHERE id = p_consultation_id;
    UPDATE public.appointments a
    SET reservation_status = 'completed'
    WHERE a.id = (SELECT appointment_id FROM public.consultations WHERE id = p_consultation_id)
      AND a.reservation_status = 'in_attendance';

    RETURN jsonb_build_object(
        'success', TRUE, 'consultation_id', p_consultation_id,
        'room_name', v_consultation.video_room_name,
        'duration_seconds', v_duration, 'status', 'finished'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_clinical_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Trilhas clínicas são append-only.' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_record_access_log_append_only ON public.record_access_log;
CREATE TRIGGER trg_record_access_log_append_only
BEFORE UPDATE OR DELETE ON public.record_access_log
FOR EACH ROW EXECUTE FUNCTION public.prevent_clinical_audit_mutation();
DROP TRIGGER IF EXISTS trg_medical_record_addenda_append_only ON public.medical_record_addenda;
CREATE TRIGGER trg_medical_record_addenda_append_only
BEFORE UPDATE OR DELETE ON public.medical_record_addenda
FOR EACH ROW EXECUTE FUNCTION public.prevent_clinical_audit_mutation();

DROP POLICY IF EXISTS policy_medical_records_rbac ON public.medical_records;
DROP POLICY IF EXISTS policy_medical_records_isolation ON public.medical_records;
DROP POLICY IF EXISTS policy_medical_records_read_authorized ON public.medical_records;
CREATE POLICY policy_medical_records_read_authorized ON public.medical_records
FOR SELECT TO authenticated
USING (public.can_access_pet_record(pet_id, 'read_clinical'));

DROP POLICY IF EXISTS policy_prescriptions_rbac ON public.prescriptions;
DROP POLICY IF EXISTS policy_prescriptions_read_authorized ON public.prescriptions;
CREATE POLICY policy_prescriptions_read_authorized ON public.prescriptions
FOR SELECT TO authenticated
USING (public.can_access_pet_record(pet_id, 'prescriptions'));

DROP POLICY IF EXISTS policy_exams_isolation ON public.exams;
DROP POLICY IF EXISTS policy_exams_read_authorized ON public.exams;
CREATE POLICY policy_exams_read_authorized ON public.exams
FOR SELECT TO authenticated
USING (public.can_access_pet_record(pet_id, 'exams'));

DROP POLICY IF EXISTS policy_documents_isolation ON public.documents;
DROP POLICY IF EXISTS policy_documents_read_authorized ON public.documents;
CREATE POLICY policy_documents_read_authorized ON public.documents
FOR SELECT TO authenticated
USING (
    pet_id IS NOT NULL
    AND (
        public.can_access_pet_record(pet_id, 'documents')
        OR public.can_access_pet_record(pet_id, 'write_clinical')
    )
);

DROP POLICY IF EXISTS policy_record_access_grants_read ON public.record_access_grants;
CREATE POLICY policy_record_access_grants_read ON public.record_access_grants
FOR SELECT TO authenticated
USING (
    tutor_id IN (SELECT t.id FROM public.tutors t WHERE t.user_id = auth.uid())
    OR veterinarian_id IN (SELECT v.id FROM public.veterinarians v WHERE v.user_id = auth.uid())
    OR public.is_admin()
);

DROP POLICY IF EXISTS policy_record_access_log_read ON public.record_access_log;
CREATE POLICY policy_record_access_log_read ON public.record_access_log
FOR SELECT TO authenticated
USING (public.can_access_pet_record(pet_id, 'read_clinical'));

DROP POLICY IF EXISTS policy_medical_record_addenda_read ON public.medical_record_addenda;
CREATE POLICY policy_medical_record_addenda_read ON public.medical_record_addenda
FOR SELECT TO authenticated
USING (public.can_access_pet_record(pet_id, 'read_clinical'));

DROP POLICY IF EXISTS policy_clinical_medication_catalog_read ON public.clinical_medication_catalog;
CREATE POLICY policy_clinical_medication_catalog_read ON public.clinical_medication_catalog
FOR SELECT TO authenticated USING (is_active = TRUE);

DROP POLICY IF EXISTS policy_veterinarian_medication_favorites_owner ON public.veterinarian_medication_favorites;
CREATE POLICY policy_veterinarian_medication_favorites_owner ON public.veterinarian_medication_favorites
FOR SELECT TO authenticated
USING (veterinarian_id IN (SELECT v.id FROM public.veterinarians v WHERE v.user_id = auth.uid()));

DROP POLICY IF EXISTS policy_prescription_signature_requests_read ON public.prescription_signature_requests;
CREATE POLICY policy_prescription_signature_requests_read ON public.prescription_signature_requests
FOR SELECT TO authenticated
USING (
    requested_by = auth.uid()
    OR tutor_id IN (SELECT t.id FROM public.tutors t WHERE t.user_id = auth.uid())
    OR veterinarian_id IN (SELECT v.id FROM public.veterinarians v WHERE v.user_id = auth.uid())
    OR public.is_admin()
);

DROP POLICY IF EXISTS policy_teleconsultation_status_participant_read ON public.teleconsultation_status_updates;
CREATE POLICY policy_teleconsultation_status_participant_read ON public.teleconsultation_status_updates
FOR SELECT TO authenticated
USING (public.can_access_consultation(consultation_id));

DROP POLICY IF EXISTS policy_referrals_clinical_read_authorized ON public.referrals_clinical;
DROP POLICY IF EXISTS policy_referrals_clinical_isolation ON public.referrals_clinical;
CREATE POLICY policy_referrals_clinical_read_authorized ON public.referrals_clinical
FOR SELECT TO authenticated
USING (public.can_access_pet_record(pet_id, 'read_clinical'));

DROP POLICY IF EXISTS policy_clinical_documents_storage_read ON storage.objects;
CREATE POLICY policy_clinical_documents_storage_read ON storage.objects
FOR SELECT TO authenticated
USING (
    bucket_id = 'clinical-documents'
    AND public.can_access_pet_record(((storage.foldername(name))[1])::UUID, 'documents')
    AND EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.pet_id = ((storage.foldername(name))[1])::UUID
          AND d.file_path = name
    )
);

REVOKE ALL ON public.medical_records, public.prescriptions, public.exams, public.documents FROM anon, authenticated;
GRANT SELECT ON public.medical_records, public.prescriptions, public.exams, public.documents TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.medical_records, public.prescriptions, public.exams, public.documents FROM anon, authenticated;
REVOKE ALL ON public.referrals_clinical FROM anon, authenticated;
GRANT SELECT ON public.referrals_clinical TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.referrals_clinical FROM anon, authenticated;
REVOKE ALL ON public.teleconsultation_status_updates FROM anon, authenticated;
GRANT SELECT ON public.teleconsultation_status_updates TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.teleconsultation_status_updates FROM anon, authenticated;
REVOKE ALL ON public.record_access_grants, public.record_access_log, public.medical_record_addenda,
    public.veterinarian_medication_favorites, public.prescription_signature_requests
FROM anon, authenticated;
GRANT SELECT ON public.record_access_grants, public.record_access_log, public.medical_record_addenda,
    public.veterinarian_medication_favorites, public.prescription_signature_requests TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.clinical_medication_catalog FROM anon, authenticated;
GRANT SELECT ON public.clinical_medication_catalog TO authenticated;

CREATE OR REPLACE FUNCTION public.write_record_access_log(
    p_pet_id UUID,
    p_action TEXT,
    p_purpose TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_tenant_id UUID;
    v_ip INET;
    v_user_agent TEXT;
    v_log_id UUID;
BEGIN
    IF v_user_id IS NULL OR NOT (
        public.can_access_pet_record(p_pet_id, 'read_clinical')
        OR public.can_access_pet_record(p_pet_id, 'write_clinical')
        OR public.can_access_pet_record(p_pet_id, 'prescriptions')
        OR public.can_access_pet_record(p_pet_id, 'exams')
        OR public.can_access_pet_record(p_pet_id, 'documents')
    ) THEN
        RAISE EXCEPTION 'Acesso negado ao prontuário deste pet.' USING ERRCODE = '42501';
    END IF;

    SELECT tenant_id INTO v_tenant_id FROM public.pets WHERE id = p_pet_id;
    BEGIN
        v_ip := split_part(current_setting('request.headers', TRUE)::jsonb ->> 'x-forwarded-for', ',', 1)::inet;
    EXCEPTION WHEN OTHERS THEN
        v_ip := NULL;
    END;
    BEGIN
        v_user_agent := current_setting('request.headers', TRUE)::jsonb ->> 'user-agent';
    EXCEPTION WHEN OTHERS THEN
        v_user_agent := NULL;
    END;

    INSERT INTO public.record_access_log (
        tenant_id, pet_id, user_id, action, purpose, ip_address, user_agent, metadata
    ) VALUES (
        v_tenant_id, p_pet_id, v_user_id, p_action, p_purpose, v_ip, v_user_agent, COALESCE(p_metadata, '{}'::jsonb)
    ) RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_medical_record_access(
    p_pet_id UUID,
    p_veterinarian_id UUID,
    p_scopes TEXT[],
    p_expires_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tutor_id UUID;
    v_tenant_id UUID;
    v_grant_id UUID;
BEGIN
    SELECT p.tutor_id, p.tenant_id INTO v_tutor_id, v_tenant_id
    FROM public.pets p
    JOIN public.tutors t ON t.id = p.tutor_id
    WHERE p.id = p_pet_id AND t.user_id = auth.uid();

    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'Somente o tutor responsável pode autorizar acesso ao prontuário.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.veterinarians WHERE id = p_veterinarian_id AND is_active AND is_verified) THEN
        RAISE EXCEPTION 'Veterinário inválido, inativo ou não verificado.' USING ERRCODE = 'P0003';
    END IF;
    IF p_expires_at <= NOW() OR p_expires_at > NOW() + INTERVAL '365 days' THEN
        RAISE EXCEPTION 'A validade do acesso deve estar entre agora e 365 dias.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(cardinality(p_scopes), 0) = 0 OR NOT (p_scopes <@ ARRAY['read_clinical', 'write_clinical', 'prescriptions', 'exams', 'documents', 'all']::TEXT[]) THEN
        RAISE EXCEPTION 'Escopos de acesso inválidos.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.record_access_grants (
        tenant_id, pet_id, tutor_id, veterinarian_id, scopes, granted_by, expires_at
    ) VALUES (
        v_tenant_id, p_pet_id, v_tutor_id, p_veterinarian_id, p_scopes, auth.uid(), p_expires_at
    ) RETURNING id INTO v_grant_id;

    INSERT INTO public.record_access_log (tenant_id, pet_id, user_id, action, purpose, metadata)
    VALUES (v_tenant_id, p_pet_id, auth.uid(), 'write', 'grant_created', jsonb_build_object('grant_id', v_grant_id, 'scopes', p_scopes));
    RETURN v_grant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_medical_record_access(p_grant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_grant public.record_access_grants%ROWTYPE;
BEGIN
    SELECT * INTO v_grant FROM public.record_access_grants WHERE id = p_grant_id FOR UPDATE;
    IF v_grant.id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.tutors t WHERE t.id = v_grant.tutor_id AND t.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Permissão negada para revogar este acesso.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.record_access_grants SET revoked_at = NOW() WHERE id = p_grant_id AND revoked_at IS NULL;
    INSERT INTO public.record_access_log (tenant_id, pet_id, user_id, action, purpose, metadata)
    VALUES (v_grant.tenant_id, v_grant.pet_id, auth.uid(), 'write', 'grant_revoked', jsonb_build_object('grant_id', p_grant_id));
    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pet_medical_timeline(
    p_pet_id UUID,
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to TIMESTAMPTZ DEFAULT NULL,
    p_veterinarian_id UUID DEFAULT NULL,
    p_event_type TEXT DEFAULT NULL,
    p_search TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_pet RECORD;
    v_viewer_role TEXT;
    v_timeline JSONB;
BEGIN
    IF NOT public.can_access_pet_record(p_pet_id, 'read_clinical') THEN
        RAISE EXCEPTION 'Acesso negado ao prontuário deste pet.' USING ERRCODE = '42501';
    END IF;

    SELECT p.id, p.tenant_id, p.tutor_id, p.name, p.species::TEXT AS species, p.breed,
           p.sex::TEXT AS sex, p.birth_date, p.weight_kg, p.microchip_number,
           p.allergies, p.chronic_conditions, t.user_id AS tutor_user_id
    INTO v_pet
    FROM public.pets p
    JOIN public.tutors t ON t.id = p.tutor_id
    WHERE p.id = p_pet_id;

    IF v_pet.id IS NULL THEN
        RAISE EXCEPTION 'Pet não encontrado.' USING ERRCODE = 'P0002';
    END IF;

    v_viewer_role := CASE
        WHEN EXISTS (SELECT 1 FROM public.tutors WHERE id = v_pet.tutor_id AND user_id = auth.uid()) THEN 'tutor'
        WHEN EXISTS (SELECT 1 FROM public.veterinarians WHERE user_id = auth.uid()) THEN 'veterinarian'
        ELSE 'admin'
    END;

    PERFORM public.write_record_access_log(p_pet_id, 'read', 'pet_timeline', jsonb_build_object('event_type', p_event_type));

    SELECT COALESCE(jsonb_agg(e.payload ORDER BY e.occurred_at DESC), '[]'::jsonb)
    INTO v_timeline
    FROM (
        SELECT mr.created_at AS occurred_at, mr.veterinarian_id,
               jsonb_build_object(
                   'id', mr.id, 'kind', 'medical_record', 'event_type', mr.entry_type,
                   'title', mr.title, 'details', mr.details, 'consultation_id', mr.consultation_id, 'complaint', mr.complaint,
                   'anamnesis', mr.anamnesis, 'physical_exam', mr.physical_exam,
                   'assessment', mr.assessment, 'diagnosis', mr.diagnosis, 'plan', mr.plan,
                   'return_recommended_at', mr.return_recommended_at, 'observations', mr.observations,
                   'vital_signs', mr.vital_signs, 'author_crmv_number', mr.author_crmv_number,
                   'author_crmv_uf', mr.author_crmv_uf, 'signed_at', mr.signed_at,
                   'created_at', mr.created_at, 'addenda', COALESCE((
                       SELECT jsonb_agg(jsonb_build_object(
                           'version_number', a.version_number, 'reason', a.reason,
                           'content', a.content, 'created_at', a.created_at,
                           'author_crmv_number', a.author_crmv_number, 'author_crmv_uf', a.author_crmv_uf
                       ) ORDER BY a.version_number)
                       FROM public.medical_record_addenda a WHERE a.medical_record_id = mr.id
                   ), '[]'::jsonb)
               ) AS payload
        FROM public.medical_records mr
        WHERE mr.pet_id = p_pet_id
          AND (p_from IS NULL OR mr.created_at >= p_from)
          AND (p_to IS NULL OR mr.created_at <= p_to)
          AND (p_veterinarian_id IS NULL OR mr.veterinarian_id = p_veterinarian_id)
          AND (p_event_type IS NULL OR p_event_type IN ('medical_record', mr.entry_type))
          AND (p_search IS NULL OR concat_ws(' ', mr.title, mr.details, mr.diagnosis, mr.anamnesis) ILIKE '%' || p_search || '%')

        UNION ALL

        SELECT ex.requested_at, ex.veterinarian_id,
               jsonb_build_object('id', ex.id, 'kind', 'exam', 'event_type', 'exam', 'title', ex.title,
                   'category', ex.category, 'status', ex.status, 'clinical_justification', ex.clinical_justification,
                   'results_text', ex.results_text, 'storage_path', ex.result_storage_path,
                   'created_at', ex.requested_at, 'completed_at', ex.completed_at) AS payload
        FROM public.exams ex
        WHERE ex.pet_id = p_pet_id
          AND (p_from IS NULL OR ex.requested_at >= p_from)
          AND (p_to IS NULL OR ex.requested_at <= p_to)
          AND (p_veterinarian_id IS NULL OR ex.veterinarian_id = p_veterinarian_id)
          AND (p_event_type IS NULL OR p_event_type IN ('exam', ex.category))
          AND (p_search IS NULL OR concat_ws(' ', ex.title, ex.clinical_justification, ex.results_text) ILIKE '%' || p_search || '%')

        UNION ALL

        SELECT pr.created_at, pr.veterinarian_id,
               jsonb_build_object('id', pr.id, 'kind', 'prescription', 'event_type', 'prescription',
                   'title', 'Receita digital', 'medications', pr.medications,
                   'recommendations', pr.general_recommendations, 'validation_code', pr.validation_code,
                   'expires_at', pr.expires_at, 'signed_at', pr.signed_at, 'signature_kind', pr.signature_kind,
                   'requires_qualified_signature', pr.requires_qualified_signature, 'created_at', pr.created_at) AS payload
        FROM public.prescriptions pr
        WHERE pr.pet_id = p_pet_id
          AND (p_from IS NULL OR pr.created_at >= p_from)
          AND (p_to IS NULL OR pr.created_at <= p_to)
          AND (p_veterinarian_id IS NULL OR pr.veterinarian_id = p_veterinarian_id)
          AND (p_event_type IS NULL OR p_event_type = 'prescription')
          AND (p_search IS NULL OR concat_ws(' ', pr.medications::TEXT, pr.general_recommendations) ILIKE '%' || p_search || '%')

        UNION ALL

        SELECT r.created_at, r.veterinarian_id,
               jsonb_build_object('id', r.id, 'kind', 'referral', 'event_type', 'referral', 'title', r.reason,
                   'clinical_summary', r.clinical_summary, 'priority', r.priority, 'status', r.status, 'created_at', r.created_at) AS payload
        FROM public.referrals_clinical r
        WHERE r.pet_id = p_pet_id
          AND (p_from IS NULL OR r.created_at >= p_from)
          AND (p_to IS NULL OR r.created_at <= p_to)
          AND (p_veterinarian_id IS NULL OR r.veterinarian_id = p_veterinarian_id)
          AND (p_event_type IS NULL OR p_event_type = 'referral')
          AND (p_search IS NULL OR concat_ws(' ', r.reason, r.clinical_summary) ILIKE '%' || p_search || '%')

        UNION ALL

        SELECT d.created_at, NULL::UUID AS veterinarian_id,
               jsonb_build_object('id', d.id, 'kind', 'document', 'event_type', d.document_type, 'title', d.title,
                   'mime_type', d.mime_type, 'file_size_bytes', d.file_size_bytes, 'exam_id', d.exam_id,
                   'medical_record_id', d.medical_record_id, 'created_at', d.created_at) AS payload
        FROM public.documents d
        WHERE d.pet_id = p_pet_id
          AND (p_from IS NULL OR d.created_at >= p_from)
          AND (p_to IS NULL OR d.created_at <= p_to)
          AND (p_event_type IS NULL OR p_event_type IN ('document', d.document_type))
          AND (p_search IS NULL OR concat_ws(' ', d.title, d.document_type) ILIKE '%' || p_search || '%')
    ) e;

    RETURN jsonb_build_object(
        'pet', jsonb_build_object(
            'id', v_pet.id, 'tenant_id', v_pet.tenant_id, 'name', v_pet.name,
            'species', v_pet.species, 'breed', v_pet.breed, 'sex', v_pet.sex,
            'birth_date', v_pet.birth_date, 'weight_kg', v_pet.weight_kg,
            'microchip_number', v_pet.microchip_number, 'allergies', v_pet.allergies,
            'chronic_conditions', v_pet.chronic_conditions
        ),
        'viewer_role', v_viewer_role,
        'can_write', public.can_access_pet_record(p_pet_id, 'write_clinical'),
        'timeline', v_timeline
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pet_record_access_log(p_pet_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_is_tutor BOOLEAN;
    v_rows JSONB;
BEGIN
    v_is_tutor := EXISTS (
        SELECT 1 FROM public.pets p JOIN public.tutors t ON t.id = p.tutor_id
        WHERE p.id = p_pet_id AND t.user_id = auth.uid()
    );
    IF NOT v_is_tutor AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Somente o tutor responsável pode consultar a auditoria de acesso.' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'user_id', l.user_id, 'actor_name', u.full_name, 'action', l.action,
        'purpose', l.purpose, 'ip_address', l.ip_address, 'accessed_at', l.accessed_at
    ) ORDER BY l.accessed_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM public.record_access_log l
    LEFT JOIN public.users u ON u.id = l.user_id
    WHERE l.pet_id = p_pet_id;

    PERFORM public.write_record_access_log(p_pet_id, 'read', 'access_log_view', '{}'::jsonb);

    RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pet_record_access_controls(p_pet_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant_id UUID;
    v_tutor_id UUID;
    v_grants JSONB;
    v_candidates JSONB;
BEGIN
    SELECT p.tenant_id, p.tutor_id INTO v_tenant_id, v_tutor_id
    FROM public.pets p JOIN public.tutors t ON t.id = p.tutor_id
    WHERE p.id = p_pet_id AND t.user_id = auth.uid();
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'Somente o tutor responsável pode gerenciar autorizações.' USING ERRCODE = '42501';
    END IF;

    PERFORM public.write_record_access_log(p_pet_id, 'read', 'access_controls', '{}'::jsonb);

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'grant_id', g.id, 'veterinarian_id', g.veterinarian_id,
        'veterinarian_name', u.full_name, 'crmv_number', pr.crmv_number,
        'crmv_uf', pr.state_uf, 'scopes', g.scopes, 'granted_at', g.granted_at,
        'expires_at', g.expires_at, 'revoked_at', g.revoked_at
    ) ORDER BY g.granted_at DESC), '[]'::jsonb)
    INTO v_grants
    FROM public.record_access_grants g
    JOIN public.veterinarians v ON v.id = g.veterinarian_id
    JOIN public.users u ON u.id = v.user_id
    LEFT JOIN LATERAL (
        SELECT r.crmv_number, r.state_uf
        FROM public.professional_registrations r
        WHERE r.veterinarian_id = v.id AND r.crmv_status = 'validated'
        ORDER BY r.validated_at DESC NULLS LAST LIMIT 1
    ) pr ON TRUE
    WHERE g.pet_id = p_pet_id AND g.tutor_id = v_tutor_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'veterinarian_id', v.id, 'name', u.full_name, 'crmv_number', pr.crmv_number, 'crmv_uf', pr.state_uf
    ) ORDER BY u.full_name), '[]'::jsonb)
    INTO v_candidates
    FROM public.veterinarian_tenants vt
    JOIN public.veterinarians v ON v.id = vt.veterinarian_id AND v.is_active AND v.is_verified
    JOIN public.users u ON u.id = v.user_id
    JOIN LATERAL (
        SELECT r.crmv_number, r.state_uf
        FROM public.professional_registrations r
        WHERE r.veterinarian_id = v.id AND r.crmv_status = 'validated'
        ORDER BY r.validated_at DESC NULLS LAST LIMIT 1
    ) pr ON TRUE
    WHERE vt.tenant_id = v_tenant_id AND vt.status = 'active';

    RETURN jsonb_build_object('grants', v_grants, 'veterinarian_candidates', v_candidates);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_signed_medical_record(
    p_pet_id UUID,
    p_title TEXT,
    p_complaint TEXT,
    p_anamnesis TEXT,
    p_physical_exam TEXT,
    p_assessment TEXT,
    p_diagnosis TEXT,
    p_plan TEXT,
    p_vital_signs JSONB DEFAULT '{}'::jsonb,
    p_follow_up_at TIMESTAMPTZ DEFAULT NULL,
    p_observations TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_pet RECORD;
    v_vet RECORD;
    v_registration RECORD;
    v_record_id UUID;
BEGIN
    SELECT v.id, v.is_active, v.is_verified
    INTO v_vet
    FROM public.veterinarians v
    WHERE v.user_id = auth.uid();
    IF v_vet.id IS NULL OR NOT v_vet.is_active OR NOT v_vet.is_verified
       OR NOT public.can_access_pet_record(p_pet_id, 'write_clinical') THEN
        RAISE EXCEPTION 'Somente veterinário verificado com vínculo assistencial pode registrar no prontuário.' USING ERRCODE = '42501';
    END IF;

    SELECT p.tenant_id INTO v_pet FROM public.pets p WHERE p.id = p_pet_id;
    IF v_pet.tenant_id IS NULL THEN RAISE EXCEPTION 'Pet não encontrado.' USING ERRCODE = 'P0002'; END IF;

    SELECT pr.crmv_number, pr.state_uf
    INTO v_registration
    FROM public.professional_registrations pr
    WHERE pr.veterinarian_id = v_vet.id
      AND pr.crmv_status = 'validated'
    ORDER BY pr.validated_at DESC NULLS LAST
    LIMIT 1;
    IF v_registration.crmv_number IS NULL THEN
        RAISE EXCEPTION 'CRMV ativo e validado é obrigatório para assinar o prontuário.' USING ERRCODE = 'P0003';
    END IF;

    INSERT INTO public.medical_records (
        tenant_id, pet_id, veterinarian_id, entry_type, title, details, vital_signs,
        complaint, anamnesis, physical_exam, assessment, diagnosis, plan,
        return_recommended_at, observations, author_crmv_number, author_crmv_uf,
        signed_at, signed_by, version_number
    ) VALUES (
        v_pet.tenant_id, p_pet_id, v_vet.id, 'clinical_note', p_title,
        concat_ws(E'\n', NULLIF(p_diagnosis, ''), NULLIF(p_plan, '')),
        COALESCE(p_vital_signs, '{}'::jsonb), p_complaint, p_anamnesis, p_physical_exam,
        p_assessment, p_diagnosis, p_plan, p_follow_up_at, p_observations,
        v_registration.crmv_number, v_registration.state_uf, NOW(), auth.uid(), 1
    ) RETURNING id INTO v_record_id;

    PERFORM public.write_record_access_log(p_pet_id, 'write', 'medical_record_signed', jsonb_build_object('record_id', v_record_id));
    RETURN jsonb_build_object('record_id', v_record_id, 'signed_at', NOW(), 'version_number', 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.append_medical_record_addendum(
    p_medical_record_id UUID,
    p_reason TEXT,
    p_content TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_record RECORD;
    v_vet RECORD;
    v_registration RECORD;
    v_version INTEGER;
    v_addendum_id UUID;
BEGIN
    SELECT mr.id, mr.tenant_id, mr.pet_id, mr.signed_at
    INTO v_record FROM public.medical_records mr WHERE mr.id = p_medical_record_id FOR UPDATE;
    SELECT v.id INTO v_vet FROM public.veterinarians v WHERE v.user_id = auth.uid();
    IF v_record.id IS NULL OR v_vet.id IS NULL
       OR NOT public.can_access_pet_record(v_record.pet_id, 'write_clinical') THEN
        RAISE EXCEPTION 'Apenas veterinário com vínculo assistencial pode adicionar correção.' USING ERRCODE = '42501';
    END IF;
    IF v_record.signed_at IS NULL THEN
        RAISE EXCEPTION 'Adendos só podem corrigir registros assinados.' USING ERRCODE = 'P0003';
    END IF;
    IF NULLIF(trim(p_reason), '') IS NULL OR NULLIF(trim(p_content), '') IS NULL THEN
        RAISE EXCEPTION 'Informe justificativa e conteúdo do adendo.' USING ERRCODE = '22023';
    END IF;
    SELECT pr.crmv_number, pr.state_uf INTO v_registration
    FROM public.professional_registrations pr
    WHERE pr.veterinarian_id = v_vet.id AND pr.crmv_status = 'validated'
    ORDER BY pr.validated_at DESC NULLS LAST LIMIT 1;
    IF v_registration.crmv_number IS NULL THEN
        RAISE EXCEPTION 'CRMV validado é obrigatório para assinar o adendo.' USING ERRCODE = 'P0003';
    END IF;
    SELECT COALESCE(MAX(a.version_number), 1) + 1 INTO v_version
    FROM public.medical_record_addenda a WHERE a.medical_record_id = p_medical_record_id;

    INSERT INTO public.medical_record_addenda (
        tenant_id, medical_record_id, pet_id, veterinarian_id, author_user_id,
        author_crmv_number, author_crmv_uf, version_number, reason, content
    ) VALUES (
        v_record.tenant_id, v_record.id, v_record.pet_id, v_vet.id, auth.uid(),
        v_registration.crmv_number, v_registration.state_uf, v_version, p_reason, p_content
    ) RETURNING id INTO v_addendum_id;

    PERFORM public.write_record_access_log(v_record.pet_id, 'addendum', 'medical_record_addendum',
        jsonb_build_object('record_id', p_medical_record_id, 'addendum_id', v_addendum_id));
    RETURN v_addendum_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_clinical_exam(
    p_pet_id UUID,
    p_title TEXT,
    p_category TEXT,
    p_justification TEXT DEFAULT NULL,
    p_consultation_id UUID DEFAULT NULL,
    p_medical_record_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_pet RECORD;
    v_vet RECORD;
    v_exam_id UUID;
    v_tutor_user_id UUID;
BEGIN
    SELECT p.tenant_id, p.tutor_id INTO v_pet FROM public.pets p WHERE p.id = p_pet_id;
    SELECT v.id INTO v_vet FROM public.veterinarians v WHERE v.user_id = auth.uid() AND v.is_active AND v.is_verified;
    IF v_pet.tenant_id IS NULL OR v_vet.id IS NULL
       OR NOT public.can_access_pet_record(p_pet_id, 'exams') THEN
        RAISE EXCEPTION 'Apenas veterinário autorizado pode solicitar exame.' USING ERRCODE = '42501';
    END IF;
    IF p_consultation_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.consultations c WHERE c.id = p_consultation_id
          AND c.pet_id = p_pet_id AND c.veterinarian_id = v_vet.id
    ) THEN
        RAISE EXCEPTION 'Consulta não corresponde ao pet e veterinário.' USING ERRCODE = '22023';
    END IF;
    IF p_medical_record_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.medical_records mr WHERE mr.id = p_medical_record_id AND mr.pet_id = p_pet_id
    ) THEN
        RAISE EXCEPTION 'Registro clínico não corresponde ao pet.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.exams (tenant_id, consultation_id, medical_record_id, pet_id, veterinarian_id, title, category, clinical_justification)
    VALUES (v_pet.tenant_id, p_consultation_id, p_medical_record_id, p_pet_id, v_vet.id, p_title, p_category, p_justification)
    RETURNING id INTO v_exam_id;

    SELECT u.id INTO v_tutor_user_id FROM public.tutors t JOIN public.users u ON u.id = t.user_id WHERE t.id = v_pet.tutor_id;
    INSERT INTO public.notifications (tenant_id, user_id, title, message, category, action_url)
    VALUES (v_pet.tenant_id, v_tutor_user_id, 'Novo exame solicitado', 'O veterinário solicitou um exame para seu pet.', 'exam_requested', '/dashboard/pet/' || p_pet_id::text);
    PERFORM public.write_record_access_log(p_pet_id, 'exam_request', 'exam_requested', jsonb_build_object('exam_id', v_exam_id));
    RETURN v_exam_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_clinical_referral(
    p_pet_id UUID,
    p_specialty_id UUID,
    p_reason TEXT,
    p_clinical_summary TEXT DEFAULT NULL,
    p_priority public.referral_priority_type DEFAULT 'routine',
    p_consultation_id UUID DEFAULT NULL,
    p_target_clinic_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant_id UUID;
    v_veterinarian_id UUID;
    v_referral_id UUID;
BEGIN
    SELECT tenant_id INTO v_tenant_id FROM public.pets WHERE id = p_pet_id;
    SELECT id INTO v_veterinarian_id FROM public.veterinarians
    WHERE user_id = auth.uid() AND is_active AND is_verified;
    IF v_tenant_id IS NULL OR v_veterinarian_id IS NULL
       OR NOT public.can_access_pet_record(p_pet_id, 'write_clinical') THEN
        RAISE EXCEPTION 'Apenas veterinário com vínculo assistencial pode encaminhar o pet.' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(trim(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'Informe o motivo do encaminhamento.' USING ERRCODE = '22023';
    END IF;
    IF p_consultation_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.consultations c
        WHERE c.id = p_consultation_id AND c.pet_id = p_pet_id AND c.veterinarian_id = v_veterinarian_id
    ) THEN
        RAISE EXCEPTION 'Consulta não corresponde ao pet e veterinário.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.referrals_clinical (
        tenant_id, consultation_id, veterinarian_id, pet_id, specialty_id,
        target_clinic_id, reason, clinical_summary, priority, status
    ) VALUES (
        v_tenant_id, p_consultation_id, v_veterinarian_id, p_pet_id, p_specialty_id,
        p_target_clinic_id, p_reason, p_clinical_summary, p_priority, 'pending'
    ) RETURNING id INTO v_referral_id;
    PERFORM public.write_record_access_log(p_pet_id, 'write', 'clinical_referral', jsonb_build_object('referral_id', v_referral_id));
    RETURN v_referral_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_clinical_document_upload(
    p_pet_id UUID,
    p_exam_id UUID DEFAULT NULL,
    p_medical_record_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant_id UUID;
BEGIN
    IF NOT (
        public.can_access_pet_record(p_pet_id, 'documents')
        OR public.can_access_pet_record(p_pet_id, 'write_clinical')
    ) THEN
        RAISE EXCEPTION 'Acesso negado para anexar documento clínico.' USING ERRCODE = '42501';
    END IF;
    IF p_exam_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.exams e WHERE e.id = p_exam_id AND e.pet_id = p_pet_id
    ) THEN
        RAISE EXCEPTION 'Exame não pertence ao pet.' USING ERRCODE = '22023';
    END IF;
    IF p_medical_record_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.medical_records mr WHERE mr.id = p_medical_record_id AND mr.pet_id = p_pet_id
    ) THEN
        RAISE EXCEPTION 'Registro não pertence ao pet.' USING ERRCODE = '22023';
    END IF;
    SELECT tenant_id INTO v_tenant_id FROM public.pets WHERE id = p_pet_id;
    RETURN jsonb_build_object('tenant_id', v_tenant_id, 'storage_prefix', p_pet_id::text || '/');
END;
$$;

CREATE OR REPLACE FUNCTION public.register_clinical_document(
    p_pet_id UUID,
    p_title TEXT,
    p_document_type TEXT,
    p_storage_path TEXT,
    p_file_size_bytes BIGINT,
    p_mime_type TEXT,
    p_exam_id UUID DEFAULT NULL,
    p_medical_record_id UUID DEFAULT NULL,
    p_results_text TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant_id UUID;
    v_tutor_id UUID;
    v_user_id UUID := auth.uid();
    v_document_id UUID;
    v_exam RECORD;
BEGIN
    IF NOT (
        public.can_access_pet_record(p_pet_id, 'documents')
        OR public.can_access_pet_record(p_pet_id, 'write_clinical')
    ) THEN
        RAISE EXCEPTION 'Acesso negado para registrar documento clínico.' USING ERRCODE = '42501';
    END IF;
    IF p_file_size_bytes <= 0 OR p_file_size_bytes > 20971520
       OR p_mime_type NOT IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') THEN
        RAISE EXCEPTION 'Arquivo clínico fora dos limites de tipo/tamanho.' USING ERRCODE = '22023';
    END IF;
    IF p_storage_path IS NULL OR p_storage_path NOT LIKE p_pet_id::TEXT || '/%' THEN
        RAISE EXCEPTION 'O caminho do arquivo deve ficar no diretório do pet autorizado.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM storage.objects o
        WHERE o.bucket_id = 'clinical-documents'
          AND o.name = p_storage_path
          AND o.metadata->>'mimetype' = p_mime_type
          AND COALESCE((o.metadata->>'size')::BIGINT, p_file_size_bytes) = p_file_size_bytes
    ) THEN
        RAISE EXCEPTION 'Objeto privado não existe ou seus metadados não correspondem ao upload.' USING ERRCODE = '22023';
    END IF;
    SELECT tenant_id, tutor_id INTO v_tenant_id, v_tutor_id FROM public.pets WHERE id = p_pet_id;
    IF p_exam_id IS NOT NULL THEN
        SELECT id, veterinarian_id INTO v_exam FROM public.exams WHERE id = p_exam_id AND pet_id = p_pet_id FOR UPDATE;
        IF v_exam.id IS NULL THEN RAISE EXCEPTION 'Exame não pertence ao pet.' USING ERRCODE = '22023'; END IF;
    END IF;

    INSERT INTO public.documents (
        tenant_id, pet_id, tutor_id, consultation_id, medical_record_id, exam_id,
        title, document_type, file_path, file_size_bytes, mime_type, uploaded_by,
        metadata
    ) VALUES (
        v_tenant_id, p_pet_id, v_tutor_id,
        (SELECT e.consultation_id FROM public.exams e WHERE e.id = p_exam_id),
        p_medical_record_id, p_exam_id, p_title, p_document_type, p_storage_path,
        p_file_size_bytes, p_mime_type, v_user_id, '{}'::jsonb
    ) RETURNING id INTO v_document_id;

    IF p_exam_id IS NOT NULL THEN
        UPDATE public.exams
        SET result_storage_path = p_storage_path,
            results_text = COALESCE(p_results_text, results_text),
            status = 'completed',
            completed_at = NOW(),
            updated_by = v_user_id
        WHERE id = p_exam_id;
        IF v_exam.veterinarian_id IS NOT NULL THEN
            INSERT INTO public.notifications (tenant_id, user_id, title, message, category, action_url)
            SELECT v_tenant_id, v.user_id, 'Resultado de exame disponível', 'Um resultado foi anexado ao prontuário do pet.',
                   'exam_result', '/dashboard/pet/' || p_pet_id::text
            FROM public.veterinarians v WHERE v.id = v_exam.veterinarian_id;
        END IF;
        INSERT INTO public.notifications (tenant_id, user_id, title, message, category, action_url)
        SELECT v_tenant_id, t.user_id, 'Resultado de exame disponível', 'Um resultado foi anexado ao prontuário do seu pet.',
               'exam_result', '/dashboard/pet/' || p_pet_id::text
        FROM public.tutors t WHERE t.id = v_tutor_id;
    END IF;

    PERFORM public.write_record_access_log(p_pet_id, 'document_upload', 'clinical_document', jsonb_build_object('document_id', v_document_id));
    RETURN v_document_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_clinical_document_download(p_document_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_document RECORD;
BEGIN
    SELECT d.id, d.pet_id, d.tenant_id, d.file_path, d.title, d.mime_type
    INTO v_document FROM public.documents d WHERE d.id = p_document_id;
    IF v_document.id IS NULL OR NOT public.can_access_pet_record(v_document.pet_id, 'documents') THEN
        RAISE EXCEPTION 'Documento clínico indisponível ou acesso negado.' USING ERRCODE = '42501';
    END IF;
    PERFORM public.write_record_access_log(v_document.pet_id, 'document_download', 'clinical_document', jsonb_build_object('document_id', p_document_id));
    RETURN jsonb_build_object('bucket', 'clinical-documents', 'path', v_document.file_path, 'title', v_document.title, 'mime_type', v_document.mime_type);
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_digital_prescription(
    p_consultation_id UUID,
    p_medications JSONB,
    p_recommendations TEXT,
    p_digital_signature_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_consultation RECORD;
    v_veterinarian RECORD;
    v_registration RECORD;
    v_medication JSONB;
    v_catalog RECORD;
    v_normalized JSONB := '[]'::jsonb;
    v_controlled BOOLEAN := FALSE;
    v_validation_code TEXT;
    v_prescription_id UUID;
    v_request_id UUID;
BEGIN
    IF p_digital_signature_hash IS NOT NULL THEN
        RAISE EXCEPTION 'Hash de assinatura informado pelo cliente não é prova de assinatura qualificada.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_medications) <> 'array' OR jsonb_array_length(p_medications) = 0 THEN
        RAISE EXCEPTION 'A receita precisa conter ao menos um medicamento.' USING ERRCODE = '22023';
    END IF;

    SELECT c.id, c.tenant_id, c.pet_id, c.tutor_id, c.veterinarian_id, c.status
    INTO v_consultation FROM public.consultations c WHERE c.id = p_consultation_id;
    SELECT v.id, v.is_active, v.is_verified INTO v_veterinarian
    FROM public.veterinarians v WHERE v.user_id = auth.uid();
    IF v_consultation.id IS NULL OR v_veterinarian.id IS NULL
       OR v_consultation.veterinarian_id <> v_veterinarian.id
       OR NOT v_veterinarian.is_active OR NOT v_veterinarian.is_verified
       OR NOT public.can_access_pet_record(v_consultation.pet_id, 'prescriptions') THEN
        RAISE EXCEPTION 'Somente veterinário verificado com vínculo assistencial pode prescrever.' USING ERRCODE = '42501';
    END IF;
    IF v_consultation.status <> 'finished' THEN
        RAISE EXCEPTION 'A consulta deve estar finalizada antes da emissão da receita.' USING ERRCODE = 'P0003';
    END IF;

    SELECT pr.crmv_number, pr.state_uf INTO v_registration
    FROM public.professional_registrations pr
    WHERE pr.veterinarian_id = v_veterinarian.id AND pr.crmv_status = 'validated'
    ORDER BY pr.validated_at DESC NULLS LAST LIMIT 1;
    IF v_registration.crmv_number IS NULL THEN
        RAISE EXCEPTION 'CRMV validado é obrigatório para emissão de receita.' USING ERRCODE = 'P0003';
    END IF;

    FOR v_medication IN SELECT value FROM jsonb_array_elements(p_medications) LOOP
        IF NULLIF(v_medication->>'catalog_id', '') IS NULL THEN
            RAISE EXCEPTION 'Cada medicamento deve ser escolhido no catálogo clínico verificado.' USING ERRCODE = '22023';
        END IF;
        SELECT id, name, active_ingredient, presentation, requires_qualified_signature
        INTO v_catalog FROM public.clinical_medication_catalog
        WHERE id = (v_medication->>'catalog_id')::UUID AND is_active = TRUE;
        IF v_catalog.id IS NULL THEN RAISE EXCEPTION 'Medicamento inativo ou inexistente no catálogo.' USING ERRCODE = '22023'; END IF;
        IF NULLIF(trim(v_medication->>'dosage'), '') IS NULL
           OR NULLIF(trim(v_medication->>'frequency'), '') IS NULL
           OR NULLIF(trim(v_medication->>'duration'), '') IS NULL THEN
            RAISE EXCEPTION 'Posologia, frequência e duração são obrigatórias.' USING ERRCODE = '22023';
        END IF;
        v_controlled := v_controlled OR v_catalog.requires_qualified_signature;
        v_normalized := v_normalized || jsonb_build_array(
            v_medication || jsonb_build_object(
                'name', v_catalog.name,
                'active_ingredient', v_catalog.active_ingredient,
                'presentation', v_catalog.presentation,
                'requires_qualified_signature', v_catalog.requires_qualified_signature
            )
        );
    END LOOP;

    IF v_controlled THEN
        INSERT INTO public.prescription_signature_requests (
            tenant_id, consultation_id, pet_id, tutor_id, veterinarian_id, requested_by, medications,
            recommendations, status, failure_reason
        ) VALUES (
            v_consultation.tenant_id, v_consultation.id, v_consultation.pet_id, v_consultation.tutor_id,
            v_veterinarian.id, auth.uid(), v_normalized, p_recommendations,
            'pending_configuration', 'ASSINATURA ICP-BRASIL PENDENTE DE CONFIGURAÇÃO'
        ) RETURNING id INTO v_request_id;
        RETURN jsonb_build_object(
            'success', FALSE,
            'status', 'pending_configuration',
            'message', 'ASSINATURA ICP-BRASIL PENDENTE DE CONFIGURAÇÃO. A receita controlada não foi emitida.',
            'signature_request_id', v_request_id
        );
    END IF;

    v_validation_code := upper(encode(gen_random_bytes(16), 'hex'));
    INSERT INTO public.prescriptions (
        tenant_id, consultation_id, veterinarian_id, pet_id, tutor_id, medications,
        general_recommendations, validation_code, signed_at, signed_by, signature_kind,
        requires_qualified_signature, expires_at
    ) VALUES (
        v_consultation.tenant_id, v_consultation.id, v_veterinarian.id, v_consultation.pet_id,
        v_consultation.tutor_id, v_normalized, p_recommendations, v_validation_code,
        NOW(), auth.uid(), 'internal', FALSE, CURRENT_DATE + 30
    ) RETURNING id INTO v_prescription_id;

    PERFORM public.write_record_access_log(v_consultation.pet_id, 'prescription', 'prescription_issued', jsonb_build_object('prescription_id', v_prescription_id));
    RETURN jsonb_build_object(
        'success', TRUE,
        'status', 'issued',
        'prescription_id', v_prescription_id,
        'validation_code', v_validation_code,
        'expires_at', CURRENT_DATE + 30,
        'signature_kind', 'internal'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_prescription_public(p_validation_code TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE WHEN p.id IS NULL THEN
        jsonb_build_object('valid', FALSE, 'status', 'not_found')
    ELSE
        jsonb_build_object(
            'valid', p.expires_at IS NULL OR p.expires_at >= CURRENT_DATE,
            'status', CASE WHEN p.expires_at IS NOT NULL AND p.expires_at < CURRENT_DATE THEN 'expired' ELSE 'valid' END,
            'validation_code', p.validation_code,
            'issued_at', p.signed_at,
            'expires_at', p.expires_at,
            'veterinarian_name', u.full_name,
            'crmv_number', pr.crmv_number,
            'crmv_uf', pr.state_uf
        )
    END
    FROM (SELECT 1) seed
    LEFT JOIN public.prescriptions p ON p.validation_code = p_validation_code
    LEFT JOIN public.veterinarians v ON v.id = p.veterinarian_id
    LEFT JOIN public.users u ON u.id = v.user_id
    LEFT JOIN LATERAL (
        SELECT r.crmv_number, r.state_uf
        FROM public.professional_registrations r
        WHERE r.veterinarian_id = v.id AND r.crmv_status = 'validated'
        ORDER BY r.validated_at DESC NULLS LAST LIMIT 1
    ) pr ON TRUE;
$$;

CREATE OR REPLACE FUNCTION public.get_prescription_pdf_data(p_prescription_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_prescription RECORD;
    v_pet RECORD;
    v_veterinarian RECORD;
    v_registration RECORD;
BEGIN
    SELECT * INTO v_prescription FROM public.prescriptions WHERE id = p_prescription_id;
    IF v_prescription.id IS NULL OR NOT public.can_access_pet_record(v_prescription.pet_id, 'prescriptions') THEN
        RAISE EXCEPTION 'Receita indisponível ou acesso negado.' USING ERRCODE = '42501';
    END IF;
    SELECT p.name, p.species::TEXT AS species, p.breed, p.allergies, t.user_id, u.full_name AS tutor_name
    INTO v_pet
    FROM public.pets p
    JOIN public.tutors t ON t.id = p.tutor_id
    JOIN public.users u ON u.id = t.user_id
    WHERE p.id = v_prescription.pet_id;
    SELECT u.full_name INTO v_veterinarian
    FROM public.veterinarians v JOIN public.users u ON u.id = v.user_id WHERE v.id = v_prescription.veterinarian_id;
    SELECT pr.crmv_number, pr.state_uf INTO v_registration
    FROM public.professional_registrations pr
    WHERE pr.veterinarian_id = v_prescription.veterinarian_id AND pr.crmv_status = 'validated'
    ORDER BY pr.validated_at DESC NULLS LAST LIMIT 1;
    PERFORM public.write_record_access_log(v_prescription.pet_id, 'pdf_export', 'prescription_pdf', jsonb_build_object('prescription_id', p_prescription_id));
    RETURN jsonb_build_object(
        'validation_code', v_prescription.validation_code,
        'issued_at', v_prescription.signed_at,
        'expires_at', v_prescription.expires_at,
        'pet', jsonb_build_object('name', v_pet.name, 'species', v_pet.species, 'breed', v_pet.breed, 'allergies', v_pet.allergies),
        'tutor', jsonb_build_object('name', v_pet.tutor_name),
        'veterinarian', jsonb_build_object('name', v_veterinarian.full_name, 'crmv_number', v_registration.crmv_number, 'crmv_uf', v_registration.state_uf),
        'medications', v_prescription.medications,
        'recommendations', v_prescription.general_recommendations
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.add_veterinarian_medication_favorite(
    p_medication_id UUID,
    p_dosage TEXT,
    p_frequency TEXT,
    p_duration TEXT,
    p_route TEXT,
    p_instructions TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_veterinarian_id UUID;
    v_favorite_id UUID;
BEGIN
    SELECT id INTO v_veterinarian_id FROM public.veterinarians WHERE user_id = auth.uid() AND is_active;
    IF v_veterinarian_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.clinical_medication_catalog WHERE id = p_medication_id AND is_active
    ) THEN RAISE EXCEPTION 'Veterinário ou medicamento inválido.' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.veterinarian_medication_favorites (
        veterinarian_id, medication_id, dosage, frequency, duration, route, instructions
    ) VALUES (v_veterinarian_id, p_medication_id, p_dosage, p_frequency, p_duration, p_route, p_instructions)
    ON CONFLICT (veterinarian_id, medication_id, dosage, frequency, duration)
    DO UPDATE SET route = EXCLUDED.route, instructions = EXCLUDED.instructions
    RETURNING id INTO v_favorite_id;
    RETURN v_favorite_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_veterinarian_medication_favorites()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_veterinarian_id UUID;
    v_favorites JSONB;
BEGIN
    SELECT id INTO v_veterinarian_id
    FROM public.veterinarians
    WHERE user_id = auth.uid() AND is_active;
    IF v_veterinarian_id IS NULL THEN
        RAISE EXCEPTION 'Perfil veterinário ativo não encontrado.' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', f.id, 'medication_id', f.medication_id, 'name', c.name,
        'active_ingredient', c.active_ingredient, 'presentation', c.presentation,
        'dosage', f.dosage, 'frequency', f.frequency, 'duration', f.duration,
        'route', f.route, 'instructions', f.instructions,
        'requires_qualified_signature', c.requires_qualified_signature
    ) ORDER BY c.name), '[]'::jsonb)
    INTO v_favorites
    FROM public.veterinarian_medication_favorites f
    JOIN public.clinical_medication_catalog c ON c.id = f.medication_id AND c.is_active
    WHERE f.veterinarian_id = v_veterinarian_id;
    RETURN v_favorites;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_clinical_medication(
    p_id UUID,
    p_name TEXT,
    p_active_ingredient TEXT,
    p_presentation TEXT,
    p_species TEXT[],
    p_requires_qualified_signature BOOLEAN,
    p_regulatory_reference TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_id UUID;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Apenas administrador pode atualizar catálogo clínico.' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.clinical_medication_catalog (
        id, name, active_ingredient, presentation, species, requires_qualified_signature, regulatory_reference, created_by
    ) VALUES (
        COALESCE(p_id, gen_random_uuid()), p_name, p_active_ingredient, COALESCE(p_presentation, ''),
        COALESCE(p_species, ARRAY[]::TEXT[]), COALESCE(p_requires_qualified_signature, FALSE), p_regulatory_reference, auth.uid()
    )
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, active_ingredient = EXCLUDED.active_ingredient,
        presentation = EXCLUDED.presentation, species = EXCLUDED.species,
        requires_qualified_signature = EXCLUDED.requires_qualified_signature,
        regulatory_reference = EXCLUDED.regulatory_reference, updated_at = NOW()
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'clinical-documents', 'clinical-documents', FALSE, 20971520,
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

REVOKE ALL ON FUNCTION public.can_access_pet_record(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_pet_record(UUID, TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.write_record_access_log(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.write_record_access_log(UUID, TEXT, TEXT, JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.request_medical_record_access(UUID, UUID, TEXT[], TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_medical_record_access(UUID, UUID, TEXT[], TIMESTAMPTZ) TO authenticated;
REVOKE ALL ON FUNCTION public.revoke_medical_record_access(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_medical_record_access(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.get_pet_medical_timeline(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pet_medical_timeline(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.get_pet_record_access_log(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pet_record_access_log(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.get_pet_record_access_controls(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pet_record_access_controls(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.create_signed_medical_record(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_signed_medical_record(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.append_medical_record_addendum(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.append_medical_record_addendum(UUID, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.request_clinical_exam(UUID, TEXT, TEXT, TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_clinical_exam(UUID, TEXT, TEXT, TEXT, UUID, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.create_clinical_referral(UUID, UUID, TEXT, TEXT, public.referral_priority_type, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_clinical_referral(UUID, UUID, TEXT, TEXT, public.referral_priority_type, UUID, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.authorize_clinical_document_upload(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authorize_clinical_document_upload(UUID, UUID, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.register_clinical_document(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_clinical_document(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, UUID, UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.get_clinical_document_download(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clinical_document_download(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.issue_digital_prescription(UUID, JSONB, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_digital_prescription(UUID, JSONB, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.verify_prescription_public(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_prescription_public(TEXT) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.get_prescription_pdf_data(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_prescription_pdf_data(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.add_veterinarian_medication_favorite(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_veterinarian_medication_favorite(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.get_veterinarian_medication_favorites() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_veterinarian_medication_favorites() TO authenticated;
REVOKE ALL ON FUNCTION public.upsert_clinical_medication(UUID, TEXT, TEXT, TEXT, TEXT[], BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_clinical_medication(UUID, TEXT, TEXT, TEXT, TEXT[], BOOLEAN, TEXT) TO authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'consultations'
        ) THEN
            ALTER PUBLICATION supabase_realtime DROP TABLE public.consultations;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'teleconsultation_status_updates'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.teleconsultation_status_updates;
        END IF;
    END IF;
END;
$$;

REVOKE SELECT ON public.consultations FROM anon, authenticated;

COMMIT;
