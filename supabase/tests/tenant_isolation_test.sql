-- ==============================================================================
-- tenant_isolation_test.sql
-- Testes Automatizados de Isolamento Multi-Tenant e RLS (Row Level Security)
-- ==============================================================================

BEGIN;

-- Criar schema temporário de teste
CREATE TEMPORARY TABLE test_results (
    test_name TEXT,
    passed BOOLEAN,
    details TEXT
);

-- ==============================================================================
-- CENÁRIO 1: Contexto no Tenant A ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
-- Um usuário/sessão autenticado no Pet Shop Amigo Fiel NÃO PODE ver dados do Pet Mania (Tenant B)
-- ==============================================================================

-- Definir contexto ativo para Tenant A
SET LOCAL "request.jwt.claim.sub" = 'a3333333-3333-3333-3333-333333333333'; -- Tutor Ana (Tenant A)
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "app.current_tenant_id" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Teste 1.1: Tutor A enxerga apenas seu pet (Thor) e não enxerga o pet do Tenant B (Luna)
DO $$
DECLARE
    v_count_all INTEGER;
    v_count_tenant_b INTEGER;
BEGIN
    SELECT count(*) INTO v_count_all FROM public.pets;
    SELECT count(*) INTO v_count_tenant_b FROM public.pets WHERE name = 'Luna (Tenant B)';

    IF v_count_tenant_b = 0 AND v_count_all = 1 THEN
        INSERT INTO test_results VALUES ('1.1 - Leitura restrita ao Tenant A (Pets)', true, 'Apenas 1 pet do próprio tenant retornado. Luna (Tenant B) ficou invisível.');
    ELSE
        INSERT INTO test_results VALUES ('1.1 - Leitura restrita ao Tenant A (Pets)', false, format('Vazamento detectado! Total: %s, Pets do Tenant B visíveis: %s', v_count_all, v_count_tenant_b));
    END IF;
END $$;

-- Teste 1.2: Tutor A tenta atualizar registro de outro Tenant (deve ser bloqueado pelo RLS)
DO $$
DECLARE
    v_affected INTEGER;
BEGIN
    UPDATE public.pets SET name = 'Hacked Luna' WHERE id = 'b5555555-5555-5555-5555-555555555555';
    GET DIAGNOSTICS v_affected = ROW_COUNT;

    IF v_affected = 0 THEN
        INSERT INTO test_results VALUES ('1.2 - Bloqueio de UPDATE cruzado entre tenants', true, 'Zero linhas afetadas ao tentar alterar pet de outro tenant.');
    ELSE
        INSERT INTO test_results VALUES ('1.2 - Bloqueio de UPDATE cruzado entre tenants', false, format('Falha de segurança! %s linha(s) de outro tenant foram alteradas.', v_affected));
    END IF;
END $$;

-- Teste 1.3: Tentativa de inserção com tenant_id conflitante (Tentando injetar dado no Tenant B enquanto opera no Tenant A)
DO $$
BEGIN
    INSERT INTO public.pets (
        tenant_id, tutor_id, name, species, breed
    ) VALUES (
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', -- Tenant B
        'a4444444-4444-4444-4444-444444444444',
        'Invasor Malicioso',
        'canine',
        'Vira-lata'
    );
    -- Se passar aqui, o RLS falhou
    INSERT INTO test_results VALUES ('1.3 - Bloqueio de INSERT forjando outro tenant_id', false, 'RLS WITH CHECK falhou ao permitir inserção em outro tenant!');
EXCEPTION WHEN OTHERS THEN
    INSERT INTO test_results VALUES ('1.3 - Bloqueio de INSERT forjando outro tenant_id', true, 'Bloqueio bem-sucedido! Violação de RLS WITH CHECK interceptada.');
END $$;

-- ==============================================================================
-- CENÁRIO 2: Contexto no Tenant B ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
-- Usuário do Pet Mania Store (Tenant B) tenta consultar e alterar dados do Tenant A
-- ==============================================================================

SET LOCAL "request.jwt.claim.sub" = 'b3333333-3333-3333-3333-333333333333'; -- Tutor Bruno (Tenant B)
SET LOCAL "app.current_tenant_id" = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- Teste 2.1: Tutor B enxerga apenas Luna e não Thor
DO $$
DECLARE
    v_count_all INTEGER;
    v_count_tenant_a INTEGER;
BEGIN
    SELECT count(*) INTO v_count_all FROM public.pets;
    SELECT count(*) INTO v_count_tenant_a FROM public.pets WHERE name = 'Thor (Tenant A)';

    IF v_count_tenant_a = 0 AND v_count_all = 1 THEN
        INSERT INTO test_results VALUES ('2.1 - Leitura restrita ao Tenant B (Pets)', true, 'Apenas 1 pet do Tenant B retornado. Thor (Tenant A) permaneceu invisível.');
    ELSE
        INSERT INTO test_results VALUES ('2.1 - Leitura restrita ao Tenant B (Pets)', false, format('Vazamento no Tenant B! Total: %s, Pets do Tenant A visíveis: %s', v_count_all, v_count_tenant_a));
    END IF;
END $$;

-- Teste 2.2: Tutor B tenta deletar pet do Tenant A
DO $$
DECLARE
    v_affected INTEGER;
BEGIN
    DELETE FROM public.pets WHERE id = 'a5555555-5555-5555-5555-555555555555';
    GET DIAGNOSTICS v_affected = ROW_COUNT;

    IF v_affected = 0 THEN
        INSERT INTO test_results VALUES ('2.2 - Bloqueio de DELETE cruzado entre tenants', true, 'Zero linhas afetadas ao tentar excluir pet do outro tenant.');
    ELSE
        INSERT INTO test_results VALUES ('2.2 - Bloqueio de DELETE cruzado entre tenants', false, format('Falha de segurança! Pet do Tenant A foi excluído (%s linhas afetadas).', v_affected));
    END IF;
END $$;

-- ==============================================================================
-- CENÁRIO 3: Auditoria Automática
-- Valida se ações geram registros imutáveis em public.audit_logs
-- ==============================================================================

-- Cria um pet legítimo no Tenant B e valida se o trigger disparou
DO $$
DECLARE
    v_audit_count INTEGER;
BEGIN
    INSERT INTO public.pets (
        id, tenant_id, tutor_id, name, species, breed
    ) VALUES (
        'b6666666-6666-6666-6666-666666666666',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'b4444444-4444-4444-4444-444444444444',
        'Pipoca Auditável',
        'canine',
        'Poodle'
    );

    SELECT count(*) INTO v_audit_count 
    FROM public.audit_logs 
    WHERE entity = 'pets' AND entity_id = 'b6666666-6666-6666-6666-666666666666' AND action = 'INSERT';

    IF v_audit_count > 0 THEN
        INSERT INTO test_results VALUES ('3.1 - Gatilho de Auditoria Automática (audit_logs)', true, 'Registro de auditoria criado com sucesso pelo trigger fn_audit_trigger.');
    ELSE
        INSERT INTO test_results VALUES ('3.1 - Gatilho de Auditoria Automática (audit_logs)', false, 'Nenhum log de auditoria gerado para inserção!');
    END IF;
END $$;

-- Apresentação consolidada dos resultados
SELECT 
    test_name AS "Teste",
    CASE WHEN passed THEN '✅ APROVADO' ELSE '❌ FALHOU' END AS "Status",
    details AS "Detalhes"
FROM test_results;

ROLLBACK; -- Desfaz alterações de teste mantendo o banco limpo
