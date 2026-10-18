# AUDIT_FASE_03 - Autenticação, Perfis, Onboarding e Consentimentos

## Status da Implementação
✅ **LGPD e Consentimentos (Banco de Dados):**
   - Nova migration `0023_legal_consents_and_onboarding.sql` adicionada.
   - Tabelas `legal_documents` (versões e vigência de termos e políticas) e `user_consents` (registro inalterável do aceite por IP, timestamp e User Agent).
   - Políticas RLS configuradas (usuários veem apenas seus consentimentos).
✅ **Segurança da Conta:**
   - Triggers da fase 1 mantidos (`0010_auth_triggers_and_sync.sql`), o status da conta bloqueia sessão ativa.
   - Planejado: Páginas em React para fluxo protegido (`middleware.ts`) lidar com direcionamento.
✅ **Fluxos e Perfis Mapeados para App:**
   - `(public)/cadastro`: Captcha integrado, formulários segregados por tipo (Tutor, Vet, PetShop) via React Hook Form e zod com validação estrita BR (CPF/CNPJ).
   - MFA configurado no plano como obrigatório para perfis com altos privilégios (Admin, Vet).

## Arquitetura Definida (Front-end Auth)
- A lógica não irá recriar a tabela `auth.users`, utilizaremos estritamente `@supabase/ssr` e os *triggers* existentes.
- O rate-limit nas rotas de tentativa de login/reset_password ficarão sob as Edge Functions e configs do próprio painel do Supabase.

## Próximos Passos (Continuar Desenvolvimento)
1. Rodar `npm run supabase:types` para gerar as definições do TypeScript atualizadas após as mudanças no banco de dados.
2. Construir e validar no front-end a etapa de re-aceite ("Sua versão dos termos de uso está desatualizada. Por favor, aceite novamente.").
3. Implementar o MFA Flow usando `@supabase/supabase-js` em `src/app/auth/mfa`.
4. Finalizar testes Playwright para RBAC (PetShop A barrado de acessar dados do PetShop B).
