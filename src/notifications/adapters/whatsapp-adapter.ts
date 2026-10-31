// ==============================================================================
// src/notifications/adapters/whatsapp-adapter.ts
// Adaptador da API Oficial do WhatsApp Business (Meta Cloud API)
// ==============================================================================

import { NotificationAdapter } from './notification-adapter.interface';
import { AdapterSendResult, OutboxItem } from '../types';

export class WhatsAppAdapter implements NotificationAdapter {
  readonly channelName = 'whatsapp';

  private apiToken: string | null;
  private phoneNumberId: string | null;

  constructor(apiToken?: string, phoneNumberId?: string) {
    this.apiToken = apiToken || process.env.WHATSAPP_API_TOKEN || null;
    this.phoneNumberId = phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || null;
  }

  async send(item: OutboxItem): Promise<AdapterSendResult> {
    // 1. Verificação de credenciais: sem credenciais oficiais, marcar 'PENDENTE DE CONFIGURAÇÃO'
    if (!this.apiToken || !this.phoneNumberId) {
      return {
        status: 'pending_configuration',
        errorMessage: 'PENDENTE DE CONFIGURAÇÃO: Credenciais da API Oficial de WhatsApp (WHATSAPP_API_TOKEN / WHATSAPP_PHONE_NUMBER_ID) não configuradas.',
      };
    }

    // 2. Proteção de Privacidade e Sigilo Clínico (Regra Estrita):
    // Nunca incluir prontuário, diagnóstico, receita ou dados clínicos sensíveis em canal aberto.
    this.assertNoSensitiveClinicalData(item.renderedBody);

    // 3. Sanitização do número do destinatário para formato internacional E.164 (ex: 5511999998888)
    const sanitizedPhone = item.recipient.replace(/\D/g, '');
    if (sanitizedPhone.length < 10) {
      return {
        status: 'failed',
        errorMessage: `Número de WhatsApp inválido para envio internacional: ${item.recipient}`,
      };
    }

    try {
      // 4. Chamada à API Oficial da Meta
      const endpoint = `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: sanitizedPhone,
          type: 'text',
          text: {
            preview_url: true,
            body: item.renderedBody,
          },
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        return {
          status: 'failed',
          errorMessage: responseData.error?.message || `Erro HTTP ${response.status} na API da Meta WhatsApp.`,
          errorDetails: responseData,
        };
      }

      // 5. Confirmação real: status 'sent' com wamid retornado
      const wamid = responseData.messages?.[0]?.id;
      return {
        status: 'sent',
        externalId: wamid,
        providerResponse: responseData,
      };
    } catch (err: any) {
      return {
        status: 'failed',
        errorMessage: err.message || 'Falha de comunicação com a API do WhatsApp Business.',
        errorDetails: { name: err.name, stack: err.stack },
      };
    }
  }

  /**
   * Barreira de segurança: impede o envio de dados médicos sensíveis em mensagens externas.
   */
  private assertNoSensitiveClinicalData(text: string): void {
    const sensitivePatterns = [
      /prontu[aá]rio/i,
      /diagn[oó]stico\s*:/i,
      /posologia/i,
      /dosagem\s*:/i,
      /mg\/kg/i,
      /receita\s*:\s*[a-zA-Z]/i,
      /anamnese/i,
      /cid[-\s]*10/i,
    ];

    for (const pattern of sensitivePatterns) {
      if (pattern.test(text)) {
        throw new Error(
          `VIOLAÇÃO DE PRIVACIDADE: Tentativa de disparar notificação externa contendo termos clínicos sensíveis (${pattern}). Utilize exclusivamente link seguro autenticado.`
        );
      }
    }
  }
}
