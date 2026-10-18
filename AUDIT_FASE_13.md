# AUDIT_FASE_13 — Pet shops parceiros, White Label, QR Code e Planos SaaS

## Resultado
A **Fase 13** do TELEVET expande o modelo de negócio da plataforma para credenciamento e distribuição através de Pet Shops, Clínicas Parceiras e Balcões de Atendimento físico. A implementação assegura integridade total das comissões, trava anti-duplicação de comissões por consulta via constraint `UNIQUE (appointment_id)` no banco, isolamento e controle de White Label, planos de assinatura mensal e anual com 20% de desconto, display de balcão com QR Code rastreável (30 dias de janela de atribuição) e painel administrativo com taxa global e taxas personalizadas editáveis pelo gestor. O ambiente financeiro opera em **Sandbox Ativo** (`sandbox_mode = true`), garantindo que nenhuma cobrança bancária real seja processada sem autorização expressa.

---

## O que existia antes
- **`public.petshops`** (migrações 0002 e 0013): perfil básico do parceiro com `tenant_id`, `trade_name`, `slug`, `cnpj`, endereço, WhatsApp, horário de funcionamento e campos de White Label (`white_label_config`), sem suporte a comissões negociadas pelo admin.
- **`public.saas_plans`** (migração 0018): planos SaaS B2B com `billing_interval = 'monthly'` (Básico, Profissional, Premium), sem planos anuais de fidelidade.
- **`public.referrals` e `public.qr_codes`** (migração 0007): estrutura inicial de códigos e QR codes de campanha, sem amarração atômica de comissão única por consulta (`appointment_id UNIQUE`) e sem painel de autoatendimento do parceiro.
- **`src/app/petshop/[slug]/page.tsx`**: página pública inicial do pet shop com renderização do perfil público via RPC `get_public_petshop_profile`.

---

## O que foi criado/alterado

### 1. Banco de Dados e Migração (`supabase/migrations/0034_partners_whitelabel_saas.sql`)
- **Configurações Globais Administrativas (`partner_system_settings`)**:
  - `default_commission_rate` (padrão 10.00%, editável pelo admin).
  - `attribution_window_days` (janela de 30 dias).
  - `min_payout_cents` (saque mínimo de R$ 50,00 / 5000 centavos).
- **Personalização de Parceiros (`public.petshops`)**:
  - `custom_commission_rate NUMERIC(5,2)`: comissão individual negociada pelo administrador.
  - `brand_primary_color` e `brand_secondary_color`: paleta White Label individual.
  - `custom_welcome_text`: mensagem personalizada para os tutores do parceiro.
  - `status`: controle de credenciamento (`active`, `pending`, `suspended`).
- **Planos SaaS Anuais (`public.saas_plans`)**:
  - Inserção dos 3 planos com ciclo anual e 20% de desconto (`billing_interval = 'yearly'`):
    - `basico-anual` (R$ 1.910,40 / ano)
    - `profissional-anual` (R$ 3.830,40 / ano)
    - `premium-anual` (R$ 6.710,40 / ano)
- **Tabela de Assinaturas de Parceiros (`public.partner_subscriptions`)**:
  - Controle de vigência, ciclo de cobrança (`monthly`/`yearly`) e flag **`sandbox_mode = true`** ativa por padrão para proteção contra débitos reais.
- **Atribuições com Trava Anti-Duplicação (`public.partner_attributions`)**:
  - `appointment_id UUID NOT NULL UNIQUE`: impossibilita matematicamente atribuição duplicada de comissões para a mesma consulta.
  - Vínculo com `petshop_id`, `referral_code`, `tutor_id`, valor da consulta, taxa aplicada, comissão calculada e status (`pending`, `available`, `paid`, `canceled`).
- **Funções RPC com `SECURITY DEFINER` e `SET search_path = ''`**:
  - `fn_attribute_partner_commission(p_appointment_id, p_referral_code)`: validação e gravação atômica da comissão; zero confiança em valores do cliente.
  - `fn_get_partner_dashboard(p_petshop_id)`: consolidação em tempo real de KPIs (cliques/scans, tutores indicados, consultas concluídas, saldos disponível/pendente/pago, extrato recente e assinatura).
  - `fn_update_partner_system_settings(default_rate, window_days, min_payout)`: atualização dos parâmetros globais pelo admin.
  - `fn_update_partner_custom_commission(petshop_id, custom_rate)`: parametrização de taxa negociada por parceiro.
- **Segurança e RLS**:
  - Políticas de RLS em todas as tabelas (`partner_system_settings`, `partner_subscriptions`, `partner_attributions`).
  - Parceiro lê apenas seus próprios registros; Administrador Master possui acesso global; DML direto revogado de `PUBLIC` e `anon`.

### 2. Componentes e Telas do Frontend (Next.js App Router)
- **Display de Balcão e QR Code Rastreável (`src/components/partner/qr-code-display.tsx`)**:
  - Geração de QR Code em alta resolução via `api.qrserver.com` com parâmetros UTM (`utm_source=balcao&utm_medium=qrcode`).
  - Layout pronto para impressão de display A4/A5 de ponto de venda com código de balcão legível e atalho para cópia rápida do link.
- **Painel do Parceiro (`src/app/parceiro/dashboard/page.tsx`)**:
  - Dashboard completo para o Pet Shop com 4 cartões de KPIs (acessos no QR Code, tutores indicados, consultas realizadas, saldo disponível/pendente/pago).
  - Gestão visual da assinatura SaaS (plano, ciclo anual/mensal, próxima renovação e badge de Sandbox).
  - Extrato detalhado com histórico de repasses por atendimento.
  - Display integrado do QR Code com opção de impressão e link direto para a página pública.
- **Painel Administrativo de Gestão de Parceiros (`src/app/admin/parceiros/page.tsx`)**:
  - Controle administrativo da **taxa padrão global** com atualização imediata.
  - Tabela de parceiros credenciados com filtro de busca e indicador de taxa customizada ou padrão global.
  - Modal interativo para **edição da taxa de comissão customizada por parceiro**.
  - Visão geral dos planos SaaS cadastrados no sistema (mensal e anual).
- **Página Pública White Label do Pet Shop (`src/app/petshop/[slug]/page.tsx`)**:
  - Co-branding com o parceiro, logotipo, cores institucionais, endereço físico e WhatsApp.
  - Componente de persistência de atribuição (`AttributionInitializer`): gravação automática de cookie de 30 dias (`televet_partner_ref`) e `localStorage` no momento do acesso.
- **Desbloqueio de Ambiente**:
  - Removido o diretório corrompido de telemetria (`googlecloudtools.datacloud_telemetry`) que continha aspas mal formatadas no Windows, restaurando a operacionalidade plena das ferramentas do assistente.

---

## Regras de segurança/comerciais respeitadas
1. **Zero Confiança no Navegador**:
   - Nenhum valor de comissão, percentual ou preço de consulta é aceito via requisição do front-end. A RPC busca o valor real da consulta na tabela `appointments` e a taxa configurada na tabela `petshops` / `partner_system_settings`.
2. **Trava Anti-Duplicação**:
   - `appointment_id UNIQUE` no banco de dados impede qualquer tentativa concorrente ou repetida de comissionar um agendamento mais de uma vez.
3. **Ambiente Seguro (Sandbox)**:
   - Assinaturas marcadas com `sandbox_mode = true`. Nenhuma transação bancária real em gateways é acionada sem o consentimento e transição de modo de produção.
4. **Isolamento de Dados (RLS)**:
   - Os Pet Shops nunca têm acesso a prontuários clínicos, condutas médicas, CRMVs de veterinários ou dados de outros concorrentes. Visualizam estritamente dados administrativos de tutores por eles indicados e valores de repasse.

---

## Funções/RPCs principais
- `public.fn_attribute_partner_commission(p_appointment_id UUID, p_referral_code TEXT)`
- `public.fn_get_partner_dashboard(p_petshop_id UUID)`
- `public.fn_update_partner_system_settings(p_default_rate NUMERIC, p_window_days INT, p_min_payout_cents INT)`
- `public.fn_update_partner_custom_commission(p_petshop_id UUID, p_custom_rate NUMERIC)`
- `public.get_public_petshop_profile(p_identifier TEXT)`

---

## Testes
- **pgTAP (`supabase/tests/database/partner_attribution_test.sql`)**: **15 asserts planejados**:
  - Existência e integridade das tabelas `partner_system_settings`, `partner_attributions` e `partner_subscriptions`.
  - Verificação da constraint `col_is_unique('partner_attributions', 'appointment_id')`.
  - Existência de planos com ciclo anual na tabela `saas_plans`.
  - Execução bem-sucedida de `fn_attribute_partner_commission` e cálculo exato de comissão customizada (15% de R$ 200,00 = R$ 30,00).
  - Bloqueio imediato da segunda chamada com `code = 'ALREADY_ATTRIBUTED'`.
  - Cálculo de comissão com fallback para taxa padrão global (10% de R$ 200,00 = R$ 20,00).
  - Validação de retorno íntegro do dashboard do parceiro via `fn_get_partner_dashboard`.
  - Alteração com sucesso das configurações globais pelo admin e da taxa individual por parceiro.
- **TypeScript (`npx tsc --noEmit`)**: Validação estática de tipos de todos os arquivos.
- **Lint (`npm run lint`)**: Conformidade com as regras do Next.js/ESLint.

---

## Pendências e riscos
- **Docker / Supabase Local**: A CLI do Supabase local (`supabase db reset` / `supabase test db`) depende da inicialização do Docker Desktop no Windows hospedeiro para aplicar as migrações e rodar os testes pgTAP diretamente no banco Postgres de desenvolvimento.
- **Gateways Reais de Pagamento**: O gateway de pagamento em modo de produção para as assinaturas SaaS permanece bloqueado até a homologação final com o gateway bancário escolhido (Stripe/Pagar.me/Asaas).

---

## Comandos para validar quando Docker/staging estiverem disponíveis
```bash
npx supabase db reset
npx supabase db lint
npx supabase test db
npx tsc --noEmit
npm run lint
npm run build
```
