# AUDIT_TELEVET_ADS — TeleVet Ads: Publicidade e Patrocínios com Privacidade Absoluta

## Resultado
A **Fase 17** do TELEVET institui o **TeleVet Ads**, a rede oficial de publicidade, patrocínios e anúncios geolocalizados da plataforma. A arquitetura foi concebida sob os pilares de **transparência publicitária inegociável** e **proteção categórica da privacidade clínica de tutores e animais**.

Todo e qualquer criativo servido pelo sistema exibe compulsoriamente a identificação visual **"PATROCINADO"** ou **"ANÚNCIO"**, embutida no template e protegida contra remoção ou adulteração por CSS ou código do anunciante. A segmentação é delimitada a variáveis éticas de contexto geográfico e categorias gerais de serviço, com **bloqueio absoluto (em nível de banco de dados, trigger, RPC e TypeScript) contra o uso de dados clínicos, prontuários, vacinas, espécie, raça ou dados pessoais de tutores**.

A entrega é composta por:
- **Banco de Dados & Migração 0038** ([`0038_televet_ads_advertising_and_sponsorships.sql`](file:///c:/Users/EMMANUEL/Desktop/TELEVET%20geral/TELEVET/supabase/migrations/0038_televet_ads_advertising_and_sponsorships.sql)): tabelas `ad_plans`, `advertisers`, `ad_campaigns`, `ad_creatives`, `ad_placements`, `ad_events` (estruturada para particionamento mensal, com deduplicação anti-fraude e zero PII), procedure de entrega server-side `serve_ads`, triggers de moderação e políticas RLS;
- **Motor TypeScript & Cláusula de Privacidade** ([`src/ads/ad-service.ts`](file:///c:/Users/EMMANUEL/Desktop/TELEVET%20geral/TELEVET/src/ads/ad-service.ts)): método estático `assertZeroClinicalDataUsage` que rejeita tentativas de segmentação clínica, cálculo de métricas agregadas (impressões, visualizações, CTR, cliques e contatos diretos) e exportador CSV sanitizado;
- **Componentes de Publicidade Segura**: [`sponsored-badge.tsx`](file:///c:/Users/EMMANUEL/Desktop/TELEVET%20geral/TELEVET/src/components/ads/sponsored-badge.tsx) e [`ad-banner.tsx`](file:///c:/Users/EMMANUEL/Desktop/TELEVET%20geral/TELEVET/src/components/ads/ad-banner.tsx) com `IntersectionObserver` para auditoria de visualizações ativas (> 50% em tela);
- **Portal do Anunciante** ([`src/app/anunciante/`](file:///c:/Users/EMMANUEL/Desktop/TELEVET%20geral/TELEVET/src/app/anunciante/)): dashboard de métricas em tempo real, criador de campanhas geolocalizadas e vitrine de planos configuráveis;
- **Central Administrativa Master** ([`src/app/admin/anuncios/page.tsx`](file:///c:/Users/EMMANUEL/Desktop/TELEVET%20geral/TELEVET/src/app/admin/anuncios/page.tsx)): fila de moderação com aprovação e parecer formal de rejeição, gestão de preços e limites dos planos no banco de dados e controle anti-fraude;
- **Integração no Diretório Nacional** ([`src/app/diretorio/page.tsx`](file:///c:/Users/EMMANUEL/Desktop/TELEVET%20geral/TELEVET/src/app/diretorio/page.tsx)): slot de anúncio contextualizado (`diretorio_top_banner`) com selo obrigatório;
- **Suíte de Testes Automatizados**: testes unitários e de conformidade em [`scripts/test-ads-runner.mjs`](file:///c:/Users/EMMANUEL/Desktop/TELEVET%20geral/TELEVET/scripts/test-ads-runner.mjs) (9 testes com inspeção de dependências no banco) e testes de banco pgTAP em [`televet_ads_test.sql`](file:///c:/Users/EMMANUEL/Desktop/TELEVET%20geral/TELEVET/supabase/tests/database/televet_ads_test.sql) (10 asserts).

---

## O que existia antes
- **Tabela Preliminar `sponsors_and_advertisers` (Fase 15)**: criada como um esboço simples para patrocinadores do Admin Master, sem suporte a múltiplos anunciantes isolados (multi-tenant de publicidade), sem planos de assinatura, sem criativos dissociados de campanhas e sem controle de eventos de métricas.
- **Ausência de Entrega Server-Side de Ads**: não existia a procedure `serve_ads` nem regras espaciais/temporais para leilão e veiculação de anúncios.
- **Ausência de Proteção Anti-Fraude e Deduplicação**: qualquer clique ou impressão repetida podia ser contabilizada abusivamente sem limitação temporal por sessão.
- **Ausência de Painel do Anunciante**: anunciantes externos não possuíam portal de autoatendimento para cadastrar campanhas, selecionar planos, acompanhar CTR e exportar relatórios.

---

## O que foi criado/alterado

### 1. Banco de Dados e Migração (`supabase/migrations/0038_televet_ads_advertising_and_sponsorships.sql`)
- **Tabela `public.ad_plans` (Planos Configuráveis pelo Admin Master)**:
  - Campos: `id`, `slug`, `name`, `description`, `price_cents` (**definido e editável no banco de dados, NUNCA fixado no código**), `billing_cycle`, `max_active_campaigns`, `max_impressions_monthly`, `allowed_scopes`, `features JSONB`, `is_active`, `display_order`.
  - Carga inicial dos 5 planos do escopo:
    1. `basico`: Cadastro e página patrocinada no diretório (R$ 99,00/mês);
    2. `regional`: Destaque regional na busca, pin no mapa e banner local (R$ 249,00/mês);
    3. `estadual`: Campanha estadual ampla com banner de topo e relatórios (R$ 590,00/mês);
    4. `nacional`: Cobertura em todo o território nacional (R$ 1.490,00/mês);
    5. `premium`: Prioridade máxima de leilão, métricas em tempo real e suporte dedicado (R$ 2.990,00/mês).
- **Tabela `public.advertisers` (Empresas Anunciantes)**:
  - Campos: `id`, `owner_user_id`, `razao_social`, `nome_fantasia`, `cnpj`, `contact_name`, `contact_email`, `contact_phone`, `contact_whatsapp`, `website_url`, `balance_cents`, `status` (`active`, `suspended`, `pending_verification`).
- **Tabela `public.ad_campaigns` (Campanhas com Segmentação Rígida)**:
  - Campos: `id`, `advertiser_id`, `plan_id`, `name`, `campaign_type` (`banner`, `destaque_busca`, `destaque_regional`, `estadual`, `nacional`, `pagina_patrocinada`, `campanha_categoria`, `campanha_localizacao`), `scope` (`bairro`, `cidade`, `regiao`, `estado`, `conjunto_estados`, `nacional`), `target_ufs`, `target_cities`, `target_neighborhoods`, `target_categories` (apenas categorias gerais do diretório), `target_context` (`busca`, `diretorio`, `home`, `geral`), `starts_at`, `ends_at`, `budget_cents`, `daily_budget_cents`, `spent_cents`, `status` (`rascunho`, `aguardando_aprovacao`, `aprovado`, `ativo`, `pausado`, `rejeitado`, `expirado`), `payment_status` (`pending`, `paid`, `failed`, `refunded`), `rejection_reason`, `moderated_by`, `moderated_at`.
  - **Trigger de Privacidade `trg_validate_ad_privacy`**: impede o cadastramento de qualquer campanha que contenha termos clínicos (`prontuario`, `diagnostico`, `sintoma`, `vacina`, `raca`, `especie`, etc.), lançando erro `22023`.
- **Tabela `public.ad_creatives` (Criativos com Selo Não Removível)**:
  - Campos: `id`, `campaign_id`, `format` (`banner_horizontal`, `banner_vertical`, `banner_quadrado`, `card_destaque`, `pagina_patrocinada`), `title`, `description`, `image_url` (bucket `ad-assets`), `target_url`, `call_to_action`, `phone`, `whatsapp`, `is_active`.
- **Tabela `public.ad_placements`**:
  - Cadastro de slots oficiais: `diretorio_top_banner`, `diretorio_sidebar`, `busca_featured`, `home_featured`.
- **Tabela `public.ad_events` (Métricas Particionadas por Mês, Anti-Fraude e Zero PII)**:
  - Campos: `id`, `campaign_id`, `creative_id`, `event_type` (`impressao`, `visualizacao`, `clique`, `ligacao`, `whatsapp`, `como_chegar`), `placement_key`, `session_hash`, `created_at`, `event_date`, `event_month`.
  - **Deduplicação Anti-Fraude**: ignora eventos repetidos do mesmo `session_hash` nos últimos 60 segundos.
  - **Sem PII**: não armazena IP real, cookies persistentes nem dados pessoais de tutores.
- **Funções RPC com `SECURITY DEFINER` e `SET search_path = ''`**:
  - `serve_ads(placement, uf, cidade, bairro, categoria, limit)`: entrega server-side de anúncios qualificados, verificando status ativo, pagamento aprovado, vigência temporal e orçamento disponível. Injeta compulsoriamente `badge_label = 'PATROCINADO'`.
  - `record_ad_event(...)`: deduplicação anti-fraude e registro atômico com débito proporcional de orçamento.
  - `admin_moderate_campaign(...)`: moderação administrativa com parecer formal gravado em `audit_logs`.
- **Políticas RLS (Row Level Security)**:
  - Anunciantes só visualizam e alteram suas próprias campanhas e criativos (`advertisers.owner_user_id = auth.uid()`);
  - O público consome anúncios exclusivamente através da função segura `serve_ads`;
  - Apenas o Administrador Master pode editar planos (`ad_plans`) e moderar campanhas.

### 2. Arquitetura TypeScript e Serviços (`src/ads/`)
- **`src/ads/types.ts`**: modelagem completa de `AdPlan`, `Advertiser`, `AdCampaign`, `AdCreative`, `ServedAd`, `AdMetricsSummary` e lista de `FORBIDDEN_CLINICAL_FIELDS`.
- **`AdService` (`src/ads/ad-service.ts`)**:
  - `assertZeroClinicalDataUsage(params)`: método estático de validação prévia que aborta a execução se qualquer parâmetro contiver termos ou identificadores clínicos.
  - `serveAds(params)`: consumo da entrega server-side com selo obrigatório.
  - `recordEvent(...)`: registro de impressões, visualizações e cliques com deduplicação de 60 segundos.
  - `getPlans()` e `savePlan(...)`: leitura e persistência dinâmica de planos no banco de dados.
  - `getCampaignMetrics(campaignId)`: consolidação analítica de CTR, contatos e faturamento.
  - `exportMetricsCsv(metrics, campaignName)`: gerador de CSV sanitizado para prestação de contas.

### 3. Componentes de Interface de Anúncios
- **`SponsoredBadge` (`src/components/ads/sponsored-badge.tsx`)**:
  - Componente oficial do selo **"PATROCINADO"** ou **"ANÚNCIO"**, posicionado sobre camadas de z-index prioritárias e imutável pelo anunciante.
- **`AdBanner` (`src/components/ads/ad-banner.tsx`)**:
  - Renderiza anúncios nos formatos horizontal e card destaque;
  - Utiliza `IntersectionObserver` para validar visualizações reais (> 50% visível na tela);
  - Botões de contato direto (WhatsApp e Telefone) e link de conversão com tracking integrado.

### 4. Frontend e Telas Integradas
- **Portal do Anunciante (`src/app/anunciante/page.tsx`)**:
  - Visão geral com 6 cards de métricas (Impressões, Visualizações, Cliques, CTR, Contatos Diretos e Investimento);
  - Botão de exportação de relatório em CSV;
  - Listagem de campanhas com badges de status e saldo da conta.
- **Criador de Campanhas com Segmentação Ética (`src/app/anunciante/campanhas/nova/page.tsx`)**:
  - Definição de escopo geográfico (Bairro, Cidade, Regional, Estadual, Nacional);
  - Seleção de categorias gerais do diretório (Ambulâncias, Farmácias, Laboratórios, etc.);
  - Configuração de orçamento diário e total;
  - Cadastro de criativo (título, descrição, imagem no bucket `ad-assets`, link de destino e contatos);
  - Alerta informativo de conformidade e envio para moderação.
- **Vitrine de Planos Configuráveis (`src/app/anunciante/planos/page.tsx`)**:
  - Apresentação comparativa dos 5 planos (Básico, Regional, Estadual, Nacional, Premium) com valores em R$ e limites consumidos diretamente do banco de dados.
- **Módulo de Governança no Admin Master (`src/app/admin/anuncios/page.tsx`)**:
  - Fila de Moderação: aprovação com 1 clique ou rejeição fundamentada com justificativa obrigatória;
  - Gestão de Planos & Preços: editor interativo para o Superadmin alterar valores e capacidades dos planos diretamente no banco de dados;
  - Tabela de anunciantes com controle de suspensão/ativação;
  - Dashboard analítico de faturamento global e volume de impressões da rede.
- **Integração no Diretório Nacional (`src/app/diretorio/page.tsx`)**:
  - Inserção do componente `AdBanner` no topo dos resultados de busca do diretório, contextualizado por localização e categoria.

---

## Regras de segurança e privacidade respeitadas
1. **Isolamento Clínico e Zero Leitura de Prontuários**:
   - É expressamente proibido veicular anúncios baseados em doenças, históricos de atendimento, receituários, vacinas, raças ou diagnósticos.
   - **Comprovado por teste de inspeção de dependências**: a função `serve_ads` **NÃO possui nenhum JOIN ou consulta a tabelas clínicas** (`consultations`, `medical_records`, `pets`, `prescriptions`, `pet_vaccinations`, `tutors`).
2. **Selo "PATROCINADO" Obrigatório e Inegociável**:
   - Todo anúncio veiculado exibe o selo com ícone de megafone e rotulagem clara, assegurando total transparência ao usuário final conforme as boas práticas do CONAR e da LGPD.
3. **Preços e Limites Dinâmicos no Banco (`ad_plans`)**:
   - Nenhum preço de plano de publicidade é fixado no código TypeScript. Todas as tarifas, limites de impressões e escopos são lidos da tabela `ad_plans` gerenciada pelo Admin Master.
4. **Proteção Anti-Fraude com Deduplicação Temporal**:
   - Cliques e impressões repetidos da mesma sessão dentro da janela de 60 segundos são deduplicados na função `record_ad_event`, protegendo o orçamento do anunciante contra robôs ou duplo clique acidental.
5. **Minimização de Dados (LGPD)**:
   - A tabela `ad_events` não armazena IP real, CPF ou nomes de usuários. O `session_hash` é gerado sem capacidade de engenharia reversa.
   - Nenhum dado pessoal é transmitido ao anunciante sem que o tutor tome uma ação voluntária e deliberada (ex.: clicar no botão de WhatsApp ou Ligar).
6. **Isolamento RLS entre Anunciantes**:
   - O anunciante A nunca tem acesso aos criativos, faturamento, saldo ou métricas do anunciante B.

---

## Funções/RPCs principais
- `public.serve_ads(p_placement, p_uf, p_cidade, p_bairro, p_categoria, p_limit)`
- `public.record_ad_event(p_campaign_id, p_creative_id, p_event_type, p_placement, p_session_hash)`
- `public.admin_moderate_campaign(p_campaign_id, p_action, p_rejection_reason)`

---

## Testes Realizados

### 1. Suíte de Testes Unitários e de Conformidade (`scripts/test-ads-runner.mjs`)
Executado via `npm run test:ads` (Node.js Test Runner + tsx):
```text
✅ Todos os testes de conformidade do TeleVet Ads passaram com sucesso.
✔ 1. Anúncios com status não aprovado (rascunho, aguardando, rejeitado, pausado) NÃO são servidos (4.41ms)
✔ 2. Anúncio sem pagamento ou com orçamento esgotado NÃO é servido (0.35ms)
✔ 3. Selo "PATROCINADO" ou "ANÚNCIO" é obrigatório e inalterável em todo criativo servido (1.54ms)
✔ 4. Deduplicação Anti-Fraude descarta eventos repetidos da mesma sessão em 60 segundos (0.46ms)
✔ 5. Cláusula de Privacidade Absoluta bloqueia tentativas de segmentação por dados clínicos ou tutores (4.76ms)
✔ 6. Inspeção de Dependências no Banco comprova que serve_ads NÃO acessa tabelas clínicas (1.71ms)
✔ 7. Planos de anúncios (ad_plans) possuem preços e limites dinâmicos no banco de dados (1.57ms)
✔ 8. Moderação de Campanha: Aprovação ativa veiculação e Rejeição exige parecer formal (0.50ms)
✔ 9. Exportação de Métricas em CSV é sanitizada e livre de dados de identificação pessoal (LGPD) (4.20ms)
ℹ tests 9 | pass 9 | fail 0 | duration_ms 53.62ms
```

### 2. Testes de Banco de Dados pgTAP (`supabase/tests/database/televet_ads_test.sql`)
10 asserts planejados:
1. Existência da tabela `ad_plans`;
2. Existência da tabela `advertisers`;
3. Existência da tabela `ad_campaigns`;
4. Existência da tabela `ad_creatives`;
5. Existência da tabela `ad_placements`;
6. Existência da tabela `ad_events`;
7. Carga inicial dos 5 planos configuráveis no banco;
8. Existência da RPC `serve_ads`;
9. Existência da RPC `record_ad_event`;
10. Trigger `trg_validate_ad_privacy` disparando exceção `22023` contra termos clínicos.

### 3. Validação Estática TypeScript
- Executado `npm run typecheck` (`tsc --noEmit`) com saída de **0 erros de compilação**.

---

## Conclusão e Entrega
A **Fase 17 — TeleVet Ads: Publicidade e Patrocínios** encontra-se integralmente desenvolvida, testada e em conformidade estrita com os limites de privacidade, governança e regras comerciais do projeto TELEVET.
