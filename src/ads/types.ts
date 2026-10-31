// ==============================================================================
// src/ads/types.ts
// Tipos e Interfaces do TeleVet Ads (Fase 17 e Fase 18)
// Publicidade, Assinaturas, Checkout, Faturas e Contabilidade de Ads
// ==============================================================================

export type CampaignScope = 'bairro' | 'cidade' | 'regiao' | 'regional' | 'estado' | 'conjunto_estados' | 'nacional';

export type CampaignType =
  | 'banner'
  | 'destaque_busca'
  | 'destaque_regional'
  | 'estadual'
  | 'nacional'
  | 'pagina_patrocinada'
  | 'campanha_categoria'
  | 'campanha_localizacao';

export type CampaignStatus =
  | 'rascunho'
  | 'aguardando_aprovacao'
  | 'aprovado'
  | 'ativo'
  | 'pausado'
  | 'rejeitado'
  | 'expirado';

export type CreativeFormat =
  | 'banner_horizontal'
  | 'banner_vertical'
  | 'banner_quadrado'
  | 'card_destaque'
  | 'pagina_patrocinada';

export type AdEventType =
  | 'impressao'
  | 'visualizacao'
  | 'clique'
  | 'ligacao'
  | 'whatsapp'
  | 'como_chegar';

export type AdSubscriptionStatus =
  | 'pending'
  | 'active'
  | 'past_due'
  | 'suspended'
  | 'cancelled'
  | 'expired';

export type AdInvoiceStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'refunded';

export type AdBillingPeriod =
  | 'monthly'
  | 'quarterly'
  | 'semiannual'
  | 'yearly';

export type AdNfStatus =
  | 'pending_integration'
  | 'issued'
  | 'error'
  | 'cancelled';

export interface AdPlan {
  id: string;
  slug: string;
  name: string;
  description?: string;
  priceCents: number; // Definido pelo Admin Master
  billingCycle: 'monthly' | 'quarterly' | 'yearly' | 'cpm' | 'cpc';
  maxActiveCampaigns: number;
  maxImpressionsMonthly?: number | null;
  allowedScopes: CampaignScope[];
  features: Record<string, boolean>;
  isActive: boolean;
  displayOrder: number;
}

export interface Advertiser {
  id: string;
  ownerUserId?: string | null;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj?: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
  contactWhatsapp?: string | null;
  websiteUrl?: string | null;
  balanceCents: number;
  status: 'active' | 'suspended' | 'pending_verification';
  createdAt: string;
  updatedAt: string;
}

export interface AdCampaign {
  id: string;
  advertiserId: string;
  planId?: string | null;
  name: string;
  campaignType: CampaignType;
  scope: CampaignScope;
  targetUfs: string[];
  targetCities: string[];
  targetNeighborhoods: string[];
  targetCategories: string[]; // Apenas categorias do diretório
  targetContext: 'busca' | 'diretorio' | 'home' | 'geral';
  startsAt: string;
  endsAt?: string | null;
  budgetCents: number;
  dailyBudgetCents: number;
  spentCents: number;
  status: CampaignStatus;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  rejectionReason?: string | null;
  moderatedBy?: string | null;
  moderatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdCreative {
  id: string;
  campaignId: string;
  format: CreativeFormat;
  title: string;
  description?: string;
  imageUrl: string;
  targetUrl: string;
  callToAction: string;
  phone?: string | null;
  whatsapp?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ServedAd {
  adId: string;
  campaignId: string;
  creativeId: string;
  advertiserName: string;
  title: string;
  description?: string;
  imageUrl: string;
  targetUrl: string;
  callToAction: string;
  phone?: string | null;
  whatsapp?: string | null;
  format: CreativeFormat;
  badgeLabel: 'PATROCINADO' | 'ANÚNCIO'; // Não removível pelo CSS do anunciante
}

export interface ServeAdsParams {
  placement: string;
  uf?: string;
  cidade?: string;
  bairro?: string;
  categoria?: string;
  limit?: number;
}

export interface AdMetricsSummary {
  impressionsCount: number;
  viewsCount: number;
  clicksCount: number;
  ctrPercent: number;
  callsCount: number;
  whatsappCount: number;
  routesCount: number;
  spentCents: number;
  budgetCents: number;
}

// ==============================================================================
// Tipos Financeiros de Ads (Fase 18)
// ==============================================================================

export interface AdPeriodDiscount {
  id: string;
  period: AdBillingPeriod;
  monthsCount: number;
  discountPercentage: number;
  description?: string;
  isActive: boolean;
}

export interface AdCoupon {
  id: string;
  code: string;
  description?: string;
  discountPercent: number;
  discountFixedCents: number;
  minPurchaseCents: number;
  maxUses?: number | null;
  currentUses: number;
  validFrom: string;
  validUntil?: string | null;
  isActive: boolean;
}

export interface AdSubscription {
  id: string;
  advertiserId: string;
  planId: string;
  campaignId?: string | null;
  billingPeriod: AdBillingPeriod;
  status: AdSubscriptionStatus;
  basePriceCents: number;
  periodDiscountCents: number;
  couponDiscountCents: number;
  finalPriceCents: number;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  gracePeriodUntil?: string | null;
  autoRenew: boolean;
  failedChargeAttempts: number;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdInvoice {
  id: string;
  invoiceNumber: string;
  advertiserId: string;
  subscriptionId?: string | null;
  campaignId?: string | null;
  planId?: string | null;
  grossAmountCents: number;
  discountCents: number;
  netAmountCents: number;
  status: AdInvoiceStatus;
  paymentMethod: 'pix' | 'credit_card' | 'boleto';
  pixQrCode?: string | null;
  pixCopyPaste?: string | null;
  pixExpiresAt?: string | null;
  providerName: string;
  providerTransactionId?: string | null;
  providerStatus: string;
  providerStatusReason?: string | null;
  dueDate: string;
  paidAt?: string | null;
  // Estrutura Fiscal
  nfStatus: AdNfStatus;
  nfNumber?: string | null;
  nfSeries?: string | null;
  nfVerificationCode?: string | null;
  nfXmlUrl?: string | null;
  nfPdfUrl?: string | null;
  nfErrorMessage?: string | null;
  taxIdCnpj?: string | null;
  municipalTaxCode?: string | null;
  nfIssuedAt?: string | null;
  // Recibo
  receiptToken: string;
  receiptAuthHash?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdLedgerEntry {
  id: string;
  advertiserId: string;
  invoiceId?: string | null;
  subscriptionId?: string | null;
  eventType: string;
  amountCents: number;
  direction: 'credit' | 'debit' | 'none';
  balanceAfterCents: number;
  description?: string;
  createdAt: string;
}

export interface AdCheckoutParams {
  advertiserId: string;
  planId: string;
  campaignId?: string | null;
  billingPeriod: AdBillingPeriod;
  couponCode?: string | null;
  paymentMethod: 'pix' | 'credit_card' | 'boleto';
}

export interface AdCheckoutResult {
  success: boolean;
  subscriptionId: string;
  invoiceId: string;
  invoiceNumber: string;
  finalPriceCents: number;
  pixCopyPaste?: string;
  pixQrCode?: string;
  dueDate: string;
  error?: string;
}

export interface AdWebhookEventParams {
  providerName: string;
  providerEventId: string;
  eventType: string;
  providerStatus: string;
  invoiceId: string;
  payload?: Record<string, unknown>;
}

export interface AdWebhookResult {
  success: boolean;
  duplicate?: boolean;
  status?: string;
  subscriptionActivated?: boolean;
  campaignPaid?: boolean;
  receiptHash?: string;
  message?: string;
  error?: string;
}

/**
 * Campos estritamente PROIBIDOS de serem usados na segmentação de publicidade.
 * O TeleVet Ads nunca acessa ou segmenta por dados clínicos do pet ou dados pessoais do tutor.
 */
export const FORBIDDEN_CLINICAL_FIELDS = [
  'prontuario',
  'prontuário',
  'clinical_history',
  'diagnostico',
  'diagnóstico',
  'diagnosis',
  'symptom',
  'sintoma',
  'vacina',
  'vaccine',
  'pet_id',
  'pet_name',
  'raca',
  'raça',
  'breed',
  'especie',
  'espécie',
  'species',
  'tutor_cpf',
  'tutor_id',
] as const;
