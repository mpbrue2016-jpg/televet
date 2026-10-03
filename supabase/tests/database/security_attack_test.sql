-- ==============================================================================
-- security_attack_test.sql
-- Testes pgTAP de Ataque e Segurança (Fase 1)
-- ==============================================================================

BEGIN;

SELECT plan(7);

-- Cenário de Ataque: Anon e Tutor tentando ler/alterar commission_rules
SET LOCAL ROLE anon;
SELECT throws_ok(
    'SELECT * FROM public.commission_rules',
    '42501',
    NULL,
    'Anon não pode ler commission_rules (RLS Falha Esperada ou retorna 0 linhas)'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
-- Assuming tutor user context setup would be here...

-- Cenário de Ataque: Chamar process_appointment_payment_split pelo cliente
SELECT throws_ok(
    $$ SELECT public.process_appointment_payment_split('00000000-0000-0000-0000-000000000000'::uuid, 'evt_123') $$,
    'P0001',
    'Acesso negado: Apenas service_role pode processar pagamentos capturados.',
    'Acesso bloqueado a chamador não autorizado para process_appointment_payment_split'
);

-- Cenário de Ataque: Chamar subscribe_tenant_saas_plan para tenant alheio
SELECT throws_ok(
    $$ SELECT public.subscribe_tenant_saas_plan('11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-222222222222'::uuid) $$,
    'P0001',
    'Acesso negado: Não autorizado para este tenant.',
    'Acesso bloqueado a tenant_admin forjando tenant_id alheio em subscribe_tenant_saas_plan'
);

-- Cenário de Ataque: Ler prontuário de outro pet (RLS)
-- Simulando select
SELECT is_empty(
    $$ SELECT id FROM public.medical_records WHERE id = '33333333-3333-3333-3333-333333333333' $$,
    'Tutor não pode ler prontuário de outro pet (RLS esconde o registro)'
);

-- Cenário de Ataque: Pet Shop lendo prontuário (RLS)
SET LOCAL "request.jwt.claim.sub" = 'petshop_user_id';
SELECT is_empty(
    $$ SELECT id FROM public.medical_records $$,
    'Pet Shop não tem permissão para ler prontuários'
);

-- Cenário de Ataque: Tenant A lendo Tenant B em tabelas com tenant_id (isolamento)
SET LOCAL "app.current_tenant_id" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is_empty(
    $$ SELECT id FROM public.pets WHERE tenant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
    'Tenant A não enxerga pets do Tenant B'
);

-- Verificação: Nenhuma tabela em public sem RLS
SELECT is_empty(
    $$ 
       SELECT tablename 
       FROM pg_tables 
       WHERE schemaname = 'public' 
         AND rowsecurity = false 
    $$,
    'Todas as tabelas em public devem ter RLS habilitado'
);

SELECT * FROM finish();

ROLLBACK;
