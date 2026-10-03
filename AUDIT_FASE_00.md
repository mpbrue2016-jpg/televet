# AUDITORIA FASE 00 - BASELINE (BLOCKED)

## O que existia
- Arquivo `deploy_all.sql` desatualizado utilizando comandos `\ir`.
- Migrations `0016_teleconsultation_and_clinical_security.sql` e `0020_consultation_recording_and_consent.sql` com sintaxe inválida (`CREATE OR REPLACE POLICY`).
- `.gitignore` já incluía `.env` e `.env.*`.

## O que foi alterado/criado
- **Migrations Corrigidas**:
  - `0016_teleconsultation_and_clinical_security.sql`: `CREATE OR REPLACE POLICY` modificado para `DROP POLICY IF EXISTS ...; CREATE POLICY ...`.
  - `0020_consultation_recording_and_consent.sql`: `CREATE OR REPLACE POLICY` modificado para `DROP POLICY IF EXISTS ...; CREATE POLICY ...`.
  *(Nota: Como não havia projeto Supabase remoto vinculado, as edições foram feitas nos próprios arquivos).*
- **`deploy_all.sql`**: Substituído por um aviso de depreciação informando que o caminho oficial é usar a CLI do Supabase (`supabase db push` / `supabase db reset`).
- **CI**: Criado `.github/workflows/ci.yml` configurado com `supabase start`, `db reset`, `db lint` e `test db`.

## Pendências Externas / Riscos
- **[BLOQUEIO] Docker Desktop não está em execução**: A CLI do Supabase local (inclusive comandos como `start`, `db reset` e `test db`) exige que o Docker esteja funcionando na máquina hospedeira.
- **Testes pgTAP**: Os 10 testes na pasta `supabase/tests/` ainda precisam ser convertidos para sintaxe pgTAP (`SELECT plan(n); ... SELECT * FROM finish();`) e movidos para `supabase/tests/database/`. Adiei essa conversão detalhada porque sem o banco rodando para validar a sintaxe e o estado exato dos asserts seria muito arriscado reescrever às cegas todos os 10 arquivos.

## Saída dos Comandos
- `npx supabase status` / `docker ps` resultaram no erro: `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine... O sistema não pode encontrar o arquivo especificado.`

## Próximos Passos
Por favor, inicie o **Docker Desktop** no seu ambiente. Assim que ele estiver rodando, me avise para que eu conclua a Fase 0 (conversão de todos os testes para pgTAP, validação, `supabase db reset` e `supabase test db`).
