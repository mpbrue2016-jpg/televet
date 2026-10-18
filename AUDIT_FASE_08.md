# AUDIT_FASE_08 — Pagamentos reais, split e ledger

## 1) O que existia antes
- O projeto já tinha a base financeira de `payments`, `payment_splits`, `wallets`, `payouts`, `refunds` e a lógica de split em `0017_financial_engine_splits_and_chargebacks.sql`.
- Já existia idempotência para processamento do pagamento e split, mas o sistema ainda não tinha uma camada explícita de gateway real, presença de webhook/ledger e controle de estados do provedor.
- A arquitetura centralizava regras de negócio no banco, mas a integração real com o PSP (Stripe, Pagar.me, Asaas, Mercado Pago) ainda era um ponto em aberto: sem deduplicação de eventos, sem ledger amigável ao auditor, sem estado de gateway em tabela pública.

## 2) O que foi criado/modificado
- Nova migration: `supabase/migrations/0028_payment_gateway_ledger.sql`
- Tabelas criadas:
  - `public.payment_gateways`
  - `public.payment_ledger`
  - `public.payment_webhook_events`
- Colunas adicionadas em `public.payments`:
  - `provider_status`
  - `provider_reference_id`
  - `provider_status_reason`
  - `provider_metadata`
  - `last_gateway_event_at`
  - `payment_currency`
- Funções criadas:
  - `public.register_payment_gateway_config(...)`
  - `public.register_payment_webhook_event(...)`
  - `public.apply_provider_status_update(...)`
  - `public.write_payment_ledger_event()`
- Trigger de ledger:
  - `trg_payments_ledger_event` em `public.payments`
- Serviços expostos:
  - `FinancialEngine.registerGatewayConfig(...)`
  - `FinancialEngine.registerWebhookEvent(...)`
  - `FinancialEngine.applyProviderStatus(...)`

## 3) Mecanismos implementados

### 3.1 Abstração real de gateway
- `payment_gateways` guarda a configuração do provedor por tenant, com `provider_name`, `config`, `is_enabled`, `webhook_secret` e `provider_account_id`.
- O modelo serve para qualquer provedor real sem hardcode de sucesso no front-end.
- Segredos sensíveis continuam pendentes de runtime/env, e só ficam no ambiente do provedor ou em mecanismo de secret manager.

### 3.2 Deduplicação de webhook
- `payment_webhook_events` usa a combinação `provider_name + provider_event_id` como chave única.
- Isso impede processamento duplicado do mesmo evento do PSP e reduz risco de double-charge ou reconciliação inconsistente.
- A função `register_payment_webhook_event` retorna `duplicate = true` para eventos repetidos sem reprocessar o pagamento.

### 3.3 Ledger financeiro e auditoria
- `payment_ledger` registra toda mudança relevante em status e vínculo financeiro do pagamento.
- Cada insert/update de `payments` dispara `write_payment_ledger_event()`, garantindo o histórico canônico de eventos do ciclo de pagamento.
- O ledger guarda `provider_name`, `provider_event_id`, `event_type`, `amount_cents`, `direction`, `metadata` e timestamp.

### 3.4 Estado do provedor e validação de transições
- A coluna `payments.provider_status` usa o enum `payment_provider_status_type`.
- A função `apply_provider_status_update` centraliza regras de transição e atualiza também `payments.status` para o estado canônico do sistema (`pending`, `captured`, `failed`, `refunded`).
- A transição de sucesso não pode reverter para estados pendentes ou processamento.

### 3.5 Sem fake success
- O sistema não aceita marketing de sucesso sem o gateway real responder e sem um webhook/evento validado.
- O estado `captured` só é emitido via `apply_provider_status_update(..., 'succeeded')` e a persistência do ledger correspondente.
- Se a chave do gateway não estiver configurada no ambiente, o código fica explícito como pendente; não há “sucesso simulado”.

## 4) Matriz da regra → mecanismo → teste

| Regra de negócio | Mecanismo técnico | Teste previsto |
|---|---|---|
| Gateway por tenant e provedor | `payment_gateways` + `register_payment_gateway_config` | teste de configuração ativa |
| Webhook idempotente | `payment_webhook_events` + unique constraint | teste de evento repetido não duplica processamento |
| Prevenção de sucesso falso | `provider_status` + `apply_provider_status_update` | teste de pagamento aprovado pelo gateway |
| Ledger contábil | `payment_ledger` + trigger `trg_payments_ledger_event` | teste de contagem de eventos/ledger |
| Consistência do estado financeiro | transição de status no banco | teste de status canônico `captured` |

## 5) Testes e validação
Arquivo de teste criado:
- `supabase/tests/database/payment_gateway_ledger_test.sql`

Comandos esperados para validação do banco:
- `npx supabase db reset`
- `npx supabase db lint`
- `npx supabase test db`

## 6) Estado desta sessão
A validação de banco real ficou bloqueada no ambiente local porque o Docker daemon não estava ativo. A execução correta do fluxo permanece dependente do ambiente com Docker Desktop/daemon disponível.

## 7) Pendências / riscos
- Configurar as credenciais reais do provedor em ambiente seguro (`STRIPE_SECRET_KEY`, `PAGARME_API_KEY`, etc.) fora do repositório.
- Definir a política de webhook secret e assinatura de payload por provedor.
- Planejar reconciliação automatizada entre `payment_ledger` e os eventos do gateway em produção.
- Validar a forma final de payout/settlement para contas de petshop e veterinário em uma fase posterior.
