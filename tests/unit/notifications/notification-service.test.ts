// ==============================================================================
// tests/unit/notifications/notification-service.test.ts
// Testes Unitários de Lógica de Negócio, Idempotência, Privacidade e Adaptadores
// ==============================================================================

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { TemplateEngine } from '@/notifications/template-engine';
import { EmailAdapter } from '@/notifications/adapters/email-adapter';
import { WhatsAppAdapter } from '@/notifications/adapters/whatsapp-adapter';
import { PushAdapter } from '@/notifications/adapters/push-adapter';
import { OutboxItem } from '@/notifications/types';

describe('Fase 14: Notificações, Privacidade e Adaptadores', () => {
  const dummyItem: OutboxItem = {
    id: '11111111-1111-1111-1111-111111111111',
    tenantId: '77777777-7777-7777-7777-777777777777',
    userId: 'a4444444-4444-4444-4444-444444444444',
    event: 'appointment_confirmed',
    channel: 'email',
    recipient: 'tutor@televet.test',
    templateSlug: 'appointment_confirmed',
    templateVersion: 1,
    renderedSubject: 'Consulta Confirmada',
    renderedBody: 'Olá Carlos, sua consulta para Thor foi confirmada. Acesse: {{secure_link}}',
    payload: { tutor_name: 'Carlos', pet_name: 'Thor' },
    secureLink: 'https://app.televet.com.br/seguro/123',
    attempts: 0,
    maxAttempts: 3,
    idempotencyKey: 'test_key_01',
  };

  test('TemplateEngine substitui variáveis e injeta secure_link corretamente', () => {
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

  test('assertClinicalPrivacy bloqueia prontuário, CID-10 e dosagens de remédios em canal aberto', () => {
    // 1. Mensagem com prontuário clínico sensível deve lançar exceção
    assert.throws(() => {
      TemplateEngine.render(
        'Diagnóstico: infecção renal crônica. CID-10: N18',
        {}
      );
    }, /VIOLAÇÃO DE PRIVACIDADE CLÍNICA/);

    // 2. Mensagem com dosagem e princípio ativo farmacológico deve lançar exceção
    assert.throws(() => {
      TemplateEngine.render(
        'Sua receita de Amoxicilina dosagem: 500 está pronta',
        {}
      );
    }, /VIOLAÇÃO DE PRIVACIDADE CLÍNICA/);
  });

  test('EmailAdapter retorna pending_configuration quando não há credenciais válidas', async () => {
    const adapter = new EmailAdapter('');
    const result = await adapter.send(dummyItem);

    assert.equal(result.status, 'pending_configuration');
    assert.match(result.errorMessage || '', /PENDENTE DE CONFIGURAÇÃO/);
  });

  test('WhatsAppAdapter retorna pending_configuration quando faltam credenciais da Meta', async () => {
    const adapter = new WhatsAppAdapter('', '');
    const result = await adapter.send({
      ...dummyItem,
      channel: 'whatsapp',
      recipient: '5511999998888',
    });

    assert.equal(result.status, 'pending_configuration');
    assert.match(result.errorMessage || '', /PENDENTE DE CONFIGURAÇÃO/);
  });

  test('PushAdapter retorna pending_configuration sem FCM key', async () => {
    const adapter = new PushAdapter('');
    const result = await adapter.send({
      ...dummyItem,
      channel: 'push',
      recipient: 'fcm-device-token-123',
    });

    assert.equal(result.status, 'pending_configuration');
    assert.match(result.errorMessage || '', /PENDENTE DE CONFIGURAÇÃO/);
  });
});
