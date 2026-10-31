// ==============================================================================
// src/notifications/adapters/notification-adapter.interface.ts
// Interface Base para Adaptadores de Notificação (E-mail, WhatsApp, Push, In-App)
// ==============================================================================

import { AdapterSendResult, OutboxItem } from '../types';

export interface NotificationAdapter {
  readonly channelName: string;

  /**
   * Envia o item da outbox através do provedor externo.
   * Regra estrita: Sem credenciais válidas, marcar "PENDENTE DE CONFIGURAÇÃO".
   * Nunca declarar enviado sem resposta real do provedor.
   */
  send(item: OutboxItem): Promise<AdapterSendResult>;
}
