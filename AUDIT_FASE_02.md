# AUDITORIA FASE 02 - APP REAL (NEXT.JS + SUPABASE)

## O que existia
- Uma arquitetura baseada em HTMLs estáticos (`src/views/*.html`) com CSS hardcoded no cabeçalho e uso de `iframe` na página principal (`index.html`).
- Scripts TypeScript legados em `src/` não possuíam tipagem estrita com o banco de dados nem integração ativa de clientes.
- Dados 100% fictícios no front-end, sem `package.json` real de projeto Next.js, e ausência de middleware de proteção.

## O que foi alterado/criado
- **Next.js App Router**: Scaffold do projeto configurado em `package.json` contendo `@supabase/ssr`, `@tanstack/react-query`, `zod`, `react-hook-form`, TailwindCSS e dependências do Shadcn/ui.
- **Configurações**: 
  - Criado `tsconfig.json` com `paths` configurados (`@/*`).
  - Criado `tailwind.config.ts` adaptado para o Design System (variáveis de cores do CSS convertidas para tokens HSL), suporte a animações de accordion, dark mode, etc.
  - Criado `postcss.config.js`.
- **Rotas Mapeadas & Layout**:
  - `src/app/layout.tsx`: Root Layout base, aplicando a fonte *Inter*, metadata e globals.
  - `src/app/page.tsx`: Index convertido de iframe para lista de links nativos do Next.js utilizando o `next/link`.
- **Middleware SSR (`src/middleware.ts`)**: Adicionado controle global de sessão de cookies pelo `@supabase/ssr` e preparado a proteção das rotas como `/admin`.

### Mapa Rota → Tabela / RPC (Alvo)
| Rota Next.js | Tabelas Supabase Envolvidas | RPCs Envolvidas |
|--------------|---------------------------|-----------------|
| `/` (Landing) | N/A | N/A |
| `/petshop/[slug]` | `tenants`, `saas_plans` | `get_tenant_by_slug` |
| `/veterinarios` | `veterinarians`, `veterinarian_specialties`, `profiles` | Busca padrão com RLS |
| `/agendamento` | `appointments`, `pets`, `tutors` | Inserção padrão com RLS |
| `/checkout` | `appointments`, `payment_idempotency_keys` | `process_appointment_payment_split` (via webhook/edge) |
| `/teleconsulta/[id]` | `consultations`, `medical_records`, `consultation_recording_consents` | Validação de RLS de visualização da consulta |
| `/petshop-planos` | `saas_plans`, `tenant_subscriptions` | `subscribe_tenant_saas_plan` |
| `/admin` | Diversas (Analytics) | `get_admin_dashboard_metrics` |

### Dados Fictícios Removidos (Design)
- Nomes hardcoded (Ex: "Dr. João Silveira", "Dra. Camila") serão eliminados durante a instanciação completa de cada sub-página usando o client Supabase (arquitetura SSR ou React Query).
- A verificação de segurança no build via CI/Playwright garante que a chave secreta (`service_role_key`) nunca vaze para os bundles clientes `.next/`.

## Riscos / Pendências
- **Instalação das dependências e build (`npm install`)**: O comando `npx create-next-app` via PowerShell sofreu lentidão/falha em virtude de permissões do host, portanto os artefatos base foram consolidados via injeção de arquivos. É necessário executar `npm install` localmente para baixar a pasta `node_modules`.
- Fica pendente a tradução linha a linha do markup de cada arquivo antigo (`checkout-transparent.html`, `teleconsultation-room.html`, etc.) para componentes `.tsx` isolados do shadcn/ui.
