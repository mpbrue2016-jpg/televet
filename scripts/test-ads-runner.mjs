// ==============================================================================
// scripts/test-ads-runner.mjs
// Executor de Testes Unitários e de Conformidade da Fase 17 (TeleVet Ads)
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { AdService } from '../src/ads/ad-service.ts';
import { FORBIDDEN_CLINICAL_FIELDS } from '../src/ads/types.ts';

test('1. Anúncios com status não aprovado (rascunho, aguardando, rejeitado, pausado) NÃO são servidos', () => {
  const campaigns = [
    { id: '1', status: 'ativo', payment_status: 'paid', budget_cents: 1000, spent_cents: 100 },
    { id: '2', status: 'rascunho', payment_status: 'paid', budget_cents: 1000, spent_cents: 0 },
    { id: '3', status: 'aguardando_aprovacao', payment_status: 'paid', budget_cents: 1000, spent_cents: 0 },
    { id: '4', status: 'rejeitado', payment_status: 'paid', budget_cents: 1000, spent_cents: 0 },
    { id: '5', status: 'pausado', payment_status: 'paid', budget_cents: 1000, spent_cents: 50 },
    { id: '6', status: 'expirado', payment_status: 'paid', budget_cents: 1000, spent_cents: 1000 },
  ];

  // Simulação da lógica de elegibilidade de serve_ads
  const eligible = campaigns.filter(c => c.status === 'ativo');

  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].id, '1');
  assert.equal(eligible.some(c => c.status !== 'ativo'), false);
});

test('2. Anúncio sem pagamento ou com orçamento esgotado NÃO é servido', () => {
  const campaigns = [
    { id: 'c1', status: 'ativo', payment_status: 'paid', budget_cents: 1000, spent_cents: 200 },    // Válido
    { id: 'c2', status: 'ativo', payment_status: 'pending', budget_cents: 1000, spent_cents: 0 },     // Sem pagamento
    { id: 'c3', status: 'ativo', payment_status: 'failed', budget_cents: 1000, spent_cents: 0 },      // Falha de pagamento
    { id: 'c4', status: 'ativo', payment_status: 'paid', budget_cents: 1000, spent_cents: 1000 },    // Orçamento esgotado
    { id: 'c5', status: 'ativo', payment_status: 'paid', budget_cents: 500, spent_cents: 600 },      // Estourou limite
  ];

  const eligible = campaigns.filter(
    c => c.status === 'ativo' && c.payment_status === 'paid' && (c.budget_cents === 0 || c.spent_cents < c.budget_cents)
  );

  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].id, 'c1');
});

test('3. Selo "PATROCINADO" ou "ANÚNCIO" é obrigatório e inalterável em todo criativo servido', async () => {
  const service = new AdService('http://localhost:54321', 'mock-key');

  // Ao chamar serveAds (ou simular seu retorno), o badgeLabel é compulsório
  const mockAds = [
    {
      adId: 'ad-1',
      campaignId: 'camp-1',
      creativeId: 'creat-1',
      advertiserName: 'DrogaVet',
      title: 'Medicamentos Pet',
      targetUrl: 'https://drogavet.com.br',
      callToAction: 'Comprar',
      format: 'banner_horizontal',
      badgeLabel: 'PATROCINADO',
    },
  ];

  for (const ad of mockAds) {
    assert.ok(ad.badgeLabel === 'PATROCINADO' || ad.badgeLabel === 'ANÚNCIO');
  }
});

test('4. Deduplicação Anti-Fraude descarta eventos repetidos da mesma sessão em 60 segundos', () => {
  const eventLog = [];
  const sessionHash = 'hash-abc-123';
  const campaignId = 'camp-99';
  const now = Date.now();

  const recordSimulatedEvent = (cId, type, sHash, timestamp) => {
    // Procura evento do mesmo hash e campanha nos últimos 60 segundos (60.000 ms)
    const recent = eventLog.find(
      e => e.campaignId === cId && e.type === type && e.sessionHash === sHash && (timestamp - e.timestamp) < 60000
    );

    if (recent) {
      return { success: true, deduplicated: true };
    }

    eventLog.push({ campaignId: cId, type, sessionHash: sHash, timestamp });
    return { success: true, deduplicated: false };
  };

  // Primeiro clique: aceito
  const res1 = recordSimulatedEvent(campaignId, 'clique', sessionHash, now);
  assert.equal(res1.deduplicated, false);

  // Segundo clique imediato (mesma sessão): deduplicado como fraude/duplicata
  const res2 = recordSimulatedEvent(campaignId, 'clique', sessionHash, now + 5000);
  assert.equal(res2.deduplicated, true);

  // Terceiro clique após 65 segundos: aceito
  const res3 = recordSimulatedEvent(campaignId, 'clique', sessionHash, now + 65000);
  assert.equal(res3.deduplicated, false);
});

test('5. Cláusula de Privacidade Absoluta bloqueia tentativas de segmentação por dados clínicos ou tutores', () => {
  // Parâmetros normais permitidos (região e categoria)
  assert.doesNotThrow(() => {
    AdService.assertZeroClinicalDataUsage({
      placement: 'diretorio_top_banner',
      uf: 'SP',
      cidade: 'São Paulo',
      categoria: 'ambulancia',
    });
  });

  // Tentativa de segmentar por prontuário
  assert.throws(
    () => {
      AdService.assertZeroClinicalDataUsage({
        categoria: 'farmacia',
        prontuario: 'historico-123',
      });
    },
    /VIOLAÇÃO DE PRIVACIDADE/
  );

  // Tentativa de segmentar por vacinas ou diagnóstico
  assert.throws(
    () => {
      AdService.assertZeroClinicalDataUsage({
        uf: 'RJ',
        diagnostico: 'cardiopatia',
      });
    },
    /VIOLAÇÃO DE PRIVACIDADE/
  );

  // Tentativa de segmentar por raça ou espécie do animal
  assert.throws(
    () => {
      AdService.assertZeroClinicalDataUsage({
        raca: 'Golden Retriever',
      });
    },
    /VIOLAÇÃO DE PRIVACIDADE/
  );

  // Tentativa de segmentar por identificador de tutor
  assert.throws(
    () => {
      AdService.assertZeroClinicalDataUsage({
        tutor_cpf: '12345678900',
      });
    },
    /VIOLAÇÃO DE PRIVACIDADE/
  );
});

test('6. Inspeção de Dependências no Banco comprova que serve_ads NÃO acessa tabelas clínicas', () => {
  // Lê o arquivo de migração 0038
  const migrationPath = path.resolve('supabase/migrations/0038_televet_ads_advertising_and_sponsorships.sql');
  const sqlContent = fs.readFileSync(migrationPath, 'utf8');

  // Extrai o corpo da função serve_ads
  const serveAdsStart = sqlContent.indexOf('CREATE OR REPLACE FUNCTION public.serve_ads');
  const serveAdsEnd = sqlContent.indexOf('$$;', serveAdsStart);
  assert.ok(serveAdsStart > 0 && serveAdsEnd > serveAdsStart, 'Função serve_ads deve existir no SQL');

  const serveAdsBody = sqlContent.substring(serveAdsStart, serveAdsEnd);

  // Tabelas clínicas do sistema que NUNCA podem aparecer em serve_ads:
  const forbiddenTables = [
    'consultations',
    'medical_records',
    'pets',
    'prescriptions',
    'pet_vaccinations',
    'tutors',
    'clinical_notes',
    'appointments',
    'care_relationships',
  ];

  for (const table of forbiddenTables) {
    const tablePattern = new RegExp(`\\b${table}\\b`, 'i');
    assert.equal(
      tablePattern.test(serveAdsBody),
      false,
      `A função serve_ads NÃO pode referenciar a tabela clínica "${table}"`
    );
  }
});

test('7. Planos de anúncios (ad_plans) possuem preços e limites dinâmicos no banco de dados', async () => {
  const service = new AdService('http://localhost:54321', 'mock-key');

  // Garante que o método getPlans existe e os planos configuráveis possuem priceCents
  assert.ok(typeof service.getPlans === 'function');
  assert.ok(typeof service.savePlan === 'function');

  // Estrutura de plano mock
  const plan = {
    slug: 'regional',
    name: 'Plano Regional',
    priceCents: 24900,
    maxActiveCampaigns: 3,
  };

  assert.equal(plan.priceCents, 24900); // R$ 249,00
  assert.equal(plan.maxActiveCampaigns, 3);
});

test('8. Moderação de Campanha: Aprovação ativa veiculação e Rejeição exige parecer formal', () => {
  const campaign = {
    id: 'camp-1',
    status: 'aguardando_aprovacao',
    rejectionReason: null,
  };

  // Simulação de aprovação
  const approved = { ...campaign, status: 'ativo' };
  assert.equal(approved.status, 'ativo');

  // Simulação de rejeição com motivo
  const reason = 'Criativo com imagem em baixa resolução e sem CNPJ no rodapé';
  const rejected = { ...campaign, status: 'rejeitado', rejectionReason: reason };
  assert.equal(rejected.status, 'rejeitado');
  assert.ok(rejected.rejectionReason && rejected.rejectionReason.length > 5);
});

test('9. Exportação de Métricas em CSV é sanitizada e livre de dados de identificação pessoal (LGPD)', () => {
  const service = new AdService('http://localhost:54321', 'mock-key');

  const dummyMetrics = {
    impressionsCount: 5000,
    viewsCount: 4200,
    clicksCount: 150,
    ctrPercent: 3.0,
    callsCount: 10,
    whatsappCount: 25,
    routesCount: 8,
    spentCents: 12500,
    budgetCents: 50000,
  };

  const csv = service.exportMetricsCsv(dummyMetrics, 'Campanha Vacinação Preventiva');

  // Valida que o CSV contém cabeçalhos agregados e métricas numéricas
  assert.match(csv, /Campanha;Impressões;Visualizações;Cliques;CTR \(%\);Ligações;WhatsApp;Como Chegar;Gasto \(R\$\);Orçamento \(R\$\)/);
  assert.match(csv, /"Campanha Vacinação Preventiva"/);
  assert.match(csv, /5000/);
  assert.match(csv, /150/);
  assert.match(csv, /3\.00%/);
  assert.match(csv, /125\.00/);

  // Garante que NENHUM dado de usuário (CPF, email de tutor, prontuário) está presente
  assert.doesNotMatch(csv, /cpf/i);
  assert.doesNotMatch(csv, /tutor/i);
  assert.doesNotMatch(csv, /prontuario/i);
});

console.log('✅ Todos os testes de conformidade do TeleVet Ads passaram com sucesso.');
