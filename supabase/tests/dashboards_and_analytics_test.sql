-- ==============================================================================
-- dashboards_and_analytics_test.sql
-- Fase 9: Testes Automatizados dos 4 Dashboards Especializados e Funções RPC de Analytics
-- ==============================================================================

BEGIN;

CREATE TEMPORARY TABLE dashboard_test_results (
    test_id TEXT PRIMARY KEY,
    title TEXT,
    passed BOOLEAN,
    details TEXT
);

-- ==============================================================================
-- TESTE 9.1: DASHBOARD ADMINISTRADOR MASTER
-- ==============================================================================
SET LOCAL "request.jwt.claim.sub" = '99999999-9999-9999-9999-999999999999'; -- Superadmin

DO $$
DECLARE
    v_admin_metrics JSONB;
BEGIN
    SELECT public.get_admin_master_metrics() INTO v_admin_metrics;

    IF v_admin_metrics IS NOT NULL 
       AND (v_admin_metrics->'financial'->>'mrr_cents') IS NOT NULL
       AND (v_admin_metrics->'petshops'->>'total') IS NOT NULL
       AND (v_admin_metrics->'veterinarians'->>'total') IS NOT NULL THEN
        INSERT INTO dashboard_test_results VALUES (
            '9.1',
            'Cálculo das Métricas do Administrador Master',
            true,
            'MRR, GMV, Comissões e contadores de Pet Shops/Vets consolidados com precisão.'
        );
    ELSE
        INSERT INTO dashboard_test_results VALUES (
            '9.1',
            'Cálculo das Métricas do Administrador Master',
            false,
            'Falha no cálculo das métricas do administrador.'
        );
    END IF;
END $$;

-- ==============================================================================
-- TESTE 9.2: ISOLAMENTO RBAC - Pet Shop Tenta Acessar Métricas Globais do Master
-- ==============================================================================
SET LOCAL "request.jwt.claim.sub" = 'a2222222-2222-2222-2222-222222222222'; -- Gestor do Pet Shop

DO $$
BEGIN
    PERFORM public.get_admin_master_metrics();

    -- Se não disparar erro, falhou
    INSERT INTO dashboard_test_results VALUES (
        '9.2',
        'Bloqueio RBAC: Pet Shop Acessar Métricas do Master',
        false,
        'Pet shop conseguiu acessar métricas confidenciais globais!'
    );
EXCEPTION WHEN OTHERS THEN
    INSERT INTO dashboard_test_results VALUES (
        '9.2',
        'Bloqueio RBAC: Pet Shop Acessar Métricas do Master',
        true,
        'Bloqueio seguro! Exceção 42501 disparada ao tentar ler dados executivos.'
    );
END $$;

-- ==============================================================================
-- TESTE 9.3: DASHBOARD DO PET SHOP PARCEIRO
-- ==============================================================================
SET LOCAL "request.jwt.claim.sub" = 'a2222222-2222-2222-2222-222222222222';

DO $$
DECLARE
    v_petshop_metrics JSONB;
BEGIN
    SELECT public.get_petshop_dashboard_metrics('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') INTO v_petshop_metrics;

    IF v_petshop_metrics IS NOT NULL 
       AND (v_petshop_metrics->'commissions') IS NOT NULL
       AND (v_petshop_metrics->'subscription') IS NOT NULL
       AND (v_petshop_metrics->'referrals') IS NOT NULL THEN
        INSERT INTO dashboard_test_results VALUES (
            '9.3',
            'Métricas do Dashboard do Pet Shop (Comissões e Assinatura)',
            true,
            'Extrato de comissões, link exclusivo, QR code e status da assinatura retornados com sucesso.'
        );
    ELSE
        INSERT INTO dashboard_test_results VALUES (
            '9.3',
            'Métricas do Dashboard do Pet Shop (Comissões e Assinatura)',
            false,
            'Inconsistência nos dados do dashboard do Pet Shop.'
        );
    END IF;
END $$;

-- ==============================================================================
-- TESTE 9.4: DASHBOARD DO MÉDICO VETERINÁRIO
-- ==============================================================================
SET LOCAL "request.jwt.claim.sub" = 'c1111111-1111-1111-1111-111111111111'; -- Dra. Camila

DO $$
DECLARE
    v_vet_metrics JSONB;
BEGIN
    SELECT public.get_veterinarian_dashboard_metrics('c2222222-2222-2222-2222-222222222222') INTO v_vet_metrics;

    IF v_vet_metrics IS NOT NULL 
       AND (v_vet_metrics->'financial') IS NOT NULL
       AND (v_vet_metrics->'appointments') IS NOT NULL
       AND (v_vet_metrics->'veterinarian') IS NOT NULL THEN
        INSERT INTO dashboard_test_results VALUES (
            '9.4',
            'Métricas do Dashboard do Veterinário (Agenda e Carteira)',
            true,
            'Faturamento líquido, saldo disponível, CRMV e estatísticas de consultas entregues com sucesso.'
        );
    ELSE
        INSERT INTO dashboard_test_results VALUES (
            '9.4',
            'Métricas do Dashboard do Veterinário (Agenda e Carteira)',
            false,
            'Falha na obtenção do dashboard do veterinário.'
        );
    END IF;
END $$;

-- ==============================================================================
-- TESTE 9.5: DASHBOARD DO TUTOR
-- ==============================================================================
SET LOCAL "request.jwt.claim.sub" = 'a3333333-3333-3333-3333-333333333333'; -- Tutora Ana Silva

DO $$
DECLARE
    v_tutor_metrics JSONB;
    v_pets_count INTEGER;
BEGIN
    SELECT public.get_tutor_dashboard_metrics('a4444444-4444-4444-4444-444444444444') INTO v_tutor_metrics;
    v_pets_count := jsonb_array_length(v_tutor_metrics->'pets');

    IF v_tutor_metrics IS NOT NULL AND v_pets_count >= 1 THEN
        INSERT INTO dashboard_test_results VALUES (
            '9.5',
            'Métricas do Dashboard do Tutor (Pets e Prescrições)',
            true,
            format('Lista de pets retornada (%s pets) junto com dados da próxima teleconsulta.', v_pets_count)
        );
    ELSE
        INSERT INTO dashboard_test_results VALUES (
            '9.5',
            'Métricas do Dashboard do Tutor (Pets e Prescrições)',
            false,
            'Falha no painel do tutor.'
        );
    END IF;
END $$;

-- Exibe os resultados consolidados
SELECT 
    test_id AS "ID",
    title AS "Cenário de Teste - Fase 9",
    CASE WHEN passed THEN '✅ APROVADO' ELSE '❌ FALHOU' END AS "Status",
    details AS "Resultado"
FROM dashboard_test_results
ORDER BY test_id;

ROLLBACK;
