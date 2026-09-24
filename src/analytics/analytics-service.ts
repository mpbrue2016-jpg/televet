import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface AdminMasterMetrics {
  financial: {
    mrrCents: number;
    arrCents: number;
    gmvCents: number;
    commissionsCents: number;
    refundsCents: number;
    totalRevenueCents: number;
  };
  petshops: {
    total: number;
    active: number;
    trial: number;
    inadimplente: number;
    canceled: number;
  };
  veterinarians: {
    total: number;
    validated: number;
    pending: number;
  };
  appointments: {
    scheduled: number;
    paid: number;
    completed: number;
    cancelled: number;
  };
  ecosystem: {
    tutorsCount: number;
    petsCount: number;
    clinicsCount: number;
  };
}

import { getSupabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase-client';

export class AnalyticsService {
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
   * Obtém métricas executivas completas para o Dashboard do Administrador Master
   */
  async getAdminMasterMetrics(): Promise<AdminMasterMetrics> {
    const { data, error } = await this.supabase.rpc('get_admin_master_metrics');

    if (error) {
      throw new Error(`Erro ao obter métricas de administrador: ${error.message}`);
    }

    return {
      financial: {
        mrrCents: data.financial.mrr_cents,
        arrCents: data.financial.arr_cents,
        gmvCents: data.financial.gmv_cents,
        commissionsCents: data.financial.commissions_cents,
        refundsCents: data.financial.refunds_cents,
        totalRevenueCents: data.financial.total_revenue_cents,
      },
      petshops: data.petshops,
      veterinarians: data.veterinarians,
      appointments: data.appointments,
      ecosystem: {
        tutorsCount: data.ecosystem.tutors_count,
        petsCount: data.ecosystem.pets_count,
        clinicsCount: data.ecosystem.clinics_count,
      },
    };
  }

  /**
   * Obtém métricas operacionais e de comissão para o Pet Shop
   */
  async getPetShopMetrics(tenantId: string): Promise<any> {
    const { data, error } = await this.supabase.rpc('get_petshop_dashboard_metrics', {
      p_tenant_id: tenantId,
    });

    if (error) {
      throw new Error(`Erro ao obter métricas do Pet Shop: ${error.message}`);
    }

    return data;
  }

  /**
   * Obtém agenda, métricas financeiras e reputação do Médico Veterinário
   */
  async getVeterinarianMetrics(veterinarianId: string): Promise<any> {
    const { data, error } = await this.supabase.rpc('get_veterinarian_dashboard_metrics', {
      p_veterinarian_id: veterinarianId,
    });

    if (error) {
      throw new Error(`Erro ao obter métricas do veterinário: ${error.message}`);
    }

    return data;
  }

  /**
   * Obtém pets, próxima teleconsulta e receitas do Tutor
   */
  async getTutorMetrics(tutorId: string): Promise<any> {
    const { data, error } = await this.supabase.rpc('get_tutor_dashboard_metrics', {
      p_tutor_id: tutorId,
    });

    if (error) {
      throw new Error(`Erro ao obter painel do tutor: ${error.message}`);
    }

    return data;
  }
}
