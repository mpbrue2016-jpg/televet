-- ==============================================================================
-- 0012_account_security_and_blocking.sql
-- Fase 2: Gestão de Contas, Bloqueio de Usuários e Trilha de Segurança
-- ==============================================================================

-- 1. Função RPC para Bloquear ou Suspender um Usuário (Apenas Admin ou Tenant Admin de sua unidade)
CREATE OR REPLACE FUNCTION public.set_user_status(
    p_target_user_id UUID,
    p_new_status public.user_account_status,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_operator_id UUID;
    v_is_platform_admin BOOLEAN;
    v_target_user_email TEXT;
BEGIN
    v_operator_id := auth.uid();
    v_is_platform_admin := public.is_admin();

    -- Validação de permissão do operador
    IF NOT v_is_platform_admin THEN
        RAISE EXCEPTION 'Acesso negado: apenas administradores podem alterar o status de contas.'
            USING ERRCODE = '42501';
    END IF;

    -- Não permitir que o operador bloqueie a si mesmo
    IF v_operator_id = p_target_user_id THEN
        RAISE EXCEPTION 'Operação inválida: um administrador não pode bloquear a própria conta.'
            USING ERRCODE = '23514';
    END IF;

    -- Atualiza o status na tabela pública
    UPDATE public.users
    SET 
        account_status = p_new_status,
        is_active = (p_new_status = 'active'),
        updated_at = NOW()
    WHERE id = p_target_user_id
    RETURNING email INTO v_target_user_email;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuário com ID % não encontrado.', p_target_user_id
            USING ERRCODE = 'P0002';
    END IF;

    -- Registrar evento em audit_logs
    INSERT INTO public.audit_logs (
        user_id,
        action,
        entity,
        entity_id,
        old_data,
        new_data
    ) VALUES (
        v_operator_id,
        'UPDATE_USER_STATUS',
        'users',
        p_target_user_id::text,
        jsonb_build_object('reason', p_reason),
        jsonb_build_object('new_status', p_new_status, 'email', v_target_user_email)
    );

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_target_user_id,
        'status', p_new_status,
        'message', format('Status do usuário atualizado para %s com sucesso.', p_new_status)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Função de Troca Segura de Senha ou Recuperação
CREATE OR REPLACE FUNCTION public.request_password_reset_audit(
    p_email VARCHAR(255)
)
RETURNS VOID AS $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT id INTO v_user_id FROM public.users WHERE email = p_email;

    IF v_user_id IS NOT NULL THEN
        INSERT INTO public.audit_logs (
            user_id,
            action,
            entity,
            entity_id,
            new_data
        ) VALUES (
            v_user_id,
            'REQUEST_PASSWORD_RESET',
            'users',
            v_user_id::text,
            jsonb_build_object('email', p_email, 'requested_at', NOW())
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
