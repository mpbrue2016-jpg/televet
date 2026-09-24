-- ==============================================================================
-- petshop_attribution_test.sql
-- Fase 3: Validação de Pet Shop, Página Individual, Links, QR Codes e Rastreamento de Atribuição
-- ==============================================================================

BEGIN;

CREATE TEMPORARY TABLE attribution_test_results (
    test_id TEXT PRIMARY KEY,
    title TEXT,
    passed BOOLEAN,
    details TEXT
);

-- 1. CRIAÇÃO DO PET SHOP DE TESTE: "Animal Feliz"
-- Tenant ID: '33333333-3333-3333-3333-333333333333'
INSERT INTO public.tenants (
    id, slug, name, trade_name, email, status, white_label_config
) VALUES (
    '33333333-3333-3333-3333-333333333333',
    'animal-feliz',
    'Animal Feliz Pet Center Eireli',
    'Pet Shop Animal Feliz',
    'contato@animalfeliz.com.br',
    'active',
    '{
        "primary_color": "#10b981",
        "secondary_color": "#047857",
        "brand_name": "Animal Feliz TeleVet"
    }'::jsonb
);

INSERT INTO public.petshops (
    id, tenant_id, name, trade_name, phone, whatsapp, custom_domain, commercial_info
) VALUES (
    '33333333-aaaa-bbbb-cccc-333333333333',
    '33333333-3333-3333-3333-333333333333',
    'Pet Shop Animal Feliz Matriz',
    'Animal Feliz Moema',
    '(11) 98765-4321',
    '(11) 98765-4321',
    'vet.animalfeliz.com.br',
    'Mais de 10 anos de tradição em cuidados veterinários.'
);

-- Cria o código de indicação do Pet Shop
INSERT INTO public.referrals (
    id, tenant_id, code, referrer_type, referrer_id, commission_percentage
) VALUES (
    '33333333-ref1-ref2-ref3-333333333333',
    '33333333-3333-3333-3333-333333333333',
    'AFELIZ2026',
    'petshop',
    '33333333-aaaa-bbbb-cccc-333333333333',
    15.00
);

-- 2. TESTE 2.1: Obtenção do Perfil Público pelo Slug '/petshop/animal-feliz'
DO $$
DECLARE
    v_profile JSONB;
BEGIN
    SELECT public.get_public_petshop_profile('animal-feliz') INTO v_profile;

    IF v_profile IS NOT NULL AND v_profile->>'slug' = 'animal-feliz' AND v_profile->>'referral_code' = 'AFELIZ2026' THEN
        INSERT INTO attribution_test_results VALUES (
            '3.1',
            'Resolução de Perfil Público via Slug',
            true,
            'Perfil do Pet Shop e dados de White-Label recuperados com sucesso.'
        );
    ELSE
        INSERT INTO attribution_test_results VALUES (
            '3.1',
            'Resolução de Perfil Público via Slug',
            false,
            'Falha ao obter perfil pelo slug animal-feliz.'
        );
    END IF;
END $$;

-- 3. TESTE 2.2: Rastreamento de Visita com Token de Sessão
DO $$
DECLARE
    v_track_res JSONB;
    v_visit_count INTEGER;
BEGIN
    SELECT public.track_partner_attribution(
        '33333333-3333-3333-3333-333333333333',
        '33333333-aaaa-bbbb-cccc-333333333333',
        'sess_mock_token_animal_feliz_999',
        'AFELIZ2026',
        'https://tele-veterinaria.com.br/petshop/animal-feliz?ref=AFELIZ2026',
        'Mozilla/5.0 Chrome Test Agent'
    ) INTO v_track_res;

    SELECT count(*) INTO v_visit_count 
    FROM public.partner_visits 
    WHERE session_token = 'sess_mock_token_animal_feliz_999';

    IF v_visit_count = 1 THEN
        INSERT INTO attribution_test_results VALUES (
            '3.2',
            'Registro de Rastreamento de Visita com Token',
            true,
            'Visita persistida na tabela partner_visits associada ao Pet Shop.'
        );
    ELSE
        INSERT INTO attribution_test_results VALUES (
            '3.2',
            'Registro de Rastreamento de Visita com Token',
            false,
            'Visita não foi registrada no banco de dados.'
        );
    END IF;
END $$;

-- 4. TESTE 2.3: Conversão e Associação Irrefutável do Tutor ao Pet Shop
DO $$
DECLARE
    v_tutor_user_id UUID := '77777777-7777-7777-7777-777777777777';
    v_bind_res JSONB;
    v_is_tutor_linked BOOLEAN;
    v_attribution_count INTEGER;
BEGIN
    -- Cria o usuário do novo tutor
    INSERT INTO public.users (
        id, email, full_name, system_role
    ) VALUES (
        v_tutor_user_id,
        'novo.tutor.rastreado@gmail.com',
        'Marcos Vinicius (Tutor Rastreado)',
        'tutor'
    );

    -- Executa a vinculação via token de sessão (cookie)
    SELECT public.bind_tutor_to_partner(
        v_tutor_user_id,
        'sess_mock_token_animal_feliz_999'
    ) INTO v_bind_res;

    -- Valida se o tutor foi associado ao tenant do Animal Feliz
    SELECT EXISTS (
        SELECT 1 FROM public.tutors 
        WHERE user_id = v_tutor_user_id 
          AND tenant_id = '33333333-3333-3333-3333-333333333333'
    ) INTO v_is_tutor_linked;

    -- Valida se gerou atribuição de comissão futura
    SELECT count(*) INTO v_attribution_count
    FROM public.referral_attributions
    WHERE referred_user_id = v_tutor_user_id
      AND tenant_id = '33333333-3333-3333-3333-333333333333';

    IF v_is_tutor_linked AND v_attribution_count = 1 THEN
        INSERT INTO attribution_test_results VALUES (
            '3.3',
            'Vínculo Definitivo Tutor -> Pet Shop via Atribuição',
            true,
            'Tutor perfeitamente vinculado ao tenant do Animal Feliz e comissão futura garantida!'
        );
    ELSE
        INSERT INTO attribution_test_results VALUES (
            '3.3',
            'Vínculo Definitivo Tutor -> Pet Shop via Atribuição',
            false,
            format('Falha de vinculação! Vinculado: %s, Atribuições: %s', v_is_tutor_linked, v_attribution_count)
        );
    END IF;
END $$;

-- Exibe os resultados consolidados
SELECT 
    test_id AS "ID",
    title AS "Cenário de Teste - Fase 3",
    CASE WHEN passed THEN '✅ APROVADO' ELSE '❌ FALHOU' END AS "Status",
    details AS "Resultado"
FROM attribution_test_results
ORDER BY test_id;

ROLLBACK;
