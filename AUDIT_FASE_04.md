# AUDIT_FASE_04 - Portal do Tutor e Prontuário Básico do Pet

## Status da Implementação (Banco de Dados e Infra)
✅ **Estrutura de Perfil do Pet (`pets` table expandida)**
   - Implementado *Soft Delete* (`deleted_at` na tabela `pets`). Com isso o tutor pode "excluir" o pet da interface dele, mas todo o histórico financeiro e clínico que o médico ou clínica registraram no passado é preservado inviolavelmente.
   - Adicionada constraint para `microchip_number` ser único (apenas se preenchido, ignorando valores nulos).
   - Adicionada flag `birth_date_approx` para tutores que adotam e não sabem o dia exato do nascimento.
   - Adicionado campo `color` (Cor da pelagem).

✅ **Histórico Longitudinal (Peso e Documentos)**
   - Tabela `pet_weights` criada com registro de gramas (maior precisão para neonatos e animais silvestres) referenciando `pet_id` e `recorded_by`.
   - Tabela `pet_documents` criada para referenciar exames, laudos e carteirinhas.

✅ **Storage e Mime-Types**
   - Inseridos via Migration no schema `storage.buckets` os diretórios:
     - `pet-photos`: Limite de 5MB, exclusivo para Imagens (`jpeg, png, webp`). Privado.
     - `pet-documents`: Limite de 10MB, aceita PDFs e imagens. Privado.

✅ **Segurança da Informação (LGPD e RLS)**
   - Criadas políticas (RLS) restritivas na tabela `pet_weights` e `pet_documents` fazendo `JOIN` de volta até o `user_id` do auth com a tabela de tutores: um tutor NUNCA vê ou altera pesos/dados de pets alheios.
   - Pet shops estão excluídos (não podem ler `pet_weights` de clientes atribuídos, eles leem apenas nome do tutor para questões de agendamento de banho/tosa).

## Próximos Passos (Construção Front-end React)
1. Construir a página **"/tutor/dashboard"**: Interface que lista os pets ativos, exibindo a foto usando **URLs assinadas** que devem ser resolvidas pelo backend (devido à restrição dos buckets privados).
2. Criar Modal/Página para inclusão de Pet: Formulário com `react-hook-form`, `zod`, input select dinâmico para Raças com base na Espécie.
3. Componente Gráfico: Utilizar uma biblioteca como Recharts e os dados do `pet_weights` para mostrar a evolução cronológica.
4. Integrar busca de CEP no formulário de edição do perfil do tutor (viacep).
