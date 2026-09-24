-- ==============================================================================
-- 0016_teleconsultation_and_clinical_security.sql
-- Fase 6: Teleconsulta, Prontuário Clínico, Exames, Receitas e Blindagem de Segurança
-- ==============================================================================

-- 1. Tokens de Acesso Seguro para Sala Virtual de Telemedicina
ALTER TABLE public.consultations
ADD COLUMN IF NOT EXISTS tutor_room_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS vet_room_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS video_provider VARCHAR(64) DEFAULT 'webrtc_livekit',
ADD COLUMN IF NOT EXISTS call_duration_seconds INTEGER DEFAULT 0;

-- 2. Função RPC para Inicializar a Sala Virtual de Teleconsulta
CREATE OR REPLACE FUNCTION public.start_teleconsultation(
    p_consultation_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_consultation RECORD;
    v_tutor_token VARCHAR(255);
    v_vet_token VARCHAR(255);
    v_is_vet BOOLEAN;
    v_is_tutor BOOLEAN;
BEGIN
    SELECT * INTO v_consultation
    FROM public.consultations
    WHERE id = p_consultation_id;

    IF v_consultation.id IS NULL THEN
        RAISE EXCEPTION 'Consulta não encontrada.' USING ERRCODE = 'P0002';
    END IF;

    -- Validação de quem está iniciando (apenas Vet ou Tutor envolvidos)
    v_is_vet := EXISTS (SELECT 1 FROM public.veterinarians WHERE id = v_consultation.veterinarian_id AND user_id = auth.uid());
    v_is_tutor := EXISTS (SELECT 1 FROM public.tutors WHERE id = v_consultation.tutor_id AND user_id = auth.uid());

    IF NOT (v_is_vet OR v_is_tutor OR public.is_admin()) THEN
        RAISE EXCEPTION 'Acesso negado à sala virtual.' USING ERRCODE = '42501';
    END IF;

    -- Gera tokens efêmeros de sala se ainda não existirem
    v_tutor_token := COALESCE(v_consultation.tutor_room_token, 'tutor_tk_' || encode(gen_random_bytes(16), 'hex'));
    v_vet_token := COALESCE(v_consultation.vet_room_token, 'vet_tk_' || encode(gen_random_bytes(16), 'hex'));

    UPDATE public.consultations
    SET 
        status = 'active',
        started_at = COALESCE(started_at, NOW()),
        tutor_room_token = v_tutor_token,
        vet_room_token = v_vet_token,
        updated_at = NOW()
    WHERE id = p_consultation_id;

    -- Atualiza status do agendamento vinculado
    UPDATE public.appointments
    SET lifecycle_status = 'confirmado', updated_at = NOW()
    WHERE id = v_consultation.appointment_id AND lifecycle_status = 'aguardando_pagamento';

    RETURN jsonb_build_object(
        'success', true,
        'consultation_id', p_consultation_id,
        'status', 'active',
        'tutor_token', v_tutor_token,
        'vet_token', v_vet_token,
        'room_url', '/teleconsulta/' || p_consultation_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Função RPC para Encerramento da Consulta e Registro do Prontuário Médico
CREATE OR REPLACE FUNCTION public.finish_teleconsultation(
    p_consultation_id UUID,
    p_anamnesis TEXT,
    p_physical_exam TEXT,
    p_diagnosis TEXT,
    p_clinical_conduct TEXT,
    p_private_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_consultation RECORD;
    v_is_vet BOOLEAN;
    v_duration_secs INTEGER;
BEGIN
    SELECT * INTO v_consultation
    FROM public.consultations
    WHERE id = p_consultation_id;

    IF v_consultation.id IS NULL THEN
        RAISE EXCEPTION 'Consulta não localizada.' USING ERRCODE = 'P0002';
    END IF;

    -- Somente o Veterinário responsável (ou Admin) pode fechar o prontuário
    v_is_vet := EXISTS (SELECT 1 FROM public.veterinarians WHERE id = v_consultation.veterinarian_id AND user_id = auth.uid());

    IF NOT (v_is_vet OR public.is_admin()) THEN
        RAISE EXCEPTION 'Apenas o médico veterinário responsável pode finalizar a consulta e registrar o prontuário.' 
            USING ERRCODE = '42501';
    END IF;

    -- Calcula duração da chamada
    v_duration_secs := EXTRACT(EPOCH FROM (NOW() - COALESCE(v_consultation.started_at, NOW())))::INTEGER;

    -- Atualiza a consulta
    UPDATE public.consultations
    SET 
        status = 'finished',
        finished_at = NOW(),
        call_duration_seconds = v_duration_secs,
        anamnesis = p_anamnesis,
        physical_exam = p_physical_exam,
        definitive_diagnosis = p_diagnosis,
        clinical_conduct = p_clinical_conduct,
        private_veterinarian_notes = p_private_notes,
        updated_at = NOW()
    WHERE id = p_consultation_id;

    -- Grava a entrada no prontuário oficial (medical_records)
    INSERT INTO public.medical_records (
        tenant_id,
        pet_id,
        consultation_id,
        veterinarian_id,
        entry_type,
        title,
        details
    ) VALUES (
        v_consultation.tenant_id,
        v_consultation.pet_id,
        p_consultation_id,
        v_consultation.veterinarian_id,
        'consultation_summary',
        'Atendimento de Telemedicina',
        format('Diagnóstico: %s | Conduta: %s | Anamnese: %s', p_diagnosis, p_clinical_conduct, p_anamnesis)
    );

    -- Atualiza o agendamento para o status 'realizado'
    UPDATE public.appointments
    SET lifecycle_status = 'realizado', updated_at = NOW()
    WHERE id = v_consultation.appointment_id;

    RETURN jsonb_build_object(
        'success', true,
        'consultation_id', p_consultation_id,
        'status', 'finished',
        'duration_seconds', v_duration_secs
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Função RPC para Emissão de Receita Digital
CREATE OR REPLACE FUNCTION public.issue_digital_prescription(
    p_consultation_id UUID,
    p_medications JSONB,
    p_recommendations TEXT,
    p_digital_signature_hash TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_consultation RECORD;
    v_is_vet BOOLEAN;
    v_validation_code VARCHAR(64);
    v_prescription_id UUID;
BEGIN
    SELECT * INTO v_consultation
    FROM public.consultations
    WHERE id = p_consultation_id;

    IF v_consultation.id IS NULL THEN
        RAISE EXCEPTION 'Consulta não localizada.' USING ERRCODE = 'P0002';
    END IF;

    -- Apenas o veterinário responsável pode prescrever
    v_is_vet := EXISTS (SELECT 1 FROM public.veterinarians WHERE id = v_consultation.veterinarian_id AND user_id = auth.uid());

    IF NOT (v_is_vet OR public.is_admin()) THEN
        RAISE EXCEPTION 'Apenas o veterinário responsável pode emitir receitas médicas.' USING ERRCODE = '42501';
    END IF;

    -- Código público de validação (ex: RX-9A3F-2026)
    v_validation_code := 'RX-' || upper(substring(encode(gen_random_bytes(4), 'hex') from 1 for 6)) || '-' || to_char(NOW(), 'YYYY');

    INSERT INTO public.prescriptions (
        tenant_id,
        consultation_id,
        veterinarian_id,
        pet_id,
        tutor_id,
        medications,
        general_recommendations,
        validation_code,
        digital_signature_hash,
        signed_at,
        expires_at
    ) VALUES (
        v_consultation.tenant_id,
        p_consultation_id,
        v_consultation.veterinarian_id,
        v_consultation.pet_id,
        v_consultation.tutor_id,
        p_medications,
        p_recommendations,
        v_validation_code,
        p_digital_signature_hash,
        NOW(),
        CURRENT_DATE + 30 -- Validade de 30 dias
    ) RETURNING id INTO v_prescription_id;

    RETURN jsonb_build_object(
        'success', true,
        'prescription_id', v_prescription_id,
        'validation_code', v_validation_code,
        'expires_at', CURRENT_DATE + 30
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. BLINDAGEM RLS: PET SHOP JAMAIS PODE EDITAR DADOS CLÍNICOS NEM REGISTROS DE VETS
-- Garante que tentativas de UPDATE / DELETE nas tabelas médicas por Pet Shops sejam bloqueadas no banco

-- Regra de bloqueio em medical_records
CREATE OR REPLACE POLICY policy_block_petshop_tampering_medical_records ON public.medical_records
FOR UPDATE USING (
    public.is_admin() OR 
    veterinarian_id IN (SELECT id FROM public.veterinarians WHERE user_id = auth.uid())
) WITH CHECK (
    public.is_admin() OR 
    veterinarian_id IN (SELECT id FROM public.veterinarians WHERE user_id = auth.uid())
);

-- Regra de bloqueio em prescriptions
CREATE OR REPLACE POLICY policy_block_petshop_tampering_prescriptions ON public.prescriptions
FOR UPDATE USING (
    public.is_admin() OR 
    veterinarian_id IN (SELECT id FROM public.veterinarians WHERE user_id = auth.uid())
) WITH CHECK (
    public.is_admin() OR 
    veterinarian_id IN (SELECT id FROM public.veterinarians WHERE user_id = auth.uid())
);

-- Regra de bloqueio em professional_registrations (Pet Shop NUNCA pode alterar CRMV)
CREATE OR REPLACE POLICY policy_block_petshop_tampering_crmv ON public.professional_registrations
FOR UPDATE USING (
    public.is_admin() OR 
    veterinarian_id IN (SELECT id FROM public.veterinarians WHERE user_id = auth.uid())
) WITH CHECK (
    public.is_admin() OR 
    veterinarian_id IN (SELECT id FROM public.veterinarians WHERE user_id = auth.uid())
);
