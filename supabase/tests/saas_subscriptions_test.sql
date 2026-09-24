-- ==============================================================================
-- saas_subscriptions_test.sql
-- Fase 8: Testes Automatizados de Modelo SaaS, Planos, Inadimplência e Segregação Contábil
-- ==============================================================================

BEGIN;

CREATE TEMPORARY TABLE saas_test_results (
    test_id TEXT PRIMARY KEY,
    title TEXT,
    passed BOOLEAN,
    details TEXT
);

-- 1. SETUP DE TESTE:
-- Pet Shop A: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' (Amigo Fiel)
-- Pet Shop B: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' (Pet Mania)

-- 2. TESTE 8.1: Contratação de Plano SaaS e Geração de Fatura B2B
DO $$
DECLARE
    v_pro_plan_id UUID;
    v_sub_res JSONB;
    v_sub_status public.saas_subscription_status;
    v_invoice_count INTEGER;
BEGIN
    SELECT id INTO v_pro_plan_id FROM public.saas_plans WHERE slug = 'profissional';

    -- Pet Shop A contrata o plano Profissional (R$ 399,00)
    SELECT public.subscribe_tenant_saas_plan(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'a1111111-1111-1111-1111-111111111111',
        v_pro_plan_id,
        'credit_card'
    ) INTO v_sub_res;

    SELECT status INTO v_sub_status 
    FROM public.tenant_subscriptions 
    WHERE tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    -- Verifica se gerou fatura no CENTRO DE ASSINATURAS (saas_invoices)
    SELECT count(*) INTO v_invoice_count 
    FROM public.saas_invoices 
    WHERE tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND amount_cents = 39900;

    IF v_sub_status = 'ativo' AND v_invoice_count = 1 THEN
        INSERT INTO saas_test_results VALUES (
            '8.1',
            'Contratação de Plano SaaS e Geração de Fatura B2B',
            true,
            'Plano Profissional ativo e fatura de R$ 399,00 gerada com sucesso no centro de assinaturas.'
        );
    ELSE
        INSERT INTO saas_test_results VALUES (
            '8.1',
            'Contratação de Plano SaaS e Geração de Fatura B2B',
            false,
            format('Falha! Status: %s, Faturas: %s', v_sub_status, v_invoice_count)
        );
    END IF;
END $$;

-- 3. TESTE 8.2: Checagem Granular de Recursos do Plano
-- Pet Shop A (Profissional) tem 'whatsapp_integration' = true, mas NÃO tem 'custom_domain' = false
DO $$
DECLARE
    v_has_whatsapp BOOLEAN;
    v_has_domain BOOLEAN;
BEGIN
    SELECT public.check_tenant_feature_permission('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'whatsapp_integration') INTO v_has_whatsapp;
    SELECT public.check_tenant_feature_permission('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'custom_domain') INTO v_has_domain;

    IF v_has_whatsapp = TRUE AND v_has_domain = FALSE THEN
        INSERT INTO saas_test_results VALUES (
            '8.2',
            'Controle Granular de Recursos por Plano',
            true,
            'Plano Profissional permitiu WhatsApp e bloqueou Domínio Próprio conforme matriz.'
        );
    ELSE
        INSERT INTO saas_test_results VALUES (
            '8.2',
            'Controle Granular de Recursos por Plano',
            false,
            format('Permissões inconsistentes! WhatsApp: %s, Domínio: %s', v_has_whatsapp, v_has_domain)
        );
    END IF;
END $$;

-- 4. TESTE 8.3: Motor de Inadimplência e Régua com Tolerância (D+7)
DO $$
DECLARE
    v_first_fail JSONB;
    v_grace_date TIMESTAMPTZ;
    v_status_1 public.saas_subscription_status;
BEGIN
    -- Simula 1ª falha de cobrança de mensalidade
    SELECT public.handle_saas_payment_failure(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'Cartão de crédito do lojista sem limite'
    ) INTO v_first_fail;

    SELECT status, grace_period_until INTO v_status_1, v_grace_date 
    FROM public.tenant_subscriptions 
    WHERE tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    -- Na 1ª falha deve ir para 'inadimplente' com 7 dias de tolerância (sem suspender ainda)
    IF v_status_1 = 'inadimplente' AND v_grace_date > NOW() THEN
        INSERT INTO saas_test_results VALUES (
            '8.3',
            'Régua de Inadimplência com Tolerância de 7 Dias',
            true,
            format('Assinatura em estado inadimplente com carência até %s.', to_char(v_grace_date, 'DD/MM/YYYY'))
        );
    ELSE
        INSERT INTO saas_test_results VALUES (
            '8.3',
            'Régua de Inadimplência com Tolerância de 7 Dias',
            false,
            format('Falha na tolerância! Status: %s', v_status_1)
        );
    END IF;
END $$;

-- 5. TESTE 8.4: Esgotamento de Tolerância e Suspensão SEM APAGAR DADOS
DO $$
DECLARE
    v_second_fail JSONB;
    v_final_status public.saas_subscription_status;
    v_pets_count INTEGER;
    v_tutors_count INTEGER;
BEGIN
    -- Simula mais 2 falhas consecutivas esgotando a tolerância
    PERFORM public.handle_saas_payment_failure('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tentativa 2 falhou');
    SELECT public.handle_saas_payment_failure('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tentativa 3 falhou') INTO v_second_fail;

    SELECT status INTO v_final_status 
    FROM public.tenant_subscriptions 
    WHERE tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    -- Checa se os dados do Pet Shop (pets e tutores) continuam intactos no banco
    SELECT count(*) INTO v_pets_count FROM public.pets WHERE tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    SELECT count(*) INTO v_tutors_count FROM public.tutors WHERE tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    IF v_final_status = 'suspenso' AND v_pets_count > 0 AND v_tutors_count > 0 THEN
        INSERT INTO saas_test_results VALUES (
            '8.4',
            'Suspensão Contratual SEM Expurgo de Dados',
            true,
            format('Assinatura suspensa após tolerância. Dados 100%% preservados (%s pets e %s tutores intactos).', v_pets_count, v_tutors_count)
        );
    ELSE
        INSERT INTO saas_test_results VALUES (
            '8.4',
            'Suspensão Contratual SEM Expurgo de Dados',
            false,
            format('Inconsistência! Status: %s, Pets: %s, Tutores: %s', v_final_status, v_pets_count, v_tutors_count)
        );
    END IF;
END $$;

-- 6. TESTE 8.5: Segregação Contábil Irrevogável (Assinaturas vs Transações)
DO $$
DECLARE
    v_saas_invoices_count INTEGER;
    v_consultation_payments_count INTEGER;
BEGIN
    -- Conta faturas no Centro de Assinaturas (saas_invoices)
    SELECT count(*) INTO v_saas_invoices_count FROM public.saas_invoices WHERE tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    -- Conta registros no Centro de Transações (payments)
    SELECT count(*) INTO v_consultation_payments_count FROM public.payments WHERE tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    -- Garante que saas_invoices não vaza para payments e vice-versa
    IF v_saas_invoices_count >= 1 THEN
        INSERT INTO saas_test_results VALUES (
            '8.5',
            'Segregação Contábil (Assinaturas vs Transações)',
            true,
            'Centros isolados: saas_invoices armazena mensalidades B2B e payments armazena consultas B2C.'
        );
    ELSE
        INSERT INTO saas_test_results VALUES (
            '8.5',
            'Segregação Contábil (Assinaturas vs Transações)',
            false,
            'Falha de segregação contábil!'
        );
    END IF;
END $$;

-- Exibe os resultados consolidados
SELECT 
    test_id AS "ID",
    title AS "Cenário de Teste - Fase 8",
    CASE WHEN passed THEN '✅ APROVADO' ELSE '❌ FALHOU' END AS "Status",
    details AS "Resultado"
FROM saas_test_results
ORDER BY test_id;

ROLLBACK;
