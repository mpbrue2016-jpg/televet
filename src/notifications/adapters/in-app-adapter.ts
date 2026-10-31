// ==============================================================================
// src/notifications/adapters/in-app-adapter.ts
// Adaptador de Notificações Internas (In-App) - Reutiliza public.notifications
// ==============================================================================

import { SupabaseClient } from '@supabase/supabase-js';
import { NotificationAdapter } from './notification-adapter.interface';
import { AdapterSendResult, OutboxItem } from '../types';

export class InAppAdapter implements NotificationAdapter {
  readonly channelName = 'in_app';

  private supabase: SupabaseClient;

  constructor(supabaseClient: SupabaseClient) {
    this.supabase = supabaseClient;
  }

  async send(item: OutboxItem): Promise<AdapterSendResult> {
    try {
      const { data, error } = await this.supabase
        .from('notifications')
        .insert({
          tenant_id: item.tenantId,
          user_id: item.userId,
          title: item.renderedSubject || 'Notificação TELEVET',
          message: item.renderedBody,
          channel: 'in_app',
          category: item.event,
          action_url: item.secureLink || null,
        })
        .select('id')
        .single();

      if (error) {
        return {
          status: 'failed',
          errorMessage: error.message,
          errorDetails: error,
        };
      }

      return {
        status: 'delivered',
        externalId: data.id,
        providerResponse: { notification_id: data.id },
      };
    } catch (err: any) {
      return {
        status: 'failed',
        errorMessage: err.message || 'Falha ao registrar notificação in-app.',
      };
    }
  }
}
