import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SplitBreakdown {
  ruleApplied: string;
  grossAmountCents: number;
  gatewayFeeCents: number;
  netAmountCents: number;
  veterinarianCents: number;
  petshopCents: number;
  platformCents: number;
}

export interface PaymentProcessingInput {
  appointmentId: string;
  gateway: 'pagarme' | 'stripe' | 'asaas' | 'mercadopago';
  gatewayTransactionId: string;
  paymentMethod: 'pix' | 'credit_card' | 'boleto';
  idempotencyKey: string;
  campaignCode?: string;
}

export interface PaymentGatewayConfigInput {
  tenantId: string;
  providerName: 'stripe' | 'pagarme' | 'asaas' | 'mercadopago' | 'manual';
  isEnabled?: boolean;
  config?: Record<string, unknown>;
}

export interface PaymentWebhookEventInput {
  tenantId: string;
  paymentId: string;
  providerName: 'stripe' | 'pagarme' | 'asaas' | 'mercadopago' | 'manual';
  providerEventId: string;
  eventType: string;
  payload?: Record<string, unknown>;
}

export type PaymentGatewayStatus =
  | 'pending'
  | 'requires_action'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'refunded';

import { getSupabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase-client';

export class FinancialEngine {
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
   * Processamento atômico do split financeiro com garantia de idempotência
   */
  async processSplit(input: PaymentProcessingInput): Promise<{ paymentId: string; split: SplitBreakdown }> {
    const { data, error } = await this.supabase.rpc('process_appointment_payment_split', {
      p_appointment_id: input.appointmentId,
      p_gateway: input.gateway,
      p_gateway_tx_id: input.gatewayTransactionId,
      p_payment_method: input.paymentMethod,
      p_idempotency_key: input.idempotencyKey,
      p_campaign_code: input.campaignCode || null,
    });

    if (error) {
      throw new Error(`Falha no motor financeiro: ${error.message}`);
    }

    return {
      paymentId: data.payment_id,
      split: {
        ruleApplied: data.split.rule_applied,
        grossAmountCents: data.gross_amount_cents,
        gatewayFeeCents: data.gateway_fee_cents,
        netAmountCents: data.net_amount_cents,
        veterinarianCents: data.split.veterinarian_cents,
        petshopCents: data.split.petshop_cents,
        platformCents: data.split.platform_cents,
      },
    };
  }

  /**
   * Reversão atômica de pagamento e recálculo das carteiras (Reembolso)
   */
  async refundPayment(paymentId: string, reason: string): Promise<void> {
    const { error } = await this.supabase.rpc('process_refund_split', {
      p_payment_id: paymentId,
      p_reason: reason,
    });

    if (error) {
      throw new Error(`Erro ao estornar pagamento: ${error.message}`);
    }
  }

  /**
   * Registro e acompanhamento de chargeback/contestação de compra
   */
  async openChargebackDispute(
    tenantId: string,
    paymentId: string,
    gatewayDisputeId: string,
    amountCents: number,
    reason: string
  ): Promise<string> {
    const { data, error } = await this.supabase
      .from('chargeback_disputes')
      .insert({
        tenant_id: tenantId,
        payment_id: paymentId,
        gateway_dispute_id: gatewayDisputeId,
        amount_cents: amountCents,
        reason,
        status: 'dispute_opened',
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Erro ao abrir disputa de chargeback: ${error.message}`);
    }

    return data.id;
  }

  /**
   * Configura um gateway real do provedor, sem armazenar segredos sensíveis em texto puro.
   * O ambiente real segue pendente até que a chave do provedor venha do runtime.
   */
  async registerGatewayConfig(input: PaymentGatewayConfigInput): Promise<{ success: boolean; providerName: string; isEnabled: boolean }> {
    const { data, error } = await this.supabase.rpc('register_payment_gateway_config', {
      p_tenant_id: input.tenantId,
      p_provider_name: input.providerName,
      p_is_enabled: input.isEnabled ?? false,
      p_config: input.config ?? {},
    });

    if (error) {
      throw new Error(`Erro ao configurar gateway: ${error.message}`);
    }

    return {
      success: Boolean(data?.success ?? true),
      providerName: data?.provider_name ?? input.providerName,
      isEnabled: Boolean(data?.is_enabled ?? input.isEnabled ?? false),
    };
  }

  /**
   * Registra um evento de webhook do provedor com deduplicação por provider_event_id.
   */
  async registerWebhookEvent(input: PaymentWebhookEventInput): Promise<{ duplicate: boolean; eventId: string | null; paymentId: string | null }> {
    const { data, error } = await this.supabase.rpc('register_payment_webhook_event', {
      p_tenant_id: input.tenantId,
      p_payment_id: input.paymentId,
      p_provider_name: input.providerName,
      p_provider_event_id: input.providerEventId,
      p_event_type: input.eventType,
      p_payload: input.payload ?? {},
    });

    if (error) {
      throw new Error(`Erro ao registrar webhook: ${error.message}`);
    }

    return {
      duplicate: Boolean(data?.duplicate ?? false),
      eventId: data?.event_id ?? null,
      paymentId: data?.payment_id ?? input.paymentId ?? null,
    };
  }

  /**
   * Atualiza o status do gateway e o ledger financeiro do pagamento.
   */
  async applyProviderStatus(
    paymentId: string,
    providerName: PaymentGatewayConfigInput['providerName'],
    providerStatus: PaymentGatewayStatus,
    providerEventId?: string,
    reason?: string,
    payload?: Record<string, unknown>
  ): Promise<{ success: boolean; paymentId: string; providerStatus: PaymentGatewayStatus; paymentStatus: string }> {
    const { data, error } = await this.supabase.rpc('apply_provider_status_update', {
      p_payment_id: paymentId,
      p_provider_name: providerName,
      p_provider_status: providerStatus,
      p_provider_event_id: providerEventId ?? null,
      p_reason: reason ?? null,
      p_payload: payload ?? {},
    });

    if (error) {
      throw new Error(`Erro ao atualizar status do gateway: ${error.message}`);
    }

    return {
      success: Boolean(data?.success ?? false),
      paymentId: data?.payment_id ?? paymentId,
      providerStatus: data?.provider_status ?? providerStatus,
      paymentStatus: data?.payment_status ?? 'pending',
    };
  }
}
