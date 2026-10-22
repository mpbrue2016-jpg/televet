# AUDIT_FASE_06 — Agenda, disponibilidade e reserva sem conflito

## Status geral
✅ A fase 6 foi implementada no banco com foco na base de agenda e regras de disponibilidade.

## O que existia antes
- O projeto já possuía a tabela `veterinarian_schedules` e a RPC `get_available_appointment_slots` da Fase 5.
- O fluxo de agendamento anterior criava um registro de consulta direta, mas sem hold de 10 minutos, sem bloqueios configuráveis e sem validação de transição de status.
- Não havia tabela de regras de disponibilidade por dia, bloqueios e feriados, nem mecanismo de concorrência robusto no banco.

## O que foi criado/alterado
- Nova migration: `supabase/migrations/0026_agenda_disponibilidade_e_holds.sql`
- Adição de regras de disponibilidade (`availability_rules`)
- Adição de exceções de bloqueio (`availability_exceptions`)
- Adição de feriados (`holidays`)
- Extensão `btree_gist` ativa para evitar sobreposição de agenda
- Proteção de conflito por `EXCLUDE USING gist` na tabela `appointments`
- Hold de reserva em 10 minutos, com liberação automática por job `pg_cron`
- Funções de reserva, confirmação e liberação de holds
- Atualização da RPC `book_appointment` para gerar `starts_at`, `ends_at`, `reservation_status` e `hold_expires_at`
- Ampliação do serviço de agendamento em `src/appointments/appointment-service.ts`

## Migrations
- `0026_agenda_disponibilidade_e_holds.sql`

## Tabelas adicionadas
- `public.availability_rules`
- `public.availability_exceptions`
- `public.holidays`

## Tabelas ajustadas
- `public.appointments`
  - `starts_at`
  - `ends_at`
  - `reservation_status`
  - `hold_expires_at`
  - `modality`

## Policies
- `availability_rules`: leitura pública para consulta de disponibilidade; gestão por veterinário dono ou admin
- `availability_exceptions`: leitura válida para consulta e gestão por veterinário dono ou admin
- `holidays`: leitura pública; escrita somente admin

## Funções/RPCs
- `public.get_available_appointment_slots(...)`
- `public.book_appointment(...)`
- `public.reserve_appointment_slot(...)`
- `public.confirm_appointment_reservation(...)`
- `public.release_expired_appointment_holds()`
- `public.validate_appointment_transition()`

## Regras implementadas
- Resgate de slots com base em `America/Sao_Paulo`
- Bloqueios respeitados por sobreposição de intervalos
- Feriados podem bloquear a geração de slots
- Concorrência reduzida por `EXCLUDE` + hold dinâmico
- Transições de status validadas no banco
- Liberação automática de holds expirados a cada minuto

## Testes
Arquivo criado: `supabase/tests/database/agenda_availability_test.sql`

Cobertura implementada:
- tabela de regras de disponibilidade existe
- tabela de exceções existe
- tabela de feriados existe
- RPC de exploração de slots existe
- RPC de reserva existe
- RPC de confirmação existe
- job de liberação de holds existe
- constraint de exclusão de agenda existe

## Pendências / riscos
- O ambiente local desta sessão não tem o CLI do Supabase disponível no PATH, então a validação real de `supabase db reset` e `supabase test db` precisa ser executada no ambiente com o CLI instalado.
- O projeto ainda precisa de uma tela de edição de disponibilidade no frontend para uso operacional completo.
- Integração Google Calendar / ICS permanece pendente e foi deixada como recurso opcional.

## Observação final
Este conjunto cobre a base técnica da fase 6: agenda real no banco, reserva sem conflito, bloqueios e hold de segurança, sem depender de lógica apenas no frontend.
