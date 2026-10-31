-- ==============================================================================
-- supabase/tests/database/televet_ads_test.sql
-- Testes pgTAP da Fase 17: TeleVet Ads (Publicidade, Patrocínios e Privacidade)
-- ==============================================================================

BEGIN;
SELECT plan(10);

-- 1. Estrutura de tabelas de publicidade
SELECT has_table('public', 'ad_plans', 'Tabela ad_plans deve existir');
SELECT has_table('public', 'advertisers', 'Tabela advertisers deve existir');
SELECT has_table('public', 'ad_campaigns', 'Tabela ad_campaigns deve existir');
SELECT has_table('public', 'ad_creatives', 'Tabela ad_creatives deve existir');
SELECT has_table('public', 'ad_placements', 'Tabela ad_placements deve existir');
SELECT has_table('public', 'ad_events', 'Tabela ad_events deve existir');

-- 2. Carga inicial dos 5 planos configuráveis
SELECT results_eq(
    'SELECT count(*)::int FROM public.ad_plans WHERE is_active = true',
    ARRAY[5],
    'Devem existir 5 planos de publicidade configurados no banco de dados'
);

-- 3. Funções RPC fundamentais
SELECT has_function('public', 'serve_ads', 'Função serve_ads deve existir');
SELECT has_function('public', 'record_ad_event', 'Função record_ad_event deve existir');

-- 4. Trava de segurança no banco: rejeitar termos clínicos em campanhas
SELECT throws_ok(
    $$INSERT INTO public.ad_campaigns (advertiser_id, name, campaign_type, scope, target_categories) 
      VALUES (gen_random_uuid(), 'Campanha com prontuário e vacina do pet', 'banner', 'regional', ARRAY['vacina'])$$,
    '22023',
    NULL,
    'Tentativa de usar termos clínicos (prontuário/vacina) deve disparar exceção 22023'
);

SELECT * FROM finish();
ROLLBACK;
