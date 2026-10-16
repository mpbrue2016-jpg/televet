-- =============================================================================
-- 0033_referral_specialists.sql
-- Fase 12: Encaminhamentos e especialistas
-- Teletriagem/teleorientacao (Res. CFMV 1.465/2022), motivo clinico + profissional
-- encaminhante, anexos autorizados, escopo minimo do especialista, retorno
-- ligado ao historico, acompanhamento de estado e rastreabilidade.
-- Reaproveita referrals_clinical (0005), can_access_pet_record() (0030),
-- specialties/veterinarians (0003). Migracao ADITIVA e transacional.
-- =============================================================================

BEGIN;

-- 1. Enumeracoes do fluxo de encaminhamento
DO $$ BEGIN
    CREATE TYPE public.referral_status_type AS ENUM (
        'pending', 'accepted', 'in_progress', 'completed',
        'rejected', 'expired', 'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.referral_modality_type AS ENUM (
        'teletriage', 'teleorientation', 'in_person'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Colunas aditivas em referrals_clinical
ALTER TABLE public.referrals_clinical
    ADD COLUMN IF NOT EXISTS referring_veterinarian_name TEXT,
    ADD COLUMN IF NOT EXISTS referring_crmv_number TEXT,
    ADD COLUMN IF NOT EXISTS referring_crmv_uf TEXT,
    ADD COLUMN IF NOT EXISTS target_veterinarian_id UUID REFERENCES public.veterinarians(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS accepted_by UUID REFERENCES public.veterinarians(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS expiration_days INTEGER NOT NULL DEFAULT 7
        CHECK (expiration_days BETWEEN 1 AND 90),
    ADD COLUMN IF NOT EXISTS modality public.referral_modality_type NOT NULL DEFAULT 'teletriage',
    ADD COLUMN IF NOT EXISTS scopes TEXT[] NOT NULL DEFAULT ARRAY['read_clinical']::TEXT[]
        CHECK (scopes <@ ARRAY['read_clinical','exams','documents','prescriptions']::TEXT[]),
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS return_medical_record_id UUID REFERENCES public.medical_records(id) ON DELETE SET NULL;

ALTER TABLE public.referrals_clinical
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ
        GENERATED ALWAYS AS (created_at + make_interval(days => expiration_days)) STORED;

-- Snapshot do encaminhante (rastreabilidade mesmo se o perfil mudar depois)
UPDATE public.referrals_clinical r
SET
    referring_veterinarian_name = u.full_name,
    referring_crmv_number = pr.crmv_number,
    referring_crmv_uf = pr.state_uf
FROM public.veterinarians v
JOIN public.users u ON u.id = v.user_id
LEFT JOIN public.professional_registrations pr ON pr.veterinarian_id = v.id
WHERE r.veterinarian_id = v.id
  AND r.referring_veterinarian_name IS NULL;

-- 3. Anexos autorizados do encaminhamento
CREATE TABLE IF NOT EXISTS public.referral_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    referral_id UUID NOT NULL REFERENCES public.referrals_clinical(id) ON DELETE CASCADE,
    pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
    exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE,
    attached_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    authorized_for_specialist BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_referral_document_has_source
        CHECK (document_id IS NOT NULL OR exam_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_referral_documents_referral
    ON public.referral_documents(referral_id);
CREATE INDEX IF NOT EXISTS idx_referral_documents_pet
    ON public.referral_documents(pet_id);

-- 4. Atendimentos de retorno (ligados ao historico do animal)
CREATE TABLE IF NOT EXISTS public.referral_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    referral_id UUID NOT NULL REFERENCES public.referrals_clinical(id) ON DELETE CASCADE,
    pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    attending_veterinarian_id UUID NOT NULL REFERENCES public.veterinarians(id) ON DELETE CASCADE,
    medical_record_id UUID REFERENCES public.medical_records(id) ON DELETE SET NULL,
    return_summary TEXT NOT NULL CHECK (length(trim(return_summary)) > 0),
    diagnosis TEXT,
    conduct TEXT,
    follow_up_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_returns_referral
    ON public.referral_returns(referral_id);
CREATE INDEX IF NOT EXISTS idx_referral_returns_pet
    ON public.referral_returns(pet_id);

CREATE INDEX IF NOT EXISTS idx_referrals_clinical_pet_status
    ON public.referrals_clinical(pet_id, status);
CREATE INDEX IF NOT EXISTS idx_referrals_clinical_target_vet
    ON public.referrals_clinical(target_veterinarian_id, status);

-- 5. RLS: leitura autorizada; DML apenas via RPC (padrao Fase 10)
ALTER TABLE public.referral_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_referral_documents_read_authorized ON public.referral_documents;
CREATE POLICY policy_referral_documents_read_authorized ON public.referral_documents
FOR SELECT TO authenticated
USING (public.can_access_pet_record(pet_id, 'read_clinical'));

DROP POLICY IF EXISTS policy_referral_returns_read_authorized ON public.referral_returns;
CREATE POLICY policy_referral_returns_read_authorized ON public.referral_returns
FOR SELECT TO authenticated
USING (public.can_access_pet_record(pet_id, 'read_clinical'));

REVOKE ALL ON public.referral_documents FROM anon, authenticated;
GRANT SELECT ON public.referral_documents TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.referral_documents FROM anon, authenticated;

REVOKE ALL ON public.referral_returns FROM anon, authenticated;
GRANT SELECT ON public.referral_returns TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.referral_returns FROM anon, authenticated;

-- 6. RPC: lista candidatos especialistas para uma especialidade.
--    Reutiliza o catalogo unico (veterinarians + CRMV validado + specialties).
CREATE OR REPLACE FUNCTION public.list_referral_candidates(
    p_specialty_id UUID,
    p_state_uf VARCHAR(2) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rows JSONB;
BEGIN
    IF p_specialty_id IS NULL THEN
        RAISE EXCEPTION 'Especialidade obrigatoria.' USING ERRCODE = '22023';
    END IF;
    -- Somente veterinario autenticado consulta candidatos (nao expoe catalogo ao publico).
    IF NOT EXISTS (
        SELECT 1 FROM public.veterinarians v WHERE v.user_id = auth.uid() AND v.is_active
    ) AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Apenas veterinarios podem listar candidatos a especialista.' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'veterinarian_id', v.id,
        'full_name', u.full_name,
        'crmv_number', pr.crmv_number,
        'crmv_uf', pr.state_uf,
        'bio', v.bio,
        'is_telemedicine_enabled', COALESCE(v.is_telemedicine_enabled, TRUE)
    ) ORDER BY u.full_name), '[]'::jsonb)
    INTO v_rows
    FROM public.veterinarians v
    JOIN public.users u ON u.id = v.user_id
    JOIN public.veterinarian_specialties vs ON vs.veterinarian_id = v.id
    JOIN public.professional_registrations pr ON pr.veterinarian_id = v.id
    WHERE vs.specialty_id = p_specialty_id
      AND v.is_active AND v.is_verified
      AND pr.crmv_status = 'validated'
      AND (p_state_uf IS NULL OR pr.state_uf = upper(p_state_uf));

    RETURN jsonb_build_object('candidates', v_rows);
END;
$$;

-- 7. RPC: cria encaminhamento para teletriagem/teleorientacao (Res. CFMV 1.465/2022).
--    Registra motivo clinico, profissional encaminhante (snapshot), escopo minimo
--    concedido ao especialista e prazo de aceite.
CREATE OR REPLACE FUNCTION public.create_referral(
    p_pet_id UUID,
    p_specialty_id UUID,
    p_reason TEXT,
    p_clinical_summary TEXT DEFAULT NULL,
    p_priority public.referral_priority_type DEFAULT 'routine',
    p_modality public.referral_modality_type DEFAULT 'teletriage',
    p_target_veterinarian_id UUID DEFAULT NULL,
    p_scopes TEXT[] DEFAULT NULL,
    p_expiration_days INTEGER DEFAULT 7,
    p_consultation_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant_id UUID;
    v_referrer RECORD;
    v_referral_id UUID;
    v_scopes TEXT[];
BEGIN
    SELECT tenant_id INTO v_tenant_id FROM public.pets WHERE id = p_pet_id;
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Pet nao encontrado.' USING ERRCODE = 'P0002';
    END IF;
    IF NULLIF(trim(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'Informe o motivo do encaminhamento.' USING ERRCODE = '22023';
    END IF;
    IF p_expiration_days IS NULL OR p_expiration_days NOT BETWEEN 1 AND 90 THEN
        RAISE EXCEPTION 'Prazo de aceite deve estar entre 1 e 90 dias.' USING ERRCODE = '22023';
    END IF;

    -- Profissional encaminhante: veterinario ativo/verificado com vinculo assistencial.
    SELECT v.id, v.user_id, u.full_name, pr.crmv_number, pr.state_uf
    INTO v_referrer
    FROM public.veterinarians v
    JOIN public.users u ON u.id = v.user_id
    LEFT JOIN public.professional_registrations pr ON pr.veterinarian_id = v.id
    WHERE v.user_id = auth.uid() AND v.is_active AND v.is_verified;

    IF v_referrer.id IS NULL OR NOT public.can_access_pet_record(p_pet_id, 'write_clinical') THEN
        RAISE EXCEPTION 'Apenas veterinario com vinculo assistencial pode encaminhar o pet.' USING ERRCODE = '42501';
    END IF;

    IF p_specialty_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.specialties s WHERE s.id = p_specialty_id AND s.is_active
    ) THEN
        RAISE EXCEPTION 'Especialidade invalida.' USING ERRCODE = '22023';
    END IF;

    -- Especialista alvo, quando informado, precisa ter a especialidade e CRMV validado.
    IF p_target_veterinarian_id IS NOT NULL THEN
        IF p_target_veterinarian_id = v_referrer.id THEN
            RAISE EXCEPTION 'Nao e possivel encaminhar para si mesmo.' USING ERRCODE = '22023';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM public.veterinarian_specialties vs
            WHERE vs.veterinarian_id = p_target_veterinarian_id AND vs.specialty_id = p_specialty_id
        ) THEN
            RAISE EXCEPTION 'O especialista selecionado nao atende esta especialidade.' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF p_consultation_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.consultations c
        WHERE c.id = p_consultation_id AND c.pet_id = p_pet_id AND c.veterinarian_id = v_referrer.id
    ) THEN
        RAISE EXCEPTION 'Consulta nao corresponde ao pet e veterinario.' USING ERRCODE = '22023';
    END IF;

    -- Escopo minimo: padrao somente leitura do prontuario; nunca 'all'.
    v_scopes := COALESCE(p_scopes, ARRAY['read_clinical']::TEXT[]);
    IF cardinality(v_scopes) = 0
       OR NOT (v_scopes <@ ARRAY['read_clinical','exams','documents','prescriptions']::TEXT[]) THEN
        RAISE EXCEPTION 'Escopo de acesso do especialista invalido.' USING ERRCODE = '22023';
    END IF;


    INSERT INTO public.referrals_clinical (
        tenant_id, consultation_id, veterinarian_id, pet_id, specialty_id,
        target_clinic_id, reason, clinical_summary, priority, status,
        referring_veterinarian_name, referring_crmv_number, referring_crmv_uf,
        target_veterinarian_id, modality, scopes, expiration_days
    ) VALUES (
        v_tenant_id, p_consultation_id, v_referrer.id, p_pet_id, p_specialty_id,
        NULL, trim(p_reason), p_clinical_summary, p_priority, 'pending',
        v_referrer.full_name, v_referrer.crmv_number, v_referrer.state_uf,
        p_target_veterinarian_id, p_modality, v_scopes, p_expiration_days
    ) RETURNING id INTO v_referral_id;

    PERFORM public.write_record_access_log(p_pet_id, 'write', 'clinical_referral',
        jsonb_build_object('referral_id', v_referral_id, 'modality', p_modality,
                           'target_veterinarian_id', p_target_veterinarian_id));

    RETURN v_referral_id;
END;
$$;

-- Helper interno: localiza encaminhamento e veterinario corrente.
CREATE OR REPLACE FUNCTION public._referral_require_specialist(
    p_referral_id UUID,
    p_for_update BOOLEAN DEFAULT FALSE
)
RETURNS public.referrals_clinical
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_referral public.referrals_clinical;
    v_vet_id UUID;
BEGIN
    IF p_for_update THEN
        SELECT * INTO v_referral FROM public.referrals_clinical WHERE id = p_referral_id FOR UPDATE;
    ELSE
        SELECT * INTO v_referral FROM public.referrals_clinical WHERE id = p_referral_id;
    END IF;
    IF v_referral.id IS NULL THEN
        RAISE EXCEPTION 'Encaminhamento nao encontrado.' USING ERRCODE = 'P0002';
    END IF;
    SELECT id INTO v_vet_id FROM public.veterinarians
    WHERE user_id = auth.uid() AND is_active AND is_verified;
    IF v_vet_id IS NULL THEN
        RAISE EXCEPTION 'Apenas veterinario verificado pode gerenciar encaminhamentos.' USING ERRCODE = '42501';
    END IF;
    IF v_vet_id = v_referral.veterinarian_id THEN
        -- Encaminhante: gerencia apenas enquanto o especialista nao assumiu.
        IF v_referral.status NOT IN ('pending','accepted') THEN
            RAISE EXCEPTION 'Encaminhamento ja encerrado.' USING ERRCODE = '22023';
        END IF;
        RETURN v_referral;
    END IF;
    -- Especialista: designado, ou qualquer verificado quando ainda pendente e sem alvo.
    IF v_referral.status = 'pending' THEN
        IF v_referral.target_veterinarian_id IS NOT NULL
           AND v_referral.target_veterinarian_id <> v_vet_id THEN
            RAISE EXCEPTION 'Este encaminhamento foi direcionado a outro especialista.' USING ERRCODE = '42501';
        END IF;
    ELSIF COALESCE(v_referral.accepted_by, v_referral.target_veterinarian_id) <> v_vet_id THEN
        RAISE EXCEPTION 'Apenas o especialista que assumiu o encaminhamento pode atualiza-lo.' USING ERRCODE = '42501';
    END IF;
    RETURN v_referral;

END;
$$;

-- 8. RPC: especialista aceita o encaminhamento (abre o acesso escopado).
CREATE OR REPLACE FUNCTION public.accept_referral(p_referral_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_referral public.referrals_clinical;
    v_vet_id UUID;
BEGIN
    v_referral := public._referral_require_specialist(p_referral_id, TRUE);
    IF v_referral.status <> 'pending' THEN
        RAISE EXCEPTION 'So e possivel aceitar encaminhamento pendente.' USING ERRCODE = '22023';
    END IF;
    IF v_referral.expires_at IS NOT NULL AND v_referral.expires_at < NOW() THEN
        UPDATE public.referrals_clinical
        SET status = 'expired', closed_at = NOW()
        WHERE id = p_referral_id;
        RAISE EXCEPTION 'Prazo de aceite deste encaminhamento venceu.' USING ERRCODE = '22023';
    END IF;
    SELECT id INTO v_vet_id FROM public.veterinarians WHERE user_id = auth.uid();
    IF v_vet_id = v_referral.veterinarian_id THEN
        RAISE EXCEPTION 'O profissional encaminhante nao pode assumir o proprio encaminhamento.' USING ERRCODE = '42501';
    END IF;


    UPDATE public.referrals_clinical
    SET status = 'accepted', accepted_by = v_vet_id, accepted_at = NOW(),
        target_veterinarian_id = COALESCE(target_veterinarian_id, v_vet_id)
    WHERE id = p_referral_id;

    PERFORM public.write_record_access_log(v_referral.pet_id, 'write', 'referral_accepted',
        jsonb_build_object('referral_id', p_referral_id, 'specialist_veterinarian_id', v_vet_id));

    RETURN jsonb_build_object('referral_id', p_referral_id, 'status', 'accepted',
        'scopes', v_referral.scopes);
END;
$$;

-- 9. RPC: recusa, cancelamento ou conclusao do encaminhamento.
CREATE OR REPLACE FUNCTION public.update_referral_status(
    p_referral_id UUID,
    p_new_status TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_referral public.referrals_clinical;
    v_vet_id UUID;
    v_allowed BOOLEAN;
BEGIN
    v_referral := public._referral_require_specialist(p_referral_id, TRUE);
    SELECT id INTO v_vet_id FROM public.veterinarians WHERE user_id = auth.uid();

    -- Transicoes por perfil: especialista assume/avanca/recusa; encaminhante cancela.
    v_allowed := (p_new_status = 'in_progress' AND v_referral.status = 'accepted'
                  AND v_vet_id = COALESCE(v_referral.accepted_by, v_referral.target_veterinarian_id))
              OR (p_new_status = 'rejected' AND v_referral.status IN ('pending','accepted')
                  AND v_vet_id <> v_referral.veterinarian_id)
              OR (p_new_status = 'cancelled' AND v_referral.veterinarian_id = v_vet_id
                  AND v_referral.status IN ('pending','accepted'))
              OR (p_new_status = 'completed' AND v_referral.status IN ('accepted','in_progress')
                  AND v_vet_id = COALESCE(v_referral.accepted_by, v_referral.target_veterinarian_id));
    IF NOT v_allowed THEN
        RAISE EXCEPTION 'Transicao de estado invalida para o encaminhamento.' USING ERRCODE = '22023';
    END IF;
    IF p_new_status = 'rejected' AND NULLIF(trim(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'Informe o motivo da recusa.' USING ERRCODE = '22023';
    END IF;


    UPDATE public.referrals_clinical
    SET status = p_new_status::public.referral_status_type,
        rejection_reason = CASE WHEN p_new_status = 'rejected' THEN trim(p_reason) ELSE rejection_reason END,
        completed_at = CASE WHEN p_new_status = 'completed' THEN NOW() ELSE completed_at END,
        closed_at = CASE WHEN p_new_status IN ('rejected','cancelled','completed') THEN NOW() ELSE closed_at END
    WHERE id = p_referral_id;

    PERFORM public.write_record_access_log(v_referral.pet_id, 'write', 'referral_status_' || p_new_status,
        jsonb_build_object('referral_id', p_referral_id, 'reason', p_reason));

    RETURN jsonb_build_object('referral_id', p_referral_id, 'status', p_new_status);
END;
$$;

-- 10. RPC: anexa documento/exame autorizado ao encaminhamento.
--     O anexo e visivel ao especialista apenas se houver escopo correspondente.
CREATE OR REPLACE FUNCTION public.attach_referral_document(
    p_referral_id UUID,
    p_document_id UUID DEFAULT NULL,
    p_exam_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_referral public.referrals_clinical;
    v_attach_id UUID;
    v_vet_id UUID;
    v_ok BOOLEAN;
BEGIN
    v_referral := public._referral_require_specialist(p_referral_id, FALSE);
    SELECT id INTO v_vet_id FROM public.veterinarians WHERE user_id = auth.uid();

    IF p_document_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.documents d
            WHERE d.id = p_document_id AND d.pet_id = v_referral.pet_id
        ) INTO v_ok;
        IF NOT v_ok THEN
            RAISE EXCEPTION 'Documento nao pertence ao pet deste encaminhamento.' USING ERRCODE = '22023';
        END IF;
    END IF;
    IF p_exam_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.exams e
            WHERE e.id = p_exam_id AND e.pet_id = v_referral.pet_id
        ) INTO v_ok;
        IF NOT v_ok THEN
            RAISE EXCEPTION 'Exame nao pertence ao pet deste encaminhamento.' USING ERRCODE = '22023';
        END IF;
    END IF;
    IF p_document_id IS NULL AND p_exam_id IS NULL THEN
        RAISE EXCEPTION 'Informe um documento ou um exame para anexar.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.referral_documents (
        tenant_id, referral_id, pet_id, document_id, exam_id, attached_by,
        authorized_for_specialist, notes
    ) VALUES (
        v_referral.tenant_id, p_referral_id, v_referral.pet_id, p_document_id, p_exam_id,
        auth.uid(), TRUE, NULLIF(trim(p_notes), '')
    ) RETURNING id INTO v_attach_id;

    PERFORM public.write_record_access_log(v_referral.pet_id, 'write', 'referral_document_attached',
        jsonb_build_object('referral_id', p_referral_id, 'document_id', p_document_id,
                           'exam_id', p_exam_id, 'attached_by_veterinarian_id', v_vet_id));

    RETURN v_attach_id;
END;
$$;

-- 11. RPC: registra o atendimento de retorno do especialista e o liga ao
--     prontuario do animal (medical_records), fechando o encaminhamento.
CREATE OR REPLACE FUNCTION public.record_referral_return(
    p_referral_id UUID,
    p_return_summary TEXT,
    p_diagnosis TEXT DEFAULT NULL,
    p_conduct TEXT DEFAULT NULL,
    p_follow_up_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_referral public.referrals_clinical;
    v_vet_id UUID;
    v_record_id UUID;
    v_return_id UUID;
    v_registration public.professional_registrations%ROWTYPE;
BEGIN
    v_referral := public._referral_require_specialist(p_referral_id, TRUE);
    IF v_referral.status NOT IN ('accepted','in_progress') THEN
        RAISE EXCEPTION 'Retorno so pode ser registrado com encaminhamento ativo.' USING ERRCODE = '22023';
    END IF;
    IF NULLIF(trim(p_return_summary), '') IS NULL THEN
        RAISE EXCEPTION 'Informe o resumo do atendimento de retorno.' USING ERRCODE = '22023';
    END IF;
    SELECT id INTO v_vet_id FROM public.veterinarians WHERE user_id = auth.uid();

    -- CRMV do especialista para assinatura do registro de retorno.
    SELECT * INTO v_registration
    FROM public.professional_registrations
    WHERE veterinarian_id = v_vet_id AND crmv_status = 'validated'
    ORDER BY validated_at DESC NULLS LAST LIMIT 1;

    -- Retorno vira registro assinado no prontuario (entry_type='referral_return').
    INSERT INTO public.medical_records (
        tenant_id, pet_id, consultation_id, veterinarian_id, entry_type,
        title, details, diagnosis, plan, author_crmv_number, author_crmv_uf,
        signed_at, signed_by
    ) VALUES (
        v_referral.tenant_id, v_referral.pet_id, v_referral.consultation_id, v_vet_id,
        'referral_return',
        'Retorno de encaminhamento - ' || COALESCE(v_referral.referring_veterinarian_name, 'especialista'),
        trim(p_return_summary), p_diagnosis, p_conduct,
        v_registration.crmv_number, v_registration.state_uf, NOW(), auth.uid()
    ) RETURNING id INTO v_record_id;

    INSERT INTO public.referral_returns (
        tenant_id, referral_id, pet_id, attending_veterinarian_id,
        medical_record_id, return_summary, diagnosis, conduct, follow_up_at
    ) VALUES (
        v_referral.tenant_id, p_referral_id, v_referral.pet_id, v_vet_id,
        v_record_id, trim(p_return_summary), p_diagnosis, p_conduct, p_follow_up_at
    ) RETURNING id INTO v_return_id;

    UPDATE public.referrals_clinical
    SET status = 'completed', completed_at = NOW(), closed_at = NOW(),
        return_medical_record_id = v_record_id
    WHERE id = p_referral_id;

    PERFORM public.write_record_access_log(v_referral.pet_id, 'write', 'referral_return_recorded',
        jsonb_build_object('referral_id', p_referral_id, 'return_id', v_return_id,
                           'medical_record_id', v_record_id));

    RETURN jsonb_build_object('referral_id', p_referral_id, 'status', 'completed',
        'return_id', v_return_id, 'medical_record_id', v_record_id);
END;
$$;

-- 12. Lista encaminhamentos do pet para quem tem acesso autorizado.
--     O especialista so enxerga os encaminhamentos que assumiu.
CREATE OR REPLACE FUNCTION public.list_pet_referrals(p_pet_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rows JSONB;
    v_vet_id UUID;
BEGIN
    IF NOT public.can_access_pet_record(p_pet_id, 'read_clinical') THEN
        RAISE EXCEPTION 'Acesso negado aos encaminhamentos deste pet.' USING ERRCODE = '42501';
    END IF;
    SELECT id INTO v_vet_id FROM public.veterinarians WHERE user_id = auth.uid();

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'referral_id', r.id,
        'status', r.status,
        'priority', r.priority,
        'modality', r.modality,
        'reason', r.reason,
        'clinical_summary', r.clinical_summary,
        'scopes', r.scopes,
        'specialty_id', r.specialty_id,
        'specialty_name', s.name,
        'referring_veterinarian_name', r.referring_veterinarian_name,
        'referring_crmv_number', r.referring_crmv_number,
        'referring_crmv_uf', r.referring_crmv_uf,
        'target_veterinarian_name', tu.full_name,
        'rejection_reason', r.rejection_reason,
        'created_at', r.created_at,
        'expires_at', r.expires_at,
        'accepted_at', r.accepted_at,
        'completed_at', r.completed_at
    ) ORDER BY r.created_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM public.referrals_clinical r
    LEFT JOIN public.specialties s ON s.id = r.specialty_id
    LEFT JOIN public.veterinarians tv ON tv.id = r.target_veterinarian_id
    LEFT JOIN public.users tu ON tu.id = tv.user_id
    WHERE r.pet_id = p_pet_id
      AND (v_vet_id IS NULL OR r.veterinarian_id = v_vet_id
           OR r.target_veterinarian_id = v_vet_id
           OR r.accepted_by = v_vet_id
           OR public.is_admin());

    PERFORM public.write_record_access_log(p_pet_id, 'read', 'referral_list', '{}'::jsonb);
    RETURN jsonb_build_object('referrals', v_rows);
END;
$$;

-- 13. Detalhe do encaminhamento. O especialista so ve campos clinicos
--     se tiver escopo correspondente; anexos seguem o mesmo recorte.
CREATE OR REPLACE FUNCTION public.get_referral_detail(p_referral_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_referral public.referrals_clinical;
    v_vet_id UUID;
    v_is_party BOOLEAN;
    v_docs JSONB;
    v_returns JSONB;
BEGIN
    SELECT * INTO v_referral FROM public.referrals_clinical WHERE id = p_referral_id;
    IF v_referral.id IS NULL THEN
        RAISE EXCEPTION 'Encaminhamento nao encontrado.' USING ERRCODE = 'P0002';
    END IF;
    IF NOT public.can_access_pet_record(v_referral.pet_id, 'read_clinical') THEN
        RAISE EXCEPTION 'Acesso negado a este encaminhamento.' USING ERRCODE = '42501';
    END IF;
    SELECT id INTO v_vet_id FROM public.veterinarians WHERE user_id = auth.uid();
    v_is_party := public.is_admin()
        OR v_vet_id = v_referral.veterinarian_id
        OR v_vet_id = v_referral.target_veterinarian_id
        OR v_vet_id = v_referral.accepted_by
        OR EXISTS (SELECT 1 FROM public.tutors t WHERE t.user_id = auth.uid()
                   AND t.id = (SELECT tutor_id FROM public.pets WHERE id = v_referral.pet_id));

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'attachment_id', rd.id,
        'document_id', rd.document_id,
        'exam_id', rd.exam_id,
        'title', COALESCE(d.title, e.title),
        'kind', CASE WHEN rd.document_id IS NOT NULL THEN 'document' ELSE 'exam' END,
        'notes', rd.notes,
        'created_at', rd.created_at
    ) ORDER BY rd.created_at DESC), '[]'::jsonb)
    INTO v_docs
    FROM public.referral_documents rd
    LEFT JOIN public.documents d ON d.id = rd.document_id
    LEFT JOIN public.exams e ON e.id = rd.exam_id
    WHERE rd.referral_id = p_referral_id
      AND (v_vet_id IS NULL OR v_is_party)
      AND (v_vet_id IS NULL OR public.is_admin()
           OR v_vet_id = v_referral.veterinarian_id
           OR (rd.document_id IS NOT NULL AND 'documents' = ANY (v_referral.scopes))
           OR (rd.exam_id IS NOT NULL AND 'exams' = ANY (v_referral.scopes)));

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'return_id', rr.id,
        'return_summary', rr.return_summary,
        'diagnosis', rr.diagnosis,
        'conduct', rr.conduct,
        'follow_up_at', rr.follow_up_at,
        'medical_record_id', rr.medical_record_id,
        'attending_veterinarian_name', au.full_name,
        'created_at', rr.created_at
    ) ORDER BY rr.created_at DESC), '[]'::jsonb)
    INTO v_returns
    FROM public.referral_returns rr
    JOIN public.veterinarians av ON av.id = rr.attending_veterinarian_id
    JOIN public.users au ON au.id = av.user_id
    WHERE rr.referral_id = p_referral_id;

    PERFORM public.write_record_access_log(v_referral.pet_id, 'read', 'referral_detail',
        jsonb_build_object('referral_id', p_referral_id));

    RETURN jsonb_build_object(
        'referral_id', v_referral.id,
        'pet_id', v_referral.pet_id,
        'status', v_referral.status,
        'priority', v_referral.priority,
        'modality', v_referral.modality,
        'reason', v_referral.reason,
        'clinical_summary', CASE WHEN v_is_party THEN v_referral.clinical_summary ELSE NULL END,
        'scopes', v_referral.scopes,
        'specialty_id', v_referral.specialty_id,
        'referring_veterinarian_name', v_referral.referring_veterinarian_name,
        'referring_crmv_number', v_referral.referring_crmv_number,
        'referring_crmv_uf', v_referral.referring_crmv_uf,
        'rejection_reason', v_referral.rejection_reason,
        'created_at', v_referral.created_at,
        'expires_at', v_referral.expires_at,
        'accepted_at', v_referral.accepted_at,
        'completed_at', v_referral.completed_at,
        'attachments', v_docs,
        'returns', v_returns
    );
END;
$$;

-- Grants: revoga PUBLIC/anon, permite apenas authenticated (padrao do projeto).
DO $$
DECLARE
    f RECORD;
BEGIN
    FOR f IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'list_referral_candidates', 'create_referral', 'accept_referral',
              'update_referral_status', 'attach_referral_document',
              'record_referral_return', 'list_pet_referrals', 'get_referral_detail',
              '_referral_require_specialist'
          )
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon;', f.sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated;', f.sig);
    END LOOP;
END $$;

COMMIT;





