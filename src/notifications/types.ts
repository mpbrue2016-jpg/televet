// ==============================================================================
// src/notifications/types.ts
// Tipos e Interfaces da Fase 14: Notificações, Outbox, Adaptadores e Preferências
// ==============================================================================

export type NotificationChannel = 'in_app' | 'email' | 'whatsapp' | 'push';

export type NotificationStatus = 
  | 'pending'
  | 'pending_configuration'
  | 'processing'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'skipped_opt_out'
  | 'canceled';

export type NotificationEvent =
  | 'appointment_confirmed'
  | 'appointment_canceled'
  | 'appointment_rescheduled'
  | 'appointment_reminder'
  | 'payment_approved'
  | 'payment_failed'
  | 'consultation_starting'
  | 'prescription_ready'
  | 'exam_ready'
  | 'referral_issued'
  | 'vaccine_due'
  | 'subscription_updated'
  | 'support_ticket_updated';

export interface EnqueueNotificationInput {
  tenantId: string;
  userId: string;
  event: NotificationEvent;
  channel: NotificationChannel;
  recipient: string;
  templateSlug: string;
  payload: Record<string, string | number>;
  secureLink?: string;
  idempotencyKey?: string;
  maxAttempts?: number;
}

export interface EnqueueNotificationResult {
  success: boolean;
  outboxId?: string;
  status: NotificationStatus;
  idempotentReused: boolean;
  notificationId?: string | null;
  error?: string | null;
}

export interface OutboxItem {
  id: string;
  tenantId: string;
  userId: string;
  event: NotificationEvent;
  channel: NotificationChannel;
  recipient: string;
  templateSlug: string;
  templateVersion: number;
  renderedSubject?: string | null;
  renderedBody: string;
  payload: Record<string, any>;
  secureLink?: string | null;
  attempts: number;
  maxAttempts: number;
  idempotencyKey?: string | null;
}

export interface AdapterSendResult {
  status: 'sent' | 'delivered' | 'failed' | 'pending_configuration';
  externalId?: string;
  providerResponse?: Record<string, any>;
  errorMessage?: string;
  errorDetails?: Record<string, any>;
}

export interface UserNotificationPreferences {
  userId: string;
  tenantId?: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  whatsappOptInAt?: string | null;
  whatsappOptInIp?: string | null;
  pushEnabled: boolean;
  remindersEnabled: boolean;
  clinicalAlertsEnabled: boolean;
  marketingEnabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface OutboxAuditMetrics {
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  failed: number;
  pendingConfiguration: number;
  skippedOptOut: number;
  successRate: number;
}
