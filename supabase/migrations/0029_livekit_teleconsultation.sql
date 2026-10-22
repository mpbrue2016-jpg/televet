-- ==============================================================================
-- 0029_livekit_teleconsultation.sql
-- Fase 9: LiveKit, autorização de sala, presença, gravação e auditoria
-- ============================================================================== 

BEGIN;

ALTER TABLE public.consultations
    ADD COLUMN IF NOT EXISTS video_room_name UUID,
    ADD COLUMN IF NOT EXISTS video_room_status TEXT NOT NULL DEFAULT 'waiting_room'
        CHECK (video_room_status IN ('waiting_room', 'active', 'finished', 'interrupted', 'abandoned')),
    ADD COLUMN IF NOT EXISTS video_room_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS video_room_ended_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS video_actual_duration_seconds INTEGER NOT NULL DEFAULT 0
        CHECK (video_actual_duration_seconds >= 0),
    ADD COLUMN IF NOT EXISTS video_connection_drop_count INTEGER NOT NULL DEFAULT 0
        CHECK (video_connection_drop_count >= 0),
    ADD COLUMN IF NOT EXISTS clinical_draft_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS recording_egress_id TEXT,
    ADD COLUMN IF NOT EXISTS recording_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS recording_deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS video_no_show_role TEXT CHECK (video_no_show_role IN ('tutor', 'veterinarian', 'both', 'unknown'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_consultations_video_room_name
    ON public.consultations(video_room_name)
    WHERE video_room_name IS NOT NULL;

UPDATE public.consultations
SET tutor_room_token = NULL,
    vet_room_token = NULL
WHERE tutor_room_token IS NOT NULL OR vet_room_token IS NOT NULL;

CREATE OR REPLACE FUNCTION public.start_teleconsultation(p_consultation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Tokens de sala não são mais emitidos pelo banco. Use a Edge Function create-video-token.'
        USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.start_teleconsultation(UUID) FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.teleconsultation_room_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    consultation_id UUID NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
    provider_event_id TEXT NOT NULL,
    provider_event_type TEXT NOT NULL,
    participant_identity TEXT,
    participant_user_id UUID,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider_event_id)
);

CREATE TABLE IF NOT EXISTS public.teleconsultation_token_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.consultation_recording_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    consultation_id UUID NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    purpose TEXT NOT NULL CHECK (purpose IN ('playback', 'download', 'retention_cleanup')),
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CHECK ((purpose = 'retention_cleanup' AND user_id IS NULL) OR (purpose <> 'retention_cleanup' AND user_id IS NOT NULL))
);

CREATE OR REPLACE FUNCTION public.prevent_teleconsultation_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Registros de auditoria de teleconsulta são append-only.' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_teleconsultation_room_events_append_only ON public.teleconsultation_room_events;
CREATE TRIGGER trg_teleconsultation_room_events_append_only
BEFORE UPDATE OR DELETE ON public.teleconsultation_room_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_teleconsultation_audit_mutation();

DROP TRIGGER IF EXISTS trg_recording_access_log_append_only ON public.consultation_recording_access_log;
CREATE TRIGGER trg_recording_access_log_append_only
BEFORE UPDATE OR DELETE ON public.consultation_recording_access_log
FOR EACH ROW EXECUTE FUNCTION public.prevent_teleconsultation_audit_mutation();

CREATE OR REPLACE FUNCTION public.expire_recording_when_consent_is_withdrawn()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.recording_status = 'consent_rejected'
       AND OLD.recording_status IN ('recording_active', 'recording_saved') THEN
        NEW.recording_expires_at := NOW();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expire_recording_on_consent_withdrawal ON public.consultations;
CREATE TRIGGER trg_expire_recording_on_consent_withdrawal
BEFORE UPDATE OF recording_status ON public.consultations
FOR EACH ROW EXECUTE FUNCTION public.expire_recording_when_consent_is_withdrawn();

ALTER TABLE public.teleconsultation_room_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_recording_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teleconsultation_token_issues ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_teleconsultation_room_events_consultation
    ON public.teleconsultation_room_events(consultation_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_recording_access_consultation
    ON public.consultation_recording_access_log(consultation_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_token_issues_actor_window
    ON public.teleconsultation_token_issues(consultation_id, user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.can_access_consultation(p_consultation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.consultations c
        JOIN public.appointments a ON a.id = c.appointment_id
        LEFT JOIN public.tutors t ON t.id = a.tutor_id
        LEFT JOIN public.veterinarians v ON v.id = a.veterinarian_id
        WHERE c.id = p_consultation_id
          AND auth.uid() IS NOT NULL
          AND (t.user_id = auth.uid() OR v.user_id = auth.uid() OR public.is_admin())
    );
$$;

DROP POLICY IF EXISTS policy_teleconsultation_room_events_read ON public.teleconsultation_room_events;
CREATE POLICY policy_teleconsultation_room_events_read
    ON public.teleconsultation_room_events FOR SELECT TO authenticated
    USING (public.can_access_consultation(consultation_id));

DROP POLICY IF EXISTS policy_recording_access_log_read ON public.consultation_recording_access_log;
CREATE POLICY policy_recording_access_log_read
    ON public.consultation_recording_access_log FOR SELECT TO authenticated
    USING (public.can_access_consultation(consultation_id));

CREATE OR REPLACE FUNCTION public.authorize_video_session(
    p_consultation_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_consultation RECORD;
    v_user_role TEXT;
    v_room_name UUID;
    v_history JSONB := '[]'::jsonb;
BEGIN
    IF COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Apenas a Edge Function pode emitir autorização de sala.' USING ERRCODE = '42501';
    END IF;

    SELECT
        c.id,
        c.tenant_id,
        c.appointment_id,
        c.status AS consultation_status,
        c.video_room_status,
        c.video_room_name,
        c.video_room_started_at,
        c.video_room_ended_at,
        a.tutor_id,
        a.pet_id,
        a.veterinarian_id,
        a.type AS appointment_type,
        a.lifecycle_status,
        a.reservation_status,
        a.starts_at,
        a.ends_at,
        p.name AS pet_name,
        p.species::text AS pet_species,
        t.user_id AS tutor_user_id,
        v.user_id AS veterinarian_user_id
    INTO v_consultation
    FROM public.consultations c
    JOIN public.appointments a ON a.id = c.appointment_id
    JOIN public.pets p ON p.id = a.pet_id
    JOIN public.tutors t ON t.id = a.tutor_id
    JOIN public.veterinarians v ON v.id = a.veterinarian_id AND v.is_active = TRUE AND v.is_verified = TRUE
    WHERE c.id = p_consultation_id
    FOR UPDATE OF c;

    IF v_consultation.id IS NULL THEN
        RAISE EXCEPTION 'Teleconsulta não encontrada.' USING ERRCODE = 'P0002';
    END IF;

    IF v_consultation.appointment_type <> 'teleconsultation' THEN
        RAISE EXCEPTION 'A sala de vídeo só pode ser criada para teleconsulta.' USING ERRCODE = 'P0003';
    END IF;

    IF p_user_id = v_consultation.tutor_user_id THEN
        v_user_role := 'tutor';
    ELSIF p_user_id = v_consultation.veterinarian_user_id THEN
        v_user_role := 'veterinarian';
    ELSE
        RAISE EXCEPTION 'Este usuário não participa da teleconsulta.' USING ERRCODE = '42501';
    END IF;

    IF v_consultation.lifecycle_status <> 'confirmado'
       OR v_consultation.reservation_status NOT IN ('confirmed', 'in_attendance') THEN
        RAISE EXCEPTION 'O agendamento ainda não está confirmado.' USING ERRCODE = 'P0003';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.payments pay
        WHERE pay.appointment_id = v_consultation.appointment_id
          AND pay.tenant_id = v_consultation.tenant_id
          AND pay.status = 'captured'
    ) THEN
        RAISE EXCEPTION 'Pagamento ainda não confirmado pelo gateway.' USING ERRCODE = 'P0003';
    END IF;

    IF NOW() < v_consultation.starts_at - INTERVAL '10 minutes'
       OR NOW() > v_consultation.ends_at + INTERVAL '15 minutes' THEN
        RAISE EXCEPTION 'A sala só fica disponível entre 10 minutos antes e 15 minutos após o horário.' USING ERRCODE = 'P0003';
    END IF;

    IF v_consultation.consultation_status IN ('finished', 'abandoned')
       OR v_consultation.video_room_status IN ('finished', 'abandoned') THEN
        RAISE EXCEPTION 'Esta teleconsulta já foi encerrada.' USING ERRCODE = 'P0003';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM public.teleconsultation_token_issues i
        WHERE i.consultation_id = p_consultation_id
          AND i.user_id = p_user_id
          AND i.created_at > NOW() - INTERVAL '5 minutes'
    ) >= 12 THEN
        RAISE EXCEPTION 'Limite temporário de solicitações de acesso excedido.' USING ERRCODE = '54000';
    END IF;

    INSERT INTO public.teleconsultation_token_issues (consultation_id, user_id)
    VALUES (p_consultation_id, p_user_id);

    v_room_name := COALESCE(v_consultation.video_room_name, gen_random_uuid());

    UPDATE public.consultations
    SET video_room_name = v_room_name,
        video_provider = 'livekit',
        updated_at = NOW()
    WHERE id = p_consultation_id;

    UPDATE public.appointments
    SET telemedicine_technology = COALESCE(telemedicine_technology, '{}'::jsonb)
            || jsonb_build_object('provider', 'livekit', 'recorded_at', NOW()),
        updated_at = NOW()
    WHERE id = v_consultation.appointment_id;

    IF v_user_role = 'veterinarian' THEN
        SELECT COALESCE(
            jsonb_agg(jsonb_build_object(
                'entry_type', history.entry_type,
                'title', history.title,
                'details', history.details,
                'created_at', history.created_at
            ) ORDER BY history.created_at DESC),
            '[]'::jsonb
        ) INTO v_history
        FROM (
            SELECT mr.entry_type, mr.title, mr.details, mr.created_at
            FROM public.medical_records mr
            WHERE mr.pet_id = v_consultation.pet_id
              AND mr.tenant_id = v_consultation.tenant_id
            ORDER BY mr.created_at DESC
            LIMIT 5
        ) history;
    END IF;

    RETURN jsonb_build_object(
        'consultation_id', v_consultation.id,
        'appointment_id', v_consultation.appointment_id,
        'participant_identity', p_user_id::text,
        'participant_role', v_user_role,
        'room_name', v_room_name::text,
        'consultation_status', v_consultation.consultation_status,
        'scheduled_ends_at', v_consultation.ends_at,
        'pet', CASE WHEN v_user_role = 'veterinarian' THEN
            jsonb_build_object('name', v_consultation.pet_name, 'species', v_consultation.pet_species, 'history', v_history)
            ELSE NULL END,
        'clinical_draft', CASE WHEN v_user_role = 'veterinarian' THEN (
            SELECT jsonb_build_object(
                'anamnesis', c.anamnesis,
                'physical_exam', c.physical_exam,
                'diagnosis', c.definitive_diagnosis,
                'clinical_conduct', c.clinical_conduct
            )
            FROM public.consultations c
            WHERE c.id = v_consultation.id
        ) ELSE NULL END
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_teleconsultation_state(p_consultation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_state RECORD;
BEGIN
    SELECT c.id, c.status, c.video_room_status, c.video_room_started_at,
           c.video_room_ended_at, c.video_actual_duration_seconds,
           c.video_connection_drop_count, c.tutor_recording_consent,
           c.vet_recording_consent, c.recording_status,
           c.recording_storage_path, c.recording_expires_at,
           c.clinical_draft_updated_at, a.ends_at
    INTO v_state
    FROM public.consultations c
    JOIN public.appointments a ON a.id = c.appointment_id
    WHERE c.id = p_consultation_id
      AND public.can_access_consultation(c.id);

    IF v_state.id IS NULL THEN
        RAISE EXCEPTION 'Acesso negado à teleconsulta.' USING ERRCODE = '42501';
    END IF;

    RETURN jsonb_build_object(
        'consultation_id', v_state.id,
        'status', v_state.status,
        'video_room_status', v_state.video_room_status,
        'video_room_started_at', v_state.video_room_started_at,
        'video_room_ended_at', v_state.video_room_ended_at,
        'video_actual_duration_seconds', v_state.video_actual_duration_seconds,
        'video_connection_drop_count', v_state.video_connection_drop_count,
        'tutor_recording_consent', COALESCE(v_state.tutor_recording_consent, FALSE),
        'vet_recording_consent', COALESCE(v_state.vet_recording_consent, FALSE),
        'recording_status', v_state.recording_status,
        'recording_storage_path', v_state.recording_storage_path,
        'recording_expires_at', v_state.recording_expires_at,
        'clinical_draft_updated_at', v_state.clinical_draft_updated_at,
        'scheduled_ends_at', v_state.ends_at
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_teleconsultation_draft(
    p_consultation_id UUID,
    p_anamnesis TEXT,
    p_physical_exam TEXT,
    p_diagnosis TEXT,
    p_clinical_conduct TEXT
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_updated_at TIMESTAMPTZ;
BEGIN
    IF v_user_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.consultations c
        JOIN public.appointments a ON a.id = c.appointment_id
        JOIN public.veterinarians v ON v.id = a.veterinarian_id
        WHERE c.id = p_consultation_id
          AND v.user_id = v_user_id
          AND c.status IN ('waiting_room', 'active')
    ) THEN
        RAISE EXCEPTION 'Somente o veterinário responsável pode salvar rascunhos desta teleconsulta.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.consultations
    SET anamnesis = p_anamnesis,
        physical_exam = p_physical_exam,
        definitive_diagnosis = p_diagnosis,
        clinical_conduct = p_clinical_conduct,
        clinical_draft_updated_at = NOW(),
        updated_at = NOW()
    WHERE id = p_consultation_id
    RETURNING clinical_draft_updated_at INTO v_updated_at;

    RETURN v_updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_video_recording(p_consultation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_consultation RECORD;
    v_user_id UUID := auth.uid();
BEGIN
    SELECT c.id, c.tenant_id, c.video_room_name, c.status,
           c.tutor_recording_consent, c.vet_recording_consent,
           v.user_id AS veterinarian_user_id
    INTO v_consultation
    FROM public.consultations c
    JOIN public.appointments a ON a.id = c.appointment_id
    JOIN public.veterinarians v ON v.id = a.veterinarian_id
    WHERE c.id = p_consultation_id
    FOR UPDATE OF c;

    IF v_consultation.id IS NULL OR v_consultation.veterinarian_user_id IS DISTINCT FROM v_user_id THEN
        RAISE EXCEPTION 'Somente o veterinário participante pode iniciar a gravação.' USING ERRCODE = '42501';
    END IF;

    IF v_consultation.status <> 'active' OR v_consultation.video_room_name IS NULL THEN
        RAISE EXCEPTION 'A sala precisa estar ativa para iniciar a gravação.' USING ERRCODE = 'P0003';
    END IF;

    IF v_consultation.recording_status = 'recording_active' THEN
        RAISE EXCEPTION 'Já existe gravação ativa nesta teleconsulta.' USING ERRCODE = 'P0003';
    END IF;

    IF NOT COALESCE(v_consultation.tutor_recording_consent, FALSE)
       OR NOT COALESCE(v_consultation.vet_recording_consent, FALSE) THEN
        RAISE EXCEPTION 'Gravação bloqueada: tutor e veterinário precisam consentir explicitamente.' USING ERRCODE = 'P0003';
    END IF;

    RETURN jsonb_build_object(
        'consultation_id', v_consultation.id,
        'room_name', v_consultation.video_room_name::text,
        'recording_status', 'consent_pending'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_video_egress_started(
    p_consultation_id UUID,
    p_egress_id TEXT,
    p_storage_path TEXT,
    p_retention_days INTEGER DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_consultation RECORD;
BEGIN
    IF COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Apenas a Edge Function pode registrar Egress.' USING ERRCODE = '42501';
    END IF;

    SELECT c.id, c.tenant_id, c.tutor_recording_consent, c.vet_recording_consent, c.status
    INTO v_consultation
    FROM public.consultations c
    WHERE c.id = p_consultation_id
    FOR UPDATE;

    IF v_consultation.id IS NULL OR v_consultation.status <> 'active'
       OR NOT COALESCE(v_consultation.tutor_recording_consent, FALSE)
       OR NOT COALESCE(v_consultation.vet_recording_consent, FALSE) THEN
        RAISE EXCEPTION 'Consentimento bilateral ou sala ativa não confirmado.' USING ERRCODE = 'P0003';
    END IF;

    UPDATE public.consultations
    SET recording_status = 'recording_active',
        recording_started_at = COALESCE(recording_started_at, NOW()),
        recording_storage_path = p_storage_path,
        recording_egress_id = p_egress_id,
        recording_expires_at = NOW() + make_interval(days => GREATEST(1, LEAST(p_retention_days, 3650))),
        updated_at = NOW()
    WHERE id = p_consultation_id;

    RETURN jsonb_build_object('success', TRUE, 'recording_status', 'recording_active');
END;
$$;

CREATE OR REPLACE FUNCTION public.record_video_egress_stopped(p_consultation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Apenas a Edge Function pode registrar o encerramento de Egress.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.consultations
    SET recording_status = 'recording_stopped',
        recording_ended_at = COALESCE(recording_ended_at, NOW()),
                recording_expires_at = CASE
                        WHEN recording_status = 'consent_rejected' THEN NOW()
                        ELSE recording_expires_at
                END,
        updated_at = NOW()
    WHERE id = p_consultation_id
            AND recording_status IN ('recording_active', 'consent_rejected');

    IF NOT FOUND THEN
                IF EXISTS (
                        SELECT 1 FROM public.consultations
                        WHERE id = p_consultation_id
                            AND recording_status IN ('recording_stopped', 'recording_saved')
                ) THEN
                        RETURN jsonb_build_object('success', TRUE, 'recording_status', 'recording_stopped');
                END IF;
        RAISE EXCEPTION 'A gravação não está ativa.' USING ERRCODE = 'P0003';
    END IF;

    RETURN jsonb_build_object('success', TRUE, 'recording_status', 'recording_stopped');
END;
$$;

CREATE OR REPLACE FUNCTION public.process_livekit_room_event(
    p_provider_event_id TEXT,
    p_event_type TEXT,
    p_room_name UUID,
    p_participant_identity TEXT,
    p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_consultation RECORD;
    v_participant_user_id UUID;
    v_now TIMESTAMPTZ := NOW();
    v_duration INTEGER;
    v_event_id UUID;
    v_duplicate BOOLEAN := FALSE;
BEGIN
    IF COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Apenas a Edge Function pode consumir eventos LiveKit.' USING ERRCODE = '42501';
    END IF;

    SELECT c.id, c.tenant_id, c.status, c.video_room_status,
           c.video_room_started_at, c.video_room_ended_at,
           a.tutor_id, a.veterinarian_id, a.starts_at, a.ends_at,
           t.user_id AS tutor_user_id, v.user_id AS veterinarian_user_id
    INTO v_consultation
    FROM public.consultations c
    JOIN public.appointments a ON a.id = c.appointment_id
    JOIN public.tutors t ON t.id = a.tutor_id
    JOIN public.veterinarians v ON v.id = a.veterinarian_id
    WHERE c.video_room_name = p_room_name
    FOR UPDATE OF c;

    IF v_consultation.id IS NULL THEN
        RAISE EXCEPTION 'Sala LiveKit desconhecida.' USING ERRCODE = 'P0002';
    END IF;

    IF p_participant_identity IS NOT NULL THEN
        BEGIN
            v_participant_user_id := p_participant_identity::UUID;
        EXCEPTION WHEN invalid_text_representation THEN
            v_participant_user_id := NULL;
        END;

        IF v_participant_user_id IS DISTINCT FROM v_consultation.tutor_user_id
           AND v_participant_user_id IS DISTINCT FROM v_consultation.veterinarian_user_id THEN
            v_participant_user_id := NULL;
        END IF;
    END IF;

    INSERT INTO public.teleconsultation_room_events (
        tenant_id, consultation_id, provider_event_id, provider_event_type,
        participant_identity, participant_user_id, occurred_at, payload
    ) VALUES (
        v_consultation.tenant_id, v_consultation.id, p_provider_event_id, p_event_type,
        p_participant_identity, v_participant_user_id, v_now, COALESCE(p_payload, '{}'::jsonb)
    )
    ON CONFLICT (provider_event_id) DO NOTHING
    RETURNING id INTO v_event_id;

    IF v_event_id IS NULL THEN
        v_duplicate := TRUE;
        RETURN jsonb_build_object('success', TRUE, 'duplicate', TRUE, 'consultation_id', v_consultation.id);
    END IF;

    IF p_event_type IN ('participant_joined', 'room_started')
       AND (v_consultation.status IN ('finished', 'abandoned')
            OR v_consultation.video_room_status IN ('finished', 'abandoned')) THEN
        RETURN jsonb_build_object('success', TRUE, 'ignored', TRUE, 'consultation_id', v_consultation.id);
    END IF;

    IF p_event_type IN ('participant_joined', 'room_started') THEN
        UPDATE public.consultations
        SET video_room_status = 'active',
            video_room_started_at = COALESCE(video_room_started_at, v_now),
            status = CASE WHEN status = 'waiting_room' THEN 'active'::public.consultation_status_type ELSE status END,
            started_at = COALESCE(started_at, v_now),
            updated_at = NOW()
        WHERE id = v_consultation.id;

        UPDATE public.appointments a
        SET reservation_status = 'in_attendance'
        WHERE a.id = (SELECT appointment_id FROM public.consultations WHERE id = v_consultation.id)
          AND a.reservation_status = 'confirmed';
    ELSIF p_event_type = 'participant_connection_aborted' THEN
        UPDATE public.consultations
        SET video_connection_drop_count = video_connection_drop_count + 1,
            updated_at = NOW()
        WHERE id = v_consultation.id;
    ELSIF p_event_type = 'room_finished' THEN
        v_duration := CASE
            WHEN v_consultation.video_room_started_at IS NULL THEN 0
            ELSE GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_consultation.video_room_started_at))::INTEGER)
        END;

        IF v_consultation.status = 'waiting_room'
           AND v_now > v_consultation.ends_at + INTERVAL '10 minutes' THEN
            UPDATE public.consultations
            SET video_room_status = 'abandoned',
                video_room_ended_at = v_now,
                status = 'abandoned',
                updated_at = NOW()
            WHERE id = v_consultation.id;

            UPDATE public.appointments a
            SET reservation_status = 'no_show',
                lifecycle_status = 'no_show'
            WHERE a.id = (SELECT appointment_id FROM public.consultations WHERE id = v_consultation.id)
              AND a.reservation_status = 'confirmed';
        ELSIF v_consultation.status <> 'finished' THEN
            UPDATE public.consultations
            SET video_room_status = 'interrupted',
                video_room_ended_at = v_now,
                video_actual_duration_seconds = v_duration,
                status = 'interrupted',
                updated_at = NOW()
            WHERE id = v_consultation.id;
        ELSE
            UPDATE public.consultations
            SET video_room_status = 'finished',
                video_room_ended_at = COALESCE(video_room_ended_at, v_now),
                video_actual_duration_seconds = v_duration,
                updated_at = NOW()
            WHERE id = v_consultation.id;
        END IF;
    ELSIF p_event_type = 'egress_ended' THEN
        UPDATE public.consultations
        SET recording_status = CASE
                                WHEN recording_status <> 'consent_rejected'
                                         AND p_payload->>'egress_status' = 'EGRESS_COMPLETE'
                     AND NULLIF(p_payload #>> '{egressInfo,fileResults,0,filename}', '') IS NOT NULL
                THEN 'recording_saved'::public.consultation_recording_status_type
                ELSE 'recording_stopped'::public.consultation_recording_status_type
            END,
            recording_ended_at = v_now,
                        recording_expires_at = CASE
                                WHEN recording_status = 'consent_rejected' THEN v_now
                                ELSE recording_expires_at
                        END,
            updated_at = NOW()
        WHERE id = v_consultation.id
                    AND recording_status IN ('recording_active', 'consent_rejected');
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'duplicate', v_duplicate,
        'event_id', v_event_id,
        'consultation_id', v_consultation.id,
        'event_type', p_event_type
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.log_consultation_recording_access(
    p_consultation_id UUID,
    p_purpose TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant_id UUID;
    v_access_id UUID;
BEGIN
    IF auth.uid() IS NULL OR NOT public.can_access_consultation(p_consultation_id) THEN
        RAISE EXCEPTION 'Acesso negado à gravação.' USING ERRCODE = '42501';
    END IF;

    SELECT tenant_id INTO v_tenant_id
    FROM public.consultations
    WHERE id = p_consultation_id AND recording_status = 'recording_saved';

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Gravação ainda não está disponível.' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.consultation_recording_access_log (tenant_id, consultation_id, user_id, purpose)
    VALUES (v_tenant_id, p_consultation_id, auth.uid(), p_purpose)
    RETURNING id INTO v_access_id;

    RETURN v_access_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_video_recording_stop(p_consultation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_consultation RECORD;
    v_user_id UUID := auth.uid();
BEGIN
    SELECT c.id, c.recording_status, c.recording_egress_id,
           t.user_id AS tutor_user_id, v.user_id AS veterinarian_user_id
    INTO v_consultation
    FROM public.consultations c
    JOIN public.appointments a ON a.id = c.appointment_id
    JOIN public.tutors t ON t.id = a.tutor_id
    JOIN public.veterinarians v ON v.id = a.veterinarian_id
    WHERE c.id = p_consultation_id;

    IF v_consultation.id IS NULL OR v_user_id IS NULL
       OR v_user_id NOT IN (v_consultation.tutor_user_id, v_consultation.veterinarian_user_id) THEN
        RAISE EXCEPTION 'Somente participantes podem interromper a gravação.' USING ERRCODE = '42501';
    END IF;

    IF v_consultation.recording_status NOT IN ('recording_active', 'consent_rejected')
       OR v_consultation.recording_egress_id IS NULL THEN
        RAISE EXCEPTION 'Não há gravação ativa para interromper.' USING ERRCODE = 'P0003';
    END IF;

    RETURN jsonb_build_object(
        'consultation_id', v_consultation.id,
        'egress_id', v_consultation.recording_egress_id
    );
END;
$$;

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
        p_consultation_id,
        p_anamnesis,
        p_physical_exam,
        p_diagnosis,
        p_clinical_conduct,
        p_private_notes
    );

    UPDATE public.medical_records mr
    SET details = concat_ws(
        E'\n',
        NULLIF(mr.details, ''),
        'Tecnologia utilizada na teleconsulta: ' || COALESCE((
            SELECT c.video_provider FROM public.consultations c WHERE c.id = p_consultation_id
        ), 'livekit')
    )
    WHERE mr.consultation_id = p_consultation_id
      AND mr.entry_type = 'consultation_summary';

    v_duration := CASE
        WHEN v_consultation.video_room_started_at IS NULL THEN 0
        ELSE GREATEST(0, EXTRACT(EPOCH FROM (NOW() - v_consultation.video_room_started_at))::INTEGER)
    END;

    UPDATE public.consultations
    SET video_room_status = 'finished',
        video_room_ended_at = NOW(),
        video_actual_duration_seconds = v_duration,
        updated_at = NOW()
    WHERE id = p_consultation_id;

    UPDATE public.appointments a
    SET reservation_status = 'completed'
    WHERE a.id = (SELECT appointment_id FROM public.consultations WHERE id = p_consultation_id)
      AND a.reservation_status = 'in_attendance';

    RETURN jsonb_build_object(
        'success', TRUE,
        'consultation_id', p_consultation_id,
        'room_name', v_consultation.video_room_name,
        'duration_seconds', v_duration,
        'status', 'finished'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_close_expired_video_rooms()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INTEGER := 0;
    v_active_count INTEGER := 0;
BEGIN
        UPDATE public.consultations c
        SET video_room_status = 'abandoned',
                video_room_ended_at = NOW(),
                video_no_show_role = CASE
                        WHEN NOT EXISTS (
                                SELECT 1 FROM public.teleconsultation_room_events e
                                WHERE e.consultation_id = c.id AND e.participant_user_id = a.tutor_user_id
                                    AND e.provider_event_type = 'participant_joined'
                        ) AND NOT EXISTS (
                                SELECT 1 FROM public.teleconsultation_room_events e
                                WHERE e.consultation_id = c.id AND e.participant_user_id = a.veterinarian_user_id
                                    AND e.provider_event_type = 'participant_joined'
                        ) THEN 'both'
                        WHEN NOT EXISTS (
                                SELECT 1 FROM public.teleconsultation_room_events e
                                WHERE e.consultation_id = c.id AND e.participant_user_id = a.tutor_user_id
                                    AND e.provider_event_type = 'participant_joined'
                        ) THEN 'tutor'
                        WHEN NOT EXISTS (
                                SELECT 1 FROM public.teleconsultation_room_events e
                                WHERE e.consultation_id = c.id AND e.participant_user_id = a.veterinarian_user_id
                                    AND e.provider_event_type = 'participant_joined'
                        ) THEN 'veterinarian'
                        ELSE 'unknown'
                END,
                status = 'abandoned',
                updated_at = NOW()
        FROM (
                SELECT a.id AS appointment_id, a.ends_at, t.user_id AS tutor_user_id, v.user_id AS veterinarian_user_id
                FROM public.appointments a
                JOIN public.tutors t ON t.id = a.tutor_id
                JOIN public.veterinarians v ON v.id = a.veterinarian_id
        ) a
        WHERE a.appointment_id = c.appointment_id
            AND c.status = 'waiting_room'
            AND NOW() > a.ends_at + INTERVAL '10 minutes';

        GET DIAGNOSTICS v_count = ROW_COUNT;

        UPDATE public.appointments a
        SET reservation_status = 'no_show',
                lifecycle_status = 'no_show'
        WHERE a.id IN (
                SELECT c.appointment_id FROM public.consultations c
                WHERE c.video_room_status = 'abandoned'
                    AND c.status = 'abandoned'
                    AND c.video_room_ended_at IS NOT NULL
        )
            AND a.reservation_status = 'confirmed';

    UPDATE public.consultations c
    SET video_room_status = 'interrupted',
        video_room_ended_at = NOW(),
        status = CASE WHEN c.status = 'active' THEN 'interrupted'::public.consultation_status_type ELSE c.status END,
        video_actual_duration_seconds = CASE
            WHEN c.video_room_started_at IS NULL THEN 0
            ELSE GREATEST(0, EXTRACT(EPOCH FROM (NOW() - c.video_room_started_at))::INTEGER)
        END,
        updated_at = NOW()
    FROM public.appointments a
    WHERE a.id = c.appointment_id
      AND c.video_room_status = 'active'
      AND c.video_room_ended_at IS NULL
      AND NOW() > a.ends_at + INTERVAL '15 minutes';

        GET DIAGNOSTICS v_active_count = ROW_COUNT;
        RETURN v_count + v_active_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_expired_video_rooms()
RETURNS TABLE (consultation_id UUID, room_name UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
        SELECT c.id, c.video_room_name
        FROM public.consultations c
        JOIN public.appointments a ON a.id = c.appointment_id
        WHERE (
                        (c.status = 'waiting_room' AND a.ends_at < NOW() - INTERVAL '10 minutes')
                        OR (c.status = 'active' AND a.ends_at < NOW() - INTERVAL '15 minutes')
            )
            AND c.video_room_ended_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.list_expired_recordings()
RETURNS TABLE (consultation_id UUID, storage_path TEXT, tenant_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
        SELECT c.id, c.recording_storage_path, c.tenant_id
        FROM public.consultations c
        WHERE c.recording_storage_path IS NOT NULL
            AND c.recording_expires_at IS NOT NULL
            AND c.recording_expires_at <= NOW()
            AND c.recording_deleted_at IS NULL;
$$;

DROP POLICY IF EXISTS policy_consultation_recording_consents_read ON public.consultation_recording_consents;
CREATE POLICY policy_consultation_recording_consents_read
    ON public.consultation_recording_consents FOR SELECT TO authenticated
    USING (public.can_access_consultation(consultation_id));

DROP POLICY IF EXISTS policy_insert_recording_consents ON public.consultation_recording_consents;
REVOKE INSERT, UPDATE, DELETE ON public.consultation_recording_consents FROM anon, authenticated;
GRANT SELECT ON public.consultation_recording_consents TO authenticated;

DROP POLICY IF EXISTS policy_consultations_participant_read ON public.consultations;
CREATE POLICY policy_consultations_participant_read
    ON public.consultations FOR SELECT TO authenticated
    USING (public.can_access_consultation(id));

REVOKE INSERT, UPDATE, DELETE ON public.consultations FROM anon, authenticated;
GRANT SELECT ON public.consultations TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'consultation-recordings',
    'consultation-recordings',
    FALSE,
    524288000,
    ARRAY['video/mp4']
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'consultation-attachments',
    'consultation-attachments',
    FALSE,
    20971520,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS policy_consultation_recordings_read ON storage.objects;
CREATE POLICY policy_consultation_recordings_read ON storage.objects
FOR SELECT TO authenticated
USING (
    bucket_id = 'consultation-recordings'
    AND public.can_access_consultation(((storage.foldername(name))[1])::UUID)
    AND EXISTS (
        SELECT 1 FROM public.consultations c
        WHERE c.id = ((storage.foldername(name))[1])::UUID
          AND c.recording_status = 'recording_saved'
          AND (c.recording_expires_at IS NULL OR c.recording_expires_at > NOW())
    )
);

DROP POLICY IF EXISTS policy_consultation_attachments_read ON storage.objects;
CREATE POLICY policy_consultation_attachments_read ON storage.objects
FOR SELECT TO authenticated
USING (
    bucket_id = 'consultation-attachments'
    AND public.can_access_consultation(((storage.foldername(name))[1])::UUID)
);

DROP POLICY IF EXISTS policy_consultation_attachments_insert ON storage.objects;
CREATE POLICY policy_consultation_attachments_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'consultation-attachments'
    AND public.can_access_consultation(((storage.foldername(name))[1])::UUID)
    AND (storage.foldername(name))[2] = auth.uid()::text
);

REVOKE ALL ON FUNCTION public.authorize_video_session(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_video_session(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.get_teleconsultation_state(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teleconsultation_state(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.process_livekit_room_event(TEXT, TEXT, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_livekit_room_event(TEXT, TEXT, UUID, TEXT, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.record_video_egress_started(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_video_egress_started(UUID, TEXT, TEXT, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.record_video_egress_stopped(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_video_egress_stopped(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.save_teleconsultation_draft(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_teleconsultation_draft(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.authorize_video_recording(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authorize_video_recording(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.authorize_video_recording_stop(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authorize_video_recording_stop(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.finish_video_consultation(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_video_consultation(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.log_consultation_recording_access(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_consultation_recording_access(UUID, TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION public.register_recording_consent(UUID, BOOLEAN, VARCHAR, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.can_access_consultation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_consultation(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.auto_close_expired_video_rooms() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_close_expired_video_rooms() TO service_role;

REVOKE ALL ON FUNCTION public.list_expired_video_rooms() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_expired_video_rooms() TO service_role;

REVOKE ALL ON FUNCTION public.list_expired_recordings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_expired_recordings() TO service_role;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = 'consultations'
       ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.consultations;
    END IF;
END;
$$;

COMMIT;
