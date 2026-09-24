import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SaaSPlanDTO {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  maxTeamUsers: number;
  maxVeterinarians: number;
  maxConsultationsMonth: number;
  hasReports: boolean;
  hasMarketingTools: boolean;
  hasCoupons: boolean;
  hasWhatsappIntegration: boolean;
  hasCustomDomain: boolean;
  hasWhiteLabel: boolean;
  hasApiAccess: boolean;
  supportLevel: string;
}

import { getSupabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase-client';

export class SaaSPlanService {
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
   * Lista todos os planos SaaS disponíveis configurados pelo Administrador
   */
  async listPlans(): Promise<SaaSPlanDTO[]> {
    const { data, error } = await this.supabase
      .from('saas_plans')
      .select('*')
      .eq('is_active', true)
      .order('price_cents', { ascending: true });

    if (error) {
      throw new Error(`Erro ao listar planos: ${error.message}`);
    }

    return (data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      priceCents: p.price_cents,
      maxTeamUsers: p.max_team_users,
      maxVeterinarians: p.max_veterinarians,
      maxConsultationsMonth: p.max_consultations_month,
      hasReports: p.has_reports,
      hasMarketingTools: p.has_marketing_tools,
      hasCoupons: p.has_coupons,
      hasWhatsappIntegration: p.has_whatsapp_integration,
      hasCustomDomain: p.has_custom_domain,
      hasWhiteLabel: p.has_white_label,
      hasApiAccess: p.has_api_access,
      supportLevel: p.support_level,
    }));
  }

  /**
   * Contratação ou upgrade de plano SaaS para o Pet Shop
   */
  async subscribeTenant(tenantId: string, petshopId: string, planId: string): Promise<{ subscriptionId: string; status: string }> {
    const { data, error } = await this.supabase.rpc('subscribe_tenant_saas_plan', {
      p_tenant_id: tenantId,
      p_petshop_id: petshopId,
      p_plan_id: planId,
    });

    if (error) {
      throw new Error(`Erro ao contratar plano SaaS: ${error.message}`);
    }

    return {
      subscriptionId: data.subscription_id,
      status: data.status,
    };
  }

  /**
   * Checagem de permissão de recurso do plano (ex: 'custom_domain')
   */
  async hasFeaturePermission(tenantId: string, featureKey: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('check_tenant_feature_permission', {
      p_tenant_id: tenantId,
      p_feature_key: featureKey,
    });

    if (error) return false;
    return !!data;
  }
}
