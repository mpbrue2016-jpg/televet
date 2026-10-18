# AUDIT_FASE_07 — Conformidade CFMV: RPVAR, urgência e consentimento

## 1) O que existia antes
- O projeto já possuía a base de agenda, agendamento e teleconsulta em 0026, com `appointments`, `consultations`, `veterinarians`, `pets`, `tutors` e `consultation_recording_consents`.
- Não existia uma regra de negócio explícita de RPVAR (Relação Prévia Veterinário-Animal-Responsável) no banco.
- Também não havia triagem obrigatória de urgência antes da teleconsulta nem um fluxo canônico de consentimento de telemedicina versionado.
- A regra de segurança estava centralizada principalmente em RLS e em booleans de gravação, mas sem validação de requisito regulatório para agendamento de teleconsulta.

## 2) O que foi criado/modificado
- Nova migration: `supabase/migrations/0027_telemedicine_cfmv_compliance.sql`
- Tabelas criadas:
  - `public.care_relationships`
  - `public.telemedicine_consents`
  - `public.telemedicine_triage_records`
- Colunas adicionadas em `public.appointments`:
  - `telemedicine_consent_required`
  - `telemedicine_consent_signed`
  - `telemedicine_triage_passed`
  - `telemedicine_triage_completed_at`
  - `telemedicine_signals`
  - `telemedicine_technology`
- Funções criadas:
  - `public.can_book_teleconsultation(p_pet_id uuid, p_veterinarian_id uuid)`
  - `public.validate_telemedicine_booking()`
  - `public.register_telemedicine_triage(p_appointment_id uuid, p_signals jsonb, p_emergency_detected boolean, p_recommended_action text)`
  - `public.register_telemedicine_consent(p_appointment_id uuid, p_consented boolean, p_terms_version text, p_ip_address text, p_user_agent text)`
  - `public.register_care_relationship(...)`
- Trigger aplicado:
  - `trg_validate_telemedicine_booking` em `public.appointments`
- Serviços expostos:
  - `AppointmentService.canBookTeleconsultation(...)`
  - `TeleconsultationService.registerUrgencyTriage(...)`
  - `TeleconsultationService.registerTelemedicineConsent(...)`

## 3) Mecanismos implementados

### 3.1 RPVAR e bloqueio de teleconsulta
- A tabela `care_relationships` registra a relação prévia entre pet, tutor, veterinário/clinic e a validade da relação.
- A função `public.can_book_teleconsultation` exige:
  - `pet_id` e `veterinarian_id` com vínculo ativo;
  - `status = 'active'`;
  - `valid_until` ausente ou em futuro;
  - veterinário `is_active = true` e `is_verified = true`.
- O trigger `trg_validate_telemedicine_booking` bloqueia qualquer `INSERT/UPDATE` em `appointments` com `type = 'teleconsultation'` quando a RPVAR estiver ausente/inválida.

### 3.2 Urgência/emergência
- A função `public.register_telemedicine_triage()` grava a triagem e exige que `emergency_detected = FALSE` para liberar o agendamento/atendimento.
- Qualquer sinal de urgência dispara exceção e orienta o fluxo para atendimento presencial imediato.
- Os dados são persistidos em `public.telemedicine_triage_records` e marcados em `appointments.telemedicine_triage_passed`.

### 3.3 Consentimento de telemedicina
- A tabela `public.telemedicine_consents` registra o termo, versão e assinatura do tutor responsável.
- A função `public.register_telemedicine_consent()` exige consentimento explícito (`p_consented = TRUE`) para liberar a teleconsulta.
- A coluna `appointments.telemedicine_consent_signed` é atualizada ao confirmar o consentimento.

### 3.4 Técnica e tecnologia registrada no prontuário
- `public.appointments.telemedicine_technology` pode armazenar o provedor, app version e modalidade usada.
- O projeto já registra a tecnologia em `consultations`/outras estruturas da fase anterior; este campo permite persisting em agendamento para auditar a telemedicina.

## 4) Matriz da norma → mecanismo → teste

| Exigência da norma | Mecanismo técnico implementado | Teste previsto |
|---|---|---|
| RPVAR obrigatória para teleconsulta | `care_relationships` + `can_book_teleconsultation` + trigger `trg_validate_telemedicine_booking` | pgTAP + teste de inserção sem RPVAR deve falhar |
| Urgência/emergência antes da teleconsulta | `register_telemedicine_triage` com `emergency_detected` e bloqueio em trigger/função | pgTAP e teste de triagem com sinal de emergência deve falhar |
| Veterinário inativo/não verificado não atende | validação em trigger `validate_telemedicine_booking` | teste de vet inativo bloqueado |
| Consentimento do responsável | `telemedicine_consents` + `register_telemedicine_consent()` | função deve exigir `p_consented = TRUE` |
| Compartilhamento de informações requer termo | consentimento registrado por consulta e bloqueio no fluxo de consentimento | teste de compartilhamento sem termo deve falhar |
| Auditoria e rastreabilidade | tabelas `care_relationships`, `telemedicine_consents` e `telemedicine_triage_records` | consultas de auditoria e logs |

## 5) Artigos de referência da Resolução CFMV (base técnica)
Este módulo foi implementado como mecanismo técnico de rastreio, consentimento e bloqueio regulatório, mas a validação jurídica final deve ser feita por CRMV/advogado.

Base de referência para implementação técnica:
- Resolução CFMV nº 1.465/2022 (telemedicina veterinária)
- Artigos referentes a: relação prévia, consentimento informado, triagem de urgência e registro da tecnologia/atendimento.
- Observação: validar com CRMV/advogado antes de go-live ou uso comercial real.

## 6) Testes e validação
Arquivo de teste criado:
- `supabase/tests/database/cfmv_telemedicine_test.sql`

Comandos esperados para validação do banco:
- `npx supabase db reset`
- `npx supabase db lint`
- `npx supabase test db`

### Estado desta sessão
A validação real do banco ficou bloqueada no ambiente local porque o Docker daemon não estava ativo. O comando executado foi:

```bash
node scripts/phase-validate.mjs --phase 7 --skip-e2e
```

E a resposta do ambiente foi:

```text
failed to connect to the docker API ... dockerDesktopLinuxEngine ... O sistema não pode encontrar o arquivo especificado.
```

Logo, a implementação foi entregue com a migração e os testes prontos, mas a execução local end-to-end da base segue dependente do Docker Desktop/daemon rodando.

## 7) Pendências / riscos
- Validar a redação exata do termo de telemedicina com o CRMV/advogado antes de uso em produção.
- Confirmar a política interna de urgência e encaminhamento presencial para o caso de alarmes.
- Definir a versão do termo e a assinatura eletrônica qualificada usada na Fase 10.
- Concluir o fluxo de UI para mostrar o bloqueio amigável ao tutor e sugerir agendamento presencial.
