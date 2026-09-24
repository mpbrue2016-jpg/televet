import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CrmvStatus } from './crmv-adapter';

export interface MarketplaceVeterinarian {
  veterinarianId: string;
  fullName: string;
  email: string;
  avatarUrl?: string;
  bio?: string;
  city?: string;
  stateUf?: string;
  education?: string;
  experienceYears: number;
  consultationFeeCents: number;
  consultationDurationMinutes: number;
  supportedModalities: string[];
  ratingAverage: number;
  totalReviews: number;
  crmvNumber: string;
  crmvUf: string;
  crmvStatus: CrmvStatus;
  specialties: Array<{ id: string; name: string; icon: string }>;
  nextAvailableSlots?: string[];
}

export interface SearchVeterinariansFilters {
  specialtyId?: string;
  stateUf?: string;
  maxPriceCents?: number;
  modality?: 'teleconsultation' | 'presential_clinic' | 'presential_home';
  limit?: number;
  offset?: number;
}

import { getSupabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase-client';

export class VeterinarianService {
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
   * Busca veterinários no marketplace aplicando filtros e a regra obrigatória de CRMV Validado
   */
  async searchMarketplace(filters: SearchVeterinariansFilters = {}): Promise<MarketplaceVeterinarian[]> {
    const { data, error } = await this.supabase.rpc('search_marketplace_veterinarians', {
      p_specialty_id: filters.specialtyId || null,
      p_state_uf: filters.stateUf || null,
      p_max_price_cents: filters.maxPriceCents || null,
      p_modality: filters.modality || null,
      p_limit: filters.limit || 20,
      p_offset: filters.offset || 0,
    });

    if (error) {
      throw new Error(`Erro ao buscar profissionais no marketplace: ${error.message}`);
    }

    if (!data) return [];

    return data.map((item: any) => ({
      veterinarianId: item.veterinarian_id,
      fullName: item.full_name,
      email: item.email,
      avatarUrl: item.avatar_url,
      bio: item.bio,
      city: item.city,
      stateUf: item.state_uf,
      education: item.education,
      experienceYears: item.experience_years || 0,
      consultationFeeCents: item.consultation_fee_cents,
      consultationDurationMinutes: item.consultation_duration_minutes,
      supportedModalities: item.supported_modalities || ['teleconsultation'],
      ratingAverage: Number(item.rating_average),
      totalReviews: item.total_reviews,
      crmvNumber: item.crmv_number,
      crmvUf: item.crmv_uf,
      crmvStatus: item.crmv_status,
      specialties: item.specialties || [],
      nextAvailableSlots: [
        'Hoje às 14:00',
        'Hoje às 16:30',
        'Amanhã às 10:00'
      ],
    }));
  }

  /**
   * Atualização de preço, duração e modalidades do profissional
   */
  async updatePricingAndModality(
    veterinarianId: string, 
    feeCents: number, 
    durationMinutes: number, 
    modalities: string[]
  ): Promise<void> {
    const { error } = await this.supabase
      .from('veterinarians')
      .update({
        consultation_fee_cents: feeCents,
        consultation_duration_minutes: durationMinutes,
        supported_modalities: modalities,
        updated_at: new Date().toISOString(),
      })
      .eq('id', veterinarianId);

    if (error) {
      throw new Error(`Erro ao atualizar dados de preço: ${error.message}`);
    }
  }

  /**
   * Configuração de grade de horários de atendimento semanal
   */
  async setWeeklySchedule(
    veterinarianId: string,
    schedules: Array<{ dayOfWeek: number; startTime: string; endTime: string; slotDurationMinutes?: number }>
  ): Promise<void> {
    // Remove horários existentes anteriores
    await this.supabase
      .from('veterinarian_schedules')
      .delete()
      .eq('veterinarian_id', veterinarianId);

    // Insere nova grade
    const rows = schedules.map(s => ({
      veterinarian_id: veterinarianId,
      day_of_week: s.dayOfWeek,
      start_time: s.startTime,
      end_time: s.endTime,
      slot_duration_minutes: s.slotDurationMinutes || 45,
    }));

    const { error } = await this.supabase
      .from('veterinarian_schedules')
      .insert(rows);

    if (error) {
      throw new Error(`Erro ao salvar grade de horários: ${error.message}`);
    }
  }
}
