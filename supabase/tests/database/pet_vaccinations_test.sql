-- =============================================================================
-- pet_vaccinations_test.sql
-- Fase 11: Carteira de vacinacao digital, RLS, validacoes e lembretes
-- =============================================================================

BEGIN;
SELECT plan(35);

-- Garante vinculo assistencial do veterinario base ao pet (write_clinical)
INSERT INTO public.appointments (
    id, tenant_id, petshop_id, tutor_id, pet_id, veterinarian_id, scheduled_for,
    starts_at, ends_at, lifecycle_status, reservation_status
) VALUES (
    '10300000-0000-4000-8000-000000000030',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'a1111111-1111-1111-1111-111111111111',
    'a4444444-4444-4444-4444-444444444444',
    'a5555555-5555-5555-5555-555555555555',
    'c2222222-2222-2222-2222-222222222222',
    NOW(), NOW() - INTERVAL '1 minute', NOW() + INTERVAL '29 minutes',
    'realizado', 'completed'
) ON CONFLICT (id) DO NOTHING;

UPDATE public.veterinarians
SET is_active = TRUE, is_verified = TRUE
WHERE id = 'c2222222-2222-2222-2222-222222222222';

-- Veterinario sem nenhum vinculo ao pet (caso negativo)
INSERT INTO public.users (id, email, full_name, system_role)
VALUES ('10300000-0000-4000-8000-000000000021', 'vet.semvinculo.phase11@example.test', 'Vet Sem Vinculo', 'veterinarian')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.veterinarians (id, user_id, is_active, is_verified)
VALUES ('10300000-0000-4000-8000-000000000022', '10300000-0000-4000-8000-000000000021', TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Estrutura
SELECT has_table('public', 'vaccinations', 'Tabela de vacinas existe.');
SELECT has_column('public', 'vaccinations', 'application_date', 'Vacina guarda data de aplicacao.');
SELECT has_column('public', 'vaccinations', 'manufacturer', 'Vacina guarda fabricante quando informado.');
SELECT has_column('public', 'vaccinations', 'lot_number', 'Vacina guarda lote quando aplicavel.');
SELECT has_column('public', 'vaccinations', 'next_dose_at', 'Vacina guarda proxima dose definida pelo profissional.');
SELECT has_column('public', 'vaccinations', 'reminder_enabled', 'Vacina permite ativar lembrete.');
SELECT has_column('public', 'vaccinations', 'reminder_notified_at', 'Lembrete possui controle de idempotencia.');
SELECT has_column('public', 'documents', 'vaccination_id', 'Documento pode ser comprovante de uma vacina.');

SELECT has_function('public', 'create_vaccination', ARRAY['uuid','text','date','text','text','text','text','date','boolean','uuid'], 'Registro de vacina e feito por RPC autorizada.');
SELECT has_function('public', 'update_vaccination', ARRAY['uuid','text','text','text','date','boolean','text'], 'Atualizacao de vacina e feita por RPC autorizada.');
SELECT has_function('public', 'get_pet_vaccinations', ARRAY['uuid'], 'Carteira de vacinas e lida por RPC auditada.');
SELECT has_function('public', 'get_pet_vaccination_history', ARRAY['uuid'], 'Historico unificado e lido por RPC auditada.');
SELECT has_function('public', 'get_pet_vaccination_card_data', ARRAY['uuid'], 'Exportacao da carteira usa RPC auditada.');
SELECT has_function('public', 'authorize_vaccination_document_upload', ARRAY['uuid','uuid'], 'Upload de comprovante e autorizado no banco.');
SELECT has_function('public', 'register_vaccination_document', ARRAY['uuid','uuid','text','text','bigint','text'], 'Comprovante e registrado por funcao validada.');
SELECT has_function('public', 'get_vaccination_document_download', ARRAY['uuid'], 'Download de comprovante e autorizado e auditado.');

-- Seguranca / RLS
SELECT has_policy('public', 'vaccinations', 'policy_vaccinations_read_authorized', 'Leitura de vacinas passa pela autorizacao clinica.');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.vaccinations'::regclass), 'RLS habilitado em vaccinations.');
SELECT ok(NOT has_table_privilege('anon', 'public.vaccinations', 'SELECT'), 'anon nao le vacinas.');
SELECT ok(NOT has_table_privilege('authenticated', 'public.vaccinations', 'INSERT'), 'Cliente nao insere vacina diretamente.');
SELECT ok(NOT has_table_privilege('authenticated', 'public.vaccinations', 'UPDATE'), 'Cliente nao edita vacina diretamente.');

-- Tutor: leitura da carteira, auditoria e negacao de escrita
SET LOCAL "request.jwt.claim.sub" = 'a3333333-3333-3333-3333-333333333333';
SET LOCAL "app.current_tenant_id" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT ok((public.get_pet_vaccinations('a5555555-5555-5555-5555-555555555555')->'vaccinations') IS NOT NULL, 'Tutor le a carteira do proprio pet.');
SELECT ok((SELECT count(*) > 0 FROM public.record_access_log WHERE pet_id = 'a5555555-5555-5555-5555-555555555555' AND purpose = 'vaccination_wallet'), 'Leitura da carteira foi registrada no log.');
SELECT throws_ok(
    $$ SELECT public.create_vaccination('a5555555-5555-5555-5555-555555555555', 'Vacina Invalida', CURRENT_DATE) $$,
    '42501',
    'Somente veterinario verificado com vinculo assistencial pode registrar vacinas.',
    'Tutor nao registra vacina (dado clinico e do profissional).'
);

-- Pet Shop: sem acesso clinico
SET LOCAL "request.jwt.claim.sub" = 'a2222222-2222-2222-2222-222222222222';
SELECT throws_ok(
    $$ SELECT public.get_pet_vaccinations('a5555555-5555-5555-5555-555555555555') $$,
    '42501',
    'Acesso negado a carteira de vacinacao deste pet.',
    'Pet Shop nao acessa a carteira de vacinacao.'
);
SELECT throws_ok(
    $$ SELECT public.get_pet_vaccination_history('a5555555-5555-5555-5555-555555555555') $$,
    '42501',
    'Acesso negado ao historico de vacinacao deste pet.',
    'Pet Shop nao acessa o historico de vacinacao.'
);

-- Veterinario com vinculo: criacao valida e validacoes
SET LOCAL "request.jwt.claim.sub" = 'c1111111-1111-1111-1111-111111111111';
SET LOCAL "app.current_tenant_id" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT ok(
    (public.create_vaccination(
        'a5555555-5555-5555-5555-555555555555', 'Vacina Teste Fase 11', CURRENT_DATE,
        'Fabricante Exemplo', 'LOTE-11', '1a', 'Aplicada sem reacoes',
        CURRENT_DATE + 3, TRUE, NULL
    )->>'vaccination_id') IS NOT NULL,
    'Veterinario verificado com vinculo registra vacina com dados informados.'
);
SELECT throws_ok(
    $$ SELECT public.create_vaccination('a5555555-5555-5555-5555-555555555555', 'Vacina Futura', CURRENT_DATE + 1) $$,
    '22023',
    'Data de aplicacao invalida: nao e possivel registrar vacina com data futura.',
    'Data de aplicacao futura e rejeitada (nao inventamos datas).'
);
SELECT throws_ok(
    $$ SELECT public.create_vaccination('a5555555-5555-5555-5555-555555555555', 'Vacina Dose', CURRENT_DATE, NULL, NULL, NULL, NULL, CURRENT_DATE) $$,
    '22023',
    'A proxima dose deve ser posterior a data de aplicacao.',
    'Proxima dose igual/anterior a aplicacao e rejeitada.'
);
SELECT throws_ok(
    $$ SELECT public.create_vaccination('a5555555-5555-5555-5555-555555555555', 'Vacina Lembrete', CURRENT_DATE, NULL, NULL, NULL, NULL, NULL, TRUE) $$,
    '22023',
    'Lembrete exige proxima dose definida pelo profissional.',
    'Lembrete sem proxima dose definida e rejeitado.'
);

-- Veterinario sem vinculo: negado
SET LOCAL "request.jwt.claim.sub" = '10300000-0000-4000-8000-000000000021';
SELECT throws_ok(
    $$ SELECT public.create_vaccination('a5555555-5555-5555-5555-555555555555', 'Vacina Sem Vinculo', CURRENT_DATE) $$,
    '42501',
    'Somente veterinario verificado com vinculo assistencial pode registrar vacinas.',
    'Veterinario sem vinculo assistencial nao registra vacina.'
);

-- Tutor: lembrete in-app idempotente, historico e exportacao
SET LOCAL "request.jwt.claim.sub" = 'a3333333-3333-3333-3333-333333333333';
SELECT ok((public.get_pet_vaccinations('a5555555-5555-5555-5555-555555555555')->'vaccinations') IS NOT NULL, 'Leitura da carteira apos registro.');
SELECT ok(
    (SELECT count(*) > 0 FROM public.notifications
     WHERE category = 'vaccine_reminder' AND channel = 'in_app'
       AND user_id = 'a3333333-3333-3333-3333-333333333333'),
    'Lembrete de proxima dose e criado apenas como notificacao in-app.'
);
SELECT ok(
    (SELECT count(*) >= 1 FROM jsonb_array_elements(
        public.get_pet_vaccination_history('a5555555-5555-5555-5555-555555555555')->'history'
    ) AS e WHERE e->>'kind' = 'vaccination'),
    'Historico unificado contem a vacina registrada.'
);
SELECT ok(
    (public.get_pet_vaccination_card_data('a5555555-5555-5555-5555-555555555555')->'vaccinations') IS NOT NULL,
    'Exportacao da carteira retorna dados autorizados.'
);

SELECT * FROM finish();

