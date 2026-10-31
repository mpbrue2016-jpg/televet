// ==============================================================================
// src/notifications/notification-service.ts
// Serviço Central de Notificações, Outbox, Deduplicação e Adaptadores Multi-Canal
// ==============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase-client';
import {
  EnqueueNotificationInput,
  EnqueueNotificationResult,
  NotificationChannel,
  NotificationEvent,
  OutboxAuditMetrics,
  OutboxItem,
  UserNotificationPreferences,
} from './types';
import { NotificationAdapter } from './adapters/notification-adapter.interface';
import { EmailAdapter } from './adapters/email-adapter';
import { WhatsAppAdapter } from './adapters/whatsapp-adapter';
import { PushAdapter } from './adapters/push-adapter';
import { InAppAdapter } from './adapters/in-app-adapter';
import { TemplateEngine } from './template-engine';

export class NotificationService {
  private supabase: SupabaseClient;
  private adapters: Map<NotificationChannel, NotificationAdapter> = new Map();
  private appBaseUrl: string;

  constructor(
    supabaseUrl: string = SUPABASE_URL,
    supabaseAnonKey: string = SUPABASE_ANON_KEY,
    appBaseUrl?: string
  ) {
    this.supabase = (supabaseUrl === SUPABASE_URL && supabaseAnonKey === SUPABASE_ANON_KEY)
      ? getSupabaseClient()
      : createClient(supabaseUrl, supabaseAnonKey);

    this.appBaseUrl = appBaseUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://app.televet.com.br';

    // Registro dos adaptadores padrão da arquitetura
    this.registerAdapter(new EmailAdapter());
    this.registerAdapter(new WhatsAppAdapter());
    this.registerAdapter(new PushAdapter());
    this.registerAdapter(new InAppAdapter(this.supabase));
  }

  /**
   * Permite registrar ou sobrescrever um adaptador específico de canal (e.g. em testes unitários).
   */
  registerAdapter(adapter: NotificationAdapter): void {
    this.adapters.set(adapter.channelName as NotificationChannel, adapter);
  }

  /**
   * Enfileira uma notificação na outbox com deduplicação/idempotência e verificação de opt-out.
   */
  async enqueueNotification(input: EnqueueNotificationInput): Promise<EnqueueNotificationResult> {
    const idempotencyKey = input.idempotencyKey || 
      `${input.tenantId}:${input.userId}:${input.event}:${input.channel}:${JSON.stringify(input.payload)}`;

    const { data, error } = await this.supabase.rpc('fn_enqueue_notification', {
      p_tenant_id: input.tenantId,
      p_user_id: input.userId,
      p_event: input.event,
      p_channel: input.channel,
      p_recipient: input.recipient,
      p_template_slug: input.templateSlug,
      p_payload: input.payload,
      p_secure_link: input.secureLink || null,
      p_idempotency_key: idempotencyKey,
      p_max_attempts: input.maxAttempts || 3,
    });

    if (error) {
      throw new Error(`Falha ao enfileirar notificação: ${error.message}`);
    }

    return {
      success: Boolean(data?.success),
      outboxId: data?.outbox_id,
      status: data?.status,
      idempotentReused: Boolean(data?.idempotent_reused),
      notificationId: data?.notification_id,
      error: data?.error,
    };
  }

  // ============================================================================
  // Disparadores de Eventos de Negócio (Conteúdo Mínimo e Link Seguro)
  // ============================================================================

  /**
   * Confirmação de Agendamento
   */
  async notifyAppointmentConfirmed(params: {
    tenantId: string;
    userId: string;
    appointmentId: string;
    tutorName: string;
    petName: string;
    scheduledDate: string;
    recipientEmail?: string;
    recipientPhone?: string;
  }): Promise<void> {
    const secureLink = TemplateEngine.generateSecureLink(this.appBaseUrl, 'appointment', params.appointmentId);
    const payload = {
      tutor_name: params.tutorName,
      pet_name: params.petName,
      scheduled_date: params.scheduledDate,
    };

    // 1. Notificação In-App
    await this.enqueueNotification({
      tenantId: params.tenantId,
      userId: params.userId,
      event: 'appointment_confirmed',
      channel: 'in_app',
      recipient: params.userId,
      templateSlug: 'appointment_confirmed',
      payload,
      secureLink,
      idempotencyKey: `appt_confirmed:in_app:${params.appointmentId}`,
    });

    // 2. Notificação por E-mail
    if (params.recipientEmail) {
      await this.enqueueNotification({
        tenantId: params.tenantId,
        userId: params.userId,
        event: 'appointment_confirmed',
        channel: 'email',
        recipient: params.recipientEmail,
        templateSlug: 'appointment_confirmed',
        payload,
        secureLink,
        idempotencyKey: `appt_confirmed:email:${params.appointmentId}`,
      });
    }

    // 3. Notificação por WhatsApp (se fornecido telefone; opt-in é verificado no banco)
    if (params.recipientPhone) {
      await this.enqueueNotification({
        tenantId: params.tenantId,
        userId: params.userId,
        event: 'appointment_confirmed',
        channel: 'whatsapp',
        recipient: params.recipientPhone,
        templateSlug: 'appointment_confirmed',
        payload,
        secureLink,
        idempotencyKey: `appt_confirmed:whatsapp:${params.appointmentId}`,
      });
    }
  }

  /**
   * Cancelamento de Consulta
   */
  async notifyAppointmentCanceled(params: {
    tenantId: string;
    userId: string;
    appointmentId: string;
    tutorName: string;
    petName: string;
    scheduledDate: string;
    recipientEmail?: string;
    recipientPhone?: string;
  }): Promise<void> {
    const secureLink = TemplateEngine.generateSecureLink(this.appBaseUrl, 'support', params.appointmentId);
    const payload = {
      tutor_name: params.tutorName,
      pet_name: params.petName,
      scheduled_date: params.scheduledDate,
    };

    await this.enqueueNotification({
      tenantId: params.tenantId,
      userId: params.userId,
      event: 'appointment_canceled',
      channel: 'in_app',
      recipient: params.userId,
      templateSlug: 'appointment_canceled',
      payload,
      secureLink,
      idempotencyKey: `appt_canceled:in_app:${params.appointmentId}`,
    });

    if (params.recipientEmail) {
      await this.enqueueNotification({
        tenantId: params.tenantId,
        userId: params.userId,
        event: 'appointment_canceled',
        channel: 'email',
        recipient: params.recipientEmail,
        templateSlug: 'appointment_canceled',
        payload,
        secureLink,
        idempotencyKey: `appt_canceled:email:${params.appointmentId}`,
      });
    }

    if (params.recipientPhone) {
      await this.enqueueNotification({
        tenantId: params.tenantId,
        userId: params.userId,
        event: 'appointment_canceled',
        channel: 'whatsapp',
        recipient: params.recipientPhone,
        templateSlug: 'appointment_canceled',
        payload,
        secureLink,
        idempotencyKey: `appt_canceled:whatsapp:${params.appointmentId}`,
      });
    }
  }

  /**
   * Reagendamento de Consulta
   */
  async notifyAppointmentRescheduled(params: {
    tenantId: string;
    userId: string;
    appointmentId: string;
    tutorName: string;
    petName: string;
    newScheduledDate: string;
    recipientEmail?: string;
    recipientPhone?: string;
  }): Promise<void> {
    const secureLink = TemplateEngine.generateSecureLink(this.appBaseUrl, 'appointment', params.appointmentId);
    const payload = {
      tutor_name: params.tutorName,
      pet_name: params.petName,
      scheduled_date: params.newScheduledDate,
    };

    await this.enqueueNotification({
      tenantId: params.tenantId,
      userId: params.userId,
      event: 'appointment_rescheduled',
      channel: 'in_app',
      recipient: params.userId,
      templateSlug: 'appointment_rescheduled',
      payload,
      secureLink,
      idempotencyKey: `appt_rescheduled:in_app:${params.appointmentId}:${params.newScheduledDate}`,
    });

    if (params.recipientEmail) {
      await this.enqueueNotification({
        tenantId: params.tenantId,
        userId: params.userId,
        event: 'appointment_rescheduled',
        channel: 'email',
        recipient: params.recipientEmail,
        templateSlug: 'appointment_rescheduled',
        payload,
        secureLink,
        idempotencyKey: `appt_rescheduled:email:${params.appointmentId}:${params.newScheduledDate}`,
      });
    }
  }

  /**
   * Lembrete de Consulta (24h / 1h de antecedência)
   */
  async notifyAppointmentReminder(params: {
    tenantId: string;
    userId: string;
    appointmentId: string;
    tutorName: string;
    petName: string;
    scheduledDate: string;
    hoursAhead: number;
    recipientEmail?: string;
    recipientPhone?: string;
  }): Promise<void> {
    const secureLink = TemplateEngine.generateSecureLink(this.appBaseUrl, 'teleconsultation', params.appointmentId);
    const payload = {
      tutor_name: params.tutorName,
      pet_name: params.petName,
      scheduled_date: params.scheduledDate,
    };

    const idempotencyPrefix = `appt_reminder_${params.hoursAhead}h`;

    if (params.recipientEmail) {
      await this.enqueueNotification({
        tenantId: params.tenantId,
        userId: params.userId,
        event: 'appointment_reminder',
        channel: 'email',
        recipient: params.recipientEmail,
        templateSlug: 'appointment_reminder',
        payload,
        secureLink,
        idempotencyKey: `${idempotencyPrefix}:email:${params.appointmentId}`,
      });
    }

    if (params.recipientPhone) {
      await this.enqueueNotification({
        tenantId: params.tenantId,
        userId: params.userId,
        event: 'appointment_reminder',
        channel: 'whatsapp',
        recipient: params.recipientPhone,
        templateSlug: 'appointment_reminder',
        payload,
        secureLink,
        idempotencyKey: `${idempotencyPrefix}:whatsapp:${params.appointmentId}`,
      });
    }
  }

  /**
   * Pagamento Aprovado
   */
  async notifyPaymentApproved(params: {
    tenantId: string;
    userId: string;
    paymentId: string;
    tutorName: string;
    petName: string;
    amountFormatted: string;
    recipientEmail?: string;
    recipientPhone?: string;
  }): Promise<void> {
    const secureLink = TemplateEngine.generateSecureLink(this.appBaseUrl, 'receipt', params.paymentId);
    const payload = {
      tutor_name: params.tutorName,
      pet_name: params.petName,
      amount_formatted: params.amountFormatted,
    };

    await this.enqueueNotification({
      tenantId: params.tenantId,
      userId: params.userId,
      event: 'payment_approved',
      channel: 'in_app',
      recipient: params.userId,
      templateSlug: 'payment_approved',
      payload,
      secureLink,
      idempotencyKey: `payment_approved:in_app:${params.paymentId}`,
    });

    if (params.recipientEmail) {
      await this.enqueueNotification({
        tenantId: params.tenantId,
        userId: params.userId,
        event: 'payment_approved',
        channel: 'email',
        recipient: params.recipientEmail,
        templateSlug: 'payment_approved',
        payload,
        secureLink,
        idempotencyKey: `payment_approved:email:${params.paymentId}`,
      });
    }
  }

  /**
   * Falha no Pagamento
   */
  async notifyPaymentFailed(params: {
    tenantId: string;
    userId: string;
    paymentId: string;
    tutorName: string;
    petName: string;
    recipientEmail?: string;
  }): Promise<void> {
    const secureLink = TemplateEngine.generateSecureLink(this.appBaseUrl, 'billing', params.paymentId);
    const payload = {
      tutor_name: params.tutorName,
      pet_name: params.petName,
    };

    if (params.recipientEmail) {
      await this.enqueueNotification({
        tenantId: params.tenantId,
        userId: params.userId,
        event: 'payment_failed',
        channel: 'email',
        recipient: params.recipientEmail,
        templateSlug: 'payment_failed',
        payload,
        secureLink,
        idempotencyKey: `payment_failed:email:${params.paymentId}`,
      });
    }
  }

  /**
   * Consulta Iniciando (Médico na sala)
   */
  async notifyConsultationStarting(params: {
    tenantId: string;
    userId: string;
    consultationId: string;
    tutorName: string;
    petName: string;
    recipientPhone?: string;
  }): Promise<void> {
    const secureLink = TemplateEngine.generateSecureLink(this.appBaseUrl, 'teleconsultation', params.consultationId);
    const payload = {
      tutor_name: params.tutorName,
      pet_name: params.petName,
    };

    if (params.recipientPhone) {
      await this.enqueueNotification({
        tenantId: params.tenantId,
        userId: params.userId,
        event: 'consultation_starting',
        channel: 'whatsapp',
        recipient: params.recipientPhone,
        templateSlug: 'consultation_starting',
        payload,
        secureLink,
        idempotencyKey: `consultation_start:whatsapp:${params.consultationId}`,
      });
    }
  }

  /**
   * Receita ou Documento Médico Disponível (Zero termos sensíveis em canal aberto!)
   */
  async notifyPrescriptionReady(params: {
    tenantId: string;
    userId: string;
    documentId: string;
    tutorName: string;
    petName: string;
    recipientEmail?: string;
    recipientPhone?: string;
  }): Promise<void> {
    const secureLink = TemplateEngine.generateSecureLink(this.appBaseUrl, 'prescription', params.documentId);
    const payload = {
      tutor_name: params.tutorName,
      pet_name: params.petName,
    };

    await this.enqueueNotification({
      tenantId: params.tenantId,
      userId: params.userId,
      event: 'prescription_ready',
      channel: 'in_app',
      recipient: params.userId,
      templateSlug: 'prescription_ready',
      payload,
      secureLink,
      idempotencyKey: `prescription_ready:in_app:${params.documentId}`,
    });

    if (params.recipientEmail) {
      await this.enqueueNotification({
        tenantId: params.tenantId,
        userId: params.userId,
        event: 'prescription_ready',
        channel: 'email',
        recipient: params.recipientEmail,
        templateSlug: 'prescription_ready',
        payload,
        secureLink,
        idempotencyKey: `prescription_ready:email:${params.documentId}`,
      });
    }

    if (params.recipientPhone) {
      await this.enqueueNotification({
        tenantId: params.tenantId,
        userId: params.userId,
        event: 'prescription_ready',
        channel: 'whatsapp',
        recipient: params.recipientPhone,
        templateSlug: 'prescription_ready',
        payload,
        secureLink,
        idempotencyKey: `prescription_ready:whatsapp:${params.documentId}`,
      });
    }
  }

  /**
   * Encaminhamento Emitido
   */
  async notifyReferralIssued(params: {
    tenantId: string;
    userId: string;
    referralId: string;
    tutorName: string;
    petName: string;
    recipientEmail?: string;
    recipientPhone?: string;
  }): Promise<void> {
    const secureLink = TemplateEngine.generateSecureLink(this.appBaseUrl, 'referral', params.referralId);
    const payload = {
      tutor_name: params.tutorName,
      pet_name: params.petName,
    };

    await this.enqueueNotification({
      tenantId: params.tenantId,
      userId: params.userId,
      event: 'referral_issued',
      channel: 'in_app',
      recipient: params.userId,
      templateSlug: 'referral_issued',
      payload,
      secureLink,
      idempotencyKey: `referral_issued:in_app:${params.referralId}`,
    });

    if (params.recipientEmail) {
      await this.enqueueNotification({
        tenantId: params.tenantId,
        userId: params.userId,
        event: 'referral_issued',
        channel: 'email',
        recipient: params.recipientEmail,
        templateSlug: 'referral_issued',
        payload,
        secureLink,
        idempotencyKey: `referral_issued:email:${params.referralId}`,
      });
    }
  }

  /**
   * Alerta de Vacinação
   */
  async notifyVaccineDue(params: {
    tenantId: string;
    userId: string;
    vaccineId: string;
    tutorName: string;
    petName: string;
    vaccineName: string;
    dueDate: string;
    recipientEmail?: string;
    recipientPhone?: string;
  }): Promise<void> {
    const secureLink = TemplateEngine.generateSecureLink(this.appBaseUrl, 'vaccination', params.vaccineId);
    const payload = {
      tutor_name: params.tutorName,
      pet_name: params.petName,
      vaccine_name: params.vaccineName,
      due_date: params.dueDate,
    };

    await this.enqueueNotification({
      tenantId: params.tenantId,
      userId: params.userId,
      event: 'vaccine_due',
      channel: 'in_app',
      recipient: params.userId,
      templateSlug: 'vaccine_due',
      payload,
      secureLink,
      idempotencyKey: `vaccine_due:in_app:${params.vaccineId}`,
    });

    if (params.recipientEmail) {
      await this.enqueueNotification({
        tenantId: params.tenantId,
        userId: params.userId,
        event: 'vaccine_due',
        channel: 'email',
        recipient: params.recipientEmail,
        templateSlug: 'vaccine_due',
        payload,
        secureLink,
        idempotencyKey: `vaccine_due:email:${params.vaccineId}`,
      });
    }
  }

  /**
   * Atualização de Assinatura SaaS
   */
  async notifySubscriptionUpdated(params: {
    tenantId: string;
    userId: string;
    subscriptionId: string;
    userName: string;
    planStatus: string;
    recipientEmail?: string;
  }): Promise<void> {
    const secureLink = TemplateEngine.generateSecureLink(this.appBaseUrl, 'saas', params.subscriptionId);
    const payload = {
      user_name: params.userName,
      plan_status: params.planStatus,
    };

    if (params.recipientEmail) {
      await this.enqueueNotification({
        tenantId: params.tenantId,
        userId: params.userId,
        event: 'subscription_updated',
        channel: 'email',
        recipient: params.recipientEmail,
        templateSlug: 'subscription_updated',
        payload,
        secureLink,
        idempotencyKey: `subscription_updated:email:${params.subscriptionId}:${params.planStatus}`,
      });
    }
  }

  /**
   * Chamado de Suporte Respondido
   */
  async notifySupportTicketUpdated(params: {
    tenantId: string;
    userId: string;
    ticketId: string;
    userName: string;
    recipientEmail?: string;
  }): Promise<void> {
    const secureLink = TemplateEngine.generateSecureLink(this.appBaseUrl, 'support', params.ticketId);
    const payload = {
      user_name: params.userName,
      ticket_id: params.ticketId,
    };

    if (params.recipientEmail) {
      await this.enqueueNotification({
        tenantId: params.tenantId,
        userId: params.userId,
        event: 'support_ticket_updated',
        channel: 'email',
        recipient: params.recipientEmail,
        templateSlug: 'support_ticket_updated',
        payload,
        secureLink,
        idempotencyKey: `ticket_updated:email:${params.ticketId}`,
      });
    }
  }

  // ============================================================================
  // Processamento Resiliente da Outbox e Execução de Retries
  // ============================================================================

  /**
   * Processa itens pendentes da Outbox respeitando políticas de retry e resposta real.
   */
  async processOutbox(batchSize = 10): Promise<{
    processed: number;
    sent: number;
    delivered: number;
    failed: number;
    pendingConfiguration: number;
  }> {
    const { data: claimedItems, error: claimError } = await this.supabase.rpc('fn_claim_notification_outbox', {
      p_batch_size: batchSize,
    });

    if (claimError) {
      throw new Error(`Erro ao reivindicar itens da outbox: ${claimError.message}`);
    }

    const items: OutboxItem[] = (claimedItems || []).map((row: any) => ({
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      event: row.event,
      channel: row.channel,
      recipient: row.recipient,
      templateSlug: row.template_slug,
      templateVersion: row.template_version,
      renderedSubject: row.rendered_subject,
      renderedBody: row.rendered_body,
      payload: row.payload,
      secureLink: row.secure_link,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      idempotencyKey: row.idempotency_key,
    }));

    const results = {
      processed: items.length,
      sent: 0,
      delivered: 0,
      failed: 0,
      pendingConfiguration: 0,
    };

    for (const item of items) {
      const adapter = this.adapters.get(item.channel);

      if (!adapter) {
        await this.supabase.rpc('fn_update_notification_outbox_status', {
          p_outbox_id: item.id,
          p_status: 'failed',
          p_error_message: `Nenhum adaptador registrado para o canal ${item.channel}.`,
        });
        results.failed++;
        continue;
      }

      try {
        const sendResult = await adapter.send(item);

        await this.supabase.rpc('fn_update_notification_outbox_status', {
          p_outbox_id: item.id,
          p_status: sendResult.status,
          p_external_id: sendResult.externalId || null,
          p_provider_response: sendResult.providerResponse || null,
          p_error_message: sendResult.errorMessage || null,
          p_error_details: sendResult.errorDetails || null,
        });

        if (sendResult.status === 'sent') results.sent++;
        else if (sendResult.status === 'delivered') results.delivered++;
        else if (sendResult.status === 'pending_configuration') results.pendingConfiguration++;
        else if (sendResult.status === 'failed') results.failed++;

      } catch (err: any) {
        await this.supabase.rpc('fn_update_notification_outbox_status', {
          p_outbox_id: item.id,
          p_status: 'failed',
          p_error_message: err.message || 'Erro inesperado no envio.',
        });
        results.failed++;
      }
    }

    return results;
  }

  // ============================================================================
  // Preferências do Usuário e Consentimento
  // ============================================================================

  async getPreferences(userId: string): Promise<UserNotificationPreferences> {
    const { data, error } = await this.supabase.rpc('fn_get_notification_preferences', {
      p_user_id: userId,
    });

    if (error) {
      throw new Error(`Erro ao obter preferências: ${error.message}`);
    }

    return {
      userId: data.user_id,
      tenantId: data.tenant_id,
      inAppEnabled: data.in_app_enabled,
      emailEnabled: data.email_enabled,
      whatsappEnabled: data.whatsapp_enabled,
      whatsappOptInAt: data.whatsapp_opt_in_at,
      whatsappOptInIp: data.whatsapp_opt_in_ip,
      pushEnabled: data.push_enabled,
      remindersEnabled: data.reminders_enabled,
      clinicalAlertsEnabled: data.clinical_alerts_enabled,
      marketingEnabled: data.marketing_enabled,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async updatePreferences(params: {
    userId: string;
    emailEnabled?: boolean;
    whatsappEnabled?: boolean;
    pushEnabled?: boolean;
    inAppEnabled?: boolean;
    remindersEnabled?: boolean;
    marketingEnabled?: boolean;
    ipAddress?: string;
  }): Promise<UserNotificationPreferences> {
    const current = await this.getPreferences(params.userId);

    const { data, error } = await this.supabase.rpc('fn_update_notification_preferences', {
      p_user_id: params.userId,
      p_email_enabled: params.emailEnabled ?? current.emailEnabled,
      p_whatsapp_enabled: params.whatsappEnabled ?? current.whatsappEnabled,
      p_push_enabled: params.pushEnabled ?? current.pushEnabled,
      p_in_app_enabled: params.inAppEnabled ?? current.inAppEnabled,
      p_reminders_enabled: params.remindersEnabled ?? current.remindersEnabled,
      p_marketing_enabled: params.marketingEnabled ?? current.marketingEnabled,
      p_ip_address: params.ipAddress || null,
    });

    if (error) {
      throw new Error(`Erro ao atualizar preferências: ${error.message}`);
    }

    return {
      userId: data.user_id,
      inAppEnabled: data.in_app_enabled,
      emailEnabled: data.email_enabled,
      whatsappEnabled: data.whatsapp_enabled,
      whatsappOptInAt: data.whatsapp_opt_in_at,
      pushEnabled: data.push_enabled,
      remindersEnabled: data.reminders_enabled,
      marketingEnabled: data.marketing_enabled,
      clinicalAlertsEnabled: current.clinicalAlertsEnabled,
    };
  }

  // ============================================================================
  // Auditoria e Métricas da Outbox
  // ============================================================================

  async getAuditMetrics(tenantId?: string): Promise<OutboxAuditMetrics> {
    const { data, error } = await this.supabase.rpc('fn_get_outbox_audit_metrics', {
      p_tenant_id: tenantId || null,
    });

    if (error) {
      throw new Error(`Erro ao obter métricas da outbox: ${error.message}`);
    }

    return {
      total: Number(data.total || 0),
      pending: Number(data.pending || 0),
      sent: Number(data.sent || 0),
      delivered: Number(data.delivered || 0),
      failed: Number(data.failed || 0),
      pendingConfiguration: Number(data.pending_configuration || 0),
      skippedOptOut: Number(data.skipped_opt_out || 0),
      successRate: Number(data.success_rate || 100),
    };
  }

  /**
   * Notificações In-App do Usuário
   */
  async getUserInAppNotifications(userId: string, limit = 20): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Erro ao buscar notificações: ${error.message}`);
    }

    return data || [];
  }

  async markNotificationAsRead(notificationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId);

    if (error) {
      throw new Error(`Erro ao marcar notificação como lida: ${error.message}`);
    }
  }
}
