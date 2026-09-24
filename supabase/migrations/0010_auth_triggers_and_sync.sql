-- ==============================================================================
-- 0010_auth_triggers_and_sync.sql
-- Fase 2: Triggers de Autenticação, Sincronização e Bloqueio de Usuários
-- ==============================================================================

-- 1. Status de conta do usuário
DO $$ BEGIN
    CREATE TYPE user_account_status AS ENUM (
        'pending_verification',
        'active',
        'suspended',
        'blocked'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Adiciona a coluna de status estruturado na tabela de users se ainda não existir
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS account_status user_account_status NOT NULL DEFAULT 'active';

-- 2. Função de Sincronização Automática: auth.users -> public.users
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    v_role public.user_role_type;
    v_full_name TEXT;
    v_phone TEXT;
    v_cpf TEXT;
    v_is_superadmin BOOLEAN;
    v_tenant_id UUID;
BEGIN
    -- Extrai metadados do cadastro passados via raw_user_meta_data
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
    v_phone := NEW.raw_user_meta_data->>'phone';
    v_cpf := NEW.raw_user_meta_data->>'cpf';
    v_role := COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role_type, 'tutor'::public.user_role_type);
    v_is_superadmin := COALESCE((NEW.raw_user_meta_data->>'is_superadmin')::boolean, FALSE);
    
    -- Inserção na tabela pública de perfis
    INSERT INTO public.users (
        id,
        email,
        full_name,
        phone,
        cpf,
        system_role,
        is_superadmin,
        is_active,
        account_status
    ) VALUES (
        NEW.id,
        NEW.email,
        v_full_name,
        v_phone,
        v_cpf,
        v_role,
        v_is_superadmin,
        TRUE,
        'active'
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        updated_at = NOW();

    -- Se um tenant_id foi fornecido no onboarding, vincula à tabela tenant_users
    IF NEW.raw_user_meta_data->>'tenant_id' IS NOT NULL THEN
        v_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::UUID;
        INSERT INTO public.tenant_users (
            tenant_id,
            user_id,
            role,
            is_active
        ) VALUES (
            v_tenant_id,
            NEW.id,
            v_role,
            TRUE
        ) ON CONFLICT (tenant_id, user_id) DO NOTHING;
    END IF;

    -- Se for Perfil TUTOR, cria automaticamente o registro na tabela tutors vinculado ao tenant
    IF v_role = 'tutor' AND v_tenant_id IS NOT NULL THEN
        INSERT INTO public.tutors (
            tenant_id,
            user_id
        ) VALUES (
            v_tenant_id,
            NEW.id
        ) ON CONFLICT (tenant_id, user_id) DO NOTHING;
    END IF;

    -- Se for Perfil VETERINÁRIO, cria automaticamente o perfil profissional
    IF v_role = 'veterinarian' THEN
        INSERT INTO public.veterinarians (
            user_id,
            bio,
            is_verified
        ) VALUES (
            NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'bio', 'Veterinário parceiro'),
            FALSE
        ) ON CONFLICT (user_id) DO NOTHING;

        IF v_tenant_id IS NOT NULL THEN
            INSERT INTO public.veterinarian_tenants (
                tenant_id,
                veterinarian_id,
                is_primary
            ) SELECT 
                v_tenant_id, 
                v.id, 
                TRUE 
              FROM public.veterinarians v 
              WHERE v.user_id = NEW.id
              ON CONFLICT (tenant_id, veterinarian_id) DO NOTHING;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger disparado no evento de criação em auth.users
-- (Nota: Condicional caso auth.users exista no ambiente Supabase)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
        DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
        CREATE TRIGGER on_auth_user_created
        AFTER INSERT ON auth.users
        FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
    END IF;
END $$;
