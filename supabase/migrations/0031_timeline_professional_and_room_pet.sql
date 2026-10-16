-- =============================================================================
-- 0031_timeline_professional_and_room_pet.sql
-- Fase 10 (continuidade): identificacao do profissional responsavel na timeline
-- e pet_id na autorizacao de sala de teleconsulta.
-- Migracao ADITIVA: apenas CREATE OR REPLACE de funcoes existentes.
-- Nenhuma tabela nova, nenhum dado alterado ou removido.
-- =============================================================================

BEGIN;

-- 1. Timeline do prontuario: inclui nome do profissional responsavel (e autor de
--    documentos) alem do CRMV ja existente. Nenhum dado clinico novo e exposto:
--    quem enxerga o evento ja passou por can_access_pet_record().
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
        RAISE EXCEPTION 'Acesso negado ao prontuario deste pet.' USING ERRCODE = '42501';
    END IF;

    SELECT p.id, p.tenant_id, p.tutor_id, p.name, p.species::TEXT AS species, p.breed,
           p.sex::TEXT AS sex, p.birth_date, p.weight_kg, p.microchip_number,
           p.allergies, p.chronic_conditions, t.user_id AS tutor_user_id
    INTO v_pet
    FROM public.pets p
    JOIN public.tutors t ON t.id = p.tutor_id
    WHERE p.id = p_pet_id;

    IF v_pet.id IS NULL THEN
        RAISE EXCEPTION 'Pet nao encontrado.' USING ERRCODE = 'P0002';
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
                   'veterinarian_name', vet_user.full_name,
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
        LEFT JOIN public.veterinarians vet ON vet.id = mr.veterinarian_id
        LEFT JOIN public.users vet_user ON vet_user.id = vet.user_id
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
                   'veterinarian_name', vet_user.full_name,
                   'created_at', ex.requested_at, 'completed_at', ex.completed_at) AS payload
        FROM public.exams ex
        LEFT JOIN public.veterinarians vet ON vet.id = ex.veterinarian_id
        LEFT JOIN public.users vet_user ON vet_user.id = vet.user_id
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
                   'requires_qualified_signature', pr.requires_qualified_signature,
                   'veterinarian_name', vet_user.full_name,
                   'created_at', pr.created_at) AS payload
        FROM public.prescriptions pr
        LEFT JOIN public.veterinarians vet ON vet.id = pr.veterinarian_id
        LEFT JOIN public.users vet_user ON vet_user.id = vet.user_id
        WHERE pr.pet_id = p_pet_id
          AND (p_from IS NULL OR pr.created_at >= p_from)
          AND (p_to IS NULL OR pr.created_at <= p_to)
          AND (p_veterinarian_id IS NULL OR pr.veterinarian_id = p_veterinarian_id)
          AND (p_event_type IS NULL OR p_event_type = 'prescription')
          AND (p_search IS NULL OR concat_ws(' ', pr.medications::TEXT, pr.general_recommendations) ILIKE '%' || p_search || '%')

        UNION ALL

        SELECT r.created_at, r.veterinarian_id,
               jsonb_build_object('id', r.id, 'kind', 'referral', 'event_type', 'referral', 'title', r.reason,
                   'clinical_summary', r.clinical_summary, 'priority', r.priority, 'status', r.status,
                   'veterinarian_name', vet_user.full_name,
                   'created_at', r.created_at) AS payload
        FROM public.referrals_clinical r
        LEFT JOIN public.veterinarians vet ON vet.id = r.veterinarian_id
        LEFT JOIN public.users vet_user ON vet_user.id = vet.user_id
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
                   'medical_record_id', d.medical_record_id,
                   'author_name', author_user.full_name,
                   'created_at', d.created_at) AS payload
        FROM public.documents d
        LEFT JOIN public.users author_user ON author_user.id = d.uploaded_by
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


-- 2. Autorizacao de sala de teleconsulta: retorna tambem o pet_id ja conhecido
--    pelo participante (junto ao nome/especie/historico ja entregues ao vet),
--    viabilizando solicitacao de exame durante a chamada.
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
        RAISE EXCEPTION 'Apenas a Edge Function pode emitir autorizacao de sala.' USING ERRCODE = '42501';
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
        RAISE EXCEPTION 'Teleconsulta nao encontrada.' USING ERRCODE = 'P0002';
    END IF;

    IF v_consultation.appointment_type <> 'teleconsultation' THEN
        RAISE EXCEPTION 'A sala de video so pode ser criada para teleconsulta.' USING ERRCODE = 'P0003';
    END IF;

    IF p_user_id = v_consultation.tutor_user_id THEN
        v_user_role := 'tutor';
    ELSIF p_user_id = v_consultation.veterinarian_user_id THEN
        v_user_role := 'veterinarian';
    ELSE
        RAISE EXCEPTION 'Este usuario nao participa da teleconsulta.' USING ERRCODE = '42501';
    END IF;

    IF v_consultation.lifecycle_status <> 'confirmado'
       OR v_consultation.reservation_status NOT IN ('confirmed', 'in_attendance') THEN
        RAISE EXCEPTION 'O agendamento ainda nao esta confirmado.' USING ERRCODE = 'P0003';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.payments pay
        WHERE pay.appointment_id = v_consultation.appointment_id
          AND pay.tenant_id = v_consultation.tenant_id
          AND pay.status = 'captured'
    ) THEN
        RAISE EXCEPTION 'Pagamento ainda nao confirmado pelo gateway.' USING ERRCODE = 'P0003';
    END IF;

    IF NOW() < v_consultation.starts_at - INTERVAL '10 minutes'
       OR NOW() > v_consultation.ends_at + INTERVAL '15 minutes' THEN
        RAISE EXCEPTION 'A sala so fica disponivel entre 10 minutos antes e 15 minutos apos o horario.' USING ERRCODE = 'P0003';
    END IF;

    IF v_consultation.consultation_status IN ('finished', 'abandoned')
       OR v_consultation.video_room_status IN ('finished', 'abandoned') THEN
        RAISE EXCEPTION 'Esta teleconsulta ja foi encerrada.' USING ERRCODE = 'P0003';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM public.teleconsultation_token_issues i
        WHERE i.consultation_id = p_consultation_id
          AND i.user_id = p_user_id
          AND i.created_at > NOW() - INTERVAL '5 minutes'
    ) >= 12 THEN
        RAISE EXCEPTION 'Limite temporario de solicitacoes de acesso excedido.' USING ERRCODE = '54000';
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
        'pet_id', v_consultation.pet_id,
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

COMMIT;

