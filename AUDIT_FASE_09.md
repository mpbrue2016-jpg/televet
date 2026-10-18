# AUDIT_FASE_09 — Teleconsulta real com LiveKit

## Resultado
A arquitetura e o fluxo de vídeo real foram implementados, sem vídeo simulado. **A fase ainda não pode ser declarada concluída para produção**: faltam credenciais/serviços externos, configuração dos agendamentos periódicos e execução de reset/lint/pgTAP/E2E reais neste ambiente.

## O que existia
- `consultations` e `appointments` já existiam, junto com funções de início/finalização clínica.
- `start_teleconsultation` emitia tokens reutilizáveis no Postgres e não verificava pagamento, janela da consulta ou `reservation_status`.
- O consentimento bilateral de gravação já existia em `consultation_recording_consents`, mas não havia Egress real, bucket privado dedicado, evento de provedor nem auditoria de acesso ao arquivo.
- Não havia rota Next.js `/teleconsulta/[id]` nem Edge Functions no repositório.

## O que foi criado
- Migration `supabase/migrations/0029_livekit_teleconsultation.sql`.
- Edge Functions:
  - `supabase/functions/create-video-token`: autentica o usuário, valida a autorização no Postgres e emite token LiveKit de 5 minutos, com identidade UUID e permissões restritas à sala.
  - `supabase/functions/livekit-webhook`: valida assinatura por `WebhookReceiver` oficial do SDK LiveKit e persiste evento com deduplicação.
  - `supabase/functions/start-video-recording` e `stop-video-recording`: controlam Egress oficial, exigem consentimento bilateral no banco e salvam em Storage privado via S3 compatível.
  - `supabase/functions/finish-video-consultation`: encerra a consulta com a RPC clínica e solicita o fechamento da sala no LiveKit.
  - `supabase/functions/reconcile-video-rooms`: fecha salas expiradas no LiveKit e reconcilia no-show/interrupções.
  - `supabase/functions/cleanup-consultation-recordings`: remove objetos após o prazo e grava auditoria de retenção.
  - `supabase/functions/_shared/auth.ts`: valida JWT via Supabase Auth e cria clientes de usuário/service role separados.
- Rota `src/app/teleconsulta/[id]/page.tsx`: teste de mídia e seleção de dispositivos, sala de espera, áudio/vídeo real, chat, compartilhamento de tela, anexos privados, estado de conexão, timer, painel clínico com autosave, consentimento, indicador `GRAVANDO` e encerramento pelo veterinário.
- SDK oficial `livekit-client` instalado.
- `playwright.config.ts` e `tests/e2e/teleconsultation.spec.ts`, com navegadores tutor/veterinário, câmera fake para testes e casos de pagamento pendente/terceiro. Os cenários dependem de fixtures de staging e ficam skip quando elas não estão configuradas.
- `supabase/tests/database/livekit_teleconsultation_test.sql` com 29 verificações pgTAP planejadas, inclusive consentimento/revogação, sem pagamento e negação de DML direto.
- `.env.example` com nomes de variáveis sem valores secretos.
- `supabase/config.toml` para projeto/Edge Functions.

## Banco, segurança e fluxo
- `authorize_video_session` valida participante, consulta do tipo teleconsulta, status clínico/agendamento confirmado, pagamento `captured`, janela de 10 minutos antes até 15 minutos após o fim e veterinário ativo/verificado. O nome da sala é UUID criado no banco.
- DML direto de `authenticated` foi revogado em `consultations` e `consultation_recording_consents`; leitura de participantes segue por RLS, e o consentimento só é gravado pela RPC. Isso fecha o caminho antigo em que a policy `FOR ALL` permitia alterar os flags de consentimento diretamente.
- O token só é emitido pela Edge Function após autenticação; o cliente nunca recebe `service_role` nem o segredo LiveKit.
- `save_teleconsultation_draft` limita autosave ao veterinário responsável; `finish_video_consultation` grava a evolução pela função clínica existente e fecha a reserva.
- O provedor `livekit` e o timestamp são persistidos em `appointments.telemedicine_technology` e anexados ao resumo oficial em `medical_records` ao finalizar a consulta.
- `teleconsultation_room_events` deduplica eventos por `provider_event_id`; eventos e logs de acesso são append-only.
- `consultation-recordings` e `consultation-attachments` são buckets privados. A leitura de gravação exige participação e validade da retenção; playback gera URL assinada curta e registra quem acessou.
- A gravação fica bloqueada no banco sem aceite explícito de tutor e veterinário. Revogação inicia parada de Egress e impede tornar a gravação resultante acessível.
- O webhook atualiza presença, estado da sala, quedas, duração e disponibilidade/erro da gravação. O no-show guarda o papel ausente; não foi automatizada política financeira de reembolso/reagendamento porque ela depende da política de cancelamento definida pelo negócio.
- O RPC legado `start_teleconsultation` foi desativado, e valores antigos de tokens reutilizáveis foram invalidados.

## Integração e configuração pendente
Escolha técnica: LiveKit Cloud usando os SDKs oficiais `livekit-client` e `livekit-server-sdk`. Nenhuma resposta/endereço de API foi inventado; token, webhook e Egress usam SDKs oficiais.

Configurar como Supabase secrets, nunca no bundle do navegador:
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_RECORDING_S3_ENDPOINT`
- `LIVEKIT_RECORDING_S3_BUCKET`
- `LIVEKIT_RECORDING_S3_ACCESS_KEY`
- `LIVEKIT_RECORDING_S3_SECRET`
- `LIVEKIT_RECORDING_S3_REGION`
- `CONSULTATION_RECORDING_RETENTION_DAYS`
- `VIDEO_RECONCILE_SECRET`

Sem as três credenciais básicas, a interface/Edge Function retorna **VÍDEO PENDENTE DE CONFIGURAÇÃO**. Sem credenciais de Egress/S3, gravação retorna **GRAVAÇÃO PENDENTE DE CONFIGURAÇÃO**; a chamada de vídeo pode continuar sem gravação.

No LiveKit Cloud, cadastrar o webhook para `<SUPABASE_URL>/functions/v1/livekit-webhook`, com a API key/secret que assina os eventos. Habilitar Egress e configurar a saída S3 compatível apontando ao bucket privado do Supabase. Configurar chamadas agendadas protegidas por `VIDEO_RECONCILE_SECRET` para `reconcile-video-rooms` (a cada minuto) e `cleanup-consultation-recordings` (periodicidade alinhada à retenção). O repositório não contém URL de projeto, credenciais nem configuração do scheduler.

## Testes e estado real
- `./node_modules/.bin/tsc.cmd --noEmit`: passou, `EXIT:0`.
- `./node_modules/.bin/next.cmd lint`: passou sem erros; restam três avisos preexistentes de uso de `<img>` em telas de agendamento/petshop. ESLint também alertou que TypeScript 5.9.3 está acima da faixa suportada por `@typescript-eslint/typescript-estree` deste repo.
- `./node_modules/.bin/next.cmd build`: compilou a rota dinâmica, passou por lint/types e finalizou traces/otimização. O Next reportou `edge-server unexpectedly exited ... SIGTERM` durante a compilação, mas concluiu e listou as rotas; tratar como aviso de ambiente a investigar.
- `./node_modules/.bin/playwright.cmd test --list`: descobriu os cinco cenários da fase, incluindo bloqueio de gravação sem consentimento diretamente na Edge Function. Smoke executado via Chromium e via Edge falhou antes de abrir o navegador, ambos com exit code `2147483651`; o problema ocorre ao iniciar o processo browser neste ambiente.
- Smoke HTTP independente: `/teleconsulta/00000000-0000-4000-8000-000000000001` respondeu `HTTP 200` no servidor Next local.
- Os fluxos reais de dois usuários não foram validados porque dependem de LiveKit, Egress e storage states de staging; não registrar como E2E aprovado.
- `supabase db reset`: falhou antes de aplicar migrations com `LocalDbRunningError`; Docker Desktop Linux Engine indisponível (`dockerDesktopLinuxEngine` pipe ausente).
- `supabase db lint` e `supabase test db`: CLI leu o projeto e tentou conexão, mas ambos falharam com `ECONNREFUSED 127.0.0.1:54322`. Portanto migration e pgTAP ainda não foram executados.
- Playwright: fluxo real exige LiveKit configurado, usuários de staging em `PLAYWRIGHT_TUTOR_STORAGE_STATE`, `PLAYWRIGHT_VET_STORAGE_STATE`, `PLAYWRIGHT_THIRD_PARTY_STORAGE_STATE`, além dos IDs de consultas pagos/não pagos. Sem essas fixtures não há execução real nem alegação de sucesso.
- Edge Functions rodam no runtime Deno do Supabase; o `tsconfig` do Next exclui `supabase/functions` por serem um runtime separado.

Comandos para o ambiente configurado:
- `npx supabase db reset`
- `npx supabase db lint`
- `npx supabase test db`
- `npx playwright test`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

## Riscos e pendências
- Executar reset, lint, pgTAP e os quatro fluxos Playwright reais em Supabase/LiveKit de staging antes de considerar a fase aceita.
- Agendar e monitorar as funções de reconciliação e retenção; sem scheduler, o timer do navegador encerra a sessão localmente, mas a limpeza automática do servidor não roda.
- Validar operação de armazenamento S3 do LiveKit Egress contra a versão e a região do projeto Supabase contratado.
- No-show registra tutor/veterinário ausente, mas reembolso/reagendamento fica pendente da política financeira aprovada.
- A gravação e dados clínicos exigem validação jurídica/LGPD e política de retenção aprovada antes do go-live.
