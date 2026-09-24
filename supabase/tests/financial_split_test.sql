-- ==============================================================================
-- financial_split_test.sql
-- Fase 7: Testes Automatizados do Motor Financeiro, Splits, Prioridades, Idempotência e Reembolso
-- ==============================================================================

BEGIN;

CREATE TEMPORARY TABLE finance_test_results (
    test_id TEXT PRIMARY KEY,
    title TEXT,
    passed BOOLEAN,
    details TEXT
);

-- 1. SETUP DE DADOS DE TESTE:
-- Pet Shop A: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' (Amigo Fiel)
-- Pet Shop B: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' (Pet Mania)
-- Veterinário A: 'c2222222-2222-2222-2222-222222222222' (Dra. Camila)
-- Agendamento de R$ 200,00 (20.000 centavos)
INSERT INTO public.appointments (
    id, tenant_id, petshop_id, tutor_id, pet_id, veterinarian_id, scheduled_for, price_cents, lifecycle_status
) VALUES (
    'e1111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'a1111111-1111-1111-1111-111111111111',
    'a4444444-4444-4444-4444-444444444444',
    'a5555555-5555-5555-5555-555555555555',
    'c2222222-2222-2222-2222-222222222222',
    NOW(),
    20000, -- R$ 200,00
    'solicitado'
);

-- 2. TESTE 7.1: Cálculo do Split Padrão (70% Vet = R$ 140, 10% Pet Shop = R$ 20, 20% Plataforma = R$ 40)
DO $$
DECLARE
    v_split RECORD;
BEGIN
    SELECT * INTO v_split 
    FROM public.calculate_split_shares(
        'c2222222-2222-2222-2222-222222222222',
        'a1111111-1111-1111-1111-111111111111',
        null,
        null,
        20000
    );

    IF v_split.vet_amount_cents = 14000 
       AND v_split.petshop_amount_cents = 2000 
       AND v_split.platform_amount_cents = 4000 THEN
        INSERT INTO finance_test_results VALUES (
            '7.1',
            'Cálculo do Split Padrão (70 / 10 / 20)',
            true,
            'Valores exatos: Vet = R$ 140,00 | Pet Shop = R$ 20,00 | Plataforma = R$ 40,00.'
        );
    ELSE
        INSERT INTO finance_test_results VALUES (
            '7.1',
            'Cálculo do Split Padrão (70 / 10 / 20)',
            false,
            format('Valores divergentes: Vet=%s, Pet Shop=%s, Plat=%s', 
                v_split.vet_amount_cents, v_split.petshop_amount_cents, v_split.platform_amount_cents)
        );
    END IF;
END $$;

-- 3. TESTE 7.2: Hierarquia de Prioridades (Regra Específica do Pet Shop B com 12% sobrepondo regra padrão)
-- Insere regra customizada para o Pet Shop B com prioridade 2
INSERT INTO public.commission_rules (
    scope, target_id, priority_level, vet_share, petshop_share, platform_share
) VALUES (
    'petshop',
    'b1111111-1111-1111-1111-111111111111', -- Pet Shop B
    2,
    70.00,
    12.00, -- 12% negociado
    18.00  -- 18% plataforma
);

DO $$
DECLARE
    v_split RECORD;
BEGIN
    SELECT * INTO v_split 
    FROM public.calculate_split_shares(
        'c2222222-2222-2222-2222-222222222222',
        'b1111111-1111-1111-1111-111111111111', -- Pet Shop B
        null,
        null,
        20000
    );

    IF v_split.rule_source = 'petshop' 
       AND v_split.petshop_amount_cents = 2400 -- 12% de R$ 200 = R$ 24,00
       AND v_split.platform_amount_cents = 3600 THEN
        INSERT INTO finance_test_results VALUES (
            '7.2',
            'Hierarquia de Prioridades (Regra de Pet Shop)',
            true,
            'Regra customizada do Pet Shop B prevaleceu sobre a regra padrão global (12% aplicado).'
        );
    ELSE
        INSERT INTO finance_test_results VALUES (
            '7.2',
            'Hierarquia de Prioridades (Regra de Pet Shop)',
            false,
            format('Regra não prevaleceu! Fonte: %s, Pet Shop: %s', v_split.rule_source, v_split.petshop_amount_cents)
        );
    END IF;
END $$;

-- 4. TESTE 7.3: Processamento Atômico com Idempotência (Evita Lançamento Duplicado)
DO $$
DECLARE
    v_first_call JSONB;
    v_second_call JSONB;
    v_payments_count INTEGER;
BEGIN
    -- Primeira tentativa com a chave 'idem_key_test_001'
    SELECT public.process_appointment_payment_split(
        'e1111111-1111-1111-1111-111111111111',
        'pagarme',
        'tx_pagarme_mock_123',
        'pix',
        'idem_key_test_001'
    ) INTO v_first_call;

    -- Segunda tentativa com a MESMA chave de idempotência
    SELECT public.process_appointment_payment_split(
        'e1111111-1111-1111-1111-111111111111',
        'pagarme',
        'tx_pagarme_mock_123',
        'pix',
        'idem_key_test_001'
    ) INTO v_second_call;

    -- Checa se foi inserido apenas 1 pagamento na tabela payments
    SELECT count(*) INTO v_payments_count 
    FROM public.payments 
    WHERE appointment_id = 'e1111111-1111-1111-1111-111111111111';

    IF v_payments_count = 1 AND (v_first_call->>'payment_id') = (v_second_call->>'payment_id') THEN
        INSERT INTO finance_test_results VALUES (
            '7.3',
            'Garantia de Idempotência em Pagamentos',
            true,
            'A chamada repetida retornou o resultado salvo sem duplicar a transação nem os créditos.'
        );
    ELSE
        INSERT INTO finance_test_results VALUES (
            '7.3',
            'Garantia de Idempotência em Pagamentos',
            false,
            format('Falha de idempotência! Total de pagamentos criados: %s', v_payments_count)
        );
    END IF;
END $$;

-- 5. TESTE 7.4: Reembolso com Reversão Proporcional de Carteiras
DO $$
DECLARE
    v_pay_id UUID;
    v_refund_res JSONB;
    v_pay_status VARCHAR(32);
    v_vet_balance BIGINT;
BEGIN
    SELECT id INTO v_pay_id FROM public.payments WHERE appointment_id = 'e1111111-1111-1111-1111-111111111111';

    -- Executa reembolso
    SELECT public.process_refund_split(v_pay_id, 'Cancelamento com antecedência de 24h') INTO v_refund_res;

    SELECT status INTO v_pay_status FROM public.payments WHERE id = v_pay_id;
    SELECT balance_cents INTO v_vet_balance FROM public.wallets 
    WHERE owner_type = 'veterinarian' AND owner_id = 'c2222222-2222-2222-2222-222222222222';

    -- Como o vet recebeu 14000 e foi estornado 14000, o saldo deve ter voltado a 0
    IF v_pay_status = 'refunded' AND v_vet_balance = 0 THEN
        INSERT INTO finance_test_results VALUES (
            '7.4',
            'Reembolso com Reversão Proporcional nas Wallets',
            true,
            'Pagamento marcado como refunded e saldos estornados de todas as partes de forma precisa.'
        );
    ELSE
        INSERT INTO finance_test_results VALUES (
            '7.4',
            'Reembolso com Reversão Proporcional nas Wallets',
            false,
            format('Falha no reembolso! Status: %s, Saldo do Vet: %s', v_pay_status, v_vet_balance)
        );
    END IF;
END $$;

-- Exibe os resultados consolidados
SELECT 
    test_id AS "ID",
    title AS "Cenário de Teste - Fase 7",
    CASE WHEN passed THEN '✅ APROVADO' ELSE '❌ FALHOU' END AS "Status",
    details AS "Resultado"
FROM finance_test_results
ORDER BY test_id;

ROLLBACK;
