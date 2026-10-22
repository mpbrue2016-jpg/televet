-- ============================================================================== 
-- cfmv_telemedicine_test.sql
-- Testes pgTAP para RPVAR, urgência e consentimento de telemedicina
-- ============================================================================== 

BEGIN;

SELECT plan(9);

SELECT has_table('public', 'care_relationships', 'Tabela care_relationships existe.');
SELECT has_table('public', 'telemedicine_consents', 'Tabela telemedicine_consents existe.');
SELECT has_table('public', 'telemedicine_triage_records', 'Tabela telemedicine_triage_records existe.');

SELECT has_function('public', 'can_book_teleconsultation', ARRAY['uuid', 'uuid'], 'Função can_book_teleconsultation existe.');
SELECT has_function('public', 'validate_telemedicine_booking', ARRAY[]::text[], 'Função validate_telemedicine_booking existe.');
SELECT has_function('public', 'register_telemedicine_triage', ARRAY['uuid', 'jsonb', 'boolean', 'text'], 'Função register_telemedicine_triage existe.');
SELECT has_function('public', 'register_telemedicine_consent', ARRAY['uuid', 'boolean', 'text', 'text', 'text'], 'Função register_telemedicine_consent existe.');

SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_validate_telemedicine_booking'
    ),
    'Existe trigger de validação de teleconsulta na agenda.'
);

SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.appointments'::regclass
          AND conname = 'appointments_no_overlap'
    ),
    'A regra de antissobreposição da agenda continua aplicada.'
);

SELECT * FROM finish();

ROLLBACK;
