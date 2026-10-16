-- ==============================================================================
-- 0025_veterinarians_marketplace_crmv.sql
-- Fase 5: Marketplace de Vets, Onboarding e Validação (Busca textual)
-- ==============================================================================

BEGIN;

-- Extensões para busca textual avançada
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Tipo de status do perfil no marketplace
DO $$ BEGIN
    CREATE TYPE vet_onboarding_status AS ENUM (
        'draft',
        'under_review',
        'verified',
        'rejected',
        'suspended'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Expandindo o perfil do veterinário
ALTER TABLE public.veterinarians
ADD COLUMN IF NOT EXISTS onboarding_status vet_onboarding_status NOT NULL DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS languages TEXT[] DEFAULT ARRAY['pt-BR'],
ADD COLUMN IF NOT EXISTS consultation_duration_minutes INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS photo_url TEXT,
ADD COLUMN IF NOT EXISTS is_telemedicine_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS is_in_person_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS search_vector tsvector; -- Vetor pré-computado para busca rápida

-- Expandindo registros profissionais
ALTER TABLE public.professional_registrations
ADD COLUMN IF NOT EXISTS needs_revalidation_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS next_check_job_id UUID;

-- Bucket para documentos (Diploma, CNH, CRMV) do Veterinário
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('vet-documents', 'vet-documents', false, 10485760, '{"application/pdf","image/jpeg","image/png","image/webp"}')
ON CONFLICT (id) DO NOTHING;

-- Tabela de Documentos enviados pelo veterinário para análise
CREATE TABLE IF NOT EXISTS public.vet_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    veterinarian_id UUID NOT NULL REFERENCES public.veterinarians(id) ON DELETE CASCADE,
    document_type VARCHAR(64) NOT NULL, -- 'crmv_card', 'diploma', 'id_document', 'other'
    storage_path TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_at TIMESTAMPTZ,
    status VARCHAR(32) DEFAULT 'pending' -- 'pending', 'approved', 'rejected'
);

CREATE INDEX IF NOT EXISTS idx_vet_docs_vet_id ON public.vet_documents(veterinarian_id);

-- Fila de Revisão Manual (View administrativa)
CREATE OR REPLACE VIEW public.crmv_review_queue AS
SELECT 
    pr.id AS registration_id,
    v.id AS veterinarian_id,
    u.email,
    u.full_name AS vet_name,
    pr.crmv_number,
    pr.state_uf,
    v.onboarding_status,
    pr.status AS crm_status,
    pr.created_at AS submitted_at,
    pr.needs_revalidation_at
FROM public.professional_registrations pr
JOIN public.veterinarians v ON v.id = pr.veterinarian_id
JOIN public.users u ON u.id = v.user_id
WHERE v.onboarding_status = 'under_review' OR pr.status = 'pending_verification';

-- Função para atualizar vetor de busca do veterinário automaticamente
CREATE OR REPLACE FUNCTION public.update_vet_search_vector()
RETURNS TRIGGER AS $$
DECLARE
    vet_user_name TEXT;
    specs TEXT;
BEGIN
    -- Pegar nome do usuario
    SELECT full_name INTO vet_user_name FROM public.users WHERE id = NEW.user_id;
    
    -- Pegar especialidades
    SELECT string_agg(s.name, ' ') INTO specs 
    FROM public.veterinarian_specialties vs
    JOIN public.specialties s ON s.id = vs.specialty_id
    WHERE vs.veterinarian_id = NEW.id;

    NEW.search_vector := 
        setweight(to_tsvector('portuguese', unaccent(coalesce(vet_user_name, ''))), 'A') ||
        setweight(to_tsvector('portuguese', unaccent(coalesce(specs, ''))), 'B') ||
        setweight(to_tsvector('portuguese', unaccent(coalesce(NEW.bio, ''))), 'C');
        
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_vet_search_vector
BEFORE INSERT OR UPDATE OF bio ON public.veterinarians
FOR EACH ROW EXECUTE FUNCTION public.update_vet_search_vector();

-- Índice GIN para a busca textual rápida no marketplace
CREATE INDEX IF NOT EXISTS idx_vets_search_vector ON public.veterinarians USING GIN (search_vector);

-- RLS e Segurança
ALTER TABLE public.vet_documents ENABLE ROW LEVEL SECURITY;

-- Veterinário vê apenas seus próprios documentos
CREATE POLICY "Vet ve proprios documentos" ON public.vet_documents
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.veterinarians v 
            WHERE v.id = vet_documents.veterinarian_id AND v.user_id = auth.uid()
        )
    );

-- Públicos só leem veterinários 'verified' (Marketplace / Catálogo)
CREATE POLICY "Publico le vets verificados" ON public.veterinarians
    FOR SELECT TO authenticated
    USING (onboarding_status = 'verified' AND is_active = true);

-- Veterinário edita apenas o próprio perfil
CREATE POLICY "Vet edita proprio perfil" ON public.veterinarians
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

COMMIT;
