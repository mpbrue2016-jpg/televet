# AUDIT_FASE_12 — Encaminhamentos e especialistas

## Resultado
Fluxo de teletriagem/teleorientação (Res. CFMV 1.465/2022) implementado com persistência Supabase, RLS por `can_access_pet_record`, **escopo mínimo** concedido ao especialista com **prazo de aceite**, snapshot do encaminhante (nome + CRMV/UF) e retorno ligado ao prontuário por registro assinado. Validação de código local executada em 16/10/2026 (`tsc --noEmit` aprovado); validação de banco (pgTAP) e E2E dependem de Docker/staging e, **diferente das Fases 10 e 11, esta fase ainda não tem testes próprios** (ver Pendências).

## O que existia antes
- `referrals_clinical` (0005) registrava encaminhamento básico (vet, pet, especialidade, motivo, prioridade, status), sem modalidade, escopo, prazo, aceite por especialista nem retorno estruturado.
- `create_clinical_referral` (Fase 10) criava encaminhamento vinculado a consulta com autorização clínica, mas sem fluxo de aceite/recusa por especialista e sem anexos/retornos.
- `can_access_pet_record(pet, scope)` (0030) já previa "encaminhamento aceito/atendido" como via de acesso — pré-requisito que o novo fluxo passa a alimentar de verdade.
- `specialties`, `veterinarian_specialties` e `professional_registrations` (0003/0025) já formavam o catálogo de especialidades com CRMV validado.

## O que foi criado/alterado
- **Migration** `supabase/migrations/0033_referral_specialists.sql` (aditiva, transacional):
  - Enums `referral_status_type` (`pending/accepted/in_progress/completed/rejected/expired/cancelled`) e `referral_modality_type` (`teletriage/teleorientation/in_person`).
  - Colunas aditivas em `referrals_clinical`: snapshot do encaminhante (`referring_veterinarian_name/crmv_number/crmv_uf`), `target_veterinarian_id`, `accepted_by/accepted_at`, `completed_at`, `closed_at`, `expiration_days` (1–90, default 7), `modality`, `scopes` (subconjunto de `read_clinical/exams/documents/prescriptions`), `rejection_reason`, `return_medical_record_id` e `expires_at` **gerado** (`created_at + expiration_days`). Backfill do snapshot para encaminhamentos existentes.
  - Tabelas `referral_documents` (anexo autorizado: `document_id` ou `exam_id`, flag `authorized_for_specialist`) e `referral_returns` (resumo, diagnóstico, conduta, follow-up e vínculo com `medical_records`).
  - RLS habilitado nas duas tabelas; policy única de **SELECT** via `can_access_pet_record(pet_id,'read_clinical')`; **DML direto revogado** (padrão Fase 10: escrita só por RPC `SECURITY DEFINER`). Índices em pet/referral/status/alvo.
  - 9 funções (todas `SECURITY DEFINER`, `SET search_path = ''`, grants revogados de `PUBLIC/anon` e concedidos a `authenticated`): `list_referral_candidates`, `create_referral`, `_referral_require_specialist` (helper com lock `FOR UPDATE`), `accept_referral`, `update_referral_status`, `attach_referral_document`, `record_referral_return`, `list_pet_referrals`, `get_referral_detail`.
- **Serviço** `src/clinical/referral-service.ts`: classe `ReferralService` (padrão dos demais serviços clínicos) com DTOs tipados (`ReferralListItem`, `ReferralDetail`, `ReferralSpecialistCandidate`, `ReferralAttachment`, `ReferralReturn`) chamando exclusivamente as RPCs acima.
- **UI** `src/app/(tutor)/dashboard/pet/[id]/page.tsx`: seções **"Encaminhar para especialista"** e **"Encaminhamentos e especialistas"**:
  - Formulário: especialidade, candidatos especialistas (nome, CRMV, bio, telemedicina), modalidade, prioridade, escopo mínimo (checkboxes), prazo de aceite (1–90 dias), motivo e resumo clínico opcional.
  - Lista com rótulos de estado em PT-BR, ações de **aceitar**, **recusar** (motivo obrigatório) e **registrar retorno** (resumo obrigatório) — recusa e retorno ainda usam `window.prompt` (ver Pendências).
  - `ReferralDetailPanel`: escopo autorizado, anexos e retornos devolvidos pelo backend após autorização.

## Regras de segurança/clínicas respeitadas
- **Não inventa laudo, data nem conduta**: motivo/resumo/diagnóstico são textos do profissional; recusa exige motivo; retorno exige resumo e vira **registro assinado no prontuário** (`entry_type='referral_return'`) com CRMV validado do especialista, herdando a imutabilidade do prontuário da Fase 10.
- **Escopo mínimo e expiração**: o especialista acessa apenas os escopos concedidos e apenas dentro do prazo; aceite após o vencimento marca `expired` e recusa a operação.
- **Quem pode o quê**: somente veterinário ativo/verificado gerencia encaminhamentos; o encaminhante não assume o próprio encaminhamento; especialista direcionado impede que outro assuma; transições de estado validadas por perfil em `update_referral_status` (in_progress/rejected/cancelled/completed com papéis e estados de origem definidos).
- **RLS/auditoria**: leitura por `can_access_pet_record(read_clinical)`; DML direto revogado; criação, aceite, transição, retorno e visualização de detalhe gravam linha em `record_access_log`; Pet Shop e `anon` sem acesso clínico.
- **Coexistência**: `create_clinical_referral` (Fase 10, ligada à consulta) permanece válida; `create_referral` (Fase 12) é o fluxo completo com escopo/prazo/aceite/retorno.

## Funções/RPCs principais
`list_referral_candidates`, `create_referral`, `_referral_require_specialist`, `accept_referral`, `update_referral_status`, `attach_referral_document`, `record_referral_return`, `list_pet_referrals`, `get_referral_detail`.

## Testes
- **Nenhum teste próprio foi criado nesta fase** (diferente das Fases 10 e 11): não existe `supabase/tests/database/referral_specialists_test.sql` nem `tests/e2e/referral.spec.ts`. Cenários críticos a cobrir (sugeridos): candidatos listados apenas para veterinário; criação rejeita escopo inválido e `expiration_days` fora de 1–90; encaminhante não pode aceitar; aceite após prazo expira; especialista direcionado bloqueia terceiros; recusa exige motivo; retorno exige status ativo e grava `medical_records` assinado; especialista que não assumiu não vê detalhe clínico; `anon`/Pet Shop sem SELECT; DML direto revogado.
- `tsc --noEmit` (16/10/2026): **passou** (`TscExit=0`).
- `npm run lint` / `next lint` (16/10/2026): **passou** (`LintExit=0`); apenas os 3 avisos preexistentes de `<img>` (agendamento/booking-form e petshop/[slug]), sem erros.
- pgTAP e E2E **não executados** (Docker/staging indisponíveis — pendência adiada desde a Fase 10).

## Pendências e riscos
- **Criar e executar os testes** pgTAP e E2E da fase (cenários acima); sem isso a Fase 12 não pode ser considerada 100% aprovada.
- **Docker/Supabase indisponível**: `supabase db reset/lint/test db` não executados; a migration `0033` ainda não foi aplicada em banco real — validar em especial o `expires_at` gerado e o CHECK de `scopes` no Postgres 15.
- UX de recusa/retorno usa `window.prompt`; substituir por formulário/modal antes de produção.
- Definir se a modalidade **presencial** (`in_person`) exige regras próprias (ex.: CRMV-UF compatível com o especialista); hoje a modalidade é apenas registrada.
- Política de expiração (default 7 dias) e notificação ao especialista/encaminhante ainda não existem; `expired` só é materializado quando alguém tenta aceitar.
- Validar com CFMV/jurídico a redação do termo de teletriagem/teleorientação exibida na UI antes do go-live.

## Comandos para validar quando Docker/staging estiverem disponíveis
- `npx supabase db reset`
- `npx supabase db lint`
- `npx supabase test db` (passará a cobrir a fase assim que o teste existir)
- `npx playwright test` (idem)
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
