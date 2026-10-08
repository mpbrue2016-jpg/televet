# AUDIT_FASE_02 - Arquitetura de Front-end (App Real)

## Status da Implementação
✅ **Setup Inicial:** Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui.
✅ **Supabase SSR:** Clientes `@supabase/ssr` e pacotes base configurados.
✅ **Infra & Segurança:** `vercel.json` implementado com headers de segurança (HSTS, CSP restritiva, Permissions-Policy liberando câmera/microfone apenas na rota `/teleconsulta/[id]`).
✅ **Variáveis de Ambiente:** `.env.example` criado, contendo regra de não exposição da `service_role`.

## Migração de Rotas React
Mapeamento das 8 telas HTML (`src/views/*.html`) para as rotas do Next.js (`src/app`):

| Rota Next.js | Arquivo HTML Origem | Tabelas / RPC Relacionadas | Status |
|---|---|---|---|
| `/` (Landing) | `index.html` | N/A (Estática / Leads) | Em andamento |
| `/veterinarios` | `veterinarians-catalog.html` | `profiles` (role=vet), `specialties` | Em andamento |
| `/agendamento` | `tutor-booking-flow.html` | `appointments`, `availability` | Em andamento |
| `/checkout` | `checkout-transparent.html` | `payments`, `appointments` | Em andamento |
| `/teleconsulta/[id]` | `teleconsultation-room.html` | `teleconsultation_rooms`, RPC: `join_room` | Em andamento |
| `/petshop/[slug]` | `petshop-page.html` | `petshops`, `inventory` | Em andamento |
| `/petshop-planos` | `petshop-saas-plans.html` | `saas_plans`, `subscriptions` | Em andamento |
| `/admin` | `dashboard-admin-master.html` | `users`, `audit_logs` | Em andamento |

## Hardcodes Removidos
Abaixo a relação de dados estáticos eliminados que agora consumirão do Supabase (com *empty states* previstos em tela):
- Nomes de veterinários mockados: "Dr. João Silveira", "Dra. Camila".
- Planos e valores do SaaS para petshops.
- Catálogo estático de disponibilidade e agendas fictícias de teste.

## Próximos Passos (Continuar Desenvolvimento)
1. Concluir a refatoração dos arquivos HTML originais transformando o CSS customizado em classes utilitárias do Tailwind CSS.
2. Adicionar os componentes de `shadcn/ui` (Button, Input, Select, etc) em um design system consistente.
3. Integrar React Hook Form e zod nos modais de checkout e agendamento.
4. Finalizar testes end-to-end com Playwright.
5. Setup avançado do manifesto PWA.
