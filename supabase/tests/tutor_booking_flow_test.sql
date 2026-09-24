-- ==============================================================================
-- tutor_booking_flow_test.sql
-- Fase 5: Testes da Jornada Completa do Tutor, Pets, Slots e Associação Indelével com Pet Shop
-- ==============================================================================

BEGIN;

CREATE TEMPORARY TABLE booking_test_results (
    test_id TEXT PRIMARY KEY,
    title TEXT,
    passed BOOLEAN,
    details TEXT
);

-- 1. SETUP DE DADOS DE TESTE:
-- Pet Shop A: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' (Amigo Fiel)
-- Tutor A:    'a3333333-3333-3333-3333-333333333333' (Ana Silva) -> Tutor ID 'a4444444-4444-4444-4444-444444444444'
-- Pet A:      'a5555555-5555-5555-5555-555555555555' (Thor)
-- Vet A:      'c2222222-2222-2222-2222-222222222222' (Dra. Camila)
-- Especialidade: '11111111-1111-1111-1111-111111110001' (Clínica Geral)

-- Cria a grade de horários da Dra. Camila para Quarta-feira (dia da semana = 3)
INSERT INTO public.veterinarian_schedules (
    veterinarian_id, day_of_week, start_time, end_time, slot_duration_minutes, is_active
) VALUES (
    'c2222222-2222-2222-2222-222222222222',
    3, -- Quarta
    '09:00:00',
    '12:00:00',
    45,
    true
);

-- 2. TESTE 5.1: Geração Dinâmica de Horários Livres (Slots)
DO $$
DECLARE
    v_slots_count INTEGER;
BEGIN
    -- Data de teste: 2026-09-23 é uma Quarta-feira
    SELECT count(*) INTO v_slots_count 
    FROM public.get_available_appointment_slots('c2222222-2222-2222-2222-222222222222', '2026-09-23'::date)
    WHERE is_available = TRUE;

    -- Das 09:00 às 12:00 com 45 min cada slot: 09:00, 09:45, 10:30, 11:15 (4 slots)
    IF v_slots_count = 4 THEN
        INSERT INTO booking_test_results VALUES (
            '5.1',
            'Cálculo Dinâmico de Slots Livres no Calendário',
            true,
            format('Gerados exatamente %s horários livres de 45 minutos conforme a grade.', v_slots_count)
        );
    ELSE
        INSERT INTO booking_test_results VALUES (
            '5.1',
            'Cálculo Dinâmico de Slots Livres no Calendário',
            false,
            format('Inconsistência nos slots livres. Encontrados: %s, esperado: 4', v_slots_count)
        );
    END IF;
END $$;

-- 3. TESTE 5.2: Agendamento Atômico e Retenção do Pet Shop de Origem
DO $$
DECLARE
    v_book_res JSONB;
    v_app_id UUID;
    v_stored_petshop_id UUID;
    v_stored_tutor_id UUID;
    v_stored_vet_id UUID;
    v_stored_status public.appointment_lifecycle_status;
BEGIN
    SELECT public.book_appointment(
        p_tenant_id := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        p_petshop_id := 'a1111111-1111-1111-1111-111111111111',
        p_tutor_id := 'a4444444-4444-4444-4444-444444444444',
        p_pet_id := 'a5555555-5555-5555-5555-555555555555',
        p_veterinarian_id := 'c2222222-2222-2222-2222-222222222222',
        p_specialty_id := '11111111-1111-1111-1111-111111110001',
        p_scheduled_for := '2026-09-23 09:00:00-03',
        p_reason_for_visit := 'Checkup anual e tosse seca recente.'
    ) INTO v_book_res;

    v_app_id := (v_book_res->>'appointment_id')::UUID;

    -- Consulta o registro salvo diretamente no banco
    SELECT petshop_id, tutor_id, veterinarian_id, lifecycle_status
    INTO v_stored_petshop_id, v_stored_tutor_id, v_stored_vet_id, v_stored_status
    FROM public.appointments
    WHERE id = v_app_id;

    IF v_stored_petshop_id = 'a1111111-1111-1111-1111-111111111111'
       AND v_stored_tutor_id = 'a4444444-4444-4444-4444-444444444444'
       AND v_stored_vet_id = 'c2222222-2222-2222-2222-222222222222'
       AND v_stored_status = 'solicitado' THEN
        INSERT INTO booking_test_results VALUES (
            '5.2',
            'Associação Irrefutável com Pet Shop de Origem',
            true,
            'Consulta salva com sucesso vinculada de forma indelével ao Pet Shop A, Tutor A e Veterinário A.'
        );
    ELSE
        INSERT INTO booking_test_results VALUES (
            '5.2',
            'Associação Irrefutável com Pet Shop de Origem',
            false,
            format('Falha de associação! Pet Shop: %s, Tutor: %s, Vet: %s, Status: %s', 
                v_stored_petshop_id, v_stored_tutor_id, v_stored_vet_id, v_stored_status)
        );
    END IF;
END $$;

-- 4. TESTE 5.3: Bloqueio de Duplo Agendamento no Mesmo Horário (Concorrência)
DO $$
BEGIN
    -- Tenta agendar exatamente o mesmo horário ('2026-09-23 09:00:00-03') com o mesmo vet
    PERFORM public.book_appointment(
        p_tenant_id := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        p_petshop_id := 'a1111111-1111-1111-1111-111111111111',
        p_tutor_id := 'a4444444-4444-4444-4444-444444444444',
        p_pet_id := 'a5555555-5555-5555-5555-555555555555',
        p_veterinarian_id := 'c2222222-2222-2222-2222-222222222222',
        p_specialty_id := '11111111-1111-1111-1111-111111110001',
        p_scheduled_for := '2026-09-23 09:00:00-03',
        p_reason_for_visit := 'Tentativa duplicada invasora.'
    );

    -- Se não disparar exceção, falhou
    INSERT INTO booking_test_results VALUES (
        '5.3',
        'Prevenção de Duplo Agendamento (Concorrência)',
        false,
        'O sistema permitiu duplicidade de agendamento no mesmo horário!'
    );
EXCEPTION WHEN OTHERS THEN
    INSERT INTO booking_test_results VALUES (
        '5.3',
        'Prevenção de Duplo Agendamento (Concorrência)',
        true,
        'Bloqueio bem-sucedido! Exceção de conflito de horário disparada corretamente.'
    );
END $$;

-- 5. TESTE 5.4: Reagendamento e Cancelamento
DO $$
DECLARE
    v_app_id UUID;
    v_resched_res JSONB;
    v_cancel_res JSONB;
    v_final_status public.appointment_lifecycle_status;
BEGIN
    SELECT id INTO v_app_id FROM public.appointments WHERE scheduled_for = '2026-09-23 09:00:00-03';

    -- Reagenda para 09:45
    SELECT public.reschedule_appointment(v_app_id, '2026-09-23 09:45:00-03') INTO v_resched_res;

    -- Cancela a consulta
    SELECT public.cancel_appointment(v_app_id, 'Imprevisto pessoal do tutor') INTO v_cancel_res;

    SELECT lifecycle_status INTO v_final_status FROM public.appointments WHERE id = v_app_id;

    IF v_final_status = 'cancelado' THEN
        INSERT INTO booking_test_results VALUES (
            '5.4',
            'Reagendamento e Cancelamento Seguro',
            true,
            'Consulta reagendada e posteriormente cancelada com atualização correta do status.'
        );
    ELSE
        INSERT INTO booking_test_results VALUES (
            '5.4',
            'Reagendamento e Cancelamento Seguro',
            false,
            format('Status final incorreto: %s', v_final_status)
        );
    END IF;
END $$;

-- Exibe os resultados consolidados
SELECT 
    test_id AS "ID",
    title AS "Cenário de Teste - Fase 5",
    CASE WHEN passed THEN '✅ APROVADO' ELSE '❌ FALHOU' END AS "Status",
    details AS "Resultado"
FROM booking_test_results
ORDER BY test_id;

ROLLBACK;
