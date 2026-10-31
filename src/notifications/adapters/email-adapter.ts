// ==============================================================================
// src/notifications/adapters/email-adapter.ts
// Adaptador de E-mail (Resend / SendGrid / SMTP Oficial)
// ==============================================================================

import { NotificationAdapter } from './notification-adapter.interface';
import { AdapterSendResult, OutboxItem } from '../types';

export class EmailAdapter implements NotificationAdapter {
  readonly channelName = 'email';

  private apiKey: string | null;
  private senderEmail: string;

  constructor(apiKey?: string, senderEmail?: string) {
    this.apiKey = apiKey || process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY || null;
    this.senderEmail = senderEmail || process.env.EMAIL_FROM || 'notificacoes@televet.app';
  }

  async send(item: OutboxItem): Promise<AdapterSendResult> {
    // 1. Verificação de credenciais: sem credenciais válidas, nunca declarar enviado!
    if (!this.apiKey) {
      return {
        status: 'pending_configuration',
        errorMessage: 'PENDENTE DE CONFIGURAÇÃO: Chave de API de E-mail (RESEND_API_KEY) não configurada no ambiente.',
      };
    }

    try {
      // 2. Chamada HTTP ao provedor oficial (exemplo: Resend API)
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.senderEmail,
          to: [item.recipient],
          subject: item.renderedSubject || 'Notificação TELEVET',
          text: item.renderedBody,
          tags: [
            { name: 'event', value: item.event },
            { name: 'outbox_id', value: item.id },
          ],
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        return {
          status: 'failed',
          errorMessage: responseData.message || `Erro HTTP ${response.status} ao disparar e-mail.`,
          errorDetails: responseData,
        };
      }

      // 3. Status "enviado" somente com ID real confirmado pelo provedor
      return {
        status: 'sent',
        externalId: responseData.id,
        providerResponse: responseData,
      };
    } catch (err: any) {
      return {
        status: 'failed',
        errorMessage: err.message || 'Falha de conexão com provedor de e-mail.',
        errorDetails: { name: err.name, stack: err.stack },
      };
    }
  }
}
