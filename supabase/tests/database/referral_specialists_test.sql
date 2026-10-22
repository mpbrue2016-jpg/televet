-- ==============================================================================
-- referral_specialists_test.sql
-- Fase 12: Encaminhamentos e especialistas - teletriagem/teleorientacao,
-- escopo minimo, prazo de aceite, anexos e retorno no prontuario
-- ==============================================================================

BEGIN;
SELECT plan(58);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

-- Vinculo assistencial do veterinario base ao pet (write_clinical)
INSERT INTO public.appointments (
    id, tenant_id, petshop_id, tutor_id, pet_id, veterinarian_id, scheduled_for,
    starts_at, ends_at, lifecycle_status, reservation_status
) VALUES (
    '10300000-0000-4000-8000-000000000060',
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

-- CRMV validado do encaminhante (snapshot no encaminhamento)
INSERT INTO public.professional_registrations (
    veterinarian_id, crmv_number, state_uf, status, crmv_status, validated_at
) VALUES (
    'c2222222-2222-2222-2222-222222222222', 'CRMV-F12-TEST', 'SP', 'active_regular', 'validated', NOW()
) ON CONFLICT (crmv_number, state_uf) DO NOTHING;

-- Especialidade propria do teste
INSERT INTO public.specialties (id, name)
VALUES ('10300000-0000-4000-8000-000000000061', 'Dermatologia Fase 12 Teste')
ON CONFLICT (id) DO NOTHING;

-- Especialista (ativo, verificado, CRMV validado, especialidade vinculada)
INSERT INTO public.users (id, email, full_name, system_role)
VALUES ('10300000-0000-4000-8000-000000000062', 'vet.especialista.phase12@example.test', 'Veterinaria Especialista F12', 'veterinarian')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.veterinarians (id, user_id, is_active, is_verified)
VALUES ('10300000-0000-4000-8000-000000000063', '10300000-0000-4000-8000-000000000062', TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.professional_registrations (veterinarian_id, crmv_number, state_uf, status, crmv_status, validated_at)
VALUES ('10300000-0000-4000-8000-000000000063', 'CRMV-F12-ESP', 'SP', 'active_regular', 'validated', NOW())
ON CONFLICT (crmv_number, state_uf) DO NOTHING;
INSERT INTO public.veterinarian_specialties (veterinarian_id, specialty_id)
VALUES ('10300000-0000-4000-8000-000000000063', '10300000-0000-4000-8000-000000000061')
ON CONFLICT DO NOTHING;

-- Veterinario verificado sem vinculo com o pet e sem a especialidade (caso negativo)
INSERT INTO public.users (id, email, full_name, system_role)
VALUES ('10300000-0000-4000-8000-000000000064', 'vet.estranho.phase12@example.test', 'Veterinario Estranho F12', 'veterinarian')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.veterinarians (id, user_id, is_active, is_verified)
VALUES ('10300000-0000-4000-8000-000000000065', '10300000-0000-4000-8000-000000000064', TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Exame do pet para teste de anexo
INSERT INTO public.exams (id, tenant_id, pet_id, veterinarian_id, title)
VALUES (
    '10300000-0000-4000-8000-000000000066',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'a5555555-5555-5555-5555-555555555555',
    'c2222222-2222-2222-2222-222222222222',
    'Hemograma Fase 12'
) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Estrutura (1-20)
-- ---------------------------------------------------------------------------
SELECT has_table('public', 'referral_documents', 'Tabela de anexos de encaminhamento existe.');
SELECT has_table('public', 'referral_returns', 'Tabela de retornos de encaminhamento existe.');
SELECT has_column('public', 'referrals_clinical', 'modality', 'Encaminhamento registra modalidade (teletriagem/teleorientacao/presencial).');
SELECT has_column('public', 'referrals_clinical', 'scopes', 'Encaminhamento registra escopo minimo concedido.');
SELECT has_column('public', 'referrals_clinical', 'expiration_days', 'Encaminhamento registra prazo de aceite em dias.');
SELECT has_column('public', 'referrals_clinical', 'expires_at', 'Encaminhamento calcula vencimento do prazo.');
SELECT has_column('public', 'referrals_clinical', 'referring_veterinarian_name', 'Encaminhamento preserva snapshot do encaminhante.');
SELECT has_column('public', 'referrals_clinical', 'referring_crmv_number', 'Encaminhamento preserva CRMV do encaminhante.');
SELECT has_column('public', 'referrals_clinical', 'target_veterinarian_id', 'Encaminhamento pode ser direcionado a um especialista.');
SELECT has_column('public', 'referrals_clinical', 'accepted_by', 'Encaminhamento registra quem assumiu.');
SELECT has_column('public', 'referrals_clinical', 'rejection_reason', 'Recusa guarda o motivo informado.');
SELECT has_column('public', 'referrals_clinical', 'return_medical_record_id', 'Retorno liga ao registro do prontuario.');

SELECT has_function('public', 'list_referral_candidates', ARRAY['uuid', 'character varying'], 'Candidatos a especialista sao listados por RPC.');
SELECT has_function('public', 'create_referral', ARRAY['uuid', 'uuid', 'text', 'text', 'referral_priority_type', 'referral_modality_type', 'uuid', 'text[]', 'integer', 'uuid'], 'Criacao de encaminhamento e feita por RPC autorizada.');
SELECT has_function('public', 'accept_referral', ARRAY['uuid'], 'Aceite do encaminhamento e feito por RPC autorizada.');
SELECT has_function('public', 'update_referral_status', ARRAY['uuid', 'text', 'text'], 'Transicoes de estado sao feitas por RPC autorizada.');
SELECT has_function('public', 'attach_referral_document', ARRAY['uuid', 'uuid', 'uuid', 'text'], 'Anexo de documento/exame e feito por RPC autorizada.');
SELECT has_function('public', 'record_referral_return', ARRAY['uuid', 'text', 'text', 'text', 'timestamp with time zone'], 'Retorno do especialista e feito por RPC autorizada.');
SELECT has_function('public', 'list_pet_referrals', ARRAY['uuid'], 'Lista de encaminhamentos do pet e lida por RPC auditada.');
SELECT has_function('public', 'get_referral_detail', ARRAY['uuid'], 'Detalhe do encaminhamento e lido por RPC auditada.');

-- ---------------------------------------------------------------------------
-- RLS e privilegios (21-25)
-- ---------------------------------------------------------------------------
SELECT has_policy('public', 'referral_documents', 'policy_referral_documents_read_authorized', 'Anexos tem leitura autorizada por RLS.');
SELECT has_policy('public', 'referral_returns', 'policy_referral_returns_read_authorized', 'Retornos tem leitura autorizada por RLS.');

SET LOCAL ROLE anon;
SELECT throws_ok(
    $$ SELECT * FROM public.referral_documents $$,
    '42501',
    'permission denied for table referral_documents',
    'anon nao le anexos de encaminhamento.'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '10300000-0000-4000-8000-000000000062';
SELECT throws_ok(
    $$ INSERT INTO public.referral_documents (tenant_id, referral_id, pet_id) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10300000-0000-4000-8000-000000000099', 'a5555555-5555-5555-5555-555555555555') $$,
    '42501',
    'permission denied for table referral_documents',
    'DML direto em anexos e revogado (somente RPC).'
);
SELECT throws_ok(
    $$ UPDATE public.referral_returns SET return_summary = 'x' WHERE false $$,
    '42501',
    'permission denied for table referral_returns',
    'UPDATE direto em retornos e revogado (somente RPC).'
);
RESET ROLE;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Criacao e validacoes (26-35)
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claim.sub" = 'c1111111-1111-1111-1111-111111111111';
SET LOCAL "app.current_tenant_id" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

CREATE TEMPORARY TABLE phase12_ids (k TEXT PRIMARY KEY, v UUID);

INSERT INTO phase12_ids VALUES ('r1', public.create_referral(
    'a5555555-5555-5555-5555-555555555555',
    '10300000-0000-4000-8000-000000000061',
    'Lesao dermatologica persistente',
    'Alopecia em flanco esquerdo sem resposta a terapeutica inicial',
    'routine', 'teletriage',
    '10300000-0000-4000-8000-000000000063',
    ARRAY['read_clinical', 'exams']::TEXT[],
    7, NULL
));
SELECT ok(((SELECT v FROM phase12_ids WHERE k = 'r1') IS NOT NULL), 'Veterinario com vinculo cria encaminhamento com escopo e prazo.');

SELECT ok(
    (SELECT referring_crmv_number = 'CRMV-F12-TEST' FROM public.referrals_clinical WHERE id = (SELECT v FROM phase12_ids WHERE k = 'r1')),
    'Snapshot do encaminhante preserva o CRMV validado no momento do encaminhamento.'
);
SELECT ok(
    (SELECT expires_at - created_at = INTERVAL '7 days' FROM public.referrals_clinical WHERE id = (SELECT v FROM phase12_ids WHERE k = 'r1')),
    'Vencimento do prazo e calculado a partir do prazo informado.'
);
SELECT throws_ok(
    $$ SELECT public.create_referral('a5555555-5555-5555-5555-555555555555', '10300000-0000-4000-8000-000000000061', '   ') $$,
    '22023',
    'Informe o motivo do encaminhamento.',
    'Encaminhamento sem motivo e rejeitado.'
);
SELECT throws_ok(
    $$ SELECT public.create_referral('a5555555-5555-5555-5555-555555555555', '10300000-0000-4000-8000-000000000061', 'Motivo valido', NULL, 'routine', 'teletriage', NULL, NULL, 0) $$,
    '22023',
    'Prazo de aceite deve estar entre 1 e 90 dias.',
    'Prazo de aceite zero e rejeitado.'
);
SELECT throws_ok(
    $$ SELECT public.create_referral('a5555555-5555-5555-5555-555555555555', '10300000-0000-4000-8000-000000000061', 'Motivo valido', NULL, 'routine', 'teletriage', NULL, NULL, 91) $$,
    '22023',
    'Prazo de aceite deve estar entre 1 e 90 dias.',
    'Prazo de aceite acima de 90 dias e rejeitado.'
);
SELECT throws_ok(
    $$ SELECT public.create_referral('a5555555-5555-5555-5555-555555555555', '10300000-0000-4000-8000-000000000061', 'Motivo valido', NULL, 'routine', 'teletriage', NULL, ARRAY['all']::TEXT[]) $$,
    '22023',
    'Escopo de acesso do especialista invalido.',
    'Escopo generico (all) e rejeitado: somente escopo minimo explicito.'
);
SELECT throws_ok(
    $$ SELECT public.create_referral('a5555555-5555-5555-5555-555555555555', '10300000-0000-4000-8000-000000000061', 'Motivo valido', NULL, 'routine', 'teletriage', 'c2222222-2222-2222-2222-222222222222') $$,
    '22023',
    'Nao e possivel encaminhar para si mesmo.',
    'Encaminhamento para si mesmo e rejeitado.'
);

-- Veterinario verificado sem vinculo assistencial nao encaminha
    'Especialista com especialidade e CRMV validado aparece como candidato.'
);

-- ---------------------------------------------------------------------------
-- Fluxo: aceite, transicoes e anexos (37-46)
-- ---------------------------------------------------------------------------
-- r2: pendente sem alvo | r3: direcionado ao especialista | r4: prazo de 1 dia
INSERT INTO phase12_ids VALUES ('r2', public.create_referral(
    'a5555555-5555-5555-5555-555555555555',
    '10300000-0000-4000-8000-000000000061',
    'Segunda lesao para fluxo de recusa', NULL, 'routine', 'teletriage', NULL, NULL, 7, NULL
));
INSERT INTO phase12_ids VALUES ('r3', public.create_referral(
    'a5555555-5555-5555-5555-555555555555',
    '10300000-0000-4000-8000-000000000061',
    'Encaminhamento direcionado', NULL, 'urgent', 'teleorientation',
    '10300000-0000-4000-8000-000000000063', NULL, 7, NULL
));
INSERT INTO phase12_ids VALUES ('r4', public.create_referral(
    'a5555555-5555-5555-5555-555555555555',
    '10300000-0000-4000-8000-000000000061',
    'Encaminhamento com prazo curto', NULL, 'routine', 'teletriage',
    '10300000-0000-4000-8000-000000000063', NULL, 1, NULL
));

-- Encaminhante nao assume o proprio encaminhamento
SELECT throws_ok(
    format($$ SELECT public.accept_referral('%s') $$, (SELECT v FROM phase12_ids WHERE k = 'r2')),
    '42501',
    'O profissional encaminhante nao pode assumir o proprio encaminhamento.',
    'Encaminhante nao aceita o proprio encaminhamento.'
);
-- Especialista direcionado bloqueia terceiros enquanto pendente
SET LOCAL "request.jwt.claim.sub" = '10300000-0000-4000-8000-000000000064';
SELECT throws_ok(
    format($$ SELECT public.accept_referral('%s') $$, (SELECT v FROM phase12_ids WHERE k = 'r3')),
    '42501',
    'Este encaminhamento foi direcionado a outro especialista.',
    'Especialista direcionado impede que terceiro assuma.'
);
-- Tutor nao gerencia encaminhamentos
SET LOCAL "request.jwt.claim.sub" = 'a3333333-3333-3333-3333-333333333333';
SELECT throws_ok(
    format($$ SELECT public.accept_referral('%s') $$, (SELECT v FROM phase12_ids WHERE k = 'r2')),
    '42501',
    'Apenas veterinario verificado pode gerenciar encaminhamentos.',
    'Tutor nao aceita encaminhamentos.'
);

-- Especialista aceita r1; re-aceite e negado; r3 (direcionado) tambem aceito
SET LOCAL "request.jwt.claim.sub" = '10300000-0000-4000-8000-000000000062';
SELECT ok(
    ((public.accept_referral((SELECT v FROM phase12_ids WHERE k = 'r1')))->>'status') = 'accepted',
    'Especialista aceita o encaminhamento e assume a responsabilidade.'
);
SELECT throws_ok(
    format($$ SELECT public.accept_referral('%s') $$, (SELECT v FROM phase12_ids WHERE k = 'r1')),
    '22023',
    'So e possivel aceitar encaminhamento pendente.',
    'Re-aceite de encaminhamento ja aceito e negado.'
);
SELECT ok(
    ((public.accept_referral((SELECT v FROM phase12_ids WHERE k = 'r3')))->>'status') = 'accepted',
    'Especialista direcionado aceita o proprio encaminhamento.'
);
SELECT ok(
    ((public.update_referral_status((SELECT v FROM phase12_ids WHERE k = 'r1'), 'in_progress', NULL))->>'status') = 'in_progress',
    'Especialista assumido move o encaminhamento para em atendimento.'
);
-- So o encaminhante cancela; especialista nao pode cancelar
SELECT throws_ok(
    format($$ SELECT public.update_referral_status('%s', 'cancelled', NULL) $$, (SELECT v FROM phase12_ids WHERE k = 'r3')),
    '22023',
    'Transicao de estado invalida para o encaminhamento.',
    'Especialista nao cancela encaminhamento ativo.'
);
-- Anexo do exame ao encaminhamento ativo
SELECT ok(
    (public.attach_referral_document(
        (SELECT v FROM phase12_ids WHERE k = 'r1'),
        NULL, '10300000-0000-4000-8000-000000000066', 'Hemograma solicitado para o especialista'
    )) IS NOT NULL,
    'Especialista anexa exame do pet ao encaminhamento.'
);
SELECT throws_ok(
    format($$ SELECT public.attach_referral_document('%s', NULL, NULL, 'sem item') $$, (SELECT v FROM phase12_ids WHERE k = 'r1')),
    '22023',
    'Informe um documento ou um exame para anexar.',
    'Anexo sem documento/exame e rejeitado.'
);

SET LOCAL "request.jwt.claim.sub" = '10300000-0000-4000-8000-000000000064';
SELECT throws_ok(
    $$ SELECT public.create_referral('a5555555-5555-5555-5555-555555555555', '10300000-0000-4000-8000-000000000061', 'Motivo valido') $$,
    '42501',
    'Apenas veterinario com vinculo assistencial pode encaminhar o pet.',
    'Veterinario sem vinculo assistencial nao encaminha.'
);

-- Tutor nao consulta o catalogo de candidatos
SET LOCAL "request.jwt.claim.sub" = 'a3333333-3333-3333-3333-333333333333';
SELECT throws_ok(
    $$ SELECT public.list_referral_candidates('10300000-0000-4000-8000-000000000061') $$,
    '42501',
    'Apenas veterinarios podem listar candidatos a especialista.',
    'Tutor nao lista candidatos a especialista.'
);

-- Veterinario lista apenas candidatos verificados com CRMV validado
SET LOCAL "request.jwt.claim.sub" = 'c1111111-1111-1111-1111-111111111111';
SELECT ok(
    (SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(public.list_referral_candidates('10300000-0000-4000-8000-000000000061')->'candidates') c
        WHERE c->>'veterinarian_id' = '10300000-0000-4000-8000-000000000063'
    )),
    'Especialista com especialidade e CRMV validado aparece como candidato.'
);

