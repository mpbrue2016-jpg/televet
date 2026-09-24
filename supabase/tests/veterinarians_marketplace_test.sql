-- ==============================================================================
-- veterinarians_marketplace_test.sql
-- Fase 4: Testes Automatizados de Especialidades, CRMV, Preços e Busca no Marketplace
-- ==============================================================================

BEGIN;

CREATE TEMPORARY TABLE marketplace_test_results (
    test_id TEXT PRIMARY KEY,
    title TEXT,
    passed BOOLEAN,
    details TEXT
);

-- 1. SETUP DE TESTE:
-- Criar 2 novos veterinários:
-- VET 1: Dr. João Silveira (Cardiologia, CRMV-SP 38412, R$ 180,00, Status: 'validated' -> DEVE APARECER)
-- VET 2: Dr. Pedro Suspenso (Ortopedia, CRMV-RJ 99999, R$ 200,00, Status: 'suspended' -> NÃO PODE APARECER)
-- VET 3: Dra. Ana Pendente (Dermatologia, CRMV-MG 88888, R$ 160,00, Status: 'pending' -> NÃO PODE APARECER)

-- Inserção de Usuários
INSERT INTO public.users (id, email, full_name, system_role) VALUES
('d1111111-1111-1111-1111-111111111111', 'dr.joao@vet.med.br', 'Dr. João Silveira (Cardiologia)', 'veterinarian'),
('d2222222-2222-2222-2222-222222222222', 'dr.pedro@vet.med.br', 'Dr. Pedro Suspenso (Ortopedia)', 'veterinarian'),
('d3333333-3333-3333-3333-333333333333', 'dra.ana@vet.med.br', 'Dra. Ana Pendente (Dermatologia)', 'veterinarian');

-- Inserção de Perfis Veterinários com Preços e Duração
INSERT INTO public.veterinarians (
    id, user_id, bio, consultation_fee_cents, consultation_duration_minutes, supported_modalities, is_verified, is_active
) VALUES
('v1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 'Especialista em Cardiologia', 18000, 45, '["teleconsultation"]'::jsonb, true, true),
('v2222222-2222-2222-2222-222222222222', 'd2222222-2222-2222-2222-222222222222', 'Especialista em Ortopedia', 20000, 45, '["teleconsultation"]'::jsonb, false, true),
('v3333333-3333-3333-3333-333333333333', 'd3333333-3333-3333-3333-333333333333', 'Especialista em Dermatologia', 16000, 45, '["teleconsultation"]'::jsonb, false, true);

-- Inserção de Registros Profissionais com os Status Estritos de CRMV
INSERT INTO public.professional_registrations (
    id, veterinarian_id, crmv_number, state_uf, crmv_status
) VALUES
('r1111111-1111-1111-1111-111111111111', 'v1111111-1111-1111-1111-111111111111', 'CRMV-SP 38412', 'SP', 'validated'),
('r2222222-2222-2222-2222-222222222222', 'v2222222-2222-2222-2222-222222222222', 'CRMV-RJ 99999', 'RJ', 'suspended'),
('r3333333-3333-3333-3333-333333333333', 'v3333333-3333-3333-3333-333333333333', 'CRMV-MG 88888', 'MG', 'pending');

-- Associação com Especialidades
-- Dr. João -> Cardiologia
INSERT INTO public.veterinarian_specialties (veterinarian_id, specialty_id)
SELECT 'v1111111-1111-1111-1111-111111111111', id FROM public.specialties WHERE name = 'Cardiologia';

-- Dr. Pedro -> Ortopedia
INSERT INTO public.veterinarian_specialties (veterinarian_id, specialty_id)
SELECT 'v2222222-2222-2222-2222-222222222222', id FROM public.specialties WHERE name = 'Ortopedia';

-- Dra. Ana -> Dermatologia
INSERT INTO public.veterinarian_specialties (veterinarian_id, specialty_id)
SELECT 'v3333333-3333-3333-3333-333333333333', id FROM public.specialties WHERE name = 'Dermatologia';

-- 2. TESTE 4.1: Catálogo de Especialidades
DO $$
DECLARE
    v_total_specialties INTEGER;
BEGIN
    SELECT count(*) INTO v_total_specialties FROM public.specialties WHERE is_active = TRUE;

    IF v_total_specialties >= 14 THEN
        INSERT INTO marketplace_test_results VALUES (
            '4.1',
            'Disponibilidade das Especialidades Obrigatórias',
            true,
            format('Total de %s especialidades ativas registradas (incluindo as 14 exigidas).', v_total_specialties)
        );
    ELSE
        INSERT INTO marketplace_test_results VALUES (
            '4.1',
            'Disponibilidade das Especialidades Obrigatórias',
            false,
            format('Faltam especialidades. Apenas %s encontradas.', v_total_specialties)
        );
    END IF;
END $$;

-- 3. TESTE 4.2: Filtro Estrito de Status do CRMV (Apenas 'validated' pode aparecer nas buscas)
DO $$
DECLARE
    v_suspended_found BOOLEAN;
    v_pending_found BOOLEAN;
    v_validated_found BOOLEAN;
BEGIN
    -- Busca todos os profissionais disponíveis no marketplace
    SELECT EXISTS (
        SELECT 1 FROM public.search_marketplace_veterinarians() WHERE veterinarian_id = 'v2222222-2222-2222-2222-222222222222'
    ) INTO v_suspended_found;

    SELECT EXISTS (
        SELECT 1 FROM public.search_marketplace_veterinarians() WHERE veterinarian_id = 'v3333333-3333-3333-3333-333333333333'
    ) INTO v_pending_found;

    SELECT EXISTS (
        SELECT 1 FROM public.search_marketplace_veterinarians() WHERE veterinarian_id = 'v1111111-1111-1111-1111-111111111111'
    ) INTO v_validated_found;

    IF v_validated_found AND NOT v_suspended_found AND NOT v_pending_found THEN
        INSERT INTO marketplace_test_results VALUES (
            '4.2',
            'Filtro de Segurança e Validação de CRMV',
            true,
            'Apenas o profissional com CRMV Validado (Dr. João) retornou na busca. Suspenso e Pendente foram estritamente omitidos.'
        );
    ELSE
        INSERT INTO marketplace_test_results VALUES (
            '4.2',
            'Filtro de Segurança e Validação de CRMV',
            false,
            format('Falha de isolamento! Validado: %s, Suspenso vazou: %s, Pendente vazou: %s', v_validated_found, v_suspended_found, v_pending_found)
        );
    END IF;
END $$;

-- 4. TESTE 4.3: Busca por Especialidade Específica e Preço
DO $$
DECLARE
    v_cardio_id UUID;
    v_search_count INTEGER;
    v_fee_returned INTEGER;
BEGIN
    SELECT id INTO v_cardio_id FROM public.specialties WHERE name = 'Cardiologia';

    SELECT count(*), max(consultation_fee_cents) 
    INTO v_search_count, v_fee_returned
    FROM public.search_marketplace_veterinarians(p_specialty_id := v_cardio_id);

    IF v_search_count = 1 AND v_fee_returned = 18000 THEN
        INSERT INTO marketplace_test_results VALUES (
            '4.3',
            'Busca por Especialidade e Consistência de Preço',
            true,
            format('Busca por Cardiologia retornou exatamente 1 profissional compatível com valor de R$ %s,00.', (v_fee_returned / 100))
        );
    ELSE
        INSERT INTO marketplace_test_results VALUES (
            '4.3',
            'Busca por Especialidade e Consistência de Preço',
            false,
            format('Inconsistência de busca! Retornados: %s, Preço: %s', v_search_count, v_fee_returned)
        );
    END IF;
END $$;

-- Exibe os resultados consolidados
SELECT 
    test_id AS "ID",
    title AS "Cenário de Teste - Fase 4",
    CASE WHEN passed THEN '✅ APROVADO' ELSE '❌ FALHOU' END AS "Status",
    details AS "Resultado"
FROM marketplace_test_results
ORDER BY test_id;

ROLLBACK;
