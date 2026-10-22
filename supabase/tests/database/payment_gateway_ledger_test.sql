-- ==============================================================================
-- payment_gateway_ledger_test.sql
-- Fase 8: Testes de gateway real, webhook idempotente e ledger financeiro
-- ==============================================================================

BEGIN;

CREATE TEMPORARY TABLE payment_gateway_results (
    test_id TEXT PRIMARY KEY,
    title TEXT,
    passed BOOLEAN,
    details TEXT
);

INSERT INTO public.tenants (id, slug, name, email)
VALUES ('11111111-1111-1111-1111-111111111111', 'tenant-fase8', 'Tenant Fase 8', 'tenant8@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, system_role)
VALUES ('22222222-2222-2222-2222-222222222222', 'tutor8@example.com', 'Tutor Fase 8', 'tutor')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tutors (id, tenant_id, user_id)
VALUES ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.payments (
    id,
    tenant_id,
    tutor_id,
    gateway,
    payment_method,
    amount_cents,
    status,
    provider_status,
    payment_currency
) VALUES (
    '44444444-4444-4444-4444-444444444444',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333333',
    'stripe',
    'credit_card',
    25000,
    'pending',
    'pending',
    'BRL'
) ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
    v_gateway JSONB;
    v_first_event JSONB;
    v_second_event JSONB;
    v_update JSONB;
    v_ledger_count INTEGER;
BEGIN
    SELECT public.register_payment_gateway_config(
        '11111111-1111-1111-1111-111111111111',
        'stripe',
        TRUE,
        jsonb_build_object('mode', 'test', 'webhook_endpoint', 'pending')
    ) INTO v_gateway;

    IF v_gateway->>'provider_name' = 'stripe' AND (v_gateway->>'is_enabled')::boolean = TRUE THEN
        INSERT INTO payment_gateway_results VALUES (
            '8.1',
            'Configuração do gateway configurado com provider ativo',
            true,
            'Gateway stripe foi registrado em modo teste sem segredos sensíveis.'
        );
    ELSE
        INSERT INTO payment_gateway_results VALUES (
            '8.1',
            'Configuração do gateway configurado com provider ativo',
            false,
            format('Gateway não habilitado: %s', v_gateway)
        );
    END IF;

    SELECT public.register_payment_webhook_event(
        '11111111-1111-1111-1111-111111111111',
        '44444444-4444-4444-4444-444444444444',
        'stripe',
        'evt_8_abc_001',
        'checkout.session.completed',
        jsonb_build_object('status', 'paid', 'amount_total', 25000)
    ) INTO v_first_event;

    SELECT public.register_payment_webhook_event(
        '11111111-1111-1111-1111-111111111111',
        '44444444-4444-4444-4444-444444444444',
        'stripe',
        'evt_8_abc_001',
        'checkout.session.completed',
        jsonb_build_object('status', 'paid', 'amount_total', 25000)
    ) INTO v_second_event;

    IF (v_first_event->>'duplicate')::boolean = FALSE AND (v_second_event->>'duplicate')::boolean = TRUE THEN
        INSERT INTO payment_gateway_results VALUES (
            '8.2',
            'Deduplicação de webhook por provider_event_id',
            true,
            'O mesmo evento do gateway foi aceito apenas uma vez.'
        );
    ELSE
        INSERT INTO payment_gateway_results VALUES (
            '8.2',
            'Deduplicação de webhook por provider_event_id',
            false,
            format('Webhooks duplicados: primeiro=%s | segundo=%s', v_first_event, v_second_event)
        );
    END IF;

    SELECT public.apply_provider_status_update(
        '44444444-4444-4444-4444-444444444444',
        'stripe',
        'succeeded',
        'evt_8_abc_002',
        'Pagamento autorizado pelo gateway.',
        jsonb_build_object('status', 'paid', 'provider_status', 'succeeded')
    ) INTO v_update;

    SELECT count(*) INTO v_ledger_count
    FROM public.payment_ledger
    WHERE payment_id = '44444444-4444-4444-4444-444444444444';

    IF (v_update->>'payment_status') = 'captured'
       AND (v_update->>'provider_status') = 'succeeded'
       AND v_ledger_count >= 2 THEN
        INSERT INTO payment_gateway_results VALUES (
            '8.3',
            'Gateway real atualiza status e registra ledger',
            true,
            'Status do pagamento foi concluído e o ledger foi persistido.'
        );
    ELSE
        INSERT INTO payment_gateway_results VALUES (
            '8.3',
            'Gateway real atualiza status e registra ledger',
            false,
            format('Status: %s / provider_status: %s / ledger: %s', v_update->>'payment_status', v_update->>'provider_status', v_ledger_count)
        );
    END IF;
END $$;

SELECT
    test_id AS "ID",
    title AS "Cenário de Teste - Fase 8",
    CASE WHEN passed THEN '✅ APROVADO' ELSE '❌ FALHOU' END AS "Status",
    details AS "Resultado"
FROM payment_gateway_results
ORDER BY test_id;

ROLLBACK;
