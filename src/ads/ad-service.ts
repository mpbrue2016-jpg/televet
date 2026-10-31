// ==============================================================================
// src/ads/ad-service.ts
// Motor Server-Side do TeleVet Ads (Fase 17)
// Entrega de Anúncios, Anti-Fraude, Privacidade Clínica e Gestão de Planos
// ==============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase-client';
import {
  AdPlan,
  Advertiser,
  AdCampaign,
  AdCreative,
  ServedAd,
  ServeAdsParams,
  AdMetricsSummary,
  FORBIDDEN_CLINICAL_FIELDS,
} from './types';

export class AdService {
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
   * CLÁUSULA RÍGIDA DE PRIVACIDADE CLÍNICA:
   * Valida estritamente que nenhum parâmetro tenta injetar dados clínicos, prontuários,
   * vacinas, raças, espécies ou dados pessoais de tutores para segmentação de anúncios.
   */
  static assertZeroClinicalDataUsage(params: Record<string, any>): void {
    const serialized = JSON.stringify(params).toLowerCase();
    for (const forbidden of FORBIDDEN_CLINICAL_FIELDS) {
      if (serialized.includes(forbidden.toLowerCase())) {
        throw new Error(
          `VIOLAÇÃO DE PRIVACIDADE (TeleVet Ads): É categoricamente proibido utilizar o campo "${forbidden}" (dados clínicos, prontuário, vacinas, espécie ou identificação pessoal de tutor) para segmentar anúncios publicitários.`
        );
      }
    }
  }

  /**
   * Entrega de Anúncios Server-Side com Filtros de Elegibilidade e Selo Obrigatório.
   * Respeita orçamento, período, pagamento (Fase 18) e status de aprovação.
   */
  async serveAds(params: ServeAdsParams): Promise<ServedAd[]> {
    // 1. Auditoria de privacidade nos parâmetros
    AdService.assertZeroClinicalDataUsage(params);

    const { data, error } = await this.supabase.rpc('serve_ads', {
      p_placement: params.placement,
      p_uf: params.uf ? params.uf.toUpperCase() : null,
      p_cidade: params.cidade || null,
      p_bairro: params.bairro || null,
      p_categoria: params.categoria || null,
      p_limit: params.limit || 1,
    });

    if (error) {
      console.warn('Erro ao invocar RPC serve_ads:', error.message);
      return [];
    }

    return (data || []).map((row: any) => ({
      adId: row.ad_id,
      campaignId: row.campaign_id,
      creativeId: row.creative_id,
      advertiserName: row.advertiser_name,
      title: row.title,
      description: row.description,
      imageUrl: row.image_url,
      targetUrl: row.target_url,
      callToAction: row.call_to_action || 'Saiba Mais',
      phone: row.phone,
      whatsapp: row.whatsapp,
      format: row.format,
      badgeLabel: 'PATROCINADO', // Garante que o selo seja inegociável
    }));
  }

  /**
   * Registro de Eventos (impressão, visualização, clique, ligação, WhatsApp, rota)
   * com deduplicação anti-fraude e ZERO captura de dados pessoais (LGPD).
   */
  async recordEvent(
    campaignId: string,
    creativeId: string,
    eventType: 'impressao' | 'visualizacao' | 'clique' | 'ligacao' | 'whatsapp' | 'como_chegar',
    placement?: string,
    sessionHash?: string
  ): Promise<{ success: boolean; deduplicated: boolean }> {
    try {
      const { data, error } = await this.supabase.rpc('record_ad_event', {
        p_campaign_id: campaignId,
        p_creative_id: creativeId,
        p_event_type: eventType,
        p_placement: placement || null,
        p_session_hash: sessionHash || null,
      });

      if (error) throw error;
      return {
        success: Boolean(data?.success),
        deduplicated: Boolean(data?.deduplicated),
      };
    } catch (err: any) {
      console.warn('Falha ao registrar evento de ad:', err?.message);
      return { success: false, deduplicated: false };
    }
  }

  /**
   * Consulta os planos de publicidade configurados no banco de dados.
   * PREÇOS E LIMITES SÃO DINÂMICOS E DEFINIDOS PELO ADMIN MASTER, NUNCA NO CÓDIGO!
   */
  async getPlans(): Promise<AdPlan[]> {
    const { data, error } = await this.supabase
      .from('ad_plans')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) {
      throw new Error(`Erro ao listar planos de publicidade: ${error.message}`);
    }

    return (data || []).map((p: any) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      priceCents: p.price_cents,
      billingCycle: p.billing_cycle,
      maxActiveCampaigns: p.max_active_campaigns,
      maxImpressionsMonthly: p.max_impressions_monthly,
      allowedScopes: p.allowed_scopes || ['regional'],
      features: p.features || {},
      isActive: Boolean(p.is_active),
      displayOrder: p.display_order,
    }));
  }

  /**
   * Salva ou atualiza um plano de publicidade pelo Admin Master.
   */
  async savePlan(plan: Partial<AdPlan> & { slug: string; name: string; priceCents: number }): Promise<{ id: string }> {
    const payload: any = {
      slug: plan.slug,
      name: plan.name,
      description: plan.description || null,
      price_cents: plan.priceCents,
      billing_cycle: plan.billingCycle || 'monthly',
      max_active_campaigns: plan.maxActiveCampaigns || 1,
      max_impressions_monthly: plan.maxImpressionsMonthly || null,
      allowed_scopes: plan.allowedScopes || ['regional'],
      features: plan.features || {},
      is_active: plan.isActive !== undefined ? plan.isActive : true,
      display_order: plan.displayOrder || 0,
      updated_at: new Date().toISOString(),
    };

    if (plan.id) {
      const { data, error } = await this.supabase
        .from('ad_plans')
        .update(payload)
        .eq('id', plan.id)
        .select('id')
        .single();

      if (error) throw new Error(`Erro ao atualizar plano de anúncio: ${error.message}`);
      return { id: data.id };
    } else {
      const { data, error } = await this.supabase
        .from('ad_plans')
        .insert(payload)
        .select('id')
        .single();

      if (error) throw new Error(`Erro ao criar plano de anúncio: ${error.message}`);
      return { id: data.id };
    }
  }

  /**
   * Consulta perfil do anunciante autenticado.
   */
  async getAdvertiserProfile(ownerUserId: string): Promise<Advertiser | null> {
    const { data, error } = await this.supabase
      .from('advertisers')
      .select('*')
      .eq('owner_user_id', ownerUserId)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      ownerUserId: data.owner_user_id,
      razaoSocial: data.razao_social,
      nomeFantasia: data.nome_fantasia,
      cnpj: data.cnpj,
      contactName: data.contact_name,
      contactEmail: data.contact_email,
      contactPhone: data.contact_phone,
      contactWhatsapp: data.contact_whatsapp,
      websiteUrl: data.website_url,
      balanceCents: Number(data.balance_cents || 0),
      status: data.status,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * Cadastra ou atualiza o perfil do anunciante.
   */
  async saveAdvertiser(data: {
    id?: string;
    ownerUserId?: string;
    razaoSocial: string;
    nomeFantasia: string;
    cnpj?: string;
    contactName: string;
    contactEmail: string;
    contactPhone?: string;
    contactWhatsapp?: string;
    websiteUrl?: string;
  }): Promise<{ id: string }> {
    const payload: any = {
      razao_social: data.razaoSocial,
      nome_fantasia: data.nomeFantasia,
      cnpj: data.cnpj || null,
      contact_name: data.contactName,
      contact_email: data.contactEmail,
      contact_phone: data.contactPhone || null,
      contact_whatsapp: data.contactWhatsapp || null,
      website_url: data.websiteUrl || null,
      updated_at: new Date().toISOString(),
    };

    if (data.ownerUserId) payload.owner_user_id = data.ownerUserId;

    if (data.id) {
      const { data: res, error } = await this.supabase
        .from('advertisers')
        .update(payload)
        .eq('id', data.id)
        .select('id')
        .single();

      if (error) throw new Error(`Erro ao atualizar anunciante: ${error.message}`);
      return { id: res.id };
    } else {
      const { data: res, error } = await this.supabase
        .from('advertisers')
        .insert(payload)
        .select('id')
        .single();

      if (error) throw new Error(`Erro ao cadastrar anunciante: ${error.message}`);
      return { id: res.id };
    }
  }

  /**
   * Consulta campanhas de um anunciante com isolamento RLS.
   */
  async getCampaigns(advertiserId: string): Promise<AdCampaign[]> {
    const { data, error } = await this.supabase
      .from('ad_campaigns')
      .select('*')
      .eq('advertiser_id', advertiserId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Erro ao buscar campanhas: ${error.message}`);
    }

    return (data || []).map((c: any) => this.mapCampaignRow(c));
  }

  /**
   * Cadastra ou atualiza uma campanha garantindo que não há campos clínicos de segmentação.
   */
  async saveCampaign(campaign: {
    id?: string;
    advertiserId: string;
    planId?: string;
    name: string;
    campaignType: string;
    scope: string;
    targetUfs?: string[];
    targetCities?: string[];
    targetNeighborhoods?: string[];
    targetCategories?: string[];
    targetContext?: string;
    startsAt?: string;
    endsAt?: string;
    budgetCents?: number;
    dailyBudgetCents?: number;
    status?: string;
  }): Promise<{ id: string }> {
    // Validação de privacidade absoluta
    AdService.assertZeroClinicalDataUsage(campaign);

    const payload: any = {
      advertiser_id: campaign.advertiserId,
      plan_id: campaign.planId || null,
      name: campaign.name,
      campaign_type: campaign.campaignType,
      scope: campaign.scope,
      target_ufs: campaign.targetUfs || [],
      target_cities: campaign.targetCities || [],
      target_neighborhoods: campaign.targetNeighborhoods || [],
      target_categories: campaign.targetCategories || [],
      target_context: campaign.targetContext || 'geral',
      starts_at: campaign.startsAt || new Date().toISOString(),
      ends_at: campaign.endsAt || null,
      budget_cents: campaign.budgetCents || 0,
      daily_budget_cents: campaign.dailyBudgetCents || 0,
      status: campaign.status || 'rascunho',
      updated_at: new Date().toISOString(),
    };

    if (campaign.id) {
      const { data, error } = await this.supabase
        .from('ad_campaigns')
        .update(payload)
        .eq('id', campaign.id)
        .select('id')
        .single();

      if (error) throw new Error(`Erro ao atualizar campanha: ${error.message}`);
      return { id: data.id };
    } else {
      const { data, error } = await this.supabase
        .from('ad_campaigns')
        .insert(payload)
        .select('id')
        .single();

      if (error) throw new Error(`Erro ao criar campanha: ${error.message}`);
      return { id: data.id };
    }
  }

  /**
   * Cadastra ou atualiza um criativo publicitário.
   */
  async saveCreative(creative: {
    id?: string;
    campaignId: string;
    format: string;
    title: string;
    description?: string;
    imageUrl: string;
    targetUrl: string;
    callToAction?: string;
    phone?: string;
    whatsapp?: string;
  }): Promise<{ id: string }> {
    const payload: any = {
      campaign_id: creative.campaignId,
      format: creative.format,
      title: creative.title,
      description: creative.description || null,
      image_url: creative.imageUrl,
      target_url: creative.targetUrl,
      call_to_action: creative.callToAction || 'Saiba Mais',
      phone: creative.phone || null,
      whatsapp: creative.whatsapp || null,
    };

    if (creative.id) {
      const { data, error } = await this.supabase
        .from('ad_creatives')
        .update(payload)
        .eq('id', creative.id)
        .select('id')
        .single();

      if (error) throw new Error(`Erro ao atualizar criativo: ${error.message}`);
      return { id: data.id };
    } else {
      const { data, error } = await this.supabase
        .from('ad_creatives')
        .insert(payload)
        .select('id')
        .single();

      if (error) throw new Error(`Erro ao criar criativo: ${error.message}`);
      return { id: data.id };
    }
  }

  /**
   * Submete campanha para a fila de aprovação da moderação do Admin.
   */
  async submitCampaignForReview(campaignId: string): Promise<void> {
    const { error } = await this.supabase
      .from('ad_campaigns')
      .update({
        status: 'aguardando_aprovacao',
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignId);

    if (error) {
      throw new Error(`Falha ao submeter campanha: ${error.message}`);
    }
  }

  /**
   * Moderação Administrativa de Campanhas (Aprovar / Rejeitar / Pausar / Ativar).
   */
  async moderateCampaign(
    campaignId: string,
    action: 'aprovar' | 'rejeitar' | 'pausar' | 'ativar',
    reason?: string
  ): Promise<{ success: boolean; status: string }> {
    const { data, error } = await this.supabase.rpc('admin_moderate_campaign', {
      p_campaign_id: campaignId,
      p_action: action,
      p_rejection_reason: reason || null,
    });

    if (error) {
      throw new Error(`Erro na moderação da campanha: ${error.message}`);
    }

    return {
      success: Boolean(data?.success),
      status: data?.status,
    };
  }

  /**
   * Agregação de Métricas de Campanha (impressões, visualizações, CTR, cliques, contatos).
   */
  async getCampaignMetrics(campaignId: string): Promise<AdMetricsSummary> {
    const { data: campaign } = await this.supabase
      .from('ad_campaigns')
      .select('budget_cents, spent_cents')
      .eq('id', campaignId)
      .single();

    const { data: events, error } = await this.supabase
      .from('ad_events')
      .select('event_type')
      .eq('campaign_id', campaignId);

    if (error || !events) {
      return {
        impressionsCount: 0,
        viewsCount: 0,
        clicksCount: 0,
        ctrPercent: 0,
        callsCount: 0,
        whatsappCount: 0,
        routesCount: 0,
        spentCents: Number(campaign?.spent_cents || 0),
        budgetCents: Number(campaign?.budget_cents || 0),
      };
    }

    let impressions = 0;
    let views = 0;
    let clicks = 0;
    let calls = 0;
    let whatsapp = 0;
    let routes = 0;

    for (const ev of events) {
      if (ev.event_type === 'impressao') impressions++;
      if (ev.event_type === 'visualizacao') views++;
      if (ev.event_type === 'clique') clicks++;
      if (ev.event_type === 'ligacao') calls++;
      if (ev.event_type === 'whatsapp') whatsapp++;
      if (ev.event_type === 'como_chegar') routes++;
    }

    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

    return {
      impressionsCount: impressions,
      viewsCount: views,
      clicksCount: clicks,
      ctrPercent: Math.round(ctr * 100) / 100,
      callsCount: calls,
      whatsappCount: whatsapp,
      routesCount: routes,
      spentCents: Number(campaign?.spent_cents || 0),
      budgetCents: Number(campaign?.budget_cents || 0),
    };
  }

  /**
   * Exportação Sanitizada de Métricas em CSV (LGPD-Compliant, Zero PII).
   */
  exportMetricsCsv(metrics: AdMetricsSummary, campaignName: string): string {
    const headers = 'Campanha;Impressões;Visualizações;Cliques;CTR (%);Ligações;WhatsApp;Como Chegar;Gasto (R$);Orçamento (R$)\n';
    const row = [
      `"${campaignName.replace(/"/g, '""')}"`,
      metrics.impressionsCount,
      metrics.viewsCount,
      metrics.clicksCount,
      `${metrics.ctrPercent.toFixed(2)}%`,
      metrics.callsCount,
      metrics.whatsappCount,
      metrics.routesCount,
      (metrics.spentCents / 100).toFixed(2),
      (metrics.budgetCents / 100).toFixed(2),
    ].join(';');

    return headers + row;
  }

  private mapCampaignRow(row: any): AdCampaign {
    return {
      id: row.id,
      advertiserId: row.advertiser_id,
      planId: row.plan_id,
      name: row.name,
      campaignType: row.campaign_type,
      scope: row.scope,
      targetUfs: row.target_ufs || [],
      targetCities: row.target_cities || [],
      targetNeighborhoods: row.target_neighborhoods || [],
      targetCategories: row.target_categories || [],
      targetContext: row.target_context || 'geral',
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      budgetCents: Number(row.budget_cents || 0),
      dailyBudgetCents: Number(row.daily_budget_cents || 0),
      spentCents: Number(row.spent_cents || 0),
      status: row.status,
      paymentStatus: row.payment_status || 'paid',
      rejectionReason: row.rejection_reason,
      moderatedBy: row.moderated_by,
      moderatedAt: row.moderated_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ==============================================================================
  // MÉTODOS FINANCEIROS E ASSINATURAS (Fase 18)
  // ==============================================================================

  /**
   * Executa checkout de contratação de anúncio com idempotência contábil,
   * cálculo de desconto por período e validação de cupom.
   */
  async createCheckout(params: import('./types').AdCheckoutParams): Promise<import('./types').AdCheckoutResult> {
    const { data, error } = await this.supabase.rpc('create_ad_checkout', {
      p_advertiser_id: params.advertiserId,
      p_plan_id: params.planId,
      p_campaign_id: params.campaignId || null,
      p_billing_period: params.billingPeriod,
      p_coupon_code: params.couponCode || null,
      p_payment_method: params.paymentMethod,
    });

    if (error) {
      return {
        success: false,
        subscriptionId: '',
        invoiceId: '',
        invoiceNumber: '',
        finalPriceCents: 0,
        dueDate: '',
        error: error.message,
      };
    }

    return {
      success: Boolean(data?.success),
      subscriptionId: data?.subscription_id,
      invoiceId: data?.invoice_id,
      invoiceNumber: data?.invoice_number,
      finalPriceCents: Number(data?.final_price_cents || 0),
      pixCopyPaste: data?.pix_copy_paste,
      pixQrCode: data?.pix_qr_code,
      dueDate: data?.due_date,
    };
  }

  /**
   * Processa Webhook do Gateway de Pagamento com Idempotência Estrita
   * e Ativação REAL (sem fake success).
   */
  async processWebhook(params: import('./types').AdWebhookEventParams): Promise<import('./types').AdWebhookResult> {
    const { data, error } = await this.supabase.rpc('process_ad_webhook', {
      p_provider_name: params.providerName,
      p_provider_event_id: params.providerEventId,
      p_event_type: params.eventType,
      p_provider_status: params.providerStatus,
      p_invoice_id: params.invoiceId,
      p_payload: params.payload || {},
    });

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: Boolean(data?.success),
      duplicate: Boolean(data?.duplicate),
      status: data?.status,
      subscriptionActivated: Boolean(data?.subscription_activated),
      campaignPaid: Boolean(data?.campaign_paid),
      receiptHash: data?.receipt_hash,
      message: data?.message,
    };
  }

  /**
   * Consulta faturas de anúncios (`ad_invoices`), respeitando RLS.
   */
  async getInvoices(advertiserId?: string): Promise<import('./types').AdInvoice[]> {
    let query = this.supabase
      .from('ad_invoices')
      .select('*')
      .order('created_at', { ascending: false });

    if (advertiserId) {
      query = query.eq('advertiser_id', advertiserId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Erro ao listar faturas: ${error.message}`);
    }

    return (data || []).map((row: any) => this.mapInvoiceRow(row));
  }

  /**
   * Consulta assinaturas de anúncios (`ad_subscriptions`).
   */
  async getSubscriptions(advertiserId?: string): Promise<import('./types').AdSubscription[]> {
    let query = this.supabase
      .from('ad_subscriptions')
      .select('*')
      .order('created_at', { ascending: false });

    if (advertiserId) {
      query = query.eq('advertiser_id', advertiserId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Erro ao listar assinaturas: ${error.message}`);
    }

    return (data || []).map((row: any) => this.mapSubscriptionRow(row));
  }

  /**
   * Consulta cupons de desconto ativos.
   */
  async getCoupons(): Promise<import('./types').AdCoupon[]> {
    const { data, error } = await this.supabase
      .from('ad_coupons')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Erro ao listar cupons: ${error.message}`);
    }

    return (data || []).map((c: any) => ({
      id: c.id,
      code: c.code,
      description: c.description,
      discountPercent: Number(c.discount_percent || 0),
      discountFixedCents: Number(c.discount_fixed_cents || 0),
      minPurchaseCents: Number(c.min_purchase_cents || 0),
      maxUses: c.max_uses,
      currentUses: Number(c.current_uses || 0),
      validFrom: c.valid_from,
      validUntil: c.valid_until,
      isActive: Boolean(c.is_active),
    }));
  }

  /**
   * Salva ou edita um cupom pelo Admin Master.
   */
  async saveCoupon(coupon: {
    id?: string;
    code: string;
    description?: string;
    discountPercent: number;
    maxUses?: number;
    validUntil?: string;
    isActive?: boolean;
  }): Promise<{ id: string }> {
    const payload: any = {
      code: coupon.code.toUpperCase().trim(),
      description: coupon.description || null,
      discount_percent: coupon.discountPercent,
      max_uses: coupon.maxUses || null,
      valid_until: coupon.validUntil || null,
      is_active: coupon.isActive !== undefined ? coupon.isActive : true,
      updated_at: new Date().toISOString(),
    };

    if (coupon.id) {
      const { data, error } = await this.supabase
        .from('ad_coupons')
        .update(payload)
        .eq('id', coupon.id)
        .select('id')
        .single();

      if (error) throw new Error(`Erro ao atualizar cupom: ${error.message}`);
      return { id: data.id };
    } else {
      const { data, error } = await this.supabase
        .from('ad_coupons')
        .insert(payload)
        .select('id')
        .single();

      if (error) throw new Error(`Erro ao criar cupom: ${error.message}`);
      return { id: data.id };
    }
  }

  /**
   * Consulta descontos por período configurados.
   */
  async getPeriodDiscounts(): Promise<import('./types').AdPeriodDiscount[]> {
    const { data, error } = await this.supabase
      .from('ad_period_discounts')
      .select('*')
      .order('months_count', { ascending: true });

    if (error) {
      throw new Error(`Erro ao buscar descontos de período: ${error.message}`);
    }

    return (data || []).map((d: any) => ({
      id: d.id,
      period: d.period,
      monthsCount: d.months_count,
      discountPercentage: Number(d.discount_percentage || 0),
      description: d.description,
      isActive: Boolean(d.is_active),
    }));
  }

  /**
   * Atualiza percentual de desconto de período pelo Admin Master.
   */
  async updatePeriodDiscount(period: string, discountPercentage: number): Promise<void> {
    const { error } = await this.supabase
      .from('ad_period_discounts')
      .update({
        discount_percentage: discountPercentage,
        updated_at: new Date().toISOString(),
      })
      .eq('period', period);

    if (error) {
      throw new Error(`Erro ao atualizar desconto de período: ${error.message}`);
    }
  }

  /**
   * Rotina de Inadimplência e Tolerância:
   * Verifica assinaturas vencidas, transiciona para past_due / suspended e congela campanhas.
   */
  async checkAndSuspendOverdueSubscriptions(): Promise<{ success: boolean; pastDueCount: number; suspendedCount: number }> {
    const { data, error } = await this.supabase.rpc('check_and_suspend_overdue_ad_subscriptions');

    if (error) {
      throw new Error(`Erro na verificação de inadimplência: ${error.message}`);
    }

    return {
      success: Boolean(data?.success),
      pastDueCount: Number(data?.past_due_count || 0),
      suspendedCount: Number(data?.suspended_count || 0),
    };
  }

  /**
   * Marca ou desmarca empresa do diretório como Empresa Verificada pelo Admin.
   */
  async toggleDirectoryVerified(providerId: string, isVerified: boolean, notes?: string): Promise<void> {
    const { error } = await this.supabase.rpc('admin_toggle_directory_verified', {
      p_provider_id: providerId,
      p_is_verified: isVerified,
      p_verification_notes: notes || null,
    });

    if (error) {
      throw new Error(`Erro ao atualizar verificação do prestador: ${error.message}`);
    }
  }

  /**
   * Gera HTML de Recibo / 2ª Via de Fatura para Impressão e Download em PDF.
   */
  generateInvoiceReceiptHtml(
    invoice: import('./types').AdInvoice,
    advertiser: Advertiser,
    planName: string = 'TeleVet Ads'
  ): string {
    const valorReais = (invoice.netAmountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const valorBruto = (invoice.grossAmountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const descontoReais = (invoice.discountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const isPago = invoice.status === 'paid';

    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Recibo TeleVet Ads - ${invoice.invoiceNumber}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1e293b; background: #fff; max-width: 800px; margin: 0 auto; }
          .header { border-bottom: 2px solid #2563eb; padding-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
          .logo { font-size: 24px; font-weight: 800; color: #2563eb; }
          .badge { padding: 6px 14px; border-radius: 9999px; font-size: 12px; font-weight: 800; text-transform: uppercase; }
          .badge-pago { background: #dcfce7; color: #15803d; }
          .badge-pendente { background: #fef3c7; color: #b45309; }
          .details { margin: 30px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
          .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          .table th { background: #f8fafc; text-align: left; padding: 12px; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0; }
          .table td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
          .total-box { margin-top: 30px; text-align: right; }
          .total-amount { font-size: 26px; font-weight: 800; color: #0f172a; }
          .auth-hash { margin-top: 40px; padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1; font-size: 11px; word-break: break-all; color: #64748b; }
          .nf-warning { margin-top: 15px; font-size: 12px; color: #94a3b8; font-style: italic; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo">TELEVET ADS</div>
            <div style="font-size: 12px; color: #64748b;">Publicidade e Patrocínios Veterinários</div>
          </div>
          <span class="badge ${isPago ? 'badge-pago' : 'badge-pendente'}">
            ${isPago ? 'FATURA PAGA' : 'AGUARDANDO PAGAMENTO'}
          </span>
        </div>

        <div class="details">
          <div>
            <strong>Tomador do Serviço (Anunciante):</strong><br>
            ${advertiser.razaoSocial}<br>
            CNPJ: ${advertiser.cnpj || 'Não informado'}<br>
            Contato: ${advertiser.contactName} (${advertiser.contactEmail})
          </div>
          <div>
            <strong>Fatura Nº:</strong> ${invoice.invoiceNumber}<br>
            <strong>Data de Emissão:</strong> ${new Date(invoice.createdAt).toLocaleDateString('pt-BR')}<br>
            <strong>Vencimento:</strong> ${new Date(invoice.dueDate).toLocaleDateString('pt-BR')}<br>
            <strong>Método:</strong> ${invoice.paymentMethod.toUpperCase()}
          </div>
        </div>

        <table class="table">
          <thead>
            <tr>
              <th>Item / Plano</th>
              <th>Valor Bruto</th>
              <th>Desconto</th>
              <th>Valor Líquido</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Assinatura ${planName}</strong><br><span style="font-size: 12px; color: #64748b;">Veiculação de anúncios na rede TeleVet</span></td>
              <td>${valorBruto}</td>
              <td style="color: #16a34a;">-${descontoReais}</td>
              <td><strong>${valorReais}</strong></td>
            </tr>
          </tbody>
        </table>

        <div class="total-box">
          <div style="font-size: 14px; color: #64748b;">Total Líquido Cobrado:</div>
          <div class="total-amount">${valorReais}</div>
        </div>

        <div class="auth-hash">
          <strong>CÓDIGO DE AUTENTICIDADE E AUDITORIA (SHA-256):</strong><br>
          ${invoice.receiptAuthHash || invoice.receiptToken}
          <div class="nf-warning">
            * Nota Fiscal de Serviços Eletrônica (NFS-e): Estrutura validada no banco de dados [PENDENTE DE INTEGRAÇÃO COM SEFAZ/PREFEITURA MUNICIPAL].
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private mapInvoiceRow(row: any): import('./types').AdInvoice {
    return {
      id: row.id,
      invoiceNumber: row.invoice_number,
      advertiserId: row.advertiser_id,
      subscriptionId: row.subscription_id,
      campaignId: row.campaign_id,
      planId: row.plan_id,
      grossAmountCents: Number(row.gross_amount_cents || 0),
      discountCents: Number(row.discount_cents || 0),
      netAmountCents: Number(row.net_amount_cents || 0),
      status: row.status,
      paymentMethod: row.payment_method || 'pix',
      pixQrCode: row.pix_qr_code,
      pixCopyPaste: row.pix_copy_paste,
      pixExpiresAt: row.pix_expires_at,
      providerName: row.provider_name || 'mercadopago',
      providerTransactionId: row.provider_transaction_id,
      providerStatus: row.provider_status || 'pending',
      providerStatusReason: row.provider_status_reason,
      dueDate: row.due_date,
      paidAt: row.paid_at,
      nfStatus: row.nf_status || 'pending_integration',
      nfNumber: row.nf_number,
      nfSeries: row.nf_series,
      nfVerificationCode: row.nf_verification_code,
      nfXmlUrl: row.nf_xml_url,
      nfPdfUrl: row.nf_pdf_url,
      nfErrorMessage: row.nf_error_message,
      taxIdCnpj: row.tax_id_cnpj,
      municipalTaxCode: row.municipal_tax_code,
      nfIssuedAt: row.nf_issued_at,
      receiptToken: row.receipt_token,
      receiptAuthHash: row.receipt_auth_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapSubscriptionRow(row: any): import('./types').AdSubscription {
    return {
      id: row.id,
      advertiserId: row.advertiser_id,
      planId: row.plan_id,
      campaignId: row.campaign_id,
      billingPeriod: row.billing_period,
      status: row.status,
      basePriceCents: Number(row.base_price_cents || 0),
      periodDiscountCents: Number(row.period_discount_cents || 0),
      couponDiscountCents: Number(row.coupon_discount_cents || 0),
      finalPriceCents: Number(row.final_price_cents || 0),
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      gracePeriodUntil: row.grace_period_until,
      autoRenew: Boolean(row.auto_renew),
      failedChargeAttempts: Number(row.failed_charge_attempts || 0),
      cancelledAt: row.cancelled_at,
      cancellationReason: row.cancellation_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

