-- ==============================================================================
-- admin_master_test.sql
-- Fase 15: Admin Master, Analytics com Origem Real, Governança e Suporte
-- Testes de Aceite: Bloqueio de Não-Admins, Auditoria Sensível, Métricas e Isolamento
-- ==============================================================================

BEGIN;
SELECT plan(16);

-- ---------------------------------------------------------------------------
-- 1. Verificação Estrutural de Tabelas da Fase 15
-- ---------------------------------------------------------------------------

SELECT has_table('public', 'admin_user_profiles', 'Tabela admin_user_profiles existe');
SELECT has_table('public', 'admin_sensitive_access_logs', 'Tabela admin_sensitive_access_logs existe');
SELECT has_table('public', 'sponsors_and_advertisers', 'Tabela sponsors_and_advertisers existe');
SELECT has_table('public', 'support_ticket_messages', 'Tabela support_ticket_messages existe');
SELECT has_table('public', 'support_ticket_attachments', 'Tabela support_ticket_attachments existe');

-- ---------------------------------------------------------------------------
-- 2. Fixtures: Usuários de Teste (Admin, Tutor, Veterinário e Tenant Admin)
-- ---------------------------------------------------------------------------

-- Tenant de Teste
INSERT INTO public.tenants (id, name, slug)
VALUES ('77777777-7777-7777-7777-777777777777', 'Tenant Teste F15', 'tenant-teste-f15')
ON CONFLICT (id) DO NOTHING;

-- Superadmin
INSERT INTO public.users (id, tenant_id, email, full_name, role, is_superadmin, system_role, is_active, account_status)
VALUES (
    '11111111-1111-4000-8000-000000000001',
    '77777777-7777-7777-7777-777777777777',
    'admin.master@televet.test',
    'Superadmin Master',
    'superadmin',
    true,
    'superadmin',
    true,
    'active'
)
ON CONFLICT (id) DO UPDATE SET is_superadmin = true, system_role = 'superadmin';

-- Tutor
INSERT INTO public.users (id, tenant_id, email, full_name, role, is_superadmin, system_role, is_active, account_status)
VALUES (
    '22222222-2222-4000-8000-000000000002',
    '77777777-7777-7777-7777-777777777777',
    'tutor.comum@televet.test',
    'Tutor Comum',
    'tutor',
    false,
    'tutor',
    true,
    'active'
)
ON CONFLICT (id) DO UPDATE SET is_superadmin = false, system_role = 'tutor';

-- Veterinário
INSERT INTO public.users (id, tenant_id, email, full_name, role, is_superadmin, system_role, is_active, account_status)
VALUES (
    '33333333-3333-4000-8000-000000000003',
    '77777777-7777-7777-7777-777777777777',
    'vet.comum@televet.test',
    'Dr. Veterinario',
    'veterinarian',
    false,
    'veterinarian',
    true,
    'active'
)
ON CONFLICT (id) DO UPDATE SET is_superadmin = false, system_role = 'veterinarian';

-- Tenant Admin (Gestor de Loja)
INSERT INTO public.users (id, tenant_id, email, full_name, role, is_superadmin, system_role, is_active, account_status)
VALUES (
    '44444444-4444-4444-8000-000000000004',
    '77777777-7777-7777-7777-777777777777',
    'gestor.petshop@televet.test',
    'Gestor Pet Shop',
    'tenant_admin',
    false,
    'tenant_admin',
    true,
    'active'
)
ON CONFLICT (id) DO UPDATE SET is_superadmin = false, system_role = 'tenant_admin';

-- ---------------------------------------------------------------------------
-- 3. Teste de Aceite: Tutor, Veterinário e Tenant_admin NÃO acessam o Admin Master
-- ---------------------------------------------------------------------------

-- Simular autenticação como Tutor
SET LOCAL "request.jwt.claim.sub" = '22222222-2222-4000-8000-000000000002';
SELECT throws_ok(
    'SELECT public.fn_assert_admin_master_access()',
    '42501',
    'Acesso negado: apenas o Administrador Master tem acesso ao painel de controle global.',
    'Tutor não consegue acessar o Admin Master (lança 42501)'
);

-- Simular autenticação como Veterinário
SET LOCAL "request.jwt.claim.sub" = '33333333-3333-4000-8000-000000000003';
SELECT throws_ok(
    'SELECT public.fn_assert_admin_master_access()',
    '42501',
    'Acesso negado: apenas o Administrador Master tem acesso ao painel de controle global.',
    'Veterinário não consegue acessar o Admin Master (lança 42501)'
);

-- Simular autenticação como Tenant Admin (Gestor de Loja)
SET LOCAL "request.jwt.claim.sub" = '44444444-4444-4444-8000-000000000004';
SELECT throws_ok(
    'SELECT public.fn_assert_admin_master_access()',
    '42501',
    'Acesso negado: apenas o Administrador Master tem acesso ao painel de controle global.',
    'Tenant Admin de loja não consegue acessar o Admin Master (lança 42501)'
);

-- ---------------------------------------------------------------------------
-- 4. Teste de Aceite: Ações administrativas sensíveis geram auditoria
-- ---------------------------------------------------------------------------

-- Autenticar como Superadmin Master
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-4000-8000-000000000001';

-- Executar registro justificado de acesso sensível
SELECT is(
    (SELECT (public.fn_admin_log_sensitive_access(
        'medical_records',
        'rec_test_999',
        'Auditoria pericial solicitada por autoridade sanitária'
    )->>'success')::boolean),
    true,
    'Acesso sensível com justificativa formal é registrado com sucesso'
);

SELECT ok(
    EXISTS (
        SELECT 1 FROM public.admin_sensitive_access_logs 
        WHERE target_entity = 'medical_records' 
          AND target_entity_id = 'rec_test_999'
    ),
    'Acesso registrado na tabela admin_sensitive_access_logs'
);

SELECT ok(
    EXISTS (
        SELECT 1 FROM public.audit_logs 
        WHERE entity = 'medical_records' 
          AND entity_id = 'rec_test_999'
          AND action = 'ADMIN_SENSITIVE_ACCESS'
    ),
    'Acesso registrado na trilha geral de auditoria audit_logs'
);

-- Teste do recurso "Ver Como Usuário" (Simulação Somente Leitura)
SELECT is(
    (SELECT (public.fn_admin_generate_view_as_token(
        '22222222-2222-4000-8000-000000000002'::uuid,
        'Verificação de visualização de agendamento em suporte técnico'
    )->>'read_only')::boolean),
    true,
    'Recurso Ver Como Usuário retorna flag estrita read_only = true'
);

-- ---------------------------------------------------------------------------
-- 5. Teste de Aceite: Moderação de Veterinários gera auditoria e atualiza CRMV
-- ---------------------------------------------------------------------------

-- Inserir Veterinário e Registro de Teste
INSERT INTO public.veterinarians (id, user_id, is_verified, is_active)
VALUES ('55555555-5555-4000-8000-000000000005', '33333333-3333-4000-8000-000000000003', false, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.professional_registrations (id, veterinarian_id, crmv_number, state_uf, crmv_status)
VALUES ('66666666-6666-4000-8000-000000000006', '55555555-5555-4000-8000-000000000005', '12345', 'SP', 'pending')
ON CONFLICT (id) DO NOTHING;

SELECT is(
    (SELECT (public.fn_admin_review_veterinarian(
        '55555555-5555-4000-8000-000000000005'::uuid,
        'approve',
        'Documentos conferidos no portal oficial do CRMV-SP.'
    )->>'crmv_status')),
    'validated',
    'Aprovação administrativa valida CRMV e ativa o profissional'
);

-- ---------------------------------------------------------------------------
-- 6. Teste de Aceite: Métricas com Origem Real nos Dados
-- ---------------------------------------------------------------------------

SELECT ok(
    (SELECT (public.fn_get_admin_master_real_analytics()->'financial'->>'mrr_cents') IS NOT NULL),
    'Analytics real retorna estrutura financeira com origem nos dados'
);

SELECT ok(
    (SELECT jsonb_array_length(public.fn_get_admin_master_real_analytics()->'insufficient_data_notes') > 0),
    'Métricas sem volume estatístico suficiente são documentadas em insufficient_data_notes'
);

-- ---------------------------------------------------------------------------
-- 7. Teste de Aceite: Isolamento de Tickets, Mensagens e Anexos Privados
-- ---------------------------------------------------------------------------

-- Criar Ticket
INSERT INTO public.support_tickets (id, tenant_id, user_id, title, description, status, priority)
VALUES (
    '88888888-8888-4000-8000-000000000008',
    '77777777-7777-7777-7777-777777777777',
    '22222222-2222-4000-8000-000000000002', -- Aberto pelo tutor
    'Dúvida sobre receita',
    'Não consegui abrir o anexo',
    'open',
    'high'
)
ON CONFLICT (id) DO NOTHING;

-- Mensagem pública (visível ao tutor)
INSERT INTO public.support_ticket_messages (id, ticket_id, user_id, is_internal_note, message)
VALUES (
    '99999999-9999-4000-8000-000000000001',
    '88888888-8888-4000-8000-000000000008',
    '11111111-1111-4000-8000-000000000001',
    false,
    'Olá! Estamos reenviando o link seguro.'
)
ON CONFLICT (id) DO NOTHING;

-- Nota interna confidencial (exclusiva do suporte/admin)
INSERT INTO public.support_ticket_messages (id, ticket_id, user_id, is_internal_note, message)
VALUES (
    '99999999-9999-4000-8000-000000000002',
    '88888888-8888-4000-8000-000000000008',
    '11111111-1111-4000-8000-000000000001',
    true,
    'NOTA INTERNA: Cliente teve erro de timeout no gateway de e-mail. Verificar Resend.'
)
ON CONFLICT (id) DO NOTHING;

-- Anexo privado confidencial
INSERT INTO public.support_ticket_attachments (id, ticket_id, file_name, file_url, is_private)
VALUES (
    'aaaaaaaa-aaaa-4000-8000-000000000001',
    '88888888-8888-4000-8000-000000000008',
    'internal_error_stack.log',
    'https://storage.televet.io/internal/error.log',
    true -- PRIVADO
)
ON CONFLICT (id) DO NOTHING;

-- Superadmin visualiza as duas mensagens (pública + nota interna)
SELECT is(
    (SELECT COUNT(*) FROM public.support_ticket_messages WHERE ticket_id = '88888888-8888-4000-8000-000000000008'),
    2::bigint,
    'Superadmin tem visibilidade completa de mensagens públicas e notas internas'
);

-- Superadmin tem acesso ao anexo privado
SELECT is(
    (SELECT COUNT(*) FROM public.support_ticket_attachments WHERE ticket_id = '88888888-8888-4000-8000-000000000008'),
    1::bigint,
    'Superadmin acessa anexos confidenciais da equipe'
);

-- Teste de Isolamento RLS com Tutor Autenticado
SET LOCAL "request.jwt.claim.sub" = '22222222-2222-4000-8000-000000000002';

-- Tutor vê apenas a mensagem pública (is_internal_note = false)
SELECT is(
    (SELECT COUNT(*) FROM public.support_ticket_messages WHERE ticket_id = '88888888-8888-4000-8000-000000000008'),
    1::bigint,
    'Isolamento RLS: Tutor NÃO vê notas internas confidenciais da equipe'
);

-- Tutor NÃO tem acesso ao anexo privado (is_private = true)
SELECT is(
    (SELECT COUNT(*) FROM public.support_ticket_attachments WHERE ticket_id = '88888888-8888-4000-8000-000000000008'),
    0::bigint,
    'Isolamento RLS: Tutor NÃO tem acesso a anexos marcados como privados'
);

SELECT * FROM finish();
ROLLBACK;
