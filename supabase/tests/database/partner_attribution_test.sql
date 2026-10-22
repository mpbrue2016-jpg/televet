-- ==============================================================================
-- partner_attribution_test.sql
-- Fase 13: Pet Shops Parceiros, White Label, Trava Anti-Duplicação e Planos SaaS
-- ==============================================================================

BEGIN;
SELECT plan(15);

-- ---------------------------------------------------------------------------
-- 1. Verificação Estrutural de Tabelas e Constraints
-- ---------------------------------------------------------------------------

SELECT has_table('public', 'partner_system_settings', 'Tabela partner_system_settings existe');
SELECT has_table('public', 'partner_attributions', 'Tabela partner_attributions existe');
SELECT has_table('public', 'partner_subscriptions', 'Tabela partner_subscriptions existe');

SELECT col_is_unique(
    'public',
    'partner_attributions',
    'appointment_id',
    'Trava UNIQUE em appointment_id impede rigorosamente comissões duplicadas para a mesma consulta'
);

-- ---------------------------------------------------------------------------
-- 2. Configurações Globais e Planos Anuais
-- ---------------------------------------------------------------------------

SELECT is(
    (SELECT default_commission_rate FROM public.partner_system_settings LIMIT 1),
    10.00,
    'Taxa padrão inicial configurada para 10.00%'
);

SELECT ok(
    EXISTS (SELECT 1 FROM public.saas_plans WHERE billing_interval = 'yearly'),
    'Planos SaaS com ciclo anual cadastrados no banco'
);

-- ---------------------------------------------------------------------------
-- 3. Fixtures para Teste de Atribuição e Comissionamento
-- ---------------------------------------------------------------------------

-- Criar Tenant e Pet Shop de Teste
INSERT INTO public.tenants (id, name, slug)
VALUES ('77777777-7777-7777-7777-777777777777', 'Tenant Parceiro F13', 'pet-teste-f13')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.petshops (id, tenant_id, name, trade_name, cnpj, email, status, custom_commission_rate)
VALUES (
    '88888888-8888-8888-8888-888888888888',
    '77777777-7777-7777-7777-777777777777',
    'Pet Shop Alpha F13',
    'Alpha Pet Store',
    '12345678000199',
    'contato@alphapet.test',
    'active',
    15.00 -- 15% customizada
)
ON CONFLICT (id) DO NOTHING;

-- Criar Referral associado
INSERT INTO public.referrals (id, tenant_id, code, referrer_type, referrer_id, is_active)
VALUES (
    '99999999-9999-9999-9999-999999999999',
    '77777777-7777-7777-7777-777777777777',
    'ALPHABALCAO',
    'petshop',
    '88888888-8888-8888-8888-888888888888',
    true
)
ON CONFLICT (id) DO NOTHING;

-- Criar Consulta no Banco com valor de R$ 200,00 (20000 centavos)
INSERT INTO public.appointments (
    id, tenant_id, petshop_id, tutor_id, scheduled_for, starts_at, ends_at, price_cents
) VALUES (
    'aaaaaaaa-1313-4000-8000-000000000001',
    '77777777-7777-7777-7777-777777777777',
    '88888888-8888-8888-8888-888888888888',
    'a4444444-4444-4444-4444-444444444444',
    NOW(), NOW(), NOW() + INTERVAL '30 minutes',
    20000
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Execução da Função de Atribuição (fn_attribute_partner_commission)
-- ---------------------------------------------------------------------------

-- Primeira chamada: deve ter sucesso e aplicar a taxa de 15% (R$ 30,00 = 3000 centavos)
SELECT is(
    (SELECT (public.fn_attribute_partner_commission('aaaaaaaa-1313-4000-8000-000000000001'::uuid, 'ALPHABALCAO')->>'success')::boolean),
    true,
    'Atribuição executada com sucesso para agendamento válido'
);

SELECT is(
    (SELECT (public.fn_attribute_partner_commission('aaaaaaaa-1313-4000-8000-000000000001'::uuid, 'ALPHABALCAO')->>'code')),
    'ALREADY_ATTRIBUTED',
    'Segunda tentativa de atribuir a MESMA consulta é categoricamente rejeitada (Anti-Duplicação)'
);

SELECT is(
    (SELECT commission_amount_cents FROM public.partner_attributions WHERE appointment_id = 'aaaaaaaa-1313-4000-8000-000000000001'),
    3000,
    'Comissão calculada com exatidão matemática (15% de R$ 200,00 = R$ 30,00 / 3000 centavos)'
);

-- ---------------------------------------------------------------------------
-- 5. Consulta com Taxa Padrão Global (Fallback)
-- ---------------------------------------------------------------------------

-- Pet Shop sem taxa customizada (custom_commission_rate IS NULL)
INSERT INTO public.petshops (id, tenant_id, name, trade_name, cnpj, email, status, custom_commission_rate)
VALUES (
    '88888888-8888-8888-8888-000000000002',
    '77777777-7777-7777-7777-777777777777',
    'Pet Shop Beta F13',
    'Beta Pet Store',
    '12345678000198',
    'contato@betapet.test',
    'active',
    NULL -- Usa taxa padrão global de 10%
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.referrals (id, tenant_id, code, referrer_type, referrer_id, is_active)
VALUES (
    '99999999-9999-9999-9999-000000000002',
    '77777777-7777-7777-7777-777777777777',
    'BETABALCAO',
    'petshop',
    '88888888-8888-8888-8888-000000000002',
    true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.appointments (
    id, tenant_id, petshop_id, tutor_id, scheduled_for, starts_at, ends_at, price_cents
) VALUES (
    'aaaaaaaa-1313-4000-8000-000000000002',
    '77777777-7777-7777-7777-777777777777',
    '88888888-8888-8888-8888-000000000002',
    'a4444444-4444-4444-4444-444444444444',
    NOW(), NOW(), NOW() + INTERVAL '30 minutes',
    20000
)
ON CONFLICT (id) DO NOTHING;

SELECT is(
    (SELECT (public.fn_attribute_partner_commission('aaaaaaaa-1313-4000-8000-000000000002'::uuid, 'BETABALCAO')->>'success')::boolean),
    true,
    'Atribuição para pet shop com taxa global funciona com sucesso'
);

SELECT is(
    (SELECT commission_amount_cents FROM public.partner_attributions WHERE appointment_id = 'aaaaaaaa-1313-4000-8000-000000000002'),
    2000,
    'Comissão calculada com base na taxa global de 10% (10% de R$ 200,00 = R$ 20,00 / 2000 centavos)'
);

-- ---------------------------------------------------------------------------
-- 6. RPC: fn_get_partner_dashboard
-- ---------------------------------------------------------------------------

SELECT ok(
    (SELECT (public.fn_get_partner_dashboard('88888888-8888-8888-8888-888888888888'::uuid)->>'success')::boolean),
    'Dashboard do parceiro retorna sucesso com métricas e histórico estruturados'
);

-- ---------------------------------------------------------------------------
-- 7. Funções Administrativas de Atualização
-- ---------------------------------------------------------------------------

SELECT is(
    (SELECT (public.fn_update_partner_system_settings(12.50, 45, 10000)->>'success')::boolean),
    true,
    'Administrador atualiza parâmetros globais com sucesso'
);

SELECT is(
    (SELECT (public.fn_update_partner_custom_commission('88888888-8888-8888-8888-888888888888'::uuid, 18.00)->>'success')::boolean),
    true,
    'Administrador altera taxa personalizada do parceiro com sucesso'
);

SELECT * FROM finish();
ROLLBACK;
