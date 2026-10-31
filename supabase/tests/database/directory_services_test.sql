-- ==============================================================================
-- supabase/tests/database/directory_services_test.sql
-- Testes pgTAP da Fase 16: Diretório Nacional de Serviços de Saúde Animal
-- ==============================================================================

BEGIN;
SELECT plan(12);

-- 1. Extensões essenciais
SELECT has_extension('postgis', 'Extensão postgis deve estar instalada');
SELECT has_extension('pg_trgm', 'Extensão pg_trgm deve estar instalada');
SELECT has_extension('unaccent', 'Extensão unaccent deve estar instalada');

-- 2. Estrutura de tabelas do Diretório
SELECT has_table('public', 'service_categories', 'Tabela service_categories deve existir');
SELECT has_table('public', 'service_providers', 'Tabela service_providers deve existir');
SELECT has_table('public', 'provider_photos', 'Tabela provider_photos deve existir');
SELECT has_table('public', 'provider_regions', 'Tabela provider_regions deve existir');
SELECT has_table('public', 'provider_reports', 'Tabela provider_reports deve existir');
SELECT has_table('public', 'provider_click_events', 'Tabela provider_click_events deve existir');

-- 3. Existência das 9 categorias obrigatórias
SELECT results_eq(
    'SELECT count(*)::int FROM public.service_categories WHERE is_active = true',
    ARRAY[9],
    'Devem existir exatamente 9 categorias ativas cadastradas inicialmente'
);

-- 4. Trava de segurança: rejeitar inserção de categoria proibida (ex: clinica)
SELECT throws_ok(
    $$INSERT INTO public.service_categories (slug, name, description) VALUES ('clinicas', 'Clínicas Veterinárias', 'Atendimento de clínicas')$$,
    '22023',
    NULL,
    'Tentativa de cadastrar categoria proibida (clínicas) deve lançar exceção 22023'
);

-- 5. Funções RPC fundamentais
SELECT has_function('public', 'search_service_providers', 'Função search_service_providers deve existir');

SELECT * FROM finish();
ROLLBACK;
