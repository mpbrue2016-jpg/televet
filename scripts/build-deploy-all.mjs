import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const migrationsDir = path.join(projectRoot, 'supabase', 'migrations');
const outputFile = path.join(projectRoot, 'supabase', 'deploy_all.sql');

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const header = `-- ==============================================================================
-- TELEVET - DEPLOY COMPLETO E UNIFICADO DO BANCO DE DADOS SUPABASE
-- Plataforma Multi-Tenant, Marketplace Veterinário, SaaS White-Label & Telemedicina
-- ==============================================================================
-- Data de Geração: ${new Date().toISOString()}
-- Total de Migrações Integradas: ${files.length}
-- Compatibilidade: PostgreSQL 15+ / Supabase
--
-- COMO APLICAR NO SUPABASE:
-- OPÇÃO 1 (Recomendada via Web):
--   1. Acesse o SQL Editor do seu projeto Supabase:
--      https://supabase.com/dashboard/project/griohqwryktqupvcfskh/editor
--   2. Crie uma nova query (New Query).
--   3. Cole o conteúdo integral deste arquivo e clique em "Run" (Executar).
--
-- OPÇÃO 2 (Via Supabase CLI):
--   supabase db push
-- ==============================================================================

BEGIN;

`;

const footer = `
COMMIT;

-- ==============================================================================
-- FIM DO SCRIPT DE DEPLOY UNIFICADO TELEVET
-- Todas as ${files.length} migrações foram aplicadas com sucesso.
-- ==============================================================================
`;

let body = '';
for (const file of files) {
  const filePath = path.join(migrationsDir, file);
  const content = fs.readFileSync(filePath, 'utf-8');

  body += `-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n`;
  body += `-- MIGRATION: ${file}\n`;
  body += `-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n\n`;
  body += content.trim() + '\n\n';
}

fs.writeFileSync(outputFile, header + body + footer, 'utf-8');

const stats = fs.statSync(outputFile);
console.log(`✅ deploy_all.sql gerado com sucesso!`);
console.log(`📁 Arquivo: ${outputFile}`);
console.log(`📊 Migrações: ${files.length}`);
console.log(`📏 Tamanho: ${(stats.size / 1024).toFixed(1)} KB`);
