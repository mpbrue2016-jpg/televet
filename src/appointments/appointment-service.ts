import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type AppointmentStatus = 
  | 'solicitado'
  | 'aguardando_pagamento'
  | 'confirmado'
  | 'realizado'
  | 'cancelado'
  | 'reembolsado'
  | 'no_show';

export interface BookAppointmentInput {
  tenantId: string;
  petshopId: string;
  tutorId: string;
  petId: string;
  veterinarianId: string;
  specialtyId: string;
  scheduledFor: string; // ISO String
  reasonForVisit?: string;
}

import { getSupabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase-client';

export class AppointmentService {
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
   * Obtém horários disponíveis de um veterinário em uma data
   */
  async getAvailableSlots(veterinarianId: string, dateIso: string): Promise<Array<{ time: string; duration: number; available: boolean }>> {
    const { data, error } = await this.supabase.rpc('get_available_appointment_slots', {
      p_veterinarian_id: veterinarianId,
      p_date: dateIso,
    });

    if (error) {
      throw new Error(`Erro ao obter horários livres: ${error.message}`);
    }

    return (data || []).map((slot: any) => ({
      time: slot.slot_time,
      duration: slot.duration_minutes,
      available: slot.is_available,
    }));
  }

  /**
   * Realiza a reserva de consulta garantindo rastreabilidade do Pet Shop de origem
   */
  async bookAppointment(input: BookAppointmentInput): Promise<{ appointmentId: string; priceCents: number; status: AppointmentStatus }> {
    const { data, error } = await this.supabase.rpc('book_appointment', {
      p_tenant_id: input.tenantId,
      p_petshop_id: input.petshopId,
      p_tutor_id: input.tutorId,
      p_pet_id: input.petId,
      p_veterinarian_id: input.veterinarianId,
      p_specialty_id: input.specialtyId,
      p_scheduled_for: input.scheduledFor,
      p_reason_for_visit: input.reasonForVisit || null,
    });

    if (error) {
      throw new Error(`Erro ao agendar consulta: ${error.message}`);
    }

    return {
      appointmentId: data.appointment_id,
      priceCents: data.price_cents,
      status: data.status,
    };
  }

  /**
   * Cancelamento de agendamento
   */
  async cancelAppointment(appointmentId: string, reason?: string): Promise<void> {
    const { error } = await this.supabase.rpc('cancel_appointment', {
      p_appointment_id: appointmentId,
      p_cancellation_reason: reason || null,
    });

    if (error) {
      throw new Error(`Erro ao cancelar agendamento: ${error.message}`);
    }
  }

  /**
   * Reagendamento para nova data e horário
   */
  async rescheduleAppointment(appointmentId: string, newScheduledFor: string): Promise<void> {
    const { error } = await this.supabase.rpc('reschedule_appointment', {
      p_appointment_id: appointmentId,
      p_new_scheduled_for: newScheduledFor,
    });

    if (error) {
      throw new Error(`Erro ao reagendar consulta: ${error.message}`);
    }
  }
}
