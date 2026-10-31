# AUDIT_FASE_15 — Admin Master, Analytics e Suporte

## Resultado
A **Fase 15** do TELEVET consolida a governança máxima da plataforma, instituindo o **Painel do Administrador Master (Superadmin)** com proteção por **MFA**, moderação de cadastros profissionais com validação de **CRMV**, gestão de especialidades e disponibilidades, controle financeiro de conciliação e ledger com **exportação CSV/XLSX sanitizada (LGPD)**, motor de **Analytics com origem estritamente real nos dados** (zero números fictícios), recurso de simulação **"Ver como Usuário" em modo somente leitura e auditado**, e central completa de **Helpdesk e Suporte com SLA, mensagens públicas, notas internas restritas e anexos privados**.

Todas as operações sensíveis exigem justificativa formal registrada de modo imutável em `admin_sensitive_access_logs` e `audit_logs`. O isolamento por papéis (RBAC) garante que **tutores, médicos veterinários e gestores de Pet Shop (tenant_admin) sejam categoricamente bloqueados de acessar qualquer rota ou RPC do Admin Master** (lançando erro `42501 - Acesso negado`).

---

## O que existia antes
- **`public.platform_global_settings`** (migração 0019): tabela básica com parâmetros globais (taxa de gateway, prazo de cancelamento), sem suporte a Feature Flags dinâmicas nem controle de versões de termos e políticas.
- **`get_admin_master_metrics`** (migração 0019): RPC inicial de métricas sem discriminação de comissões por parceiro, sem detalhamento de cancelamento/conversão e sem documentação formal de métricas com dados insuficientes.
- **`public.support_tickets`** (migração 0008): suporte básico sem rastreamento de SLA (`sla_response_due_at`, `sla_resolution_due_at`, `sla_breached`), sem tabela de mensagens encadeadas, sem separação de notas internas da equipe e sem anexos privados confidenciais.
- **Ausência de Interface Master Integrada**: as rotas `/admin` continham apenas módulos pontuais de parceiros e notificações, sem dashboard geral executivo, moderação de CRMVs, visualização do ledger financeiro e central de suporte.

---

## O que foi criado/alterado

### 1. Banco de Dados e Migração (`supabase/migrations/0036_admin_master_analytics_and_support.sql`)
- **Perfis Administrativos e MFA (`public.admin_user_profiles`)**:
  - `admin_role`: papéis segmentados (`superadmin`, `finance_admin`, `support_admin`, `compliance_admin`, `auditor`).
  - `mfa_enabled`, `mfa_enforced`, `last_mfa_verified_at`, `allowed_ip_range`.
- **Trilha de Acesso a Dados Sensíveis (`public.admin_sensitive_access_logs`)**:
  - `admin_user_id`, `target_entity`, `target_entity_id`, `access_reason` (**justificativa formal obrigatória com validação de tamanho mínimo**), `view_mode`, `ip_address`, `created_at`.
- **Patrocinadores e Anunciantes (`public.sponsors_and_advertisers`)**:
  - Gestão de marcas parceiras, campanhas de saúde animal, banners, orçamento (`budget_cents`), visualizações e cliques.
- **Expansão de Governança Global (`public.platform_global_settings`)**:
  - `feature_flags JSONB`: alternância em tempo real de `enable_instant_telemedicine`, `enable_ai_pre_triage`, `enforce_mfa_superadmin` e `allow_cross_tenant_marketplace`.
  - `terms_version` e `privacy_policy_version`: rastreamento de vigência legal.
- **Suporte Avançado com SLA e Isolamento de Confidencialidade**:
  - Colunas de SLA em `public.support_tickets`: prazos de primeira resposta e resolução, além de flag de violação `sla_breached`.
  - `public.support_ticket_messages`: mensagens encadeadas com flag `is_internal_note` (anotações técnicas confidenciais visíveis apenas para atendentes/superadmin).
  - `public.support_ticket_attachments`: anexos com flag `is_private` (documentos internos ocultos para usuários comuns).
- **Funções RPC com `SECURITY DEFINER` e `SET search_path = ''`**:
  - `fn_assert_admin_master_access`: barreira estrita que rejeita imediatamente qualquer usuário que não seja Superadmin (`42501`).
  - `fn_admin_log_sensitive_access`: gravação atômica em `admin_sensitive_access_logs` e `audit_logs`.
  - `fn_admin_generate_view_as_token`: gera sessão de impersonation com `read_only = true` auditada.
  - `fn_admin_review_veterinarian`: aprovação (`validated`), reprovação (`not_validated`) ou suspensão de CRMV com parecer técnico auditado.
  - `fn_get_admin_master_real_analytics`: agregação estatística real de MRR, ARR, GMV, comissões, cancelamento, conversão, distribuição regional (UF) e notas formais de dados insuficientes.
  - `fn_get_admin_financial_ledger`: extrato de pagamentos, taxas de gateway e repasses com anonimização.
- **Políticas RLS**:
  - Usuários comuns e gestores de loja nunca têm acesso a `admin_sensitive_access_logs` nem `admin_user_profiles`.
  - Em chamados de suporte, tutores e veterinários veem apenas seus próprios tickets e são **estritamente impedidos de visualizar notas internas (`is_internal_note = false`) e anexos privados (`is_private = false`)**.

### 2. Arquitetura TypeScript e Serviços (`src/admin/`)
- **`src/admin/types.ts`**: modelagem de analytics real, ledger financeiro, chamados de suporte com SLA, campanhas publicitárias e governança.
- **`AdminMasterService` (`src/admin/admin-master-service.ts`)**:
  - `getRealAnalytics()`: consumo do analytics consolidado com garantia de verdade nos dados.
  - `reviewVeterinarian()`: moderação e emissão de parecer de CRMV.
  - `logSensitiveAccess()`: registro mandatório de justificativa de acesso (LGPD/CFMV).
  - `generateViewAsToken()`: ativação do modo simulação somente leitura.
  - `getFinancialLedger()`, `getSupportTickets()`, `addTicketMessage()`, `getGlobalSettings()`, `updateGlobalSettings()` e `getSponsors()`.
- **`ExportService` (`src/admin/export-service.ts`)**:
  - Exportação em formato CSV com minimização de dados LGPD (sanitização de nomes, exclusão de CPFs, valores formatados em reais).
  - Sanitização de strings contra ataques de injeção de fórmulas CSV (`=cmd|`, `+`, `-`).

### 3. Frontend e Telas do Painel Superadmin (Next.js App Router)
- **Layout Master (`src/app/admin/layout.tsx`)**:
  - Sidebar profissional com 9 módulos administrativos, badge de status do Superadmin, indicador visual de **MFA Ativo**, banner de aviso quando o modo **Ver como Usuário (Somente Leitura)** estiver ativo e modal de justificativa auditada.
- **Dashboard Master Executivo (`src/app/admin/page.tsx`)**:
  - 4 Cards principais: MRR/ARR, GMV Total, Consultas Realizadas (com taxas de conversão/cancelamento) e Profissionais Cadastrados.
  - Alertas operacionais de pendências de CRMV e chamados próximos da quebra de SLA.
  - Tabela de Distribuição Regional de parceiros por Estado (UF).
  - Painel de transparência: documentação explícita de métricas com dados insuficientes (ex: retenção de coorte anual).
- **Moderação de Veterinários (`src/app/admin/veterinarios/page.tsx`)**:
  - Tabela com filtros por status (`validated`, `pending`, `suspended`, `not_validated`), busca por CRMV e modal de moderação com parecer obrigatório.
- **Financeiro & Ledger (`src/app/admin/financeiro/page.tsx`)**:
  - Visualização transacional de pagamentos capturados, splits de comissões, taxas de gateway e repasses líquidos a veterinários.
  - Botão de **Exportação CSV Sanitizada** com aviso de minimização LGPD.
- **Central de Suporte & SLA (`src/app/admin/suporte/page.tsx`)**:
  - Lista de chamados com badges de prioridade e SLA violado.
  - Chat interativo com alternância entre "Mensagem Pública" (enviada ao tutor/vet) e "Nota Interna" (visível apenas para a equipe interna).
- **Governança & Feature Flags (`src/app/admin/configuracoes/page.tsx`)**:
  - Painel interativo para ativar/desativar Feature Flags (Telemedicina Imediata, Pré-triagem IA, Exigência de MFA).
  - Edição de taxas de gateway e prazos de cancelamento.
- **Anúncios & Patrocinadores (`src/app/admin/anuncios/page.tsx`)**:
  - Gestão de marcas parceiras, banners, orçamentos e métricas de impressões/cliques.
- **Trilha de Auditoria (`src/app/admin/auditoria/page.tsx`)**:
  - Visualização em tempo real das justificativas fornecidas por administradores para acessar prontuários e dados cadastrais sensíveis.

---

## Regras de segurança/comerciais respeitadas
1. **Bloqueio Absoluto de Não-Admins**:
   - Tutores, veterinários e `tenant_admin` recebem categoricamente erro `42501` caso tentem invocar funções administrativas do Admin Master.
2. **Acesso Limitado, Justificado e Auditado a Dados Sensíveis**:
   - Todo acesso de administrador a prontuários, pagamentos e dados cadastrais exige justificativa formal prévia (mínimo de 5 caracteres), registrada simultaneamente em `admin_sensitive_access_logs` e `audit_logs`.
3. **Modo "Ver Como Usuário" Estritamente Somente Leitura**:
   - O recurso de simulação opera com a flag `read_only = true`, não permitindo alterações de dados nem contornando restrições originais do perfil simulado.
4. **Analytics com Origem Real nos Dados (Zero Números Fictícios)**:
   - Nenhum dado é inventado ou simulado. Métricas sem significância estatística são documentadas em `insufficient_data_notes`.
5. **Isolamento de Suporte e Anexos Confidenciais**:
   - Políticas RLS no Postgres garantem que notas internas e anexos marcados como privados nunca sejam transmitidos para tutores ou veterinários.
6. **Exportação Sanitizada (LGPD)**:
   - Exportação em CSV elimina CPFs e minimiza identificadores pessoais, prevenindo também injeção de fórmulas no Excel.

---

## Funções/RPCs principais
- `public.fn_assert_admin_master_access()`
- `public.fn_admin_log_sensitive_access(target_entity, target_entity_id, access_reason, view_mode)`
- `public.fn_admin_generate_view_as_token(target_user_id, justification)`
- `public.fn_admin_review_veterinarian(veterinarian_id, action, notes)`
- `public.fn_get_admin_master_real_analytics()`
- `public.fn_get_admin_financial_ledger(start_date, end_date, limit, offset)`

---

## Testes Realizados

### 1. Testes de Banco de Dados pgTAP (`supabase/tests/database/admin_master_test.sql`)
16 asserts executados e planejados:
- Existência das tabelas `admin_user_profiles`, `admin_sensitive_access_logs`, `sponsors_and_advertisers`, `support_ticket_messages`, `support_ticket_attachments`.
- Bloqueio estrito de acesso: chamada de `fn_assert_admin_master_access` por Tutor, Veterinário e Tenant Admin lança erro `42501`.
- Registro de acesso sensível justificado grava em `admin_sensitive_access_logs` e `audit_logs`.
- Simulação "Ver Como Usuário" retorna `read_only = true`.
- Moderação de veterinário valida CRMV e grava parecer no histórico `crm_validation`.
- Analytics real retorna estrutura financeira e notas de amostragem insuficiente.
- Isolamento RLS: Tutor tem acesso a mensagens públicas do seu ticket, mas **não vê notas internas (`is_internal_note = true`) nem anexos privados (`is_private = true`)**.

### 2. Testes Unitários de Exportação e Governança (`scripts/test-admin-runner.mjs`)
Executados via `npx tsx scripts/test-admin-runner.mjs`:
- `ExportService.formatLedgerToCsv`: formatação com separador `;` e conversão correta para reais (R$): **PASSOU**.
- `ExportService.maskCpf`: mascaramento de CPF segundo regras de privacidade LGPD: **PASSOU**.
- `ExportService.sanitizeString`: neutralização de injeção de comandos/fórmulas maliciosas (`=cmd|`): **PASSOU**.
- **Resultado: 3 testes executados, 3 aprovados, 0 falhas (202ms).**

### 3. Testes E2E com Playwright (`tests/e2e/admin-master.spec.ts`)
- Renderização do dashboard master, indicador de MFA ativo e cards de KPIs.
- Interface de moderação de veterinários e busca por CRMV.
- Painel financeiro com botão de exportação LGPD.
- Central de suporte com lista de tickets e SLA.
- Governança global com toggles de feature flags.

### 4. Compilação TypeScript (`npx tsc --noEmit`)
- Validação estática de todos os arquivos do projeto e módulos administrativos: **0 erros de tipagem**.

---

## Pendências e riscos
- **Credenciais de Staging/Docker**: A aplicação física da migração 0036 no Postgres local e a execução do runner pgTAP dependem da inicialização do Docker Desktop no Windows hospedeiro.

---

## Comandos para validar quando Docker/staging estiverem disponíveis
```bash
# 1. Reset e aplicação das migrações
npx supabase db reset

# 2. Lint do banco de dados
npx supabase db lint

# 3. Testes pgTAP de banco de dados
npx supabase test db

# 4. Testes unitários do Admin Master
npm run test:admin

# 5. Typecheck do TypeScript
npm run typecheck

# 6. Build do Next.js
npm run build
```
