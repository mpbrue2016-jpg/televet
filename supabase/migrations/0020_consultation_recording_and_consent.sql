-- ==============================================================================
-- 0020_consultation_recording_and_consent.sql
-- Fase 10: Termo de Consentimento Prévio e Mecanismo de Gravação de Consultas
-- Em conformidade com LGPD, Resoluções CFMV e Segurança Regulatória
-- ==============================================================================

-- 1. Criação do tipo ENUM para status da gravação
DO $$ BEGIN
    CREATE TYPE consultation_recording_status_type AS ENUM (
        'not_recorded',
        'consent_pending',
        'recording_active',
        'recording_stopped',
        'recording_saved',
        'consent_rejected'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Atualização da tabela consultations com campos de consentimento e auditoria da gravação
ALTER TABLE public.consultations
ADD COLUMN IF NOT EXISTS recording_status consultation_recording_status_type DEFAULT 'not_recorded',
ADD COLUMN IF NOT EXISTS tutor_recording_consent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS tutor_consented_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS vet_recording_consent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS vet_consented_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS recording_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS recording_ended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS recording_duration_seconds INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS recording_file_size_bytes BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS recording_storage_path TEXT,
ADD COLUMN IF NOT EXISTS recording_sha256_hash TEXT;

-- 3. Tabela de logs imutáveis de consentimento para fins jurídicos e regulatórios (LGPD / CFMV)
CREATE TABLE IF NOT EXISTS public.consultation_recording_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    consultation_id UUID NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_role VARCHAR(32) NOT NULL, -- 'tutor', 'veterinarian' ou 'admin'
    consented BOOLEAN NOT NULL,
    terms_version VARCHAR(16) NOT NULL DEFAULT 'v1.0-2026',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recording_consents_consultation_id 
ON public.consultation_recording_consents(consultation_id);

ALTER TABLE public.consultation_recording_consents ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de RLS para os Registros de Consentimento
CREATE OR REPLACE POLICY policy_view_recording_consents ON public.consultation_recording_consents
FOR SELECT USING (
    public.is_admin() OR
    user_id = auth.uid() OR
    consultation_id IN (
        SELECT c.id FROM public.consultations c
        LEFT JOIN public.veterinarians v ON v.id = c.veterinarian_id
        LEFT JOIN public.tutors t ON t.id = c.tutor_id
        WHERE v.user_id = auth.uid() OR t.user_id = auth.uid()
    )
);

CREATE OR REPLACE POLICY policy_insert_recording_consents ON public.consultation_recording_consents
FOR INSERT WITH CHECK (
    user_id = auth.uid() OR public.is_admin()
);

-- 5. Função RPC: Registrar Consentimento Prévio de Gravação
CREATE OR REPLACE FUNCTION public.register_recording_consent(
    p_consultation_id UUID,
    p_consented BOOLEAN,
    p_terms_version VARCHAR(16) DEFAULT 'v1.0-2026',
    p_ip_address TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_consultation RECORD;
    v_user_id UUID := auth.uid();
    v_is_vet BOOLEAN;
    v_is_tutor BOOLEAN;
    v_role VARCHAR(32);
    v_both_consented BOOLEAN := FALSE;
    v_new_status consultation_recording_status_type;
BEGIN
    SELECT * INTO v_consultation
    FROM public.consultations
    WHERE id = p_consultation_id;

    IF v_consultation.id IS NULL THEN
        RAISE EXCEPTION 'Consulta não encontrada.' USING ERRCODE = 'P0002';
    END IF;

    -- Identifica o papel do usuário
    v_is_vet := EXISTS (SELECT 1 FROM public.veterinarians WHERE id = v_consultation.veterinarian_id AND user_id = v_user_id);
    v_is_tutor := EXISTS (SELECT 1 FROM public.tutors WHERE id = v_consultation.tutor_id AND user_id = v_user_id);

    IF NOT (v_is_vet OR v_is_tutor OR public.is_admin()) THEN
        RAISE EXCEPTION 'Acesso negado para registrar consentimento nesta consulta.' USING ERRCODE = '42501';
    END IF;

    IF v_is_vet THEN
        v_role := 'veterinarian';
    ELSIF v_is_tutor THEN
        v_role := 'tutor';
    ELSE
        v_role := 'admin';
    END IF;

    -- Grava no histórico imutável
    INSERT INTO public.consultation_recording_consents (
        tenant_id,
        consultation_id,
        user_id,
        user_role,
        consented,
        terms_version,
        ip_address,
        user_agent
    ) VALUES (
        v_consultation.tenant_id,
        p_consultation_id,
        v_user_id,
        v_role,
        p_consented,
        p_terms_version,
        CASE WHEN p_ip_address IS NOT NULL AND p_ip_address <> '' THEN p_ip_address::inet ELSE NULL END,
        p_user_agent
    );

    -- Atualiza o consentimento na consulta
    IF v_role = 'veterinarian' THEN
        UPDATE public.consultations
        SET 
            vet_recording_consent = p_consented,
            vet_consented_at = CASE WHEN p_consented THEN NOW() ELSE NULL END,
            updated_at = NOW()
        WHERE id = p_consultation_id;
    ELSIF v_role = 'tutor' THEN
        UPDATE public.consultations
        SET 
            tutor_recording_consent = p_consented,
            tutor_consented_at = CASE WHEN p_consented THEN NOW() ELSE NULL END,
            updated_at = NOW()
        WHERE id = p_consultation_id;
    END IF;

    -- Recarrega o estado atualizado
    SELECT * INTO v_consultation FROM public.consultations WHERE id = p_consultation_id;

    v_both_consented := (v_consultation.tutor_recording_consent = TRUE AND v_consultation.vet_recording_consent = TRUE);

    IF p_consented = FALSE THEN
        v_new_status := 'consent_rejected';
    ELSIF v_both_consented THEN
        v_new_status := 'consent_pending'; -- Pronto para iniciar a gravação
    ELSE
        v_new_status := 'consent_pending';
    END IF;

    UPDATE public.consultations
    SET recording_status = v_new_status
    WHERE id = p_consultation_id;

    RETURN jsonb_build_object(
        'success', true,
        'consultation_id', p_consultation_id,
        'user_role', v_role,
        'consented', p_consented,
        'tutor_consented', COALESCE(v_consultation.tutor_recording_consent, false),
        'vet_consented', COALESCE(v_consultation.vet_recording_consent, false),
        'can_record', v_both_consented,
        'recording_status', v_new_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Função RPC: Iniciar Gravação (com validação obrigatória de consentimento mútuo)
CREATE OR REPLACE FUNCTION public.start_consultation_recording(
    p_consultation_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_consultation RECORD;
    v_is_vet BOOLEAN;
BEGIN
    SELECT * INTO v_consultation FROM public.consultations WHERE id = p_consultation_id;

    IF v_consultation.id IS NULL THEN
        RAISE EXCEPTION 'Consulta não encontrada.' USING ERRCODE = 'P0002';
    END IF;

    v_is_vet := EXISTS (SELECT 1 FROM public.veterinarians WHERE id = v_consultation.veterinarian_id AND user_id = auth.uid());

    IF NOT (v_is_vet OR public.is_admin()) THEN
        RAISE EXCEPTION 'Apenas o veterinário responsável pode acionar a gravação.' USING ERRCODE = '42501';
    END IF;

    -- Validação jurídica rigorosa de consentimento
    IF NOT (COALESCE(v_consultation.tutor_recording_consent, false) AND COALESCE(v_consultation.vet_recording_consent, false)) THEN
        RAISE EXCEPTION 'A gravação não pode ser iniciada sem o consentimento prévio de ambas as partes (Tutor e Veterinário).'
            USING ERRCODE = 'P0003';
    END IF;

    UPDATE public.consultations
    SET 
        recording_status = 'recording_active',
        recording_started_at = NOW(),
        updated_at = NOW()
    WHERE id = p_consultation_id;

    -- Auditoria
    INSERT INTO public.audit_logs (
        tenant_id,
        user_id,
        action,
        entity_name,
        entity_id,
        details
    ) VALUES (
        v_consultation.tenant_id,
        auth.uid(),
        'START_RECORDING',
        'consultations',
        p_consultation_id,
        jsonb_build_object('info', 'Gravação iniciada com consentimento bilateral verificado.')
    );

    RETURN jsonb_build_object(
        'success', true,
        'consultation_id', p_consultation_id,
        'recording_status', 'recording_active',
        'started_at', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Função RPC: Salvar e Finalizar a Gravação
CREATE OR REPLACE FUNCTION public.save_consultation_recording(
    p_consultation_id UUID,
    p_recording_url TEXT,
    p_storage_path TEXT DEFAULT NULL,
    p_duration_seconds INTEGER DEFAULT 0,
    p_file_size_bytes BIGINT DEFAULT 0,
    p_sha256_hash TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_consultation RECORD;
    v_is_vet BOOLEAN;
BEGIN
    SELECT * INTO v_consultation FROM public.consultations WHERE id = p_consultation_id;

    IF v_consultation.id IS NULL THEN
        RAISE EXCEPTION 'Consulta não encontrada.' USING ERRCODE = 'P0002';
    END IF;

    v_is_vet := EXISTS (SELECT 1 FROM public.veterinarians WHERE id = v_consultation.veterinarian_id AND user_id = auth.uid());

    IF NOT (v_is_vet OR public.is_admin()) THEN
        RAISE EXCEPTION 'Permissão negada para salvar a gravação da consulta.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.consultations
    SET 
        recording_url = p_recording_url,
        recording_storage_path = p_storage_path,
        recording_ended_at = NOW(),
        recording_duration_seconds = p_duration_seconds,
        recording_file_size_bytes = p_file_size_bytes,
        recording_sha256_hash = p_sha256_hash,
        recording_status = 'recording_saved',
        updated_at = NOW()
    WHERE id = p_consultation_id;

    -- Vincula também como anexo confidencial no prontuário oficial
    INSERT INTO public.medical_records (
        tenant_id,
        pet_id,
        consultation_id,
        veterinarian_id,
        entry_type,
        title,
        details,
        file_url
    ) VALUES (
        v_consultation.tenant_id,
        v_consultation.pet_id,
        p_consultation_id,
        v_consultation.veterinarian_id,
        'recording_evidence',
        'Gravação Audiovisual da Consulta (Sigilo Médico)',
        format('Arquivo audiovisual arquivado sob custódia técnica e sigilo profissional. Duração: %s s. Hash: %s', p_duration_seconds, COALESCE(p_sha256_hash, 'N/A')),
        p_recording_url
    );

    -- Auditoria
    INSERT INTO public.audit_logs (
        tenant_id,
        user_id,
        action,
        entity_name,
        entity_id,
        details
    ) VALUES (
        v_consultation.tenant_id,
        auth.uid(),
        'SAVE_RECORDING',
        'consultations',
        p_consultation_id,
        jsonb_build_object(
            'recording_url', p_recording_url,
            'duration_seconds', p_duration_seconds,
            'sha256', p_sha256_hash
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'consultation_id', p_consultation_id,
        'recording_status', 'recording_saved',
        'recording_url', p_recording_url,
        'duration_seconds', p_duration_seconds
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
