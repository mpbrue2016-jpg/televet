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
}
