-- ==============================================================================
-- 0011_rbac_functions_and_policies.sql
-- Fase 2: Funções RBAC Refinadas e Proteção Estrita contra Acessos Indevidos
-- ==============================================================================

-- Funções utilitárias de verificação de permissões do usuário autenticado

-- 1. Verifica se usuário autenticado é Administrador Geral
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() 
          AND (is_superadmin = TRUE OR system_role = 'superadmin')
          AND is_active = TRUE
          AND account_status = 'active'
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. Verifica se usuário é Gestor do Pet Shop (Tenant Admin)
CREATE OR REPLACE FUNCTION public.is_tenant_admin(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    IF public.is_admin() THEN
        RETURN TRUE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.tenant_users tu
        JOIN public.users u ON u.id = tu.user_id
        WHERE tu.tenant_id = p_tenant_id
          AND tu.user_id = auth.uid()
          AND tu.role = 'tenant_admin'
          AND tu.is_active = TRUE
          AND u.is_active = TRUE
          AND u.account_status = 'active'
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 3. Verifica se usuário é Veterinário Ativo
CREATE OR REPLACE FUNCTION public.is_active_veterinarian()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.veterinarians v
        JOIN public.users u ON u.id = v.user_id
        WHERE v.user_id = auth.uid()
          AND v.is_active = TRUE
          AND u.is_active = TRUE
          AND u.account_status = 'active'
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 4. Verifica se usuário é Tutor Ativo
CREATE OR REPLACE FUNCTION public.is_active_tutor()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.is_active = TRUE
          AND u.account_status = 'active'
          AND u.system_role = 'tutor'
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ==============================================================================
-- REFINAMENTO DE POLÍTICAS RLS ESPECÍFICAS DE SIGILO MÉDICO E ISOLAMENTO
-- Regra estrita: Pet Shop NÃO PODE ler prontuários médicos e nem dados de outros Pet Shops
-- ==============================================================================

-- Remover política anterior e aplicar nova com regras estritas de sigilo médico
DROP POLICY IF EXISTS policy_medical_records_isolation ON public.medical_records;

CREATE POLICY policy_medical_records_rbac ON public.medical_records
FOR ALL USING (
    -- 1. Administrador geral da plataforma (para fins de auditoria/suporte)
    public.is_admin() OR
    (
        tenant_id = public.current_tenant_id() AND (
            -- 2. Veterinário responsável pela consulta
            veterinarian_id IN (SELECT id FROM public.veterinarians WHERE user_id = auth.uid()) OR
            -- 3. Tutor dono do pet (somente leitura é garantida por regra de negócio)
            pet_id IN (
                SELECT p.id FROM public.pets p
                JOIN public.tutors t ON t.id = p.tutor_id
                WHERE t.user_id = auth.uid()
            )
            -- ATENÇÃO: Gestor de Pet Shop (tenant_admin) NÃO É INCLUÍDO AQUI (Garantia de sigilo médico)
        )
    )
) WITH CHECK (
    public.is_admin() OR (
        tenant_id = public.current_tenant_id() AND
        veterinarian_id IN (SELECT id FROM public.veterinarians WHERE user_id = auth.uid())
    )
);

-- Prontuários: Prescrições Médicas (Sigilo e segurança)
DROP POLICY IF EXISTS policy_prescriptions_isolation ON public.prescriptions;

CREATE POLICY policy_prescriptions_rbac ON public.prescriptions
FOR ALL USING (
    public.is_admin() OR
    (
        tenant_id = public.current_tenant_id() AND (
            veterinarian_id IN (SELECT id FROM public.veterinarians WHERE user_id = auth.uid()) OR
            tutor_id IN (SELECT id FROM public.tutors WHERE user_id = auth.uid())
            -- Gestores de Pet Shop não podem ver prescrições detalhadas
        )
    )
) WITH CHECK (
    public.is_admin() OR (
        tenant_id = public.current_tenant_id() AND
        veterinarian_id IN (SELECT id FROM public.veterinarians WHERE user_id = auth.uid())
    )
);

-- Carteiras e Saldo Financeiro: Isolamento por tipo de titular
DROP POLICY IF EXISTS policy_wallets_isolation ON public.wallets;

CREATE POLICY policy_wallets_rbac ON public.wallets
FOR ALL USING (
    public.is_admin() OR (
        tenant_id = public.current_tenant_id() AND (
            -- Pet shop só vê sua própria carteira
            (owner_type = 'petshop' AND public.is_tenant_admin(tenant_id)) OR
            -- Veterinário só vê sua própria carteira
            (owner_type = 'veterinarian' AND owner_id IN (SELECT id FROM public.veterinarians WHERE user_id = auth.uid()))
        )
    )
) WITH CHECK (
    public.is_admin()
);
