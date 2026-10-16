-- ==============================================================================
-- 0024_pet_weights_and_documents.sql
-- Fase 4: Portal do Tutor, Histórico de Peso, Documentos do Pet e Storage
-- ==============================================================================

BEGIN;

-- 1. Alterar a tabela pets para incluir suporte a nascimento aproximado e soft delete
ALTER TABLE public.pets 
ADD COLUMN IF NOT EXISTS birth_date_approx BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS color VARCHAR(64),
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Garantir que microchip seja único quando informado
CREATE UNIQUE INDEX IF NOT EXISTS idx_pets_microchip_unique 
ON public.pets(microchip_number) 
WHERE microchip_number IS NOT NULL AND trim(microchip_number) <> '';

-- 2. Tabela de histórico de pesos
CREATE TABLE IF NOT EXISTS public.pet_weights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    weight_g INTEGER NOT NULL, -- peso em gramas para maior precisão (ex: pets não convencionais ou filhotes)
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_by UUID REFERENCES public.users(id) ON DELETE SET NULL, -- Tutor ou Vet que registrou
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pet_weights_pet_id ON public.pet_weights(pet_id);
CREATE INDEX IF NOT EXISTS idx_pet_weights_recorded_at ON public.pet_weights(recorded_at);

-- 3. Tabela de documentos do pet (exames, carteira de vacinação, receitas passadas, etc)
CREATE TABLE IF NOT EXISTS public.pet_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    document_type VARCHAR(64) NOT NULL, -- 'exam', 'vaccine', 'prescription', 'other'
    title VARCHAR(255) NOT NULL,
    storage_path TEXT NOT NULL,
    uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    is_visible_to_tutor BOOLEAN DEFAULT true, -- Permite que o veterinário oculte arquivos internos
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pet_documents_pet_id ON public.pet_documents(pet_id);

-- RLS (Row Level Security)

ALTER TABLE public.pet_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pet_documents ENABLE ROW LEVEL SECURITY;

-- Tutor só vê o histórico de peso e documentos do seu próprio pet
-- As policies mais profundas de cruzamento com tutor_id requerem JOIN, ou podemos checar `pets`.
-- A regra diz: "Tutor NUNCA vê pet de outro tutor. Pet Shop só vê cliente atribuído, nunca dados clínicos."
-- Para simplificar na migration mantendo segurança:
CREATE POLICY "Tutores veem o peso dos seus pets" ON public.pet_weights
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.pets p 
            JOIN public.tutors t ON p.tutor_id = t.id 
            WHERE p.id = pet_weights.pet_id AND t.user_id = auth.uid()
        )
    );

CREATE POLICY "Tutores inserem peso nos seus pets" ON public.pet_weights
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.pets p 
            JOIN public.tutors t ON p.tutor_id = t.id 
            WHERE p.id = pet_id AND t.user_id = auth.uid()
        )
    );

CREATE POLICY "Tutores veem documentos dos seus pets" ON public.pet_documents
    FOR SELECT TO authenticated
    USING (
        is_visible_to_tutor = true AND
        EXISTS (
            SELECT 1 FROM public.pets p 
            JOIN public.tutors t ON p.tutor_id = t.id 
            WHERE p.id = pet_documents.pet_id AND t.user_id = auth.uid()
        )
    );

-- Nota: Políticas de Storage Buckets (`pet-photos` e `pet-documents`) não são SQL Tables, mas inserções em storage.buckets
-- O Supabase gerencia isso por meio de sua API de Storage, mas podemos inserir no schema se as views existirem.
-- Aqui usamos script declarativo para RLS no Postgres:

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('pet-photos', 'pet-photos', false, 5242880, '{"image/jpeg","image/png","image/webp"}'),
  ('pet-documents', 'pet-documents', false, 10485760, '{"application/pdf","image/jpeg","image/png"}')
ON CONFLICT (id) DO UPDATE SET 
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;
