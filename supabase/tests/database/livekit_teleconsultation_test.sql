-- ==============================================================================
-- livekit_teleconsultation_test.sql
-- Fase 9: Segurança de sala, consentimento bilateral, eventos e gravação privada
-- ============================================================================== 

BEGIN;

SELECT plan(29);

INSERT INTO public.care_relationships (
    tenant_id, pet_id, tutor_id, veterinarian_id, relationship_form
) VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'a5555555-5555-5555-5555-555555555555',
    'a4444444-4444-4444-4444-444444444444',
    'c2222222-2222-2222-2222-222222222222',
    'presential_registered'
);

INSERT INTO public.appointments (
    id, tenant_id, petshop_id, tutor_id, pet_id, veterinarian_id, scheduled_for,
    starts_at, ends_at, duration_minutes, price_cents, type, lifecycle_status, reservation_status
) VALUES (
    '92999999-9999-4999-8999-999999999901',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'a1111111-1111-1111-1111-111111111111',
    'a4444444-4444-4444-4444-444444444444',
    'a5555555-5555-5555-5555-555555555555',
    'c2222222-2222-2222-2222-222222222222',
    NOW() + INTERVAL '1 minute',
    NOW() - INTERVAL '1 minute',
    NOW() + INTERVAL '29 minutes',
    30,
    15000,
    'teleconsultation',
    'confirmado',
    'confirmed'
);

INSERT INTO public.payments (
    id, tenant_id, appointment_id, tutor_id, gateway, payment_method, amount_cents, status, paid_at
) VALUES (
    '92999999-9999-4999-8999-999999999902',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '92999999-9999-4999-8999-999999999901',
    'a4444444-4444-4444-4444-444444444444',
    'livekit-test-fixture',
    'pix',
    15000,
    'captured',
    NOW()
);

INSERT INTO public.consultations (
    id, tenant_id, appointment_id, status, video_room_name
) VALUES (
    '92999999-9999-4999-8999-999999999903',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '92999999-9999-4999-8999-999999999901',
    'active',
    gen_random_uuid()
);

SELECT has_column('public', 'consultations', 'video_room_name', 'Sala LiveKit identificada por UUID persistente.');
SELECT has_column('public', 'consultations', 'video_room_status', 'Status da sala persistido no banco.');
SELECT has_column('public', 'consultations', 'video_actual_duration_seconds', 'Duração real da sala persistida.');
SELECT has_column('public', 'consultations', 'video_connection_drop_count', 'Quedas de conexão contabilizadas.');
SELECT has_column('public', 'consultations', 'recording_expires_at', 'Retenção da gravação configurável por consulta.');
SELECT has_table('public', 'teleconsultation_room_events', 'Eventos LiveKit persistidos com chave de deduplicação.');
SELECT has_table('public', 'consultation_recording_access_log', 'Acessos à gravação auditáveis.');
SELECT has_function('public', 'authorize_video_session', ARRAY['uuid', 'uuid'], 'Edge Function usa RPC de autorização de participante e pagamento.');
SELECT has_function('public', 'get_teleconsultation_state', ARRAY['uuid'], 'Estado da sala exposto apenas ao participante.');
SELECT has_function('public', 'save_teleconsultation_draft', ARRAY['uuid', 'text', 'text', 'text', 'text'], 'Autosave clínico restrito ao veterinário responsável.');
SELECT has_function('public', 'finish_video_consultation', ARRAY['uuid', 'text', 'text', 'text', 'text', 'text'], 'Encerramento clínico restrito ao veterinário responsável.');
SELECT has_function('public', 'process_livekit_room_event', ARRAY['text', 'text', 'uuid', 'text', 'jsonb'], 'Webhook LiveKit deduplicado no banco.');
SELECT has_function('public', 'authorize_video_recording', ARRAY['uuid'], 'Autorização de gravação confere consentimento bilateral.');
SELECT has_function('public', 'record_video_egress_started', ARRAY['uuid', 'text', 'text', 'integer'], 'Egress só persiste quando consentimento ainda está válido.');
SELECT has_function('public', 'auto_close_expired_video_rooms', ARRAY[]::text[], 'Sweeper para encerramento e no-show existe.');

SELECT ok(
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.teleconsultation_room_events'::regclass),
    'Tabela de eventos de sala tem RLS habilitado.'
);
SELECT ok(
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.consultation_recording_access_log'::regclass),
    'Tabela de auditoria de gravação tem RLS habilitado.'
);
SELECT has_policy('public', 'consultations', 'policy_consultations_participant_read', 'Realtime de consulta limitado a participantes.');
SELECT has_policy('storage', 'objects', 'policy_consultation_recordings_read', 'Gravações ficam privadas e acessíveis a participantes dentro da retenção.');
SELECT ok(
    NOT has_table_privilege('authenticated', 'public.consultations', 'UPDATE'),
    'Participantes não podem alterar diretamente status ou consentimentos da consulta.'
);
SELECT ok(
    NOT has_table_privilege('authenticated', 'public.consultation_recording_consents', 'INSERT'),
    'Logs de consentimento só podem ser criados pela RPC autorizada.'
);
SELECT ok(
    NOT has_function_privilege('anon', 'public.authorize_video_session(uuid,uuid)', 'EXECUTE'),
    'Cliente anon não pode emitir autorização de sala.'
);
SELECT ok(
    has_function_privilege('service_role', 'public.authorize_video_session(uuid,uuid)', 'EXECUTE'),
    'Somente service_role/Edge pode chamar a autorização de sala.'
);

SET LOCAL "request.jwt.claim.role" = 'service_role';
SELECT ok(
    (public.authorize_video_session(
        '92999999-9999-4999-8999-999999999903',
        'a3333333-3333-3333-3333-333333333333'
    )->>'participant_role') = 'tutor',
    'Tutor participante com pagamento capturado recebe autorização mínima.'
);

INSERT INTO public.appointments (
    id, tenant_id, petshop_id, tutor_id, pet_id, veterinarian_id, scheduled_for,
    starts_at, ends_at, duration_minutes, price_cents, type, lifecycle_status, reservation_status
) VALUES (
    '92999999-9999-4999-8999-999999999904',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'a1111111-1111-1111-1111-111111111111',
    'a4444444-4444-4444-4444-444444444444',
    'a5555555-5555-5555-5555-555555555555',
    'c2222222-2222-2222-2222-222222222222',
    NOW() + INTERVAL '2 hours',
    NOW() + INTERVAL '2 hours',
    NOW() + INTERVAL '2 hours 30 minutes',
    30,
    15000,
    'teleconsultation',
    'confirmado',
    'confirmed'
);
INSERT INTO public.consultations (id, tenant_id, appointment_id, status)
VALUES (
    '92999999-9999-4999-8999-999999999905',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '92999999-9999-4999-8999-999999999904',
    'waiting_room'
);
SELECT throws_ok(
    $$ SELECT public.authorize_video_session(
        '92999999-9999-4999-8999-999999999905',
        'a3333333-3333-3333-3333-333333333333'
    ) $$,
    'P0003',
    'Pagamento ainda não confirmado pelo gateway.',
    'Agendamento sem pagamento capturado não recebe token de vídeo.'
);

SET LOCAL "request.jwt.claim.sub" = 'c1111111-1111-1111-1111-111111111111';
SELECT throws_ok(
    $$ SELECT public.authorize_video_recording('92999999-9999-4999-8999-999999999903') $$,
    'P0003',
    'Gravação bloqueada: tutor e veterinário precisam consentir explicitamente.',
    'Gravação sem consentimento bilateral é rejeitada pelo banco.'
);

UPDATE public.consultations
SET tutor_recording_consent = TRUE, vet_recording_consent = TRUE
WHERE id = '92999999-9999-4999-8999-999999999903';
SELECT ok(
    (public.authorize_video_recording('92999999-9999-4999-8999-999999999903')->>'room_name') IS NOT NULL,
    'A autorização só é emitida após aceite explícito dos dois participantes.'
);

UPDATE public.consultations SET tutor_recording_consent = FALSE
WHERE id = '92999999-9999-4999-8999-999999999903';
SELECT throws_ok(
    $$ SELECT public.authorize_video_recording('92999999-9999-4999-8999-999999999903') $$,
    'P0003',
    'Gravação bloqueada: tutor e veterinário precisam consentir explicitamente.',
    'Retirada de um dos consentimentos bloqueia a gravação.'
);

SET LOCAL "request.jwt.claim.sub" = 'b3333333-3333-3333-3333-333333333333';
SELECT throws_ok(
    $$ SELECT public.authorize_video_recording('92999999-9999-4999-8999-999999999903') $$,
    '42501',
    'Somente o veterinário participante pode iniciar a gravação.',
    'Usuário de terceiro tenant não pode iniciar a gravação.'
);

SELECT * FROM finish();
ROLLBACK;
