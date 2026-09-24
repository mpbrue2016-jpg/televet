-- ==============================================================================
-- clinical_security_test.sql
-- Fase 6: Testes Automatizados de Teleconsulta, Prontuário, Receitas e Blindagem Clínica
-- ==============================================================================

BEGIN;

CREATE TEMPORARY TABLE clinical_test_results (
    test_id TEXT PRIMARY KEY,
    title TEXT,
    passed BOOLEAN,
    details TEXT
);

-- 1. SETUP DE TESTE:
-- Criar uma consulta de teste entre Tutor A, Pet A (Thor) e Veterinária Camila (Tenant A)
INSERT INTO public.appointments (
    id, tenant_id, petshop_id, tutor_id, pet_id, veterinarian_id, scheduled_for, lifecycle_status
) VALUES (
    'a9999999-9999-9999-9999-999999999999',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'a1111111-1111-1111-1111-111111111111',
    'a4444444-4444-4444-4444-444444444444',
    'a5555555-5555-5555-5555-555555555555',
    'c2222222-2222-2222-2222-222222222222',
    NOW(),
    'confirmado'
);

INSERT INTO public.consultations (
    id, tenant_id, petshop_id, appointment_id, tutor_id, pet_id, veterinarian_id, status
) VALUES (
    'c9999999-9999-9999-9999-999999999999',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'a1111111-1111-1111-1111-111111111111',
    'a9999999-9999-9999-9999-999999999999',
    'a4444444-4444-4444-4444-444444444444',
    'a5555555-5555-5555-5555-555555555555',
    'c2222222-2222-2222-2222-222222222222',
    'waiting_room'
);

-- 2. TESTE 6.1: Veterinária Inicia e Finaliza a Teleconsulta com Prontuário
SET LOCAL "request.jwt.claim.sub" = 'c1111111-1111-1111-1111-111111111111'; -- Dra. Camila
SET LOCAL "app.current_tenant_id" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

DO $$
DECLARE
    v_start_res JSONB;
    v_finish_res JSONB;
    v_rx_res JSONB;
    v_med_record_count INTEGER;
BEGIN
    -- 1. Inicia chamada
    SELECT public.start_teleconsultation('c9999999-9999-9999-9999-999999999999') INTO v_start_res;

    -- 2. Finaliza e salva prontuário
    SELECT public.finish_teleconsultation(
        'c9999999-9999-9999-9999-999999999999',
        'Tosse seca e secreção nasal discreta há 3 dias.',
        'Paciente em bom estado geral, ausculta pulmonar limpa.',
        'Traqueobronquite Infecciosa Canina',
        'Prescrito xarope mucolítico e repouso.',
        'Nota privada: tutora atenciosa, retorno em 7 dias se piorar.'
    ) INTO v_finish_res;

    -- 3. Emite receita
    SELECT public.issue_digital_prescription(
        'c9999999-9999-9999-9999-999999999999',
        '[{"name": "Xarope Mucolítico Pet", "dosage": "5ml", "frequency": "12/12h", "duration": "5 dias"}]'::jsonb,
        'Oferecer bastante água fresca.'
    ) INTO v_rx_res;

    -- Verifica se o prontuário foi gravado
    SELECT count(*) INTO v_med_record_count 
    FROM public.medical_records 
    WHERE consultation_id = 'c9999999-9999-9999-9999-999999999999';

    IF v_med_record_count = 1 AND (v_rx_res->>'validation_code') IS NOT NULL THEN
        INSERT INTO clinical_test_results VALUES (
            '6.1',
            'Fluxo Clínico do Veterinário (Sala, Prontuário e Receita)',
            true,
            format('Consulta finalizada, prontuário arquivado e receita emitida com código %s.', v_rx_res->>'validation_code')
        );
    ELSE
        INSERT INTO clinical_test_results VALUES (
            '6.1',
            'Fluxo Clínico do Veterinário (Sala, Prontuário e Receita)',
            false,
            'Falha no registro do prontuário ou emissão da receita.'
        );
    END IF;
END $$;

-- 3. TESTE 6.2: Tutor Legítimo Lê a Receita e Documentos do Seu Pet
SET LOCAL "request.jwt.claim.sub" = 'a3333333-3333-3333-3333-333333333333'; -- Tutora Ana Silva (Dona do Thor)
SET LOCAL "app.current_tenant_id" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

DO $$
DECLARE
    v_rx_count INTEGER;
BEGIN
    SELECT count(*) INTO v_rx_count
    FROM public.prescriptions
    WHERE consultation_id = 'c9999999-9999-9999-9999-999999999999';

    IF v_rx_count = 1 THEN
        INSERT INTO clinical_test_results VALUES (
            '6.2',
            'Acesso do Tutor aos Documentos do seu Pet',
            true,
            'Tutora conseguiu acessar e visualizar a receita emitida para seu animal.'
        );
    ELSE
        INSERT INTO clinical_test_results VALUES (
            '6.2',
            'Acesso do Tutor aos Documentos do seu Pet',
            false,
            'Tutor legítimo foi indevidamente bloqueado de ver a receita.'
        );
    END IF;
END $$;

-- 4. TESTE 6.3: VIOLAÇÃO DE LEITURA - Pet Shop Tenta Espionar Prontuários (Sigilo Médico)
SET LOCAL "request.jwt.claim.sub" = 'a2222222-2222-2222-2222-222222222222'; -- Gestor do Pet Shop (Tenant Admin)
SET LOCAL "app.current_tenant_id" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

DO $$
DECLARE
    v_leak_count INTEGER;
BEGIN
    SELECT count(*) INTO v_leak_count
    FROM public.medical_records
    WHERE consultation_id = 'c9999999-9999-9999-9999-999999999999';

    IF v_leak_count = 0 THEN
        INSERT INTO clinical_test_results VALUES (
            '6.3',
            'Sigilo Médico: Pet Shop Bloqueado de Ler Prontuário',
            true,
            'Zero linhas retornadas! Prontuário médico inacessível ao gestor do Pet Shop.'
        );
    ELSE
        INSERT INTO clinical_test_results VALUES (
            '6.3',
            'Sigilo Médico: Pet Shop Bloqueado de Ler Prontuário',
            false,
            format('Falha grave de sigilo! Pet Shop conseguiu ler %s registros clínicos.', v_leak_count)
        );
    END IF;
END $$;

-- 5. TESTE 6.4: VIOLAÇÃO DE ESCRITA - Pet Shop Tenta Alterar CRMV ou Prontuário
DO $$
DECLARE
    v_affected INTEGER;
BEGIN
    -- Pet shop tenta alterar o CRMV da Dra. Camila
    UPDATE public.professional_registrations
    SET crmv_number = 'CRMV-HACKED-0000'
    WHERE veterinarian_id = 'c2222222-2222-2222-2222-222222222222';
    
    GET DIAGNOSTICS v_affected = ROW_COUNT;

    IF v_affected = 0 THEN
        INSERT INTO clinical_test_results VALUES (
            '6.4',
            'Regra Crítica: Pet Shop Bloqueado de Alterar CRMV/Prontuário',
            true,
            'Zero linhas afetadas! Tentativa de manipulação bloqueada pelo RLS.'
        );
    ELSE
        INSERT INTO clinical_test_results VALUES (
            '6.4',
            'Regra Crítica: Pet Shop Bloqueado de Alterar CRMV/Prontuário',
            false,
            'Falha catastrófica! Pet Shop conseguiu adulterar o registro profissional do veterinário.'
        );
    END IF;
END $$;

-- Exibe os resultados consolidados
SELECT 
    test_id AS "ID",
    title AS "Cenário de Teste - Fase 6",
    CASE WHEN passed THEN '✅ APROVADO' ELSE '❌ FALHOU' END AS "Status",
    details AS "Resultado"
FROM clinical_test_results
ORDER BY test_id;

ROLLBACK;
