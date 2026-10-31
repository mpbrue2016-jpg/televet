-- ==============================================================================
-- notifications_outbox_test.sql
-- Fase 14: Notificações Interna, E-mail, WhatsApp e Push
-- Testes de Aceite: Idempotência, Trava Anti-Duplicação, Opt-Out, Retry e Evidência Real
-- ==============================================================================

BEGIN;
SELECT plan(16);

-- ---------------------------------------------------------------------------
-- 1. Verificação Estrutural de Tabelas e Constraints
-- ---------------------------------------------------------------------------

SELECT has_table('public', 'user_notification_preferences', 'Tabela user_notification_preferences existe');
SELECT has_table('public', 'notification_templates', 'Tabela notification_templates existe');
SELECT has_table('public', 'notification_outbox', 'Tabela notification_outbox existe');

SELECT col_is_unique(
    'public',
    'notification_outbox',
    'idempotency_key',
    'Trava UNIQUE em idempotency_key garante que um evento não gera notificações duplicadas'
);

-- ---------------------------------------------------------------------------
-- 2. Presença de Templates Versionados
-- ---------------------------------------------------------------------------

SELECT ok(
    EXISTS (SELECT 1 FROM public.notification_templates WHERE slug = 'appointment_confirmed' AND channel = 'whatsapp'),
    'Template de confirmação de consulta para WhatsApp cadastrado'
);

SELECT ok(
    EXISTS (SELECT 1 FROM public.notification_templates WHERE slug = 'prescription_ready' AND channel = 'email'),
    'Template seguro de receita digital para e-mail cadastrado'
);

-- ---------------------------------------------------------------------------
-- 3. Fixtures para Testes de Notificação e Opt-in
-- ---------------------------------------------------------------------------

-- Tenant e Usuário de Teste
INSERT INTO public.tenants (id, name, slug)
VALUES ('77777777-7777-7777-7777-777777777777', 'Tenant Teste F14', 'tenant-teste-f14')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, tenant_id, email, role)
VALUES (
    'a4444444-4444-4444-4444-444444444444',
    '77777777-7777-7777-7777-777777777777',
    'tutor.f14@televet.test',
    'tutor'
)
ON CONFLICT (id) DO NOTHING;

-- Preferências padrão: WhatsApp desativado por padrão (sem opt-in prévio)
INSERT INTO public.user_notification_preferences (
    user_id, tenant_id, email_enabled, whatsapp_enabled, in_app_enabled
) VALUES (
    'a4444444-4444-4444-4444-444444444444',
    '77777777-7777-7777-7777-777777777777',
    true,
    false, -- Sem opt-in de WhatsApp
    true
)
ON CONFLICT (user_id) DO UPDATE SET whatsapp_enabled = false;

-- ---------------------------------------------------------------------------
-- 4. Teste de Aceite: Opt-out é rigorosamente respeitado
-- ---------------------------------------------------------------------------

-- Tentativa de enfileirar WhatsApp para usuário sem consentimento / opt-in
SELECT is(
    (SELECT (public.fn_enqueue_notification(
        '77777777-7777-7777-7777-777777777777'::uuid,
        'a4444444-4444-4444-4444-444444444444'::uuid,
        'appointment_confirmed',
        'whatsapp',
        '5511999998888',
        'appointment_confirmed',
        '{"tutor_name": "Carlos", "pet_name": "Thor", "scheduled_date": "20/10/2026 às 15:00"}'::jsonb,
        'https://app.televet.com.br/seguro/1',
        'idemp_opt_out_test_01'
    )->>'status')),
    'skipped_opt_out',
    'Opt-out de WhatsApp respeitado: notificação marcada como skipped_opt_out sem envio'
);

-- Usuário concede Opt-in formal com registro de data e IP
SELECT is(
    (SELECT (public.fn_update_notification_preferences(
        'a4444444-4444-4444-4444-444444444444'::uuid,
        true,  -- email
        true,  -- whatsapp opt-in concedido
        true,  -- push
        true,  -- in_app
        true,  -- reminders
        false, -- marketing
        '192.168.1.100'::inet
    )->>'whatsapp_enabled')::boolean),
    true,
    'Opt-in de WhatsApp ativado com sucesso nas preferências do usuário'
);

-- ---------------------------------------------------------------------------
-- 5. Teste de Aceite: Um evento não gera notificações duplicadas (Idempotência)
-- ---------------------------------------------------------------------------

-- Primeira chamada com chave de idempotência exclusiva: deve criar registro novo
SELECT is(
    (SELECT (public.fn_enqueue_notification(
        '77777777-7777-7777-7777-777777777777'::uuid,
        'a4444444-4444-4444-4444-444444444444'::uuid,
        'appointment_confirmed',
        'whatsapp',
        '5511999998888',
        'appointment_confirmed',
        '{"tutor_name": "Carlos", "pet_name": "Thor", "scheduled_date": "20/10/2026 às 15:00"}'::jsonb,
        'https://app.televet.com.br/seguro/1',
        'idemp_unique_appointment_1001'
    )->>'idempotent_reused')::boolean),
    false,
    'Primeira chamada enfileira com sucesso (idempotent_reused = false)'
);

-- Segunda chamada com a MESMA chave de idempotência: deve reaproveitar sem duplicar
SELECT is(
    (SELECT (public.fn_enqueue_notification(
        '77777777-7777-7777-7777-777777777777'::uuid,
        'a4444444-4444-4444-4444-444444444444'::uuid,
        'appointment_confirmed',
        'whatsapp',
        '5511999998888',
        'appointment_confirmed',
        '{"tutor_name": "Carlos", "pet_name": "Thor", "scheduled_date": "20/10/2026 às 15:00"}'::jsonb,
        'https://app.televet.com.br/seguro/1',
        'idemp_unique_appointment_1001'
    )->>'idempotent_reused')::boolean),
    true,
    'Segunda chamada com mesma chave de idempotência é deduplicada (idempotent_reused = true)'
);

SELECT is(
    (SELECT COUNT(*) FROM public.notification_outbox WHERE idempotency_key = 'idemp_unique_appointment_1001'),
    1::bigint,
    'Garantia matemática no banco: exatamente 1 registro gravado para a chave'
);

-- ---------------------------------------------------------------------------
-- 6. Teste de Reutilização: Notificação In-App alimenta public.notifications
-- ---------------------------------------------------------------------------

SELECT is(
    (SELECT (public.fn_enqueue_notification(
        '77777777-7777-7777-7777-777777777777'::uuid,
        'a4444444-4444-4444-4444-444444444444'::uuid,
        'prescription_ready',
        'in_app',
        'a4444444-4444-4444-4444-444444444444',
        'prescription_ready',
        '{"tutor_name": "Carlos", "pet_name": "Thor"}'::jsonb,
        'https://app.televet.com.br/seguro/doc123',
        'idemp_inapp_doc_123'
    )->>'status')),
    'delivered',
    'Notificação in-app registrada e entregue diretamente na caixa do usuário'
);

SELECT ok(
    EXISTS (
        SELECT 1 FROM public.notifications 
        WHERE user_id = 'a4444444-4444-4444-4444-444444444444' 
          AND category = 'prescription_ready'
    ),
    'Tabela existente public.notifications reutilizada com sucesso sem duplicação de filas'
);

-- ---------------------------------------------------------------------------
-- 7. Teste de Aceite: Política de Retry e Registro de Falhas
-- ---------------------------------------------------------------------------

-- Obter ID do item da outbox criado para teste de retry
DO $$
DECLARE
    v_outbox_id UUID;
BEGIN
    SELECT id INTO v_outbox_id 
    FROM public.notification_outbox 
    WHERE idempotency_key = 'idemp_unique_appointment_1001';

    -- Simula primeira falha temporária do provedor
    PERFORM public.fn_update_notification_outbox_status(
        v_outbox_id,
        'failed',
        null,
        null,
        'Connection timeout with Meta API'
    );
END $$;

SELECT is(
    (SELECT attempts FROM public.notification_outbox WHERE idempotency_key = 'idemp_unique_appointment_1001'),
    1,
    'Primeira falha incrementa contador de tentativas para 1'
);

SELECT is(
    (SELECT status FROM public.notification_outbox WHERE idempotency_key = 'idemp_unique_appointment_1001'),
    'pending',
    'Status permanece pending com agendamento de retry futuro (backoff exponencial)'
);

-- ---------------------------------------------------------------------------
-- 8. Teste de Aceite: Status "enviado/entregue" só após evidência real
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    v_outbox_id UUID;
BEGIN
    SELECT id INTO v_outbox_id 
    FROM public.notification_outbox 
    WHERE idempotency_key = 'idemp_unique_appointment_1001';

    -- Simula resposta oficial do provedor com wamid real
    PERFORM public.fn_update_notification_outbox_status(
        v_outbox_id,
        'sent',
        'wamid.HBgLMNTU',
        '{"status": "sent", "wamid": "wamid.HBgLMNTU"}'::jsonb
    );
END $$;

SELECT is(
    (SELECT external_id FROM public.notification_outbox WHERE idempotency_key = 'idemp_unique_appointment_1001'),
    'wamid.HBgLMNTU',
    'ID oficial externo gravado após resposta real do provedor'
);

SELECT is(
    (SELECT status FROM public.notification_outbox WHERE idempotency_key = 'idemp_unique_appointment_1001'),
    'sent',
    'Status atualizado para sent apenas mediante evidência real do provedor'
);

SELECT * FROM finish();
ROLLBACK;
