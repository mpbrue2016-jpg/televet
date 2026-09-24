-- ==============================================================================
-- rbac_and_profiles_test.sql
-- Suíte de Testes Automatizados de Perfis, RBAC e Tentativas de Acesso Indevido
-- ==============================================================================

BEGIN;

CREATE TEMPORARY TABLE rbac_test_results (
    test_id TEXT PRIMARY KEY,
    description TEXT,
    passed BOOLEAN,
    details TEXT
);

-- ==============================================================================
-- TESTE 1: PERFIL PET SHOP (Tenant Admin)
-- ID: a2222222-2222-2222-2222-222222222222 (Carlos Gestor - Tenant A)
-- ==============================================================================
SET LOCAL "request.jwt.claim.sub" = 'a2222222-2222-2222-2222-222222222222';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "app.current_tenant_id" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- 1.1 Pet Shop acessa dados da sua própria loja
DO $$
DECLARE
    v_petshop_count INTEGER;
BEGIN
    SELECT count(*) INTO v_petshop_count 
    FROM public.petshops 
    WHERE tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    IF v_petshop_count = 1 THEN
        INSERT INTO rbac_test_results VALUES ('1.1', 'Pet Shop consulta seus próprios dados', true, 'Pet shop acessou com sucesso a loja do Tenant A.');
    ELSE
        INSERT INTO rbac_test_results VALUES ('1.1', 'Pet Shop consulta seus próprios dados', false, 'Não foi possível ler dados do próprio pet shop.');
    END IF;
END $$;

-- 1.2 VIOLAÇÃO: Pet Shop tenta acessar prontuários médicos (SIGILO CLÍNICO DEVE BARRAR)
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Cria um prontuário de teste
    INSERT INTO public.medical_records (
        id, tenant_id, pet_id, veterinarian_id, title, details
    ) VALUES (
        'm1111111-1111-1111-1111-111111111111',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'a5555555-5555-5555-5555-555555555555',
        'c2222222-2222-2222-2222-222222222222',
        'Consulta Dermatológica Sigilosa',
        'Prescrição de antibiótico e histórico privado.'
    );

    -- Tenta fazer SELECT no prontuário logado como Gestor do Pet Shop
    SELECT count(*) INTO v_count FROM public.medical_records WHERE id = 'm1111111-1111-1111-1111-111111111111';

    -- Como o Pet Shop NÃO é o veterinário e nem o tutor, RLS deve retornar 0
    IF v_count = 0 THEN
        INSERT INTO rbac_test_results VALUES ('1.2', 'Bloqueio estrito de prontuário para Pet Shop', true, 'Segurança garantida! Pet Shop não tem visibilidade sobre prontuários médicos.');
    ELSE
        INSERT INTO rbac_test_results VALUES ('1.2', 'Bloqueio estrito de prontuário para Pet Shop', false, 'Falha grave! Pet Shop conseguiu ler prontuário clínico.');
    END IF;
END $$;

-- 1.3 VIOLAÇÃO: Pet Shop tenta acessar dados financeiros do Pet Shop B
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT count(*) INTO v_count 
    FROM public.petshops 
    WHERE tenant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    IF v_count = 0 THEN
        INSERT INTO rbac_test_results VALUES ('1.3', 'Bloqueio de acesso cruzado a outro Pet Shop', true, 'Pet Shop A bloqueado de ler dados do Pet Shop B.');
    ELSE
        INSERT INTO rbac_test_results VALUES ('1.3', 'Bloqueio de acesso cruzado a outro Pet Shop', false, 'Vazamento entre Pet Shops concorrentes detectado!');
    END IF;
END $$;

-- ==============================================================================
-- TESTE 2: PERFIL VETERINÁRIO
-- ID: c1111111-1111-1111-1111-111111111111 (Dra. Camila)
-- ==============================================================================
SET LOCAL "request.jwt.claim.sub" = 'c1111111-1111-1111-1111-111111111111';
SET LOCAL "app.current_tenant_id" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- 2.1 Veterinário tem permissão legítima para ler e criar prontuários
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT count(*) INTO v_count 
    FROM public.medical_records 
    WHERE id = 'm1111111-1111-1111-1111-111111111111';

    IF v_count = 1 THEN
        INSERT INTO rbac_test_results VALUES ('2.1', 'Veterinário acessa prontuário sob seus cuidados', true, 'Veterinária leu com sucesso o prontuário que ela atendeu.');
    ELSE
        INSERT INTO rbac_test_results VALUES ('2.1', 'Veterinário acessa prontuário sob seus cuidados', false, 'Veterinário legítimo foi indevidamente bloqueado.');
    END IF;
END $$;

-- ==============================================================================
-- TESTE 3: PERFIL TUTOR
-- ID: a3333333-3333-3333-3333-333333333333 (Ana Silva)
-- ==============================================================================
SET LOCAL "request.jwt.claim.sub" = 'a3333333-3333-3333-3333-333333333333';
SET LOCAL "app.current_tenant_id" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- 3.1 Tutor lê o prontuário do seu próprio Pet (Thor)
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT count(*) INTO v_count 
    FROM public.medical_records 
    WHERE pet_id = 'a5555555-5555-5555-5555-555555555555';

    IF v_count = 1 THEN
        INSERT INTO rbac_test_results VALUES ('3.1', 'Tutor lê prontuário do seu pet legítimo', true, 'Tutor visualizou os cuidados de seu próprio animal.');
    ELSE
        INSERT INTO rbac_test_results VALUES ('3.1', 'Tutor lê prontuário do seu pet legítimo', false, 'Tutor não conseguiu acessar prontuário do seu pet.');
    END IF;
END $$;

-- 3.2 VIOLAÇÃO: Tutor tenta alterar prontuário médico (Apenas Veterinário tem permissão de escrita)
DO $$
DECLARE
    v_affected INTEGER;
BEGIN
    UPDATE public.medical_records 
    SET details = 'Texto forjado pelo tutor' 
    WHERE id = 'm1111111-1111-1111-1111-111111111111';
    
    GET DIAGNOSTICS v_affected = ROW_COUNT;

    IF v_affected = 0 THEN
        INSERT INTO rbac_test_results VALUES ('3.2', 'Bloqueio de escrita de prontuário por Tutor', true, 'Zero linhas alteradas! Tutor bloqueado de alterar prontuário.');
    ELSE
        INSERT INTO rbac_test_results VALUES ('3.2', 'Bloqueio de escrita de prontuário por Tutor', false, 'Falha grave! Tutor conseguiu alterar prontuário médico.');
    END IF;
END $$;

-- ==============================================================================
-- TESTE 4: BLOQUEIO DE CONTA (Status 'blocked')
-- ==============================================================================
SET LOCAL "request.jwt.claim.sub" = '99999999-9999-9999-9999-999999999999'; -- Superadmin bloqueando usuário

-- Bloqueia o tutor Bruno do Tenant B
SELECT public.set_user_status('b3333333-3333-3333-3333-333333333333', 'blocked', 'Fraude cadastral em cartão');

-- Simula Bruno tentando operar com conta bloqueada
SET LOCAL "request.jwt.claim.sub" = 'b3333333-3333-3333-3333-333333333333';
SET LOCAL "app.current_tenant_id" = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

DO $$
DECLARE
    v_is_active_tutor BOOLEAN;
BEGIN
    v_is_active_tutor := public.is_active_tutor();

    IF NOT v_is_active_tutor THEN
        INSERT INTO rbac_test_results VALUES ('4.1', 'Bloqueio de sessão para usuário suspenso/bloqueado', true, 'Usuário com conta bloqueada é rejeitado nas checagens ativas.');
    ELSE
        INSERT INTO rbac_test_results VALUES ('4.1', 'Bloqueio de sessão para usuário suspenso/bloqueado', false, 'Usuário bloqueado continuou com acesso ativo!');
    END IF;
END $$;

-- Exibe os resultados consolidados
SELECT 
    test_id AS "ID",
    description AS "Cenário de Teste RBAC",
    CASE WHEN passed THEN '✅ APROVADO' ELSE '❌ FALHOU' END AS "Resultado",
    details AS "Evidência / Detalhes"
FROM rbac_test_results
ORDER BY test_id;

ROLLBACK;
