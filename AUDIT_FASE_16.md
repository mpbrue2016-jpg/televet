# AUDIT_FASE_16 — Diretório Nacional de Serviços de Saúde e Atendimento Animal

## Resultado
A **Fase 16** do TELEVET entrega o **Diretório Nacional de Serviços de Saúde e Atendimento Animal**, disponível em todo o território brasileiro e estruturado sob rigorosa conformidade regulatória e espacial. O módulo viabiliza a busca geolocalizada por raio de proximidade em quilômetros via **PostGIS (`geography(Point, 4326)`)**, integrando as **9 categorias estritamente permitidas**, com travas atômicas em banco de dados e no frontend que **impedem terminantemente o cadastramento de clínicas, hospitais, pet shops, banho e tosa e especialistas** (os quais continuam sob seus módulos dedicados).

A entrega engloba:
- **Banco de Dados & Migração 0037** com suporte a PostGIS, `pg_trgm`, `unaccent`, tabelas normalizadas (`service_categories`, `service_providers`, `provider_photos`, `provider_regions`, `provider_reports`, `provider_click_events`), triggers de integridade geográfica e políticas **Row Level Security (RLS)**;
- **Motor TypeScript & Serviços** com validador oficial de **CNPJ via Módulo 11 da Receita Federal**, geocodificador configurável com fallback gracioso para status `pending`, gerador de deep links para navegação (Google Maps) e WhatsApp contextual, além de validador/importador em lote de planilhas CSV;
- **Frontend Completo (Next.js App Router)** com busca híbrida (lista + mapa), filtros de "Aberto Agora", "Plantão 24 Horas" e "Verificada", páginas indexáveis com **SEO e dados estruturados Schema.org (`LocalBusiness`, `EmergencyService`)**, fluxo de auto-cadastro da empresa, painel de autoatendimento do prestador, e central de moderação, categorias, qualidade de dados e importação no **Admin Master**;
- **Atalho de Emergência Integrado**: canal direto a partir do fluxo de triagem clínica (Fase 7) e dashboard do tutor, direcionando imediatamente para ambulâncias veterinárias e estabelecimentos 24h mais próximos;
- **Suíte de Testes Automatizados**: testes unitários e de integração em `scripts/test-directory-runner.mjs` (9 testes) e testes de banco pgTAP em `supabase/tests/database/directory_services_test.sql` (12 asserts).

---

## O que existia antes
- **Migração 0037 Inicial Incompleta**: havia apenas um rascunho de tabela `directory_services` com fórmula trigonométrica Haversine sem a utilização do tipo nativo `geography` do PostGIS, sem a estrutura das tabelas `service_categories`, `provider_photos`, `provider_regions` e `provider_reports`.
- **Ausência de Validação Matemática de CNPJ**: cadastros anteriores dependiam de simples validação de string/regex, sem cálculo de dígitos verificadores do Módulo 11 da Receita Federal.
- **Ausência de Interface do Usuário**: não existiam telas públicas de busca de serviços (`/diretorio`), perfil individual com dados estruturados (`/diretorio/[id]`), fluxo de auto-cadastro (`/diretorio/cadastrar`), painel do prestador (`/diretorio/painel`) nem o módulo administrativo `/admin/diretorio`.
- **Desconexão com a Triagem de Urgência (Fase 7)**: o tutor que detectava urgência na triagem pré-consulta não contava com um atalho para acionar ambulâncias e plantões 24h geolocalizados.

---

## O que foi criado/alterado

### 1. Banco de Dados e Migração (`supabase/migrations/0037_national_services_directory.sql`)
- **Extensões Espaciais e Textuais**:
  - `postgis`: suporte ao tipo `geography(Point, 4326)`, índices espaciais `GIST` e funções `ST_DWithin` e `ST_Distance` para cálculo esferoidal de distância em metros/km;
  - `pg_trgm` e `unaccent`: busca fonética e textual insensível a acentuação.
- **Tabela `public.service_categories` (Categorias Permitidas - Gerenciável pelo Admin)**:
  - Campos: `id`, `slug`, `name`, `description`, `icon`, `display_order`, `is_active`, `created_at`, `updated_at`.
  - Carga inicial das 9 categorias obrigatórias:
    1. `ambulancia`: Ambulâncias veterinárias (resgate móvel, remoção 24h);
    2. `farmacia_veterinaria`: Farmácias veterinárias;
    3. `farmacia_manipulacao`: Farmácias de manipulação veterinária;
    4. `laboratorio`: Laboratórios veterinários (exames, histopatologia);
    5. `centro_diagnostico`: Centros de diagnóstico por imagem (raio-X, ultrassom, tomografia);
    6. `transporte`: Transporte de animais (táxi dog, vans climatizadas, translado interestadual);
    7. `funerario_cremacao`: Serviços funerários e cremação pet;
    8. `odontologia`: Odontologia veterinária;
    9. `outros_servicos`: Outros serviços de saúde animal (bancos de sangue pet, próteses).
  - Trigger `trg_validate_service_categories_terms`: impede a criação de categorias com termos proibidos (`clinica`, `hospital`, `pet shop`, `banho e tosa`, `especialista`).
- **Tabela `public.service_providers` (Prestadores Credenciados)**:
  - Identificação: `razao_social`, `nome_fantasia`, `cnpj`, `categoria` (slug da categoria), `descricao`;
  - Contato: `telefone`, `whatsapp`, `email`, `site`;
  - Endereço & PostGIS: `endereco`, `logradouro`, `numero`, `complemento`, `bairro`, `cep`, `cidade`, `uf`, `latitude`, `longitude`, `location geography(Point, 4326)`;
  - Geocodificação: `geocoding_status` (`pending`, `geocoded`, `manual`, `failed`), `geocoding_provider`;
  - Operação: `horario_funcionamento` (JSONB com grade semanal e feriados), `servicos` (array de texto), `fotos`, `logotipo`, `atende_24h` (boolean);
  - Moderação & Status: `status` (`rascunho`, `em_analise`, `aprovada`, `suspensa`), `verificada` (boolean para selo auditado), `documento_comprobatorio_url`, `clicks_count`;
  - Trigger `trg_service_providers_sync_location`: sincroniza automaticamente `location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography`;
  - Trigger `trg_validate_provider_forbidden_terms`: bloqueia o cadastro de estabelecimentos com termos excluídos.
- **Tabela `public.provider_photos`**: galeria de fotos do estabelecimento (`photo_url`, `caption`, `is_cover`, `display_order`).
- **Tabela `public.provider_regions`**: área de cobertura por cidade/UF e raio máximo para empresas de transporte e ambulâncias.
- **Tabela `public.provider_reports` (Denúncias de Informação Incorreta)**:
  - Registro de inconsistências reportadas por usuários (`telefone_invalido`, `endereco_incorreto`, `fechado_permanentemente`, `categoria_inadequada`, `outro`), status (`pendente`, `em_analise`, `resolvido`, `descartado`) e parecer do admin.
- **Tabela `public.provider_click_events` (Métricas LGPD)**:
  - Registro anônimo de eventos (`ligar`, `whatsapp`, `como_chegar`, `site`, `perfil`) com data de agregação para acompanhamento de conversão sem captura de PII.
- **Funções RPC com `SECURITY DEFINER` e `SET search_path = ''`**:
  - `search_service_providers`: busca por PostGIS com raio em km, filtros de categoria, UF, cidade, CEP, 24 horas, aberta agora, verificada e ordenação por proximidade. **Garante que o público veja estritamente estabelecimentos com `status = 'aprovada'`**.
  - `record_provider_click`: incremento atômico e gravação em `provider_click_events`.
  - `admin_review_service_provider`: moderação administrativa (`aprovar`, `suspender`, `rejeitar`, `verificar`, `desverificar`) com auditoria formal em `audit_logs`.
  - `report_provider_issue`: registro de denúncia de dados incorretos pelo público.
  - `admin_get_data_quality_report`: relatório analítico de telefones inválidos, geocodificação pendente e denúncias abertas.
  - `search_directory_services`: wrapper de compatibilidade retroativa.
- **Políticas RLS (Row Level Security)**:
  - Leitura pública aberta exclusivamente para estabelecimentos `aprovada`;
  - O prestador autenticado gerencia apenas seus próprios registros (`owner_user_id = auth.uid()`), sendo **terminantemente impedido de se auto-aprovar**;
  - O Administrador Master (`is_admin()`) possui privilégios totais de leitura e moderação.

### 2. Arquitetura TypeScript e Serviços (`src/directory/`)
- **`src/directory/types.ts`**:
  - Modelagem de dados: `ServiceProviderItem`, `ServiceCategoryEntity`, `ProviderPhotoItem`, `ProviderRegionItem`, `ProviderReportItem`, `DirectorySearchParams`, `DirectoryQualityReport`, `DirectoryCsvRow`, `DirectoryCsvValidation`;
  - Constantes regulatórias: `DIRECTORY_CATEGORIES_METADATA` (com labels e ícones) e `EXCLUDED_CATEGORIES`.
- **`src/directory/cnpj-validator.ts`**:
  - Validador oficial do algoritmo de CNPJ pelo Módulo 11 da Receita Federal;
  - Rejeição de sequências com dígitos repetidos (`00000000000000`, etc.);
  - Máscara e formatação no padrão `00.000.000/0000-00`.
- **`src/directory/geocoding-service.ts`**:
  - Provedor configurável (Nominatim / OpenStreetMap / Custom);
  - Fallback resiliente: em caso de ausência de chave de API, falha de rede ou timeout (4s), o serviço retorna `status: 'pending'` sem travar a submissão do cadastro do usuário.
- **`src/directory/directory-service.ts`**:
  - `search(params)`: busca parametrizada com suporte a cálculo de distância PostGIS e filtro de "Aberto Agora" baseado no horário semanal;
  - `getProviderById(id)`: consulta completa com fotos e regiões atendidas;
  - `getProviderServices(ownerUserId)`: consulta dos estabelecimentos pertencentes ao prestador logado;
  - `saveService(payload)`: validação preventiva de CNPJ, trava contra categorias excluídas, geocodificação e gravação em `service_providers`;
  - `reviewService(id, action, notes)`: moderação do Superadmin;
  - `recordClick(providerId, eventType)`: registro de métricas de clique;
  - `generateRouteUrl(provider)`: deep link para Google Maps / Waze;
  - `generateWhatsAppUrl(phone, name)`: link do WhatsApp com mensagem contextual pronta;
  - `validateCsvImport(csvContent)`: parser de CSV (vírgula ou ponto-e-vírgula) com validação de campos obrigatórios, conferência de CNPJ, categoria válida e detecção de termos proibidos;
  - `importCsvBatch(validRows)`: importação em lote dos registros aprovados na pré-validação;
  - `reportIssue(providerId, reportType, details, contact)` e `getDataQualityReport()`.

### 3. Frontend e Telas do Sistema (Next.js App Router)
- **Componente Reutilizável de Emergência (`src/components/directory/emergency-banner.tsx`)**:
  - Banner pulsante com alerta vermelho/laranja destacando ambulâncias veterinárias e plantão 24h mais próximos;
  - Versão padrão para topo do diretório e versão compacta para o dashboard do tutor.
- **Busca Pública Nacional (`src/app/diretorio/page.tsx`)**:
  - Barra de busca com campo textual, CEP, cidade e seletor de UF;
  - Botão "Usar Minha Localização" (HTML5 Geolocation) com feedback visual de status;
  - Filtro de raio ajustável (5 km, 10 km, 25 km, 50 km, 100 km ou Brasil inteiro);
  - Seletor em grid/pills das 9 categorias permitidas com ícones dinâmicos;
  - Toggles para "Plantão 24 Horas", "Aberto Agora" e "Apenas Verificadas";
  - Alternância entre Lista de Cards e Mapa com pins;
  - Cards de estabelecimentos com indicador de distância ("a 2.1 km"), status de abertura, selo de verificação e botões de ação com tracking (Ligar, WhatsApp, Como chegar, Ver Perfil);
  - Botão de acesso ao auto-cadastro ("Cadastrar Empresa") e "Painel do Prestador".
- **Página do Prestador com SEO (`src/app/diretorio/[id]/page.tsx`)**:
  - Metadados estruturados JSON-LD Schema.org (`LocalBusiness`, `VeterinaryCare`, `EmergencyService`) injetados para indexação orgânica no Google;
  - Apresentação completa: Razão Social, Nome Fantasia, CNPJ validado, logotipo, descrição detalhada;
  - 4 botões de conversão com tracking de cliques: **Ligar Agora**, **WhatsApp**, **Como Chegar** (Google Maps/Waze) e **Visitar Site**;
  - Grade semanal de horários com feriados e status de plantão 24h;
  - Chips de serviços especializados e galeria de fotos;
  - Botão e Modal de **Denunciar Informação Incorreta** com persistência em `provider_reports`.
- **Auto-cadastro da Empresa (`src/app/diretorio/cadastrar/page.tsx`)**:
  - Formulário com validação de CNPJ em tempo real (ícone verde/vermelho);
  - Restrição às 9 categorias permitidas com bloqueio imediato caso o usuário tente informar termos de clínicas/hospitais/pet shops;
  - Preenchimento automático de endereço por CEP (ViaCEP);
  - Configuração de horários, 24 horas, upload de logo e documento comprobatório para selo de verificação;
  - Envio automático para a esteira de análise (`em_analise`) com tela de sucesso informativa.
- **Painel do Prestador (`src/app/diretorio/painel/page.tsx`)**:
  - Dashboard para o prestador acompanhar o status de cada estabelecimento (`rascunho`, `em_analise`, `aprovada`, `suspensa`);
  - Contador de contatos e cliques recebidos (Ligar, WhatsApp, Rota, Site);
  - Botão de edição rápida de dados.
- **Módulo do Admin Master (`src/app/admin/diretorio/page.tsx`)**:
  - Aba 1 (**Moderação de Prestadores**): tabela com busca, filtros de status e ações com 1 clique: Aprovar, Suspender, Atribuir Selo Verificado e Remover Selo com justificativa auditada;
  - Aba 2 (**Categorias de Serviços**): visualização das 9 categorias ativas e modal de criação com barreira contra categorias proibidas;
  - Aba 3 (**Importação em Lote CSV**): área de colagem/upload de CSV, validador linha a linha com exibição de erros/avisos e botão para importar registros válidos;
  - Aba 4 (**Qualidade de Dados & Denúncias**): cards analíticos de telefones suspeitos, estabelecimentos sem coordenadas, geocodificação pendente e tabela de denúncias de usuários com ação de resolução.
- **Integração no Layout Admin Master (`src/app/admin/layout.tsx`)**:
  - Adicionado item "Diretório Nacional" (`/admin/diretorio`) com ícone `Compass` nos `NAV_ITEMS`.
- **Atalho de Emergência na Triagem e Dashboard**:
  - Inserido banner de socorro urgente em `src/app/(tutor)/dashboard/page.tsx`;
  - Inserido atalho em `src/app/agendamento/booking-form.tsx` na etapa de sintomas e triagem da teleconsulta, orientando o tutor com pet em estado crítico a acionar ambulância 24h imediatamente.

---

## Regras de segurança/comerciais respeitadas
1. **PostGIS e Distância Geodésica Real**:
   - As distâncias são calculadas pelo elipsoide WGS84 (`geography(Point, 4326)`) através de `ST_Distance` e filtradas por `ST_DWithin`, garantindo ordenação precisa por proximidade em quilômetros.
2. **Bloqueio Estrito de Categorias e Termos Excluídos**:
   - Triggers de banco (`trg_validate_service_categories_terms` e `trg_validate_provider_forbidden_terms`) e validações no TypeScript rejeitam preventivamente qualquer menção a clínicas, hospitais, pet shops, banho e tosa e especialistas. Esses estabelecimentos possuem seus módulos exclusivos na plataforma TELEVET.
3. **Validação Matemática de CNPJ (Módulo 11)**:
   - Todo CNPJ submetido é auditado por cálculo de dígitos verificadores da Receita Federal, impedindo o cadastramento de números fictícios ou sequências repetidas.
4. **Isolamento e RLS no Postgres**:
   - Estabelecimentos com status `rascunho`, `em_analise` ou `suspensa` são **invisíveis na busca pública**;
   - Prestadores têm acesso estritamente restrito aos seus próprios registros (`owner_user_id = auth.uid()`), sem permissão para se auto-aprovar;
   - Apenas o Superadmin pode aprovar, suspender ou conceder selo verificado.
5. **Privacidade e LGPD nas Métricas de Clique**:
   - Os cliques em "Ligar", "WhatsApp", "Como Chegar" e "Site" são registrados como contadores anônimos diários em `provider_click_events`, sem armazenar IP, nome ou dados de identificação pessoal do tutor.
6. **Geocodificação Resiliente**:
   - Em caso de indisponibilidade de rede ou ausência de chave de geocodificador, o status é gravado como `pending`, não impedindo o auto-cadastro do prestador.

---

## Funções/RPCs principais
- `public.search_service_providers(p_categoria, p_uf, p_cidade, p_bairro, p_cep, p_lat, p_lng, p_radius_km, p_atende_24h, p_verificada, p_query, p_limit, p_offset)`
- `public.record_provider_click(p_provider_id, p_event_type)`
- `public.admin_review_service_provider(p_provider_id, p_action, p_notes)`
- `public.report_provider_issue(p_provider_id, p_report_type, p_details, p_contact)`
- `public.admin_get_data_quality_report()`
- `public.search_directory_services(...)`

---

## Testes Realizados

### 1. Suíte de Testes Unitários e de Integração (`scripts/test-directory-runner.mjs`)
Executado via `npm run test:directory` (Node.js Test Runner + tsx):
```text
✅ Todos os testes unitários do Diretório Nacional passaram com sucesso.
✔ 1. CnpjValidator valida matematicamente CNPJs legítimos e rejeita falsos ou inválidos (2.56ms)
✔ 2. Catálogo de Categorias contém exatamente as 9 categorias permitidas e bloqueia excluídas (1.35ms)
✔ 3. DirectoryService rejeita cadastro com termos proibidos (Clínica / Hospital / Pet Shop) (2.69ms)
✔ 4. GeocodingService opera com fallback resiliente marcando "pending" quando offline ou sem chave (0.47ms)
✔ 5. Validador de Importação CSV identifica registros válidos, erros de categoria e termos proibidos (12.38ms)
✔ 6. Geração de URLs de Navegação (Google Maps) e WhatsApp com Mensagem Contextual (1.55ms)
✔ 7. Filtro de Emergência direciona corretamente para Ambulâncias e Atendimento 24h (0.44ms)
✔ 8. Ordenação por Proximidade Geográfica calcula distâncias coerentes (6.01ms)
✔ 9. Regra RLS: Estabelecimentos rascunho ou pendentes são estritamente ocultos do público (0.73ms)
ℹ tests 9 | pass 9 | fail 0 | duration_ms 49.78ms
```

### 2. Testes de Banco de Dados pgTAP (`supabase/tests/database/directory_services_test.sql`)
12 asserts planejados:
1. Instalação da extensão `postgis`;
2. Instalação da extensão `pg_trgm`;
3. Instalação da extensão `unaccent`;
4. Existência da tabela `service_categories`;
5. Existência da tabela `service_providers`;
6. Existência da tabela `provider_photos`;
7. Existência da tabela `provider_regions`;
8. Existência da tabela `provider_reports`;
9. Existência da tabela `provider_click_events`;
10. Carga inicial exata das 9 categorias ativas;
11. Disparo de exceção `22023` ao tentar cadastrar categoria proibida (`clinicas`);
12. Existência da função RPC `search_service_providers`.

### 3. Validação Estática TypeScript
- Executado `npm run typecheck` (`tsc --noEmit`) com saída de **0 erros de tipagem**.

---

## Conclusão e Entrega
A **Fase 16 — Diretório Nacional de Serviços de Saúde e Atendimento Animal** encontra-se integralmente implementada, testada e em conformidade com as diretrizes do projeto TELEVET, assegurando a localização ágil de serviços especializados em todo o Brasil e preservando o isolamento regulatório dos módulos de clínicas, pet shops e especialistas.
