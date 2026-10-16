-- ==============================================================================
-- pet_medical_records_test.sql
-- Fase 10: Prontuario por pet, controle de acesso, auditoria e imutabilidade
-- ==============================================================================

BEGIN;
SELECT plan(37);

INSERT INTO public.appointments (
    id, tenant_id, petshop_id, tutor_id, pet_id, veterinarian_id, scheduled_for,
    starts_at, ends_at, lifecycle_status, reservation_status
) VALUES (
    '10300000-0000-4000-8000-000000000010',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'a1111111-1111-1111-1111-111111111111',
    'a4444444-4444-4444-4444-444444444444',
    'a5555555-5555-5555-5555-555555555555',
    'c2222222-2222-2222-2222-222222222222',
    NOW(), NOW() - INTERVAL '1 minute', NOW() + INTERVAL '29 minutes',
    'realizado', 'completed'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.medical_records (
    id, tenant_id, pet_id, veterinarian_id, entry_type, title, details,
    diagnosis, plan, author_crmv_number, author_crmv_uf, signed_at, signed_by
) VALUES (
    '10300000-0000-4000-8000-000000000011',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'a5555555-5555-5555-5555-555555555555',
    'c2222222-2222-2222-2222-222222222222',
    'clinical_note', 'Registro Fase 10', 'Detalhe clínico de teste',
    'Diagnóstico de teste', 'Plano de teste', 'CRMV-SP 45892', 'SP', NOW(),
    'c1111111-1111-1111-1111-111111111111'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.consultations (
    id, tenant_id, appointment_id, tutor_id, pet_id, veterinarian_id, status
) VALUES (
    '10300000-0000-4000-8000-000000000012',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '10300000-0000-4000-8000-000000000010',
    'a4444444-4444-4444-4444-444444444444',
    'a5555555-5555-5555-5555-555555555555',
    'c2222222-2222-2222-2222-222222222222',
    'finished'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clinical_medication_catalog (
    id, name, active_ingredient, presentation, requires_qualified_signature
) VALUES (
    '10300000-0000-4000-8000-000000000013',
    'Medicamento Controlado Fase 10',
    'substância controlada de teste',
    'comprimido',
    TRUE
) ON CONFLICT (id) DO NOTHING;

SELECT has_column('public', 'medical_records', 'complaint', 'Registro clínico contém queixa SOAP.');
SELECT has_column('public', 'medical_records', 'vital_signs', 'Registro clínico contém parâmetros vitais.');
SELECT has_column('public', 'medical_records', 'author_crmv_number', 'Registro preserva CRMV do autor.');
SELECT has_column('public', 'medical_records', 'signed_at', 'Registro contém assinatura e data.');
SELECT has_table('public', 'record_access_grants', 'Autorizações de acesso revogáveis existem.');
SELECT has_table('public', 'record_access_log', 'Log append-only de acesso clínico existe.');
SELECT has_table('public', 'medical_record_addenda', 'Adendos append-only existem.');
SELECT has_table('public', 'clinical_medication_catalog', 'Catálogo de medicamentos é administrável no banco.');
SELECT has_table('public', 'prescription_signature_requests', 'Fila ICP-Brasil pendente existe.');
SELECT has_table('public', 'teleconsultation_status_updates', 'Realtime clínico usa uma projeção sem dados privados.');
SELECT has_function('public', 'can_access_pet_record', ARRAY['uuid', 'text'], 'A autorização de prontuário é centralizada no banco.');
SELECT has_function('public', 'get_pet_medical_timeline', ARRAY['uuid', 'timestamp with time zone', 'timestamp with time zone', 'uuid', 'text', 'text'], 'Timeline filtra e audita leituras.');
SELECT has_function('public', 'append_medical_record_addendum', ARRAY['uuid', 'text', 'text'], 'Correções usam adendo imutável.');
SELECT has_function('public', 'request_medical_record_access', ARRAY['uuid', 'uuid', 'text[]', 'timestamp with time zone'], 'Tutor autoriza veterinário por escopo e validade.');
SELECT has_function('public', 'verify_prescription_public', ARRAY['text'], 'Verificação pública não retorna dados clínicos.');
SELECT has_function('public', 'register_clinical_document', ARRAY['uuid', 'text', 'text', 'text', 'bigint', 'text', 'uuid', 'uuid', 'text'], 'Documentos são vinculados por função validada.');
SELECT has_function('public', 'create_clinical_referral', ARRAY['uuid', 'uuid', 'text', 'text', 'referral_priority_type', 'uuid', 'uuid'], 'Encaminhamento clínico usa RPC autorizada.');
SELECT has_policy('public', 'medical_records', 'policy_medical_records_read_authorized', 'Leitura do prontuário passa pela autorização clínica.');
SELECT has_policy('storage', 'objects', 'policy_clinical_documents_storage_read', 'Storage clínico privado verifica grant e metadado.');
SELECT has_policy('public', 'teleconsultation_status_updates', 'policy_teleconsultation_status_participant_read', 'Status realtime só é visível aos participantes autorizados.');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.record_access_grants'::regclass), 'RLS habilitado nos grants.');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.record_access_log'::regclass), 'RLS habilitado no log.');
SELECT ok(NOT has_table_privilege('authenticated', 'public.consultations', 'SELECT'), 'Cliente não pode ler a tabela clínica privada por Realtime/PostgREST.');
SELECT ok(EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'teleconsultation_status_updates'), 'A publicação Realtime contém a projeção sanitizada.');
SELECT ok(NOT has_table_privilege('authenticated', 'public.medical_records', 'UPDATE'), 'Cliente autenticado não pode editar diretamente registros clínicos.');
SELECT ok(NOT has_table_privilege('authenticated', 'public.prescriptions', 'INSERT'), 'Cliente autenticado não pode inserir receitas diretamente.');
SELECT ok(NOT has_table_privilege('authenticated', 'public.referrals_clinical', 'INSERT'), 'Cliente autenticado não pode gravar encaminhamentos diretamente.');

SET LOCAL "request.jwt.claim.sub" = 'a3333333-3333-3333-3333-333333333333';
SET LOCAL "app.current_tenant_id" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT ok(public.can_access_pet_record('a5555555-5555-5555-5555-555555555555', 'read_clinical'), 'Tutor responsável acessa o prontuário do próprio pet.');
SELECT ok((public.get_pet_medical_timeline('a5555555-5555-5555-5555-555555555555')->'timeline') IS NOT NULL, 'Leitura de timeline cria uma resposta auditada.');
SELECT ok((SELECT count(*) > 0 FROM public.record_access_log WHERE pet_id = 'a5555555-5555-5555-5555-555555555555' AND purpose = 'pet_timeline'), 'A leitura do prontuário foi registrada no log.');

INSERT INTO public.users (id, email, full_name, system_role)
VALUES ('10300000-0000-4000-8000-000000000014', 'vet.access.phase10@example.test', 'Veterinário Grant Teste', 'veterinarian')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.veterinarians (id, user_id, is_active, is_verified)
VALUES ('10300000-0000-4000-8000-000000000015', '10300000-0000-4000-8000-000000000014', TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.professional_registrations (veterinarian_id, crmv_number, state_uf, status, crmv_status, validated_at)
VALUES ('10300000-0000-4000-8000-000000000015', 'CRMV-TEST-10', 'SP', 'active_regular', 'validated', NOW())
ON CONFLICT (crmv_number, state_uf) DO NOTHING;
INSERT INTO public.veterinarian_tenants (tenant_id, veterinarian_id, status)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10300000-0000-4000-8000-000000000015', 'active')
ON CONFLICT (tenant_id, veterinarian_id) DO NOTHING;

CREATE TEMPORARY TABLE phase10_grant_id (id UUID);
INSERT INTO phase10_grant_id
SELECT public.request_medical_record_access(
    'a5555555-5555-5555-5555-555555555555',
    '10300000-0000-4000-8000-000000000015',
    ARRAY['read_clinical'],
    NOW() + INTERVAL '30 days'
);
SET LOCAL "request.jwt.claim.sub" = '10300000-0000-4000-8000-000000000014';
SELECT ok(
    public.can_access_pet_record('a5555555-5555-5555-5555-555555555555', 'read_clinical'),
    'Grant tutor válido permite leitura ao veterinário autorizado.'
);
SET LOCAL "request.jwt.claim.sub" = 'a3333333-3333-3333-3333-333333333333';
SELECT ok(
    public.revoke_medical_record_access((SELECT id FROM phase10_grant_id)),
    'Tutor responsável pode revogar a autorização.'
);
SET LOCAL "request.jwt.claim.sub" = '10300000-0000-4000-8000-000000000014';
SELECT ok(
    NOT public.can_access_pet_record('a5555555-5555-5555-5555-555555555555', 'read_clinical'),
    'Revogação remove o acesso clínico quando não há outra relação assistencial.'
);

SET LOCAL "request.jwt.claim.sub" = 'c1111111-1111-1111-1111-111111111111';
SELECT ok(
    (public.issue_digital_prescription(
        '10300000-0000-4000-8000-000000000012',
        '[{"catalog_id":"10300000-0000-4000-8000-000000000013","dosage":"1 comprimido","frequency":"24/24h","duration":"7 dias","route":"oral"}]'::jsonb,
        NULL
    )->>'status') = 'pending_configuration'
    AND NOT EXISTS (
        SELECT 1 FROM public.prescriptions
        WHERE consultation_id = '10300000-0000-4000-8000-000000000012'
    ),
    'Medicamento controlado não emite receita enquanto ICP-Brasil está pendente.'
);

SET LOCAL "request.jwt.claim.sub" = 'a2222222-2222-2222-2222-222222222222';
SELECT ok(NOT public.can_access_pet_record('a5555555-5555-5555-5555-555555555555', 'read_clinical'), 'Pet Shop não acessa prontuário clínico.');

SET LOCAL "request.jwt.claim.sub" = 'c1111111-1111-1111-1111-111111111111';
SELECT throws_ok(
    $$ UPDATE public.medical_records SET details = 'tentativa de alterar registro assinado' WHERE id = '10300000-0000-4000-8000-000000000011' $$,
    '55000',
    'Registro assinado é imutável; correções devem ser feitas por adendo.',
    'Edição direta de registro assinado é rejeitada.'
);
SELECT throws_ok(
    $$ DELETE FROM public.medical_records WHERE id = '10300000-0000-4000-8000-000000000011' $$,
    '55000',
    'Registro assinado é imutável; correções devem ser feitas por adendo.',
    'Exclusão direta de registro assinado é rejeitada.'
);

SELECT * FROM finish();
ROLLBACK;
