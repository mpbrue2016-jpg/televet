// ==============================================================================
// src/notifications/adapters/push-adapter.ts
// Adaptador de Notificações Push (Web Push / Firebase Cloud Messaging)
// ==============================================================================

import { NotificationAdapter } from './notification-adapter.interface';
import { AdapterSendResult, OutboxItem } from '../types';

export class PushAdapter implements NotificationAdapter {
  readonly channelName = 'push';

  private fcmServerKey: string | null;

  constructor(fcmServerKey?: string) {
    this.fcmServerKey = fcmServerKey || process.env.FCM_SERVER_KEY || process.env.FIREBASE_SERVER_KEY || null;
  }

  async send(item: OutboxItem): Promise<AdapterSendResult> {
    // 1. Verificação de credenciais
    if (!this.fcmServerKey) {
      return {
        status: 'pending_configuration',
        errorMessage: 'PENDENTE DE CONFIGURAÇÃO: Chave do provedor Push (FCM_SERVER_KEY) não configurada no ambiente.',
      };
    }

    try {
      // 2. Disparo FCM HTTP v1 / legacy
      const response = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Authorization': `key=${this.fcmServerKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: item.recipient,
          notification: {
            title: item.renderedSubject || 'Notificação TELEVET',
            body: item.renderedBody,
          },
          data: {
            event: item.event,
            outbox_id: item.id,
            secure_link: item.secureLink || '',
          },
        }),
      });

      const responseData = await response.json();

      if (!response.ok || responseData.failure > 0) {
        return {
          status: 'failed',
          errorMessage: responseData.results?.[0]?.error || `Falha no envio do push (${response.status})`,
          errorDetails: responseData,
        };
      }

      const messageId = responseData.results?.[0]?.message_id || String(responseData.multicast_id);

      return {
        status: 'sent',
        externalId: messageId,
        providerResponse: responseData,
      };
    } catch (err: any) {
      return {
        status: 'failed',
        errorMessage: err.message || 'Falha ao conectar com serviço de Push.',
        errorDetails: { name: err.name, stack: err.stack },
      };
    }
  }
}
