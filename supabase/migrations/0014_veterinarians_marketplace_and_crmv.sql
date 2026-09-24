-- ==============================================================================
-- 0014_veterinarians_marketplace_and_crmv.sql
-- Fase 4: Especialidades Completas, Marketplace de Veterinários, Status CRMV e Agenda
-- ==============================================================================

-- 1. Redefinição do Enum de Status do CRMV para cobrir rigorosamente todos os estados solicitados
DO $$ BEGIN
    -- Cria novo tipo temporário se necessário para migrar
    CREATE TYPE crm_validation_status_type AS ENUM (
        'pending',              -- Pendente
        'in_validation',        -- Em validação
        'validated',            -- Validado
        'needs_revalidation',   -- Necessita revalidação
        'not_validated',        -- Não validado
        'inactive',             -- Inativo
        'suspended',            -- Suspenso
        'irregular'             -- Irregular
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Atualização e Inserção das 14 Especialidades Solicitadas
INSERT INTO public.specialties (name, description, icon_name, is_active) VALUES
('Clínica geral', 'Atendimento primário, triagem, vacinação e avaliação geral de saúde.', 'stethoscope', true),
('Dermatologia', 'Doenças de pele, alergias, infecções cutâneas, queda de pelos e otites.', 'sparkles', true),
('Cardiologia', 'Avaliação do coração, sopros, pressão arterial e exames ecocardiográficos.', 'heart', true),
('Ortopedia', 'Fraturas, problemas articulares, coluna e mobilidade musculoesquelética.', 'bone', true),
('Oftalmologia', 'Doenças dos olhos, visão, conjuntivite, catarata e úlceras de córnea.', 'eye', true),
('Neurologia', 'Convulsões, paralisias, alterações de comportamento motor e sistema nervoso.', 'brain', true),
('Oncologia', 'Diagnóstico e tratamento de neoplasias, tumores e suporte quimioterápico.', 'activity', true),
('Endocrinologia', 'Diabetes, síndrome de Cushing, tireoide e distúrbios hormonais.', 'droplet', true),
('Nutrição', 'Dietas balanceadas, rações terapêuticas, emagrecimento e alimentação natural.', 'apple', true),
('Felinos', 'Medicina especializada exclusiva para gatos (ambiente e condutas Cat Friendly).', 'cat', true),
('Animais exóticos', 'Aves, répteis, pequenos roedores, coelhos e animais silvestres.', 'feather', true),
('Odontologia', 'Profilaxia dentária, cálculo dentário, extrações e saúde oral.', 'smile', true),
('Comportamento', 'Ansiedade de separação, agressividade, medos, fobias e adestramento clínico.', 'help-circle', true),
('Outras', 'Especialidades complementares ou multidisciplinares sob consulta.', 'more-horizontal', true)
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    icon_name = EXCLUDED.icon_name,
    is_active = TRUE;

-- 3. Expansão da Tabela de Veterinários
ALTER TABLE public.veterinarians
ADD COLUMN IF NOT EXISTS city VARCHAR(128),
ADD COLUMN IF NOT EXISTS state_uf VARCHAR(2),
ADD COLUMN IF NOT EXISTS education TEXT,
ADD COLUMN IF NOT EXISTS experience_years INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS photo_url TEXT,
ADD COLUMN IF NOT EXISTS consultation_duration_minutes INTEGER NOT NULL DEFAULT 45,
ADD COLUMN IF NOT EXISTS supported_modalities JSONB NOT NULL DEFAULT '["teleconsultation"]'::jsonb,
ADD COLUMN IF NOT EXISTS documents JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS bank_account_info JSONB NOT NULL DEFAULT '{
    "pix_key": null,
    "pix_key_type": null,
    "bank_name": null,
    "agency": null,
    "account_number": null,
    "holder_name": null,
    "holder_document": null
}'::jsonb;

-- 4. Ajuste da Tabela de Registros Profissionais (professional_registrations)
ALTER TABLE public.professional_registrations
ADD COLUMN IF NOT EXISTS crmv_status crm_validation_status_type NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS revalidation_deadline DATE,
ADD COLUMN IF NOT EXISTS validation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Sincroniza coluna antiga se aplicável
UPDATE public.professional_registrations
SET crmv_status = 'validated'
WHERE status = 'active_regular';

-- 5. TABELA: veterinarian_schedules (Grade Semanal de Disponibilidade e Horários)
CREATE TABLE IF NOT EXISTS public.veterinarian_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    veterinarian_id UUID NOT NULL REFERENCES public.veterinarians(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL, -- 0 = Domingo, 1 = Segunda ... 6 = Sábado
    start_time TIME NOT NULL,      -- ex: '09:00:00'
    end_time TIME NOT NULL,        -- ex: '18:00:00'
    slot_duration_minutes INTEGER NOT NULL DEFAULT 45,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_schedule_time CHECK (start_time < end_time),
    CONSTRAINT chk_day_of_week CHECK (day_of_week BETWEEN 0 AND 6)
);

CREATE INDEX IF NOT EXISTS idx_vet_schedules_vet_id ON public.veterinarian_schedules(veterinarian_id);

-- RLS para horários
ALTER TABLE public.veterinarian_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY policy_vet_schedules_select ON public.veterinarian_schedules
FOR SELECT USING (true); -- tutores podem ver disponibilidade

CREATE POLICY policy_vet_schedules_manage ON public.veterinarian_schedules
FOR ALL USING (
    public.is_admin() OR 
    veterinarian_id IN (SELECT id FROM public.veterinarians WHERE user_id = auth.uid())
);

-- 6. Função RPC de Busca Pública no Marketplace com Filtros e Validação Estrita de CRMV
-- REGRA DE OURO: Somente profissionais com CRMV 'validated' e perfil ativo aparecem para os tutores!
CREATE OR REPLACE FUNCTION public.search_marketplace_veterinarians(
    p_specialty_id UUID DEFAULT NULL,
    p_state_uf VARCHAR(2) DEFAULT NULL,
    p_max_price_cents INTEGER DEFAULT NULL,
    p_modality TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    veterinarian_id UUID,
    full_name VARCHAR(255),
    email VARCHAR(255),
    avatar_url TEXT,
    bio TEXT,
    city VARCHAR(128),
    state_uf VARCHAR(2),
    education TEXT,
    experience_years INTEGER,
    consultation_fee_cents INTEGER,
    consultation_duration_minutes INTEGER,
    supported_modalities JSONB,
    rating_average NUMERIC(3, 2),
    total_reviews INTEGER,
    crmv_number VARCHAR(32),
    crmv_uf VARCHAR(2),
    crmv_status crm_validation_status_type,
    specialties JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        v.id AS veterinarian_id,
        u.full_name,
        u.email,
        COALESCE(v.photo_url, u.avatar_url) AS avatar_url,
        v.bio,
        v.city,
        v.state_uf,
        v.education,
        v.experience_years,
        v.consultation_fee_cents,
        v.consultation_duration_minutes,
        v.supported_modalities,
        v.rating_average,
        v.total_reviews,
        pr.crmv_number,
        pr.state_uf AS crmv_uf,
        pr.crmv_status,
        (
            SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'icon', s.icon_name))
            FROM public.veterinarian_specialties vs
            JOIN public.specialties s ON s.id = vs.specialty_id
            WHERE vs.veterinarian_id = v.id AND s.is_active = TRUE
        ) AS specialties
    FROM public.veterinarians v
    JOIN public.users u ON u.id = v.user_id
    JOIN public.professional_registrations pr ON pr.veterinarian_id = v.id
    WHERE v.is_active = TRUE
      AND u.is_active = TRUE
      AND u.account_status = 'active'
      -- CRITÉRIO RIGOROSO: Apenas profissionais com CRMV validado!
      AND pr.crmv_status = 'validated'
      -- Filtros opcionais
      AND (p_specialty_id IS NULL OR EXISTS (
          SELECT 1 FROM public.veterinarian_specialties vs2 
          WHERE vs2.veterinarian_id = v.id AND vs2.specialty_id = p_specialty_id
      ))
      AND (p_state_uf IS NULL OR pr.state_uf = p_state_uf OR v.state_uf = p_state_uf)
      AND (p_max_price_cents IS NULL OR v.consultation_fee_cents <= p_max_price_cents)
      AND (p_modality IS NULL OR v.supported_modalities ? p_modality)
    ORDER BY v.rating_average DESC, v.consultation_fee_cents ASC
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
