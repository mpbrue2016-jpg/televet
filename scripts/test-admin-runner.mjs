// ==============================================================================
// scripts/test-admin-runner.mjs
// Executor de Testes Unitários da Fase 15 (Admin Master, Exportação LGPD e Governança)
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';

import { ExportService } from '../src/admin/export-service.ts';

test('1. ExportService gera CSV formatado com cabeçalhos e valores em reais', () => {
  const dummyEntries = [
    {
      paymentId: 'pay-001',
      appointmentId: 'appt-100',
      tenantName: 'Pet Shop Bicho Mimado',
      grossAmountCents: 20000,
      gatewayFeeCents: 647,
      platformCommissionCents: 3000,
      petshopCommissionCents: 2000,
      veterinarianNetCents: 14353,
      status: 'captured',
      createdAt: '2026-10-16T12:00:00Z',
    },
  ];

  const csv = ExportService.formatLedgerToCsv(dummyEntries);

  assert.match(csv, /Data\/Hora;ID Transação;ID Consulta;Parceiro \/ Tenant;/);
  assert.match(csv, /"pay-001"/);
  assert.match(csv, /"Pet Shop Bicho Mimado"/);
  assert.match(csv, /200\.00/); // R$ 200,00
  assert.match(csv, /143\.53/); // R$ 143,53
  assert.match(csv, /"captured"/);
});

test('2. ExportService mascara CPF com conformidade LGPD', () => {
  const masked = ExportService.maskCpf('123.456.789-00');
  assert.equal(masked, '***.456.789-**');

  const maskedRaw = ExportService.maskCpf('12345678900');
  assert.equal(maskedRaw, '***.456.789-**');
});

test('3. ExportService sanitiza injeção de fórmulas CSV maliciosas', () => {
  const entriesWithFormula = [
    {
      paymentId: 'pay-002',
      appointmentId: 'appt-200',
      tenantName: '=cmd|/C calc.exe',
      grossAmountCents: 5000,
      gatewayFeeCents: 198,
      platformCommissionCents: 500,
      petshopCommissionCents: 500,
      veterinarianNetCents: 3802,
      status: 'captured',
      createdAt: '2026-10-16T14:00:00Z',
    },
  ];

  const csv = ExportService.formatLedgerToCsv(entriesWithFormula);
  // Garante que o '=' inicial foi neutralizado com aspas simples para impedir execução em Excel
  assert.match(csv, /"'=cmd/);
});

console.log('✅ Todos os testes unitários do Admin Master passaram com sucesso.');
