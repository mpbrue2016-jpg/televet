-- 0023_legal_consents_and_onboarding.sql

BEGIN;

-- Tabela para gerenciar termos legais (Termos de Uso, Privacidade, etc)
CREATE TABLE IF NOT EXISTS public.legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type text NOT NULL CHECK (document_type IN ('terms_of_use', 'privacy_policy', 'telemedicine_consent', 'recording_consent')),
  version varchar(50) NOT NULL,
  content text NOT NULL,
  is_active boolean DEFAULT false,
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  -- Garantir apenas uma versão ativa por tipo
  CONSTRAINT unique_active_document UNIQUE (document_type, is_active) DEFERRABLE INITIALLY DEFERRED
);

-- Tabela de consentimentos dos usuários
CREATE TABLE IF NOT EXISTS public.user_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.legal_documents(id) ON DELETE RESTRICT,
  accepted_at timestamptz DEFAULT now(),
  ip_address inet,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb,
  UNIQUE(user_id, document_id)
);

-- Habilitar RLS
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Qualquer um pode ver os documentos ativos
CREATE POLICY "Documentos legais ativos sao publicos" ON public.legal_documents
  FOR SELECT USING (is_active = true);

-- Apenas admins podem gerenciar documentos
CREATE POLICY "Admins gerenciam documentos legais" ON public.legal_documents
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'superadmin'));

-- Usuário pode ver apenas seus próprios consentimentos
CREATE POLICY "Usuarios veem seus proprios consentimentos" ON public.user_consents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Escrita restrita a RPC para garantir integridade do IP e User Agent (se necessário na aplicação)
-- Ou inserção permitida caso user_id seja o próprio uid:
CREATE POLICY "Usuarios podem registrar seu proprio consentimento" ON public.user_consents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

COMMIT;
