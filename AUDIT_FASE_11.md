# AUDIT_FASE_11 — Vacinação e Histórico de Saúde

## Resultado
Carteira de vacinação digital implementada com persistência Supabase, RLS por `can_access_pet_record`, exportação em **PDF e JPG** e respeito às regras da fase (sem inventar datas/doses, sem notificações reais). Validação de código local executada (ver "Testes"); validação de banco (pgTAP/E2E) depende de Docker/staging.

## O que existia antes
- `medical_records.entry_type` aceitava `'vaccine'` (registro genérico, sem campos estruturados de fabricante/lote/data/próxima dose).
- `pet_documents.document_type` já aceitava `'vaccine'`; a tabela `documents` (0005) era o repositório clínico de arquivos.
- `can_access_pet_record(pet, scope)` (0030) era a regra única de acesso; bucket `clinical-documents` privado + Edge Functions `upload-clinical-document`/`get-clinical-document-url` (Fase 10) já faziam upload validado e signed URL.
- `notifications` (0008) existia com canal `in_app` e `category` livre.
- UI do pet em `src/app/(tutor)/dashboard/pet/[id]/page.tsx` (555 linhas) com abas/formulários e padrões de loading/erro/estilo.

## O que foi criado/alterado
- **Migration** `supabase/migrations/0032_pet_vaccinations.sql` (aditiva, transacional):
  - Tabela `vaccinations`: `vaccine_name`, `manufacturer`, `lot_number`, `application_date`, `dose_number`, `observations`, `next_dose_at`, `reminder_enabled`, `reminder_notified_at`, vínculos `pet/tenant/veterinarian/consultation/recorded_by`. CHECKs: `next_dose_at > application_date`, `reminder_enabled ⇒ next_dose_at NOT NULL`, nome não vazio. Índices, trigger `updated_at` e trigger de auditoria `fn_audit_trigger`.
  - Coluna aditiva `documents.vaccination_id` + índice (comprovantes ligados à vacina).
  - RLS habilitado; policy única de **SELECT** via `can_access_pet_record(pet_id,'read_clinical')`; **DML revogado** (padrão Fase 10: gravação só por RPC `SECURITY DEFINER`).
  - RPCs: `create_vaccination`, `update_vaccination`, `get_pet_vaccinations`, `get_pet_vaccination_history`, `get_pet_vaccination_card_data`, `authorize_vaccination_document_upload`, `register_vaccination_document`, `get_vaccination_document_download`. Grants: revoga `PUBLIC/anon`, permite `authenticated`.

- **Edge Functions** (novo, `verify_jwt=true` em `supabase/config.toml`):
  - `upload-vaccination-document`: valida sessão/MIME por magic bytes/20MB, autoriza no banco, upload privado em `clinical-documents`, registro atômico com rollback.
  - `get-vaccination-document-url`: autoriza, loga acesso e emite signed URL curta (60s).
  - `generate-vaccination-card`: monta o **PDF** da carteira com `pdf-lib` a partir de `get_pet_vaccination_card_data` (auditado).

- **Serviço** `src/clinical/vaccination-service.ts`: classe `VaccinationService` (padrão `MedicalRecordService`) tipando DTOs e chamando RPCs/Edge Functions.

- **UI** `src/app/(tutor)/dashboard/pet/[id]/page.tsx`: nova seção **"Carteira de vacinação"** com:
  - Lista de vacinas (fabricante, lote, data, dose, profissional, observações, próxima dose) em grid responsivo `md:grid-cols-2`;
  - Badge de status derivado (`none/upcoming/due_soon/overdue`);
  - Formulário de registro (visível só para veterinário `can_write`), campos opcionais vazios por padrão e lembrete desabilitado sem próxima dose;
  - Anexo de comprovante (PDF/JPG/PNG/WebP até 20 MB) e abertura de anexos;
  - **Exportar PDF** (Edge Function) e **Exportar JPG** (client-side via Canvas `toBlob('image/jpeg')`, sem dependências);
  - Histórico unificado (vacinas + registros legados `entry_type='vaccine'` + consultas vinculadas);
  - Layout mobile-first (botões `flex-wrap`, grid responsivo, alvos de toque).

## Regras de segurança/clínicas respeitadas
- **Não inventa datas, doses nem recomendações**: `application_date > CURRENT_DATE` é rejeitada; `next_dose_at` opcional e só validado quando presente; `dose_number` é texto livre do profissional; status é **derivado** de `next_dose_at`, nunca sugerido.
- **Não envia notificação real**: lembrete cria apenas registro `notifications.channel='in_app'` (categoria `vaccine_reminder`), com gate `reminder_enabled` e idempotência (`reminder_notified_at`); nunca `email/push/whatsapp`.
- **RLS/controle de acesso**: leitura por `can_access_pet_record(read_clinical)`; escrita exclusiva por RPC que exige veterinário ativo/verificado com `write_clinical`; Pet Shop e anon sem acesso; DML direto revogado; toda leitura/exportação gera linha em `record_access_log`.

## Funções/RPCs principais
`create_vaccination`, `update_vaccination`, `get_pet_vaccinations`, `get_pet_vaccination_history`, `get_pet_vaccination_card_data`, `authorize_vaccination_document_upload`, `register_vaccination_document`, `get_vaccination_document_download`.

## Testes
- **pgTAP** `supabase/tests/database/pet_vaccinations_test.sql`: **35 asserts** — estrutura (tabela/colunas/funções/policy), RLS e privilégios (anon sem SELECT; authenticated sem INSERT/UPDATE), leitura/auditoria do tutor, denegação para Pet Shop, criação por veterinário com vínculo, rejeição de data futura/dose inválida/lembrete sem dose, veterinário sem vínculo negado, lembrete `in_app` criado, histórico e exportação.
- **E2E** `tests/e2e/vaccination.spec.ts`: 5 fluxos de staging (tutor exporta PDF/JPG, abre histórico, vet abre formulário sem pré-preencher, Pet Shop bloqueado). Dependem de `PLAYWRIGHT_*` storage states e registros reais.

## Pendências e riscos
- **Docker/Supabase indisponível** (pendência adiada da Fase 10 — virtualização de hardware desabilitada na BIOS): `supabase db reset/lint/test db` **não executados**; os 35 asserts pgTAP correm apenas com banco local funcional.
- **E2E não executado** (exige staging/contas reais; falha prévia de Chromium/Edge no Windows).
- Exportação **JPG** é client-side (Canvas) por decisão técnica: o Deno das Edge Functions não rasteriza sem libs nativas; dados vêm já autorizados pelo RLS. **PDF** é server-side e auditado.
- Validar visualmente os estados vazios e o formulário em telas pequenas reais (responsividade feita por classes Tailwind, não testada em dispositivo físico).

## Comandos para validar quando Docker/staging estiverem disponíveis
- `npx supabase db reset`
- `npx supabase db lint`
- `npx supabase test db` (roda `pet_vaccinations_test.sql`)
- `npx playwright test vaccination.spec.ts`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

