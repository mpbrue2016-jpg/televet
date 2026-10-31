// ==============================================================================
// scripts/test-notifications-runner.mjs
// Executor de Testes Unitários de Notificações com Node.js Test Runner
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';

// Testes diretos de lógica de privacidade, interpolação e adaptadores
import { TemplateEngine } from '../src/notifications/template-engine.ts';
import { EmailAdapter } from '../src/notifications/adapters/email-adapter.ts';
import { WhatsAppAdapter } from '../src/notifications/adapters/whatsapp-adapter.ts';
import { PushAdapter } from '../src/notifications/adapters/push-adapter.ts';

test('1. TemplateEngine substitui variáveis e injeta link seguro', () => {
  const template = 'Olá {{tutor_name}}, seu agendamento para {{pet_name}} está ativo. Link: {{secure_link}}';
  const rendered = TemplateEngine.render(
    template,
    { tutor_name: 'Mariana', pet_name: 'Pipoca' },
    'https://app.televet.com.br/seguro/abc'
  );

  assert.match(rendered, /Olá Mariana/);
  assert.match(rendered, /Pipoca/);
  assert.match(rendered, /https:\/\/app\.televet\.com\.br\/seguro\/abc/);
});

test('2. Proteção de Privacidade Clínica bloqueia dados sensíveis em canal aberto', () => {
  assert.throws(() => {
    TemplateEngine.render('Diagnóstico: infecção renal crônica. CID-10: N18', {});
  }, /VIOLAÇÃO DE PRIVACIDADE CLÍNICA/);

  assert.throws(() => {
    TemplateEngine.render('Sua receita de amoxicilina dosagem: 500mg está pronta', {});
  }, /VIOLAÇÃO DE PRIVACIDADE CLÍNICA/);
});

test('3. EmailAdapter sem credenciais retorna PENDENTE DE CONFIGURAÇÃO', async () => {
  const adapter = new EmailAdapter('');
  const result = await adapter.send({
    id: '1',
    tenantId: '1',
    userId: '1',
    event: 'appointment_confirmed',
    channel: 'email',
    recipient: 'tutor@test.com',
    templateSlug: 'test',
    templateVersion: 1,
    renderedBody: 'Mensagem teste',
    payload: {},
    attempts: 0,
    maxAttempts: 3,
  });

  assert.equal(result.status, 'pending_configuration');
  assert.match(result.errorMessage, /PENDENTE DE CONFIGURAÇÃO/);
});

test('4. WhatsAppAdapter sem credenciais retorna PENDENTE DE CONFIGURAÇÃO', async () => {
  const adapter = new WhatsAppAdapter('', '');
  const result = await adapter.send({
    id: '1',
    tenantId: '1',
    userId: '1',
    event: 'appointment_confirmed',
    channel: 'whatsapp',
    recipient: '5511999998888',
    templateSlug: 'test',
    templateVersion: 1,
    renderedBody: 'Mensagem teste',
    payload: {},
    attempts: 0,
    maxAttempts: 3,
  });

  assert.equal(result.status, 'pending_configuration');
  assert.match(result.errorMessage, /PENDENTE DE CONFIGURAÇÃO/);
});

test('5. PushAdapter sem credenciais retorna PENDENTE DE CONFIGURAÇÃO', async () => {
  const adapter = new PushAdapter('');
  const result = await adapter.send({
    id: '1',
    tenantId: '1',
    userId: '1',
    event: 'appointment_confirmed',
    channel: 'push',
    recipient: 'device-token',
    templateSlug: 'test',
    templateVersion: 1,
    renderedBody: 'Mensagem teste',
    payload: {},
    attempts: 0,
    maxAttempts: 3,
  });

  assert.equal(result.status, 'pending_configuration');
  assert.match(result.errorMessage, /PENDENTE DE CONFIGURAÇÃO/);
});

console.log('✅ Todos os testes unitários de notificações passaram com sucesso.');
