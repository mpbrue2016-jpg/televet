# AUDITORIA FASE 01 - SEGURANÇA DO BANCO

## O que existia
- Várias tabelas como `saas_plans`, `tenant_subscriptions`, `chargeback_disputes`, `commission_rules` não possuíam RLS ativado ou não tinham políticas (policies) definidas.
- Nenhuma migration prévia possuía comandos `GRANT` / `REVOKE` globais.
- Mais de 30 funções `SECURITY DEFINER` estavam expostas, sem `SET search_path = ''` (susceptíveis a ataques de search_path) e podiam ser invocadas diretamente por qualquer um, incluindo endpoints vitais como `process_appointment_payment_split`.
- Views não estavam utilizando `security_invoker = true`.
- Tabela `audit_logs` podia sofrer update/delete se alguma policy fraca permitisse.

## O que foi alterado/criado
- **Migration**: Criada `0022_security_hardening.sql`.
- **Tabelas e RLS**: Habilitado RLS explicitamente para TODAS as tabelas pendentes: `saas_plans`, `tenant_subscriptions`, `saas_invoices`, `commission_rules`, `payment_idempotency_keys`, `chargeback_disputes`, `veterinarian_specialties`, `consultation_recording_consents`.
- **Policies Criadas**:
  - `saas_plans`: SELECT (ativo ou admin), ALL (admin)
  - `tenant_subscriptions` / `saas_invoices`: SELECT (admin ou `tenant_id` match)
  - `commission_rules`: SELECT (admin ou `tenant_id`), ALL (admin)
  - `veterinarian_specialties`: SELECT (público), ALL (admin ou owner)
  - `consultation_recording_consents`: SELECT (admin, user ou vet da consulta)
  - `payment_idempotency_keys` / `chargeback_disputes`: Nenhuma policy adicionada propositalmente (apenas o backend `service_role` consegue acessar).
- **Hardening de Funções**:
  - `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;` implementado, além do `ALTER DEFAULT PRIVILEGES`.
  - Concedido `GRANT EXECUTE` pontual apenas para funções baseadas em RLS (ex. `get_current_tenant_id()`, `is_admin()`).
  - Lógica para rodar dinamicamente `ALTER FUNCTION ... SET search_path = ''` para as mais de 30 funções `SECURITY DEFINER`.
- **Funções Financeiras**:
  - `process_appointment_payment_split`, `process_refund_split`, `subscribe_tenant_saas_plan` e `handle_saas_payment_failure` foram reescritas com verificações estritas do `role` (exigindo `service_role` ou `is_admin()`, e tenant válido).
- **Views**:
  - Script dinâmico embutido para setar `security_invoker = true` em todas as views do `public`.
- **Auditoria Segura**:
  - Criada `audit_log_access()` e a trigger `trg_audit_logs_append_only` para barrar completamente `UPDATE` e `DELETE` em `audit_logs`.
- **Testes pgTAP**: Criado arquivo `supabase/tests/database/security_attack_test.sql` cobrindo cenários de ataque (ex: anon, chamadas não autorizadas, isolamento B2B, vazamento de prontuário, tabela sem RLS).

## Riscos / Pendências Externas
- **[BLOQUEIO] Testes pgTAP e Linting**: Da mesma forma que na Fase 0, como o ambiente de Docker hospedeiro (`Docker Desktop`) ainda não foi iniciado, a execução real dos testes `supabase test db`, do `supabase db reset`, e dos Advisors do Supabase não pôde ser concretizada localmente nesta rodada.
- As permissões `GRANT` podem precisar de ajustes finos à medida que o frontend precisar acionar RPCs seguras, o que deve ser validado com os testes E2E/Playwright assim que o ambiente local subir.

## Saída dos Testes
- *Os testes estão escritos e prontos na pasta `supabase/tests/database/security_attack_test.sql`. Ficam no aguardo da inicialização do Docker para rodarmos `supabase test db` e confirmarmos a "falha" nos ataques.*
