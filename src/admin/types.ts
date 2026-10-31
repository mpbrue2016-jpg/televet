// ==============================================================================
// src/admin/types.ts
// Tipos e Interfaces da Fase 15: Admin Master, Analytics, Governança e Suporte
// ==============================================================================

export type AdminRole = 'superadmin' | 'finance_admin' | 'support_admin' | 'compliance_admin' | 'auditor';

export interface AdminRealAnalytics {
  financial: {
    mrrCents: number;
    arrCents: number;
    gmvCents: number;
    platformCommissionsCents: number;
    partnerCommissionsCents: number;
    refundsCents: number;
    netRevenueCents: number;
  };
  appointments: {
    total: number;
    scheduled: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    conversionRate: number;
    cancellationRate: number;
  };
  ecosystem: {
    tutorsCount: number;
    veterinariansTotal: number;
    veterinariansValidated: number;
    veterinariansPending: number;
    petshopsTotal: number;
    petshopsActive: number;
  };
  support: {
    ticketsOpen: number;
    ticketsSlaBreached: number;
  };
  regionalBreakdown: Array<{
    state_uf: string;
    partners_count: number;
  }>;
  insufficientDataNotes: string[];
}

export interface FinancialLedgerEntry {
  paymentId: string;
  appointmentId: string;
  tenantName: string;
  grossAmountCents: number;
  gatewayFeeCents: number;
  platformCommissionCents: number;
  petshopCommissionCents: number;
  veterinarianNetCents: number;
  status: string;
  createdAt: string;
}

export interface SupportTicketDetail {
  id: string;
  tenantId: string;
  userId: string;
  assignedToUserId?: string | null;
  title: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting_user' | 'resolved' | 'closed';
  slaResponseDueAt?: string | null;
  slaResolutionDueAt?: string | null;
  slaBreached: boolean;
  createdAt: string;
  updatedAt: string;
  userEmail?: string;
  userFullName?: string;
}

export interface SupportTicketMessage {
  id: string;
  ticketId: string;
  userId: string;
  isInternalNote: boolean;
  message: string;
  createdAt: string;
  senderName?: string;
}

export interface SponsorCampaign {
  id: string;
  name: string;
  companyName?: string;
  campaignType: 'banner' | 'featured_brand' | 'sponsored_article';
  targetAudience: 'all' | 'tutors' | 'veterinarians' | 'petshops';
  title: string;
  targetUrl: string;
  bannerImageUrl?: string;
  budgetCents: number;
  spentCents: number;
  impressionsCount: number;
  clicksCount: number;
  status: 'active' | 'paused' | 'completed';
}

export interface GlobalGovernanceSettings {
  platformName: string;
  defaultTrialDays: number;
  defaultCancellationHours: number;
  gatewayFeePercent: number;
  gatewayFeeFixedCents: number;
  requireCrmvAutoValidation: boolean;
  maintenanceMode: boolean;
  supportEmail: string;
  featureFlags: Record<string, boolean>;
  termsVersion: string;
  privacyPolicyVersion: string;
}
