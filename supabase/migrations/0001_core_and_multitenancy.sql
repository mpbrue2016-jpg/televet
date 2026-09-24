-- ==============================================================================
-- 0001_core_and_multitenancy.sql
-- Fase 1: Arquitetura Base, Multi-Tenancy e RBAC
-- ==============================================================================

-- Habilitação de extensões essenciais
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums fundamentais
DO $$ BEGIN
    CREATE TYPE user_role_type AS ENUM (
        'superadmin',
        'tenant_admin',
        'veterinarian',
        'receptionist',
        'tutor'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE tenant_status_type AS ENUM (
        'pending',
        'active',
        'suspended',
        'archived'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 1. TABELA: tenants (Cada Pet Shop ou Clínica parceira é um Tenant com suporte a White-Label)
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255),
    tax_id_cnpj VARCHAR(18) UNIQUE,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(32),
    status tenant_status_type NOT NULL DEFAULT 'active',
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    white_label_config JSONB NOT NULL DEFAULT '{
        "primary_color": "#0ea5e9",
        "secondary_color": "#0284c7",
        "logo_url": null,
        "favicon_url": null,
        "custom_domain": null,
        "brand_name": null
    }'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. TABELA: users (Perfil público vinculado a auth.users do Supabase)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY, -- references auth.users(id)
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(32),
    cpf VARCHAR(14) UNIQUE,
    avatar_url TEXT,
    system_role user_role_type NOT NULL DEFAULT 'tutor',
    is_superadmin BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. TABELA: tenant_users (Vínculo de Usuários com Tenants + Papéis contextuais)
CREATE TABLE IF NOT EXISTS public.tenant_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role user_role_type NOT NULL DEFAULT 'tutor',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_tenant_user UNIQUE(tenant_id, user_id)
);

-- Índices essenciais
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON public.tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id ON public.tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_cpf ON public.users(cpf);

-- Funções utilitárias de Contexto e Segurança (RLS Helpers)
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID AS $$
BEGIN
    -- Permite definir via claims JWT ou via variável de sessão para testes/API
    RETURN NULLIF(
        COALESCE(
            current_setting('request.jwt.claim.tenant_id', true),
            current_setting('app.current_tenant_id', true)
        ),
        ''
    )::UUID;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND is_superadmin = TRUE
    );
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.has_tenant_role(p_tenant_id UUID, p_roles user_role_type[])
RETURNS BOOLEAN AS $$
BEGIN
    IF public.is_superadmin() THEN
        RETURN TRUE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.tenant_users
        WHERE tenant_id = p_tenant_id
          AND user_id = auth.uid()
          AND role = ANY(p_roles)
          AND is_active = TRUE
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_tenants_updated_at
BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE OR REPLACE TRIGGER trg_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE OR REPLACE TRIGGER trg_tenant_users_updated_at
BEFORE UPDATE ON public.tenant_users
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
