// ==============================================================================
// src/admin/admin-master-service.ts
// Serviço Central do Administrador Master (Superadmin, Analytics Real, Moderação e Suporte)
// ==============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase-client';
import {
  AdminRealAnalytics,
  FinancialLedgerEntry,
  GlobalGovernanceSettings,
  SponsorCampaign,
  SupportTicketDetail,
  SupportTicketMessage,
} from './types';

export class AdminMasterService {
  private supabase: SupabaseClient;

  constructor(
    supabaseUrl: string = SUPABASE_URL,
    supabaseAnonKey: string = SUPABASE_ANON_KEY
  ) {
    this.supabase = (supabaseUrl === SUPABASE_URL && supabaseAnonKey === SUPABASE_ANON_KEY)
      ? getSupabaseClient()
      : createClient(supabaseUrl, supabaseAnonKey);
  }

  /**
   * Obtém Analytics Executivo com Origem Estritamente Real nos Dados
   * (Sem números simulados; documenta métricas com dados insuficientes)
   */
  async getRealAnalytics(): Promise<AdminRealAnalytics> {
    const { data, error } = await this.supabase.rpc('fn_get_admin_master_real_analytics');

    if (error) {
      throw new Error(`Erro ao obter analytics do Admin Master: ${error.message}`);
    }

    return {
      financial: {
        mrrCents: Number(data.financial?.mrr_cents || 0),
        arrCents: Number(data.financial?.arr_cents || 0),
        gmvCents: Number(data.financial?.gmv_cents || 0),
        platformCommissionsCents: Number(data.financial?.platform_commissions_cents || 0),
        partnerCommissionsCents: Number(data.financial?.partner_commissions_cents || 0),
        refundsCents: Number(data.financial?.refunds_cents || 0),
        netRevenueCents: Number(data.financial?.net_revenue_cents || 0),
      },
      appointments: {
        total: Number(data.appointments?.total || 0),
        scheduled: Number(data.appointments?.scheduled || 0),
        confirmed: Number(data.appointments?.confirmed || 0),
        completed: Number(data.appointments?.completed || 0),
        cancelled: Number(data.appointments?.cancelled || 0),
        conversionRate: Number(data.appointments?.conversion_rate || 0),
        cancellationRate: Number(data.appointments?.cancellation_rate || 0),
      },
      ecosystem: {
        tutorsCount: Number(data.ecosystem?.tutors_count || 0),
        veterinariansTotal: Number(data.ecosystem?.veterinarians_total || 0),
        veterinariansValidated: Number(data.ecosystem?.veterinarians_validated || 0),
        veterinariansPending: Number(data.ecosystem?.veterinarians_pending || 0),
        petshopsTotal: Number(data.ecosystem?.petshops_total || 0),
        petshopsActive: Number(data.ecosystem?.petshops_active || 0),
      },
      support: {
        ticketsOpen: Number(data.support?.tickets_open || 0),
        ticketsSlaBreached: Number(data.support?.tickets_sla_breached || 0),
      },
      regionalBreakdown: data.regional_breakdown || [],
      insufficientDataNotes: data.insufficient_data_notes || [],
    };
  }

  /**
   * Moderação e Aprovação de Cadastros de Veterinários e CRMV
   */
  async reviewVeterinarian(
    veterinarianId: string,
    action: 'approve' | 'reject' | 'suspend',
    notes?: string
  ): Promise<{ success: boolean; crmvStatus: string }> {
    const { data, error } = await this.supabase.rpc('fn_admin_review_veterinarian', {
      p_veterinarian_id: veterinarianId,
      p_action: action,
      p_notes: notes || null,
    });

    if (error) {
      throw new Error(`Falha ao revisar médico veterinário: ${error.message}`);
    }

    return {
      success: Boolean(data?.success),
      crmvStatus: data?.crmv_status,
    };
  }

  /**
   * Registro Mandatório de Acesso a Dados Sensíveis (CFMV / LGPD)
   */
  async logSensitiveAccess(
    targetEntity: string,
    targetEntityId: string,
    accessReason: string,
    viewMode: 'standard' | 'view_as_user' | 'audit_export' = 'standard'
  ): Promise<{ logId: string }> {
    const { data, error } = await this.supabase.rpc('fn_admin_log_sensitive_access', {
      p_target_entity: targetEntity,
      p_target_entity_id: targetEntityId,
      p_access_reason: accessReason,
      p_view_mode: viewMode,
    });

    if (error) {
      throw new Error(`Acesso sensível não autorizado ou sem justificativa: ${error.message}`);
    }

    return { logId: data.log_id };
  }

  /**
   * Recurso "Ver Como Usuário" (Simulação Somente Leitura e Auditada)
   */
  async generateViewAsToken(
    targetUserId: string,
    justification: string
  ): Promise<{ viewAsActive: boolean; readOnly: boolean; targetUserEmail: string }> {
    const { data, error } = await this.supabase.rpc('fn_admin_generate_view_as_token', {
      p_target_user_id: targetUserId,
      p_justification: justification,
    });

    if (error) {
      throw new Error(`Falha ao iniciar modo Ver Como Usuário: ${error.message}`);
    }

    return {
      viewAsActive: Boolean(data?.view_as_active),
      readOnly: Boolean(data?.read_only),
      targetUserEmail: data?.target_email,
    };
  }

  /**
   * Extrato do Ledger Financeiro
   */
  async getFinancialLedger(
    startDate?: string,
    endDate?: string,
    limit = 50,
    offset = 0
  ): Promise<FinancialLedgerEntry[]> {
    const { data, error } = await this.supabase.rpc('fn_get_admin_financial_ledger', {
      p_start_date: startDate || null,
      p_end_date: endDate || null,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      throw new Error(`Erro ao obter ledger financeiro: ${error.message}`);
    }

    return (data || []).map((row: any) => ({
      paymentId: row.payment_id,
      appointmentId: row.appointment_id,
      tenantName: row.tenant_name,
      grossAmountCents: row.gross_amount_cents,
      gatewayFeeCents: row.gateway_fee_cents,
      platformCommissionCents: row.platform_commission_cents,
      petshopCommissionCents: row.petshop_commission_cents,
      veterinarianNetCents: row.veterinarian_net_cents,
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  /**
   * Gestão de Tickets de Suporte e Helpdesk com SLA
   */
  async getSupportTickets(statusFilter?: string): Promise<SupportTicketDetail[]> {
    let query = this.supabase
      .from('support_tickets')
      .select('*, users!user_id(email, full_name)')
      .order('created_at', { ascending: false });

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Erro ao buscar tickets de suporte: ${error.message}`);
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      assignedToUserId: row.assigned_to_user_id,
      title: row.title,
      description: row.description,
      category: row.category,
      priority: row.priority,
      status: row.status,
      slaResponseDueAt: row.sla_response_due_at,
      slaResolutionDueAt: row.sla_resolution_due_at,
      slaBreached: Boolean(row.sla_breached),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      userEmail: row.users?.email,
      userFullName: row.users?.full_name,
    }));
  }

  async getTicketMessages(ticketId: string): Promise<SupportTicketMessage[]> {
    const { data, error } = await this.supabase
      .from('support_ticket_messages')
      .select('*, users!user_id(full_name)')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Erro ao obter mensagens do ticket: ${error.message}`);
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      ticketId: row.ticket_id,
      userId: row.user_id,
      isInternalNote: Boolean(row.is_internal_note),
      message: row.message,
      createdAt: row.created_at,
      senderName: row.users?.full_name,
    }));
  }

  async addTicketMessage(
    ticketId: string,
    message: string,
    isInternalNote = false
  ): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) throw new Error('Operador não autenticado.');

    const { error } = await this.supabase
      .from('support_ticket_messages')
      .insert({
        ticket_id: ticketId,
        user_id: user.id,
        message,
        is_internal_note: isInternalNote,
      });

    if (error) {
      throw new Error(`Falha ao registrar mensagem no ticket: ${error.message}`);
    }
  }

  /**
   * Configurações Globais de Governança e Feature Flags
   */
  async getGlobalSettings(): Promise<GlobalGovernanceSettings> {
    const { data, error } = await this.supabase
      .from('platform_global_settings')
      .select('*')
      .limit(1)
      .single();

    if (error) {
      throw new Error(`Erro ao carregar configurações globais: ${error.message}`);
    }

    return {
      platformName: data.platform_name,
      defaultTrialDays: data.default_trial_days,
      defaultCancellationHours: data.default_cancellation_hours,
      gatewayFeePercent: Number(data.gateway_fee_percent),
      gatewayFeeFixedCents: data.gateway_fee_fixed_cents,
      requireCrmvAutoValidation: Boolean(data.require_crmv_auto_validation),
      maintenanceMode: Boolean(data.maintenance_mode),
      supportEmail: data.support_email,
      featureFlags: data.feature_flags || {},
      termsVersion: data.terms_version || '2026.1',
      privacyPolicyVersion: data.privacy_policy_version || '2026.1',
    };
  }

  async updateGlobalSettings(
    settings: Partial<GlobalGovernanceSettings>
  ): Promise<void> {
    const updatePayload: any = {
      updated_at: new Date().toISOString(),
    };

    if (settings.platformName !== undefined) updatePayload.platform_name = settings.platformName;
    if (settings.defaultTrialDays !== undefined) updatePayload.default_trial_days = settings.defaultTrialDays;
    if (settings.defaultCancellationHours !== undefined) updatePayload.default_cancellation_hours = settings.defaultCancellationHours;
    if (settings.gatewayFeePercent !== undefined) updatePayload.gateway_fee_percent = settings.gatewayFeePercent;
    if (settings.maintenanceMode !== undefined) updatePayload.maintenance_mode = settings.maintenanceMode;
    if (settings.featureFlags !== undefined) updatePayload.feature_flags = settings.featureFlags;
    if (settings.termsVersion !== undefined) updatePayload.terms_version = settings.termsVersion;

    const { error } = await this.supabase
      .from('platform_global_settings')
      .update(updatePayload)
      .eq('id', '00000000-0000-0000-0000-000000000001');

    if (error) {
      throw new Error(`Falha ao atualizar governança global: ${error.message}`);
    }
  }

  /**
   * Patrocinadores e Campanhas
   */
  async getSponsors(): Promise<SponsorCampaign[]> {
    const { data, error } = await this.supabase
      .from('sponsors_and_advertisers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Erro ao buscar patrocinadores: ${error.message}`);
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      companyName: row.company_name,
      campaignType: row.campaign_type,
      targetAudience: row.target_audience,
      title: row.title,
      targetUrl: row.target_url,
      bannerImageUrl: row.banner_image_url,
      budgetCents: row.budget_cents,
      spentCents: row.spent_cents,
      impressionsCount: row.impressions_count,
      clicksCount: row.clicks_count,
      status: row.status,
    }));
  }
}
