# AUDIT_FASE_05 - Marketplace de Veterinários e Validação CRMV

## Status da Implementação (Banco de Dados e Regras)
✅ **Onboarding do Veterinário e Storage**
   - Alteramos a tabela `veterinarians` incluindo novos campos essenciais de marketplace: idiomas, tempo de consulta, modalidades suportadas, foto de perfil, e controle de status (`draft`, `under_review`, `verified`, `rejected`, `suspended`).
   - Criei o bucket `vet-documents` via script de setup para guardar diplomas e documentos profissionais confidenciais.

✅ **Fila de Revisão Manual (CRMV)**
   - O projeto já previa `crmv-adapter` em variáveis de ambiente, então estabeleci no banco o que ele precisa: uma **View Administrativa** chamada `crmv_review_queue`.
   - Um administrador pode abrir essa View no painel interno e ver quem está no estado `under_review` e com CRMV `pending_verification`, checar os PDFs enviados para o `vet-documents` e tomar ação de aceitar ou rejeitar.
   - Adicionada colunas para agendamento de reavaliação periódica (`needs_revalidation_at`).

✅ **Mecanismo de Busca Robusto (Catálogo)**
   - O Postgres agora utiliza extensões `unaccent` e `pg_trgm`.
   - Adicionado o campo automático `search_vector` (tipo `tsvector`) à tabela de veterinários.
   - **Trigger criada**: Ao inserir/atualizar um Vet, um script PL/pgSQL junta o Nome (A), Especialidades (B) e Bio (C) em um índice GIN gigante em português. Isso fará pesquisas tipo *"cardiologista sao paulo"* funcionarem instântaneamente sem inventar dependências do lado do servidor web.

✅ **Política LGPD & Catálogo (RLS)**
   - Um paciente no Frontend tentando listar veterinários NUNCA visualizará um veterinário que não esteja `verified` e `is_active`, graças à RLS aplicada rigidamente ("Publico le vets verificados").
   - Ninguém vê a documentação profissional do veterinário além dele mesmo e do Admin (proteção RLS na tabela `vet_documents`).

## Próximos Passos (Construção Front-end React)
1. **Frontend do Marketplace**: Criar a página pública de Catálogo de Veterinários (`/veterinarios`) com barra de busca que conecte ao `search_vector`.
2. **Dashboard do Vet**: Criar o painel para o Veterinário Submeter/Atualizar seus documentos de CRMV e ver que está "Em Análise".
3. **Painel do Backoffice (Admin)**: Construir a tela que lê de `crmv_review_queue` e fornece botões "Aprovar" / "Rejeitar".
