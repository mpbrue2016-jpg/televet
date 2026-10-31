// ==============================================================================
// src/notifications/webhooks/notification-webhook-handler.ts
// Processador de Webhooks de Provedores Oficiais (Meta WhatsApp e E-mail)
// ==============================================================================

import { SupabaseClient } from '@supabase/supabase-js';

export interface MetaWhatsAppStatusPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: { display_phone_number: string; phone_number_id: string };
        statuses?: Array<{
          id: string; // wamid
          status: 'sent' | 'delivered' | 'read' | 'failed';
          timestamp: string;
          recipient_id: string;
          errors?: Array<{ code: number; title: string; message: string }>;
        }>;
      };
      field: string;
    }>;
  }>;
}

export interface EmailWebhookPayload {
  type: 'email.sent' | 'email.delivered' | 'email.bounced' | 'email.complained';
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    output?: any;
  };
}

export class NotificationWebhookHandler {
  private supabase: SupabaseClient;

  constructor(supabaseClient: SupabaseClient) {
    this.supabase = supabaseClient;
  }

  /**
   * Processa status de entrega recebidos via Webhook oficial da Meta (WhatsApp Cloud API)
   */
  async handleMetaWhatsAppWebhook(payload: MetaWhatsAppStatusPayload): Promise<{ processed: number }> {
    let count = 0;

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const statuses = change.value?.statuses || [];

        for (const statusItem of statuses) {
          const wamid = statusItem.id;
          const status = statusItem.status;

          // Busca item da outbox pelo ID externo oficial (wamid)
          const { data: outboxItem } = await this.supabase
            .from('notification_outbox')
            .select('id')
            .eq('external_id', wamid)
            .maybeSingle();

          if (outboxItem) {
            let mappedStatus: string = 'sent';
            let errorMessage: string | null = null;

            if (status === 'delivered' || status === 'read') {
              mappedStatus = 'delivered';
            } else if (status === 'failed') {
              mappedStatus = 'failed';
              errorMessage = statusItem.errors?.[0]?.message || 'Falha de entrega no WhatsApp do destinatário.';
            }

            await this.supabase.rpc('fn_update_notification_outbox_status', {
              p_outbox_id: outboxItem.id,
              p_status: mappedStatus,
              p_external_id: wamid,
              p_provider_response: statusItem,
              p_error_message: errorMessage,
            });

            count++;
          }
        }
      }
    }

    return { processed: count };
  }

  /**
   * Processa status de entrega de e-mail (Resend / SendGrid)
   */
  async handleEmailDeliveryWebhook(payload: EmailWebhookPayload): Promise<boolean> {
    const emailId = payload.data?.email_id;
    if (!emailId) return false;

    const { data: outboxItem } = await this.supabase
      .from('notification_outbox')
      .select('id')
      .eq('external_id', emailId)
      .maybeSingle();

    if (!outboxItem) return false;

    let mappedStatus = 'sent';
    let errorMessage: string | null = null;

    if (payload.type === 'email.delivered') {
      mappedStatus = 'delivered';
    } else if (payload.type === 'email.bounced' || payload.type === 'email.complained') {
      mappedStatus = 'failed';
      errorMessage = `E-mail não entregue: ${payload.type}`;
    }

    await this.supabase.rpc('fn_update_notification_outbox_status', {
      p_outbox_id: outboxItem.id,
      p_status: mappedStatus,
      p_external_id: emailId,
      p_provider_response: payload,
      p_error_message: errorMessage,
    });

    return true;
  }
}
