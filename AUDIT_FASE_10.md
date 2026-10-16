# AUDIT_FASE_10 — Prontuário, receitas, exames e documentos

## Resultado
Implementação de banco, serviços e interface preparada. **Fase ainda não aprovada para produção**: a migration e pgTAP não puderam ser executados sem o Postgres/Docker local; E2E exige usuários e registros reais de staging. A integração com assinatura ICP-Brasil não foi escolhida/configurada; medicamentos controlados permanecem bloqueados e a fila marca `PENDENTE DE CONFIGURAÇÃO`.

## O que existia
- `medical_records`, `prescriptions`, `exams`, `documents` já vinculavam dados clínicos ao `pet_id`.
- As policies anteriores isolavam principalmente por tenant e concediam leituras mais amplas; não havia concessão revogável por pet nem log canônico de cada leitura.
- A tela `/dashboard/pet/[id]` usava perfil, exames, receitas e peso inventados localmente.
- `issue_digital_prescription` aceitava lista livre de medicamentos e um hash de assinatura vindo do cliente, não distinguia controlados e não exigia vínculo clínico/Cadastro CRMV verificado.
- O dashboard compartilhado exibia o nome fixo “João Tutor”. A publicação Realtime da consulta continha também campos clínicos privados.

## O que foi criado/alterado
- Migration aditiva `supabase/migrations/0030_pet_medical_records_and_access.sql`.
- Página de prontuário reescrita em `src/app/(tutor)/dashboard/pet/[id]/page.tsx` com dados reais, SOAP, parâmetros vitais, busca/filtros, timeline, solicitação de exame, upload privado, adendos, autorização/revogação de acesso, auditoria de leitura e exportação PDF.
- Página pública de verificação mínima de receita: `src/app/receita/[codigo]/page.tsx`.
- Serviço clínico atualizado: `src/clinical/medical-record-service.ts`.
- Contrato de adapter ICP-Brasil pendente, sem simular assinatura: `src/clinical/qualified-signature-adapter.ts`.
- Edge Functions:
  - `supabase/functions/upload-clinical-document`: valida sessão, MIME real por magic bytes e tamanho; autorização no banco; upload privado; registro atômico; rollback do objeto se persistência falhar.
  - `supabase/functions/get-clinical-document-url`: autoriza, registra acesso e emite signed URL curta.
  - `supabase/functions/generate-medical-record-pdf`: exporta timeline autorizada e auditada.
  - `supabase/functions/generate-prescription-pdf`: PDF com tutor, pet, CRMV, posologia, código e QR de verificação; exige `PUBLIC_APP_URL`.
- `supabase/config.toml`: Edge Functions acima com verificação JWT ativa.
- `supabase/tests/database/pet_medical_records_test.sql`: 37 asserts planejados para grants revogáveis, RLS, auditoria, imutabilidade, ICP-Brasil, encaminhamento e Realtime sanitizado.
- `tests/e2e/medical-record.spec.ts`: cinco fluxos de staging: tutor e exportação; bloqueio Pet Shop; bloqueio de vet sem vínculo; verificação pública; SOAP/exame.
- Os dois testes clínicos legados foram ajustados para não chamar `start_teleconsultation`, RPC de tokens já desativada na Fase 9.
- `src/app/(tutor)/layout.tsx`: papel da sessão identifica Portal do Tutor/Painel do Veterinário e remove o nome fixo de demonstração.
- `.env.example`: `PUBLIC_APP_URL` para QR do PDF da receita.

## Banco, autorização e auditoria
- Prontuário continua pertencendo a `pets`; campos novos no `medical_records` cobrem SOAP, CRMV, assinatura, versão e tecnologia.
- `record_access_grants`: tutor concede escopos e validade máxima de 365 dias a veterinário verificado; revogação imediata fica registrada.
- `can_access_pet_record(pet, scope)` é a regra única aplicada nas policies/RPCs: tutor dono; veterinário com consulta assistencial confirmada/realizada, encaminhamento aceito/atendido ou grant válido; superadmin conforme helper existente. Pet Shop não recebe acesso clínico.
- `consultations` deixa de ser publicada no Realtime e perde leitura direta pelo cliente; a projeção `teleconsultation_status_updates` contém apenas status e métricas, com RLS por participante.
- `record_access_log` registra actor, ação, finalidade, IP/User-Agent disponíveis e data; tabela é append-only. Timeline, download, PDF, grant e revogação escrevem trilha.
- RLS de prontuário, receita, exame, encaminhamento, documento, grants, adendos e auditoria foi restringido à autorização clínica do pet. DML direto em tabelas clínicas é revogado; gravação ocorre por RPCs `SECURITY DEFINER` com `search_path = ''` e checagem de `auth.uid()`.
- Registro assinado não pode sofrer UPDATE/DELETE. Correção exige `medical_record_addenda` append-only, versionado, justificativa e CRMV do autor.
- A Fase 9 havia publicado `consultations` inteira no Realtime, expondo campos privados. A migration agora move o canal para `teleconsultation_status_updates`, projeção sem conteúdo clínico, RLS por participante e revoga SELECT direto em `consultations`.

## Receitas, exames e documentos
- Catálogo de medicamentos é administrado no banco; a emissão valida itens do catálogo, posologia, veterinário ativo/verificado, vínculo assistencial, consulta finalizada e CRMV validado.
- Código de verificação é aleatório e único. `verify_prescription_public` retorna apenas autenticidade, validade, profissional e CRMV; não revela animal, tutor, medicamentos nem diagnóstico.
- Receita controlada não é emitida sem assinatura ICP-Brasil. A função cria uma solicitação `pending_configuration` e retorna mensagem explícita; não aceita hash alegado pelo navegador.
- `clinical_medication_catalog` e `veterinarian_medication_favorites` são acessíveis por funções de dono/admin, com posologias favoritas do profissional.
- Solicitação de exame é RPC autorizada e gera notificação interna ao tutor; upload de resultado atualiza exame e notifica tutor/veterinário.
- `clinical-documents` é bucket privado; upload máximo 20 MB, PDF/JPEG/PNG/WebP, magic bytes conferidos na Edge Function, prefixo de pet e metadados conferidos no banco; leitura exige vínculo e URL assinada curta.
- PDF da receita usa `PUBLIC_APP_URL` para gerar QR verificável. Sem essa variável, a função informa configuração pendente.

## Funções/RPCs principais
`can_access_pet_record`, `write_record_access_log`, `request_medical_record_access`, `revoke_medical_record_access`, `get_pet_medical_timeline`, `get_pet_record_access_log`, `get_pet_record_access_controls`, `create_signed_medical_record`, `append_medical_record_addendum`, `request_clinical_exam`, `create_clinical_referral`, `authorize_clinical_document_upload`, `register_clinical_document`, `get_clinical_document_download`, `issue_digital_prescription`, `verify_prescription_public`, `get_prescription_pdf_data`, `add_veterinarian_medication_favorite`, `get_veterinarian_medication_favorites`, `upsert_clinical_medication`, `finish_video_consultation`.

## Testes e validação real
- `tsc --noEmit`: passou com `EXIT:0` após a tela, serviço e testes de staging.
- `next lint`: passou sem erros. Restam três avisos preexistentes de `<img>` em agendamento/petshop; TypeScript 5.9.3 está fora da faixa suportada declarada por `@typescript-eslint/typescript-estree`.
- `playwright test --list`: cinco testes da fase foram descobertos. Não executados por exigirem storage states, usuários, pet e receita reais de staging. A instalação local anterior teve falha de inicialização de Chromium/Edge no Windows.
- `supabase db reset`: falhou com `LocalDbRunningError`; Docker Desktop respondeu `Docker Desktop is unable to start`.
- `supabase db lint` e `supabase test db`: falharam com `ECONNREFUSED 127.0.0.1:54322`; migration/pgTAP não foram executados.
- Build de produção: **APROVADO** (`npm run build` → `Compiled successfully`, 11/11 páginas estáticas, `BuildExit=0`) na retomada de 15/10/2026. Observação: o processo do compilador (`next build`) pode receber `SIGTERM` se outro comando de primeiro plano for iniciado no mesmo terminal durante a execução — rodar o build como processo isolado/foreground único.

### Retomada (15/10/2026) — validações locais re-executadas
- `tsc --noEmit`: **passou** (`TscExit=0`).
- `npm run lint`: **passou** (`LintExit=0`); os três avisos preexistentes de `<img>` (agendamento/booking-form, petshop/[slug]) permanecem, sem erros.
- `npm run build`: **passou** (`BuildExit=0`), confirmando o item que estava em aberto no item acima.
- Docker/Supabase: **continua indisponível** — Docker Desktop instalado (`C:\Program Files\Docker\Docker\Docker Desktop.exe`), mas o daemon não sobe (`failed to connect to the Docker API ... dockerDesktopLinuxEngine`). `supabase db reset/lint/test db` e pgTAP seguem **não executados**; exigem Docker Desktop funcional (WSL2) ou banco remoto.

Com Docker/staging configurados, executar:
- `npx supabase db reset`
- `npx supabase db lint`
- `npx supabase test db`
- `npx playwright test`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

## Pendências e riscos
- Escolher/contratar provedor de assinatura ICP-Brasil e implementar o adapter/webhook oficial; até então receitas controladas ficam bloqueadas.
- Configurar `PUBLIC_APP_URL` nas Edge Function secrets/environment para o QR do PDF.
- Executar reset/lint/pgTAP e E2E com bancos/contas reais; asserts pgTAP ainda não foram executados.
- Política de retenção legal do prontuário e modelos de receita/atestado devem ser aprovados por jurídico/CRMV antes de go-live.
- PDF atual usa geração server-side; revisar paginação e renderização com documentos extensos e dados reais antes de liberar produção.

---

## STATUS FINAL DA FASE 10 (15/10/2026) — **CONCLUÍDA COM PENDÊNCIAS ADIADAS**

**Decisão:** escopo/código da Fase 10 encerrado; validações de infraestrutura **adiadas para depois** (sem esquecer) e com continuidade a partir da **Fase 11**.

**Aprovado nesta fase (código + validação local):**
- ✅ `tsc --noEmit` (Exit 0), `npm run lint` (Exit 0), `npm run build` (Exit 0).
- ✅ Migrations, Edge Functions, telas, serviços, RPCs e testes (pgTAP/E2E) escritos e revisados.

**Pendências ADIADAS (retomar — não esquecer):**
1. **Habilitar virtualização (VT-x/AMD-V) na BIOS** → depois `wsl --install --no-distribution`, `wsl --update` e subir Docker Desktop. *(Bloqueio raiz do ambiente.)*
2. Com Docker online, rodar: `npx supabase db reset`, `npx supabase db lint`, `npx supabase test db` (**37 asserts pgTAP**), `npx playwright test` (**5 E2E**).
3. Contratar provedor **ICP-Brasil** e implementar `qualified-signature-adapter` (libera receitas controladas).
4. Configurar **`PUBLIC_APP_URL`** nas secrets das Edge Functions (QR do PDF de receita).
5. Aprovação **jurídico/CRMV** de textos (termo, retenção, receita/atestado) antes do go-live.
6. Revisar paginação/renderização do **PDF** com documentos extensos.

**Condição para dar a Fase 10 como 100% aprovada:** itens 1–2 executados com sucesso (infra) + itens 3–6 de negócio/produção concluídos.
