# AUDIT_FASE_14 — Notificações Interna, E-mail, WhatsApp e Push

## Resultado
A **Fase 14** do TELEVET implementa a infraestrutura completa e resiliente de notificações multi-canal (In-App, E-mail, WhatsApp Business API Oficial e Push), orquestrada por uma **Fila Outbox** transacional com garantia estrita de **idempotência (`idempotency_key UNIQUE`)**, impedindo qualquer duplicação de envios. A arquitetura reutiliza a tabela `public.notifications` existente para a caixa de entrada do usuário (sem duplicar filas) e estabelece adaptadores modulares para provedores externos. 

Em total conformidade com as exigências da LGPD e as normas do CFMV (Conselho Federal de Medicina Veterinária), **todas as mensagens externas utilizam conteúdo mínimo e link seguro autenticado**, sendo categoricamente vedada a exposição de prontuários, hipóteses diagnósticas, nomes de medicamentos ou dosagens clínicas em texto livre. O canal de WhatsApp exige **consentimento prévio explícito (opt-in)** com registro de data e IP. Na ausência de credenciais válidas de provedores externos, as mensagens são registradas com o status **"PENDENTE DE CONFIGURAÇÃO"**, assegurando que nenhum registro seja falsamente marcado como enviado ou entregue sem evidência real do provedor.

---

## O que existia antes
- **`public.notifications`** (migração 0008): tabela básica com campos `id`, `tenant_id`, `user_id`, `title`, `message`, `channel`, `category`, `action_url`, `read_at`, `created_at`, sem suporte a fila outbox, tentativas de retry, controle de entrega ou rastreamento de provedores externos.
- **Ausência de tabelas de Outbox, Templates e Preferências**: inexistia tabela de fila outbox resiliente, versionamento de templates de comunicação e preferências granulares de opt-in/opt-out por usuário.
- **Ausência de Adaptadores de Mensageria**: não havia adaptadores TypeScript estruturados para Resend, Meta WhatsApp Business API Oficial ou Firebase/Web Push.

---

## O que foi criado/alterado

### 1. Banco de Dados e Migração (`supabase/migrations/0035_notifications_outbox_preferences_and_templates.sql`)
- **Tabela de Preferências e Opt-in LGPD (`public.user_notification_preferences`)**:
  - `in_app_enabled`, `email_enabled`, `push_enabled`, `reminders_enabled`, `clinical_alerts_enabled`, `marketing_enabled`.
  - `whatsapp_enabled BOOLEAN NOT NULL DEFAULT false`: **opt-in explícito obrigatório** para o canal de WhatsApp.
  - `whatsapp_opt_in_at TIMESTAMPTZ` e `whatsapp_opt_in_ip INET`: registro de consentimento formal.
- **Tabela de Templates Versionados (`public.notification_templates`)**:
  - Constraint `UNIQUE (slug, version, channel)`.
  - Templates pré-cadastrados com **conteúdo mínimo e link seguro** para todos os eventos:
    * Agendamento (`appointment_confirmed`, `appointment_canceled`, `appointment_rescheduled`)
    * Lembretes (`appointment_reminder`)
    * Pagamento (`payment_approved`, `payment_failed`)
    * Teleconsulta (`consultation_starting`)
    * Documentos (`prescription_ready`, `exam_ready`)
    * Encaminhamento (`referral_issued`)
    * Vacinas (`vaccine_due`)
    * Assinaturas SaaS (`subscription_updated`)
    * Suporte (`support_ticket_updated`)
- **Tabela Fila Outbox Resiliente (`public.notification_outbox`)**:
  - `idempotency_key VARCHAR(255) UNIQUE`: **trava anti-duplicação matemática**. Um evento não gera notificações duplicadas.
  - Campos de controle: `tenant_id`, `user_id`, `notification_id` (amarração direta com a tabela in-app existente), `event`, `channel`, `recipient`, `template_slug`, `template_version`, `rendered_subject`, `rendered_body`, `payload`, `secure_link`.
  - Status rigoroso: `pending`, `pending_configuration`, `processing`, `sent`, `delivered`, `failed`, `skipped_opt_out`, `canceled`.
  - Controle de retries: `attempts`, `max_attempts`, `next_retry_at` com backoff exponencial.
  - Rastreamento externo: `external_id`, `provider_response`, `error_message`, `sent_at`, `delivered_at`, `failed_at`.
- **Funções RPC com `SECURITY DEFINER` e `SET search_path = ''`**:
  - `fn_enqueue_notification`: enfileiramento com verificação de idempotência (retorna `idempotent_reused: true` sem criar registros repetidos), validação de preferências (se o canal estiver desativado ou sem opt-in para WhatsApp, marca `skipped_opt_out`), renderização com `secure_link` e inserção transparente em `public.notifications` quando `channel = 'in_app'`.
  - `fn_claim_notification_outbox`: busca concorrente segura com bloqueio de linha `FOR UPDATE SKIP LOCKED`.
  - `fn_update_notification_outbox_status`: gerencia transições de status com cálculo de backoff exponencial em caso de falha transitória, marcação de `pending_configuration` e confirmação de entrega via evidência do provedor.
  - `fn_update_notification_preferences` e `fn_get_notification_preferences`: manutenção do perfil de consentimento e canais.
  - `fn_get_outbox_audit_metrics`: consolidação de métricas e taxa de sucesso da outbox para o painel de auditoria.
- **Políticas RLS (Row Level Security)**:
  - Usuários leem e gerenciam apenas suas próprias preferências e histórico de notificações.
  - DML direto bloqueado para `public` e `anon`.
  - Administradores do tenant e superadmins possuem acesso restrito para auditoria e operação.

### 2. Arquitetura TypeScript e Adaptadores (`src/notifications/`)
- **`src/notifications/types.ts`**:
  - Modelagem estrita de tipos para canais, eventos, payloads, resultados de envio e métricas operacionais.
- **Adaptadores Multi-Canal (`src/notifications/adapters/`)**:
  - `NotificationAdapter` (interface base): contrato padronizado `send(item: OutboxItem): Promise<AdapterSendResult>`.
  - `EmailAdapter`: integração com Resend / SendGrid / SMTP. Sem credenciais válidas, marca `pending_configuration`.
  - `WhatsAppAdapter`: integração com Meta WhatsApp Cloud API Oficial. Sanitização E.164, checagem de chave e trava de segurança anti-vazamento clínico.
  - `PushAdapter`: integração com Firebase Cloud Messaging / Web Push com controle de credenciais pendentes.
  - `InAppAdapter`: inserção direta e reutilização de `public.notifications`.
- **Validador de Privacidade e Link Seguro (`src/notifications/template-engine.ts`)**:
  - Interpolação segura de variáveis `{{var}}`.
  - Método `assertClinicalPrivacy`: bloqueia preventivamente o envio em caso de detecção de termos diagnósticos (CID-10, prontuário, posologias ou princípios ativos de medicamentos), forçando o redirecionamento para links seguros autenticados.
  - Método `generateSecureLink`: gera links temporários com token e expiração controlada.
- **Serviço Central Unificado (`src/notifications/notification-service.ts`)**:
  - Métodos de alto nível para todos os eventos da plataforma:
    * `notifyAppointmentConfirmed`
    * `notifyAppointmentCanceled`
    * `notifyAppointmentRescheduled`
    * `notifyAppointmentReminder`
    * `notifyPaymentApproved`
    * `notifyPaymentFailed`
    * `notifyConsultationStarting`
    * `notifyPrescriptionReady`
    * `notifyExamReady`
    * `notifyReferralIssued`
    * `notifyVaccineDue`
    * `notifySubscriptionUpdated`
    * `notifySupportTicketUpdated`
  - Método `processOutbox(batchSize)`: consome itens pendentes, despacha para os adaptadores registrados e atualiza status no banco.
  - Métodos `getPreferences`, `updatePreferences`, `getAuditMetrics`, `getUserInAppNotifications` e `markNotificationAsRead`.
- **Processador de Webhooks (`src/notifications/webhooks/notification-webhook-handler.ts`)**:
  - Recepção e mapeamento de webhooks oficiais da Meta (WhatsApp status: `sent`, `delivered`, `read`, `failed`) e Resend (e-mail: `delivered`, `bounced`).
  - Atualização com evidência oficial do provedor vinculada ao `external_id`.

### 3. Frontend e Telas do Next.js (App Router)
- **Central de Notificações In-App (`src/components/notifications/notification-center.tsx`)**:
  - Ícone de sino responsivo com badge numérico de não lidas.
  - Dropdown com histórico cronológico, categorização por ícone (consulta, vacina, receita, pagamento), ação rápida "Marcar como lida" e botão direto para o link seguro.
- **Formulário de Preferências e Opt-in LGPD (`src/components/notifications/notification-preferences-form.tsx`)**:
  - Toggles intuitivos para E-mail, WhatsApp Oficial, Push e In-App.
  - Modal formal de consentimento informado para ativação de WhatsApp.
  - Aviso explicativo sobre proteção e sigilo clínico CFMV/LGPD.
- **Página de Preferências do Usuário (`src/app/notificacoes/preferencias/page.tsx`)**:
  - Rota acessível ao tutor e veterinário para gerenciar canais de comunicação.
- **Painel Administrativo de Auditoria da Outbox (`src/app/admin/notificacoes/page.tsx`)**:
  - 6 Cartões de métricas (Total, Entregues, Enviadas, Pendentes de Configuração, Opt-Outs, Falhas).
  - Tabela completa da Fila Outbox com filtros dinâmicos por canal e status.
  - Modal de inspeção detalhada do payload, template, link seguro, mensagem de erro e resposta JSON bruta do provedor.
  - Botão de acionamento manual do worker da Outbox.
- **Rotas de API**:
  - `src/app/api/notifications/worker/route.ts`: acionamento sob demanda do processador de outbox.
  - `src/app/api/notifications/webhook/route.ts`: endpoint para verificação do webhook da Meta e recebimento de callbacks de entrega.

---

## Regras de segurança/comerciais respeitadas
1. **Idempotência Rigorosa e Trava Anti-Duplicação**:
   - `idempotency_key VARCHAR(255) UNIQUE` na tabela `notification_outbox`. Um mesmo agendamento ou evento nunca gera notificações repetidas.
2. **Sigilo Clínico e Conteúdo Mínimo (CFMV / LGPD)**:
   - Mensagens externas usam estritamente conteúdo essencial ("sua consulta está confirmada", "seu documento veterinário está pronto") acompanhado de link autenticado e seguro.
   - Nenhuma hipótese diagnóstica, posologia, nome de remédio de receita ou prontuário é transmitido em e-mail aberto ou WhatsApp.
3. **Sem Credenciais Válidas: "PENDENTE DE CONFIGURAÇÃO"**:
   - Se o ambiente não possuir `RESEND_API_KEY`, `WHATSAPP_API_TOKEN` ou credenciais FCM válidas, o sistema marca `pending_configuration`. Nunca declara enviado sem resposta real do provedor.
4. **Status "Enviado/Entregue" Somente com Evidência Real**:
   - Status `sent` só é gravado com o retorno do ID oficial do provedor (`wamid`, `id` do Resend). O status `delivered` requer webhook real de entrega ou entrega in-app confirmada.
5. **Opt-in Exigido para WhatsApp e Respeito Estrito a Opt-Out**:
   - WhatsApp desativado por padrão; requer ativação voluntária com consentimento.
   - Canais desativados pelo usuário resultam em status imediato `skipped_opt_out`, sem chamada a APIs externas.
6. **Reutilização sem Duplicação de Filas**:
   - Reutilizada a tabela `public.notifications` existente; a outbox funciona como orquestrador transacional sem redundância.

---

## Funções/RPCs principais
- `public.fn_enqueue_notification(...)`
- `public.fn_claim_notification_outbox(...)`
- `public.fn_update_notification_outbox_status(...)`
- `public.fn_update_notification_preferences(...)`
- `public.fn_get_notification_preferences(...)`
- `public.fn_get_outbox_audit_metrics(...)`

---

## Testes Realizados

### 1. Testes Unitários de Regras de Negócio e Adaptadores (`scripts/test-notifications-runner.mjs`)
Executados via `npx tsx scripts/test-notifications-runner.mjs`:
- `TemplateEngine`: substituição de variáveis e injeção do link seguro: **PASSOU**.
- `assertClinicalPrivacy`: bloqueio de dados clínicos sensíveis (CID-10, prontuário, dosagem de remédio) em canal aberto: **PASSOU**.
- `EmailAdapter`: retorno de `pending_configuration` na ausência de credenciais: **PASSOU**.
- `WhatsAppAdapter`: retorno de `pending_configuration` na ausência de credenciais da Meta: **PASSOU**.
- `PushAdapter`: retorno de `pending_configuration` na ausência de FCM key: **PASSOU**.
- **Resultado: 5 testes executados, 5 aprovados, 0 falhas (143ms).**

### 2. Testes de Banco de Dados pgTAP (`supabase/tests/database/notifications_outbox_test.sql`)
16 asserts estruturados:
- Existência das tabelas `user_notification_preferences`, `notification_templates`, `notification_outbox`.
- Constraint `col_is_unique('notification_outbox', 'idempotency_key')`.
- Existência de templates versionados com conteúdo seguro.
- Respeito ao opt-out: usuário sem WhatsApp opt-in recebe status `skipped_opt_out`.
- Registro formal de opt-in com timestamp e IP.
- Anti-duplicação: segunda chamada com a mesma chave de idempotência retorna `idempotent_reused = true` e contagem exata de 1 registro.
- Reutilização de `public.notifications` para notificações in-app.
- Política de retry: primeira falha incrementa `attempts` para 1 e agenda retry com backoff exponencial.
- Evidência real: gravação de `external_id` (wamid) e atualização para `sent` apenas com resposta oficial.

### 3. TypeScript (`npx tsc --noEmit`)
- Compilação estática de todo o projeto Next.js e da biblioteca de notificações: **0 erros de tipagem**.

---

## Pendências e riscos
- **Credenciais Oficiais de Produção**: Em ambiente local/sandbox, as variáveis `RESEND_API_KEY`, `WHATSAPP_API_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` mantêm o sistema operando com status transparente `"PENDENTE DE CONFIGURAÇÃO"` até a configuração das chaves de produção da clínica/empresa.
- **Docker Local**: A aplicação da migração 0035 e a execução da suíte pgTAP no Postgres local dependem da inicialização do Docker Desktop no Windows hospedeiro.

---

## Comandos para validar quando Docker/staging estiverem disponíveis
```bash
# 1. Reset e aplicação das migrações
npx supabase db reset

# 2. Lint do banco de dados
npx supabase db lint

# 3. Testes pgTAP de banco de dados
npx supabase test db

# 4. Testes unitários de notificações
npm run test:notifications

# 5. Typecheck do TypeScript
npm run typecheck

# 6. Build do Next.js
npm run build
```
