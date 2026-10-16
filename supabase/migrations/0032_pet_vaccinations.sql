-- =============================================================================
-- 0032_pet_vaccinations.sql
-- Fase 11: Carteira de vacinacao digital, historico de saude e lembretes
-- Persistencia real Supabase + RLS. Reaproveita pets, medical_records
-- (entry_type='vaccine'), documents e can_access_pet_record().
-- Migracao ADITIVA: nao altera assinaturas de funcoes existentes.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Tabela de vacinas (carteira estruturada por pet)
--    Datas/doses NUNCA sao inventadas: campos opcionais ficam NULL quando o
--    profissional nao informar. proxima dose so existe se definida por ele.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vaccinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    veterinarian_id UUID REFERENCES public.veterinarians(id) ON DELETE SET NULL,
    consultation_id UUID REFERENCES public.consultations(id) ON DELETE SET NULL,
    vaccine_name VARCHAR(255) NOT NULL,
    manufacturer VARCHAR(255),                    -- fabricante/identificacao, quando disponivel
    lot_number VARCHAR(128),                      -- lote, quando aplicavel
    application_date DATE NOT NULL,               -- data de aplicacao (validada: <= hoje na RPC)
    dose_number VARCHAR(64),                      -- texto livre do profissional (ex.: '1a', 'reforco')
    observations TEXT,                            -- registro de observacoes
    next_dose_at DATE,                            -- proxima dose APENAS se definida pelo profissional
    reminder_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    reminder_notified_at TIMESTAMPTZ,             -- idempotencia do lembrete in-app
    recorded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- proxima dose, quando existir, deve ser posterior a aplicacao (comparacao de colunas = imutavel)
    CONSTRAINT chk_vaccination_next_dose_after_apply CHECK (next_dose_at IS NULL OR next_dose_at > application_date),
    -- lembrete so faz sentido com uma proxima dose definida
    CONSTRAINT chk_vaccination_reminder_requires_next CHECK (reminder_enabled = FALSE OR next_dose_at IS NOT NULL),
    CONSTRAINT chk_vaccination_name_not_blank CHECK (length(trim(vaccine_name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_vaccinations_pet_id ON public.vaccinations(pet_id);
CREATE INDEX IF NOT EXISTS idx_vaccinations_application_date ON public.vaccinations(application_date DESC);
CREATE INDEX IF NOT EXISTS idx_vaccinations_next_dose ON public.vaccinations(next_dose_at) WHERE next_dose_at IS NOT NULL;

-- Trigger de atualizacao (padrao do projeto)
CREATE OR REPLACE TRIGGER trg_vaccinations_updated_at
BEFORE UPDATE ON public.vaccinations
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Anexo de comprovante: coluna aditiva em documents
-- -----------------------------------------------------------------------------
ALTER TABLE public.documents
    ADD COLUMN IF NOT EXISTS vaccination_id UUID REFERENCES public.vaccinations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_vaccination_id ON public.documents(vaccination_id)
    WHERE vaccination_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. Seguranca: RLS habilitado + leitura unica por autorizacao clinica
--    DML direto REVOGADO (padrao Fase 10): gravacao somente por RPC
--    SECURITY DEFINER (create_vaccination / update_vaccination).
-- -----------------------------------------------------------------------------
ALTER TABLE public.vaccinations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_vaccinations_read_authorized ON public.vaccinations;
CREATE POLICY policy_vaccinations_read_authorized ON public.vaccinations
FOR SELECT TO authenticated
USING (public.can_access_pet_record(pet_id, 'read_clinical'));

REVOKE ALL ON public.vaccinations FROM anon, authenticated;
GRANT SELECT ON public.vaccinations TO authenticated;

-- Auditoria das vacinas (mesma trigger generica das demais tabelas clinicas)
DROP TRIGGER IF EXISTS trg_audit_vaccinations ON public.vaccinations;
CREATE TRIGGER trg_audit_vaccinations
AFTER INSERT OR UPDATE OR DELETE ON public.vaccinations
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- -----------------------------------------------------------------------------
-- 4. Funcoes / RPCs da carteira de vacinacao
-- -----------------------------------------------------------------------------

-- 4.1 Cria uma vacina. Somente veterinario verificado com vinculo assistencial.
--     Nao ha preenchimento automatico: campos nao informados ficam NULL.
CREATE OR REPLACE FUNCTION public.create_vaccination(
    p_pet_id UUID,
    p_vaccine_name TEXT,
    p_application_date DATE,
    p_manufacturer TEXT DEFAULT NULL,
    p_lot_number TEXT DEFAULT NULL,
    p_dose_number TEXT DEFAULT NULL,
    p_observations TEXT DEFAULT NULL,
    p_next_dose_at DATE DEFAULT NULL,
    p_reminder_enabled BOOLEAN DEFAULT FALSE,
    p_consultation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_pet RECORD;
    v_vet RECORD;
    v_vaccination_id UUID;
BEGIN
    SELECT v.id, v.is_active, v.is_verified
    INTO v_vet
    FROM public.veterinarians v
    WHERE v.user_id = auth.uid();
    IF v_vet.id IS NULL OR NOT v_vet.is_active OR NOT v_vet.is_verified
       OR NOT public.can_access_pet_record(p_pet_id, 'write_clinical') THEN
        RAISE EXCEPTION 'Somente veterinario verificado com vinculo assistencial pode registrar vacinas.' USING ERRCODE = '42501';
    END IF;

    IF p_vaccine_name IS NULL OR length(trim(p_vaccine_name)) = 0 THEN
        RAISE EXCEPTION 'Nome da vacina e obrigatorio.' USING ERRCODE = '22023';
    END IF;
    IF p_application_date IS NULL OR p_application_date > CURRENT_DATE THEN
        RAISE EXCEPTION 'Data de aplicacao invalida: nao e possivel registrar vacina com data futura.' USING ERRCODE = '22023';
    END IF;
    IF p_next_dose_at IS NOT NULL AND p_next_dose_at <= p_application_date THEN
        RAISE EXCEPTION 'A proxima dose deve ser posterior a data de aplicacao.' USING ERRCODE = '22023';
    END IF;
    IF p_reminder_enabled AND p_next_dose_at IS NULL THEN
        RAISE EXCEPTION 'Lembrete exige proxima dose definida pelo profissional.' USING ERRCODE = '22023';
    END IF;
    IF p_consultation_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.consultations c WHERE c.id = p_consultation_id AND c.pet_id = p_pet_id
    ) THEN
        RAISE EXCEPTION 'Consulta nao pertence ao pet.' USING ERRCODE = '22023';
    END IF;

    SELECT p.tenant_id INTO v_pet FROM public.pets p WHERE p.id = p_pet_id;
    IF v_pet.tenant_id IS NULL THEN RAISE EXCEPTION 'Pet nao encontrado.' USING ERRCODE = 'P0002'; END IF;

    INSERT INTO public.vaccinations (
        tenant_id, pet_id, veterinarian_id, consultation_id, vaccine_name,
        manufacturer, lot_number, application_date, dose_number, observations,
        next_dose_at, reminder_enabled, recorded_by
    ) VALUES (
        v_pet.tenant_id, p_pet_id, v_vet.id, p_consultation_id, trim(p_vaccine_name),
        NULLIF(trim(p_manufacturer), ''), NULLIF(trim(p_lot_number), ''), p_application_date,
        NULLIF(trim(p_dose_number), ''), NULLIF(trim(p_observations), ''),
        p_next_dose_at, COALESCE(p_reminder_enabled, FALSE), auth.uid()
    ) RETURNING id INTO v_vaccination_id;

    PERFORM public.write_record_access_log(p_pet_id, 'write', 'vaccination_created', jsonb_build_object('vaccination_id', v_vaccination_id));
    RETURN jsonb_build_object('vaccination_id', v_vaccination_id, 'created_at', NOW());
END;
$$;

-- 4.2 Atualiza campos complementares de uma vacina (profissional que registrou ou admin).
CREATE OR REPLACE FUNCTION public.update_vaccination(
    p_vaccination_id UUID,
    p_manufacturer TEXT DEFAULT NULL,
    p_lot_number TEXT DEFAULT NULL,
    p_observations TEXT DEFAULT NULL,
    p_next_dose_at DATE DEFAULT NULL,
    p_reminder_enabled BOOLEAN DEFAULT FALSE,
    p_dose_number TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_v RECORD;
    v_vet RECORD;
BEGIN
    SELECT * INTO v_v FROM public.vaccinations WHERE id = p_vaccination_id FOR UPDATE;
    IF v_v.id IS NULL THEN RAISE EXCEPTION 'Vacina nao encontrada.' USING ERRCODE = 'P0002'; END IF;

    SELECT v.id, v.is_active, v.is_verified
    INTO v_vet
    FROM public.veterinarians v
    WHERE v.user_id = auth.uid();

    IF NOT public.is_admin() THEN
        IF v_vet.id IS NULL OR NOT v_vet.is_active OR NOT v_vet.is_verified
           OR NOT public.can_access_pet_record(v_v.pet_id, 'write_clinical') THEN
            RAISE EXCEPTION 'Sem permissao para alterar este registro de vacina.' USING ERRCODE = '42501';
        END IF;
        IF v_v.recorded_by IS NOT NULL AND v_v.recorded_by <> auth.uid() THEN
            RAISE EXCEPTION 'Apenas o profissional que registrou a vacina pode edita-la.' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF p_next_dose_at IS NOT NULL AND p_next_dose_at <= v_v.application_date THEN
        RAISE EXCEPTION 'A proxima dose deve ser posterior a data de aplicacao.' USING ERRCODE = '22023';
    END IF;
    IF p_reminder_enabled AND COALESCE(p_next_dose_at, v_v.next_dose_at) IS NULL THEN
        RAISE EXCEPTION 'Lembrete exige proxima dose definida pelo profissional.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.vaccinations
    SET manufacturer = COALESCE(NULLIF(trim(p_manufacturer), ''), manufacturer),
        lot_number = COALESCE(NULLIF(trim(p_lot_number), ''), lot_number),
        observations = COALESCE(NULLIF(trim(p_observations), ''), observations),
        dose_number = COALESCE(NULLIF(trim(p_dose_number), ''), dose_number),
        next_dose_at = CASE WHEN p_next_dose_at IS NOT NULL THEN p_next_dose_at ELSE next_dose_at END,
        reminder_enabled = COALESCE(p_reminder_enabled, reminder_enabled),
        reminder_notified_at = CASE WHEN p_next_dose_at IS NOT NULL AND p_next_dose_at IS DISTINCT FROM next_dose_at
                                    THEN NULL ELSE reminder_notified_at END,
        updated_at = NOW()
    WHERE id = p_vaccination_id;

    PERFORM public.write_record_access_log(v_v.pet_id, 'write', 'vaccination_updated', jsonb_build_object('vaccination_id', p_vaccination_id));
    RETURN TRUE;
END;
$$;

-- 4.3 Lista as vacinas estruturadas do pet com status DERIVADO de next_dose_at.
--     Cria o lembrete in-app uma unica vez quando o profissional ativou o reminder.
CREATE OR REPLACE FUNCTION public.get_pet_vaccinations(p_pet_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_pet RECORD;
    v_rows JSONB;
BEGIN
    IF NOT public.can_access_pet_record(p_pet_id, 'read_clinical') THEN
        RAISE EXCEPTION 'Acesso negado a carteira de vacinacao deste pet.' USING ERRCODE = '42501';
    END IF;

    SELECT p.id, p.tenant_id, p.tutor_id, p.name, p.species::TEXT AS species, p.breed,
           t.user_id AS tutor_user_id
    INTO v_pet
    FROM public.pets p
    JOIN public.tutors t ON t.id = p.tutor_id
    WHERE p.id = p_pet_id;
    IF v_pet.id IS NULL THEN RAISE EXCEPTION 'Pet nao encontrado.' USING ERRCODE = 'P0002'; END IF;

    PERFORM public.write_record_access_log(p_pet_id, 'read', 'vaccination_wallet', '{}'::jsonb);

    -- Lembrete in-app idempotente (apenas canal in_app; nunca email/push/whatsapp)
    IF EXISTS (
        SELECT 1 FROM public.vaccinations vx
        WHERE vx.pet_id = p_pet_id
          AND vx.reminder_enabled
          AND vx.reminder_notified_at IS NULL
          AND vx.next_dose_at IS NOT NULL
          AND vx.next_dose_at <= CURRENT_DATE + INTERVAL '7 days'
    ) THEN
        INSERT INTO public.notifications (tenant_id, user_id, title, message, channel, category, action_url)
        SELECT v_pet.tenant_id, v_pet.tutor_user_id, 'Proxima dose de vacina',
               'Uma dose de vacina do pet ' || v_pet.name || ' vence em ' ||
               to_char(min(vx.next_dose_at), 'DD/MM/YYYY') || '.',
               'in_app', 'vaccine_reminder', '/dashboard/pet/' || p_pet_id::text
        FROM public.vaccinations vx
        WHERE vx.pet_id = p_pet_id
          AND vx.reminder_enabled
          AND vx.reminder_notified_at IS NULL
          AND vx.next_dose_at IS NOT NULL
          AND vx.next_dose_at <= CURRENT_DATE + INTERVAL '7 days';

        UPDATE public.vaccinations
        SET reminder_notified_at = NOW()
        WHERE pet_id = p_pet_id
          AND reminder_enabled
          AND reminder_notified_at IS NULL
          AND next_dose_at IS NOT NULL
          AND next_dose_at <= CURRENT_DATE + INTERVAL '7 days';
    END IF;

    SELECT COALESCE(jsonb_agg(item ORDER BY application_date DESC, created_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
        SELECT jsonb_build_object(
                   'id', vx.id,
                   'vaccine_name', vx.vaccine_name,
                   'manufacturer', vx.manufacturer,
                   'lot_number', vx.lot_number,
                   'application_date', vx.application_date,
                   'dose_number', vx.dose_number,
                   'observations', vx.observations,
                   'next_dose_at', vx.next_dose_at,
                   'reminder_enabled', vx.reminder_enabled,
                   'consultation_id', vx.consultation_id,
                   'veterinarian_id', vx.veterinarian_id,
                   'veterinarian_name', vet_user.full_name,
                   'created_at', vx.created_at,
                   'status', CASE
                       WHEN vx.next_dose_at IS NULL THEN 'none'
                       WHEN vx.next_dose_at < CURRENT_DATE THEN 'overdue'
                       WHEN vx.next_dose_at <= CURRENT_DATE + INTERVAL '30 days' THEN 'due_soon'
                       ELSE 'upcoming'
                   END,
                   'days_until_next', CASE WHEN vx.next_dose_at IS NULL THEN NULL
                                           ELSE (vx.next_dose_at - CURRENT_DATE) END,
                   'attachments', COALESCE((
                       SELECT jsonb_agg(jsonb_build_object(
                           'document_id', d.id, 'title', d.title,
                           'mime_type', d.mime_type, 'file_size_bytes', d.file_size_bytes))
                       FROM public.documents d
                       WHERE d.vaccination_id = vx.id
                   ), '[]'::jsonb)
               ) AS item,
               vx.application_date, vx.created_at
        FROM public.vaccinations vx
        LEFT JOIN public.veterinarians vet ON vet.id = vx.veterinarian_id
        LEFT JOIN public.users vet_user ON vet_user.id = vet.user_id
        WHERE vx.pet_id = p_pet_id
    ) sub;

    RETURN jsonb_build_object(
        'pet', jsonb_build_object('id', v_pet.id, 'name', v_pet.name, 'species', v_pet.species, 'breed', v_pet.breed),
        'can_write', public.can_access_pet_record(p_pet_id, 'write_clinical'),
        'vaccinations', v_rows
    );
END;
$$;

-- 4.4 Historico unificado: vacinas estruturadas + registros legados
--     medical_records.entry_type='vaccine' + consultas vinculadas.
CREATE OR REPLACE FUNCTION public.get_pet_vaccination_history(p_pet_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_history JSONB;
BEGIN
    IF NOT public.can_access_pet_record(p_pet_id, 'read_clinical') THEN
        RAISE EXCEPTION 'Acesso negado ao historico de vacinacao deste pet.' USING ERRCODE = '42501';
    END IF;

    PERFORM public.write_record_access_log(p_pet_id, 'read', 'vaccination_history', '{}'::jsonb);

    SELECT COALESCE(jsonb_agg(e.payload ORDER BY e.occurred_at DESC), '[]'::jsonb)
    INTO v_history
    FROM (
        SELECT vx.application_date AS occurred_at,
               jsonb_build_object(
                   'kind', 'vaccination', 'source', 'vaccinations',
                   'id', vx.id, 'title', vx.vaccine_name,
                   'application_date', vx.application_date, 'manufacturer', vx.manufacturer,
                   'lot_number', vx.lot_number, 'dose_number', vx.dose_number,
                   'observations', vx.observations, 'next_dose_at', vx.next_dose_at,
                   'veterinarian_name', vet_user.full_name
               ) AS payload
        FROM public.vaccinations vx
        LEFT JOIN public.veterinarians vet ON vet.id = vx.veterinarian_id
        LEFT JOIN public.users vet_user ON vet_user.id = vet.user_id
        WHERE vx.pet_id = p_pet_id

        UNION ALL

        SELECT mr.created_at,
               jsonb_build_object(
                   'kind', 'vaccination_legacy', 'source', 'medical_records',
                   'id', mr.id, 'title', mr.title, 'details', mr.details,
                   'occurred_at', mr.created_at,
                   'veterinarian_name', vet_user.full_name
               ) AS payload
        FROM public.medical_records mr
        LEFT JOIN public.veterinarians vet ON vet.id = mr.veterinarian_id
        LEFT JOIN public.users vet_user ON vet_user.id = vet.user_id
        WHERE mr.pet_id = p_pet_id
          AND mr.entry_type = 'vaccine'

        UNION ALL

        SELECT c.started_at,
               jsonb_build_object(
                   'kind', 'consultation', 'source', 'consultations',
                   'id', c.id, 'title', 'Consulta registrada', 'status', c.status,
                   'occurred_at', c.started_at
               ) AS payload
        FROM public.consultations c
        WHERE c.pet_id = p_pet_id
          AND EXISTS (
              SELECT 1 FROM public.vaccinations vx
              WHERE vx.pet_id = p_pet_id AND vx.consultation_id = c.id
          )
    ) e;

    RETURN jsonb_build_object('history', v_history);
END;
$$;

-- 4.5 Dados para exportacao da carteira (PDF/JPG). Registra o acesso.
CREATE OR REPLACE FUNCTION public.get_pet_vaccination_card_data(p_pet_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_pet RECORD;
    v_items JSONB;
BEGIN
    IF NOT public.can_access_pet_record(p_pet_id, 'read_clinical') THEN
        RAISE EXCEPTION 'Acesso negado a carteira de vacinacao deste pet.' USING ERRCODE = '42501';
    END IF;

    SELECT p.id, p.name, p.species::TEXT AS species, p.breed, p.birth_date
    INTO v_pet
    FROM public.pets p WHERE p.id = p_pet_id;
    IF v_pet.id IS NULL THEN RAISE EXCEPTION 'Pet nao encontrado.' USING ERRCODE = 'P0002'; END IF;

    PERFORM public.write_record_access_log(p_pet_id, 'export', 'vaccination_card', jsonb_build_object('format', 'card'));

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'vaccine_name', vx.vaccine_name, 'manufacturer', vx.manufacturer,
               'lot_number', vx.lot_number, 'application_date', vx.application_date,
               'dose_number', vx.dose_number, 'observations', vx.observations,
               'next_dose_at', vx.next_dose_at,
               'veterinarian_name', vet_user.full_name
           ) ORDER BY vx.application_date DESC), '[]'::jsonb)
    INTO v_items
    FROM public.vaccinations vx
    LEFT JOIN public.veterinarians vet ON vet.id = vx.veterinarian_id
    LEFT JOIN public.users vet_user ON vet_user.id = vet.user_id
    WHERE vx.pet_id = p_pet_id;

    RETURN jsonb_build_object(
        'pet', jsonb_build_object('id', v_pet.id, 'name', v_pet.name, 'species', v_pet.species,
                                  'breed', v_pet.breed, 'birth_date', v_pet.birth_date),
        'vaccinations', v_items,
        'generated_at', NOW()
    );
END;
$$;

-- 4.6 Autoriza upload de comprovante de vacina (chamada pela Edge Function).
CREATE OR REPLACE FUNCTION public.authorize_vaccination_document_upload(
    p_pet_id UUID,
    p_vaccination_id UUID
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
        RAISE EXCEPTION 'Acesso negado para anexar comprovante de vacina.' USING ERRCODE = '42501';
    END IF;
    IF p_vaccination_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.vaccinations vx WHERE vx.id = p_vaccination_id AND vx.pet_id = p_pet_id
    ) THEN
        RAISE EXCEPTION 'Vacina nao pertence ao pet.' USING ERRCODE = '22023';
    END IF;
    SELECT tenant_id INTO v_tenant_id FROM public.pets WHERE id = p_pet_id;
    RETURN jsonb_build_object('tenant_id', v_tenant_id, 'storage_prefix', p_pet_id::text || '/');
END;
$$;

-- 4.7 Registra o comprovante apos upload validado (metadados conferidos no banco).
CREATE OR REPLACE FUNCTION public.register_vaccination_document(
    p_pet_id UUID,
    p_vaccination_id UUID,
    p_title TEXT,
    p_storage_path TEXT,
    p_file_size_bytes BIGINT,
    p_mime_type TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant_id UUID;
    v_tutor_id UUID;
    v_document_id UUID;
BEGIN
    IF NOT (
        public.can_access_pet_record(p_pet_id, 'documents')
        OR public.can_access_pet_record(p_pet_id, 'write_clinical')
    ) THEN
        RAISE EXCEPTION 'Acesso negado para registrar comprovante de vacina.' USING ERRCODE = '42501';
    END IF;
    IF p_vaccination_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.vaccinations vx WHERE vx.id = p_vaccination_id AND vx.pet_id = p_pet_id
    ) THEN
        RAISE EXCEPTION 'Vacina nao pertence ao pet.' USING ERRCODE = '22023';
    END IF;
    IF p_file_size_bytes <= 0 OR p_file_size_bytes > 20971520
       OR p_mime_type NOT IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') THEN
        RAISE EXCEPTION 'Arquivo fora dos limites de tipo/tamanho.' USING ERRCODE = '22023';
    END IF;
    IF p_storage_path IS NULL OR p_storage_path NOT LIKE p_pet_id::TEXT || '/%' THEN
        RAISE EXCEPTION 'O caminho do arquivo deve ficar no diretorio do pet autorizado.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'clinical-documents'
          AND o.name = p_storage_path
          AND o.metadata->>'mimetype' = p_mime_type
          AND COALESCE((o.metadata->>'size')::BIGINT, p_file_size_bytes) = p_file_size_bytes
    ) THEN
        RAISE EXCEPTION 'Objeto privado nao existe ou metadados nao correspondem ao upload.' USING ERRCODE = '22023';
    END IF;

    SELECT tenant_id, tutor_id INTO v_tenant_id, v_tutor_id FROM public.pets WHERE id = p_pet_id;

    INSERT INTO public.documents (
        tenant_id, pet_id, tutor_id, vaccination_id, title, document_type,
        file_path, file_size_bytes, mime_type, uploaded_by, metadata
    ) VALUES (
        v_tenant_id, p_pet_id, v_tutor_id, p_vaccination_id,
        COALESCE(NULLIF(trim(p_title), ''), 'Comprovante de vacina'), 'vaccine_certificate',
        p_storage_path, p_file_size_bytes, p_mime_type, auth.uid(), '{}'::jsonb
    ) RETURNING id INTO v_document_id;

    PERFORM public.write_record_access_log(p_pet_id, 'write', 'vaccination_document_registered',
        jsonb_build_object('vaccination_id', p_vaccination_id, 'document_id', v_document_id));
    RETURN v_document_id;
END;
$$;

-- 4.8 Download de comprovante de vacina (autoriza e loga).
CREATE OR REPLACE FUNCTION public.get_vaccination_document_download(p_document_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_doc RECORD;
BEGIN
    SELECT d.id, d.pet_id, d.title, d.file_path AS path
    INTO v_doc
    FROM public.documents d
    WHERE d.id = p_document_id AND d.vaccination_id IS NOT NULL;
    IF v_doc.id IS NULL THEN RAISE EXCEPTION 'Comprovante nao encontrado.' USING ERRCODE = 'P0002'; END IF;
    IF NOT (
        public.can_access_pet_record(v_doc.pet_id, 'documents')
        OR public.can_access_pet_record(v_doc.pet_id, 'read_clinical')
    ) THEN
        RAISE EXCEPTION 'Acesso negado ao comprovante.' USING ERRCODE = '42501';
    END IF;
    PERFORM public.write_record_access_log(v_doc.pet_id, 'read', 'vaccination_document_download',
        jsonb_build_object('document_id', v_doc.id));
    RETURN jsonb_build_object('path', v_doc.path, 'title', v_doc.title);
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Grants (padrao do projeto: revoga PUBLIC/anon, permite authenticated)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    f RECORD;
BEGIN
    FOR f IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('create_vaccination','update_vaccination','get_pet_vaccinations',
                            'get_pet_vaccination_history','get_pet_vaccination_card_data',
                            'authorize_vaccination_document_upload','register_vaccination_document',
                            'get_vaccination_document_download')
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon;', f.sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated;', f.sig);
    END LOOP;
END $$;

COMMIT;
