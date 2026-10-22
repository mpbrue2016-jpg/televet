-- ==============================================================================
-- agenda_availability_test.sql
-- Testes pgTAP para agenda, disponibilidade e reserva sem conflito
-- ============================================================================== 

BEGIN;

SELECT plan(8);

SELECT has_table('public', 'availability_rules', 'Tabela availability_rules existe.');
SELECT has_table('public', 'availability_exceptions', 'Tabela availability_exceptions existe.');
SELECT has_table('public', 'holidays', 'Tabela holidays existe.');

SELECT has_function('public', 'get_available_appointment_slots', ARRAY['uuid', 'date', 'text', 'uuid'], 'Função get_available_appointment_slots existe.');
SELECT has_function('public', 'reserve_appointment_slot', ARRAY['uuid', 'integer'], 'Função reserve_appointment_slot existe.');
SELECT has_function('public', 'confirm_appointment_reservation', ARRAY['uuid'], 'Função confirm_appointment_reservation existe.');
SELECT has_function('public', 'release_expired_appointment_holds', ARRAY[]::text[], 'Função release_expired_appointment_holds existe.');

SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.appointments'::regclass
          AND conname = 'appointments_no_overlap'
    ),
    'Existe a constraint de exclusão para evitar sobreposição de agenda.'
);

SELECT * FROM finish();

ROLLBACK;
