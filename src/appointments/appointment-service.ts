import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type AppointmentStatus = 
  | 'solicitado'
  | 'aguardando_pagamento'
  | 'confirmado'
  | 'realizado'
  | 'cancelado'
  | 'reembolsado'
  | 'no_show';

export type AppointmentReservationStatus =
  | 'available'
  | 'reserved'
  | 'awaiting_payment'
  | 'confirmed'
  | 'in_attendance'
  | 'completed'
  | 'cancelled'
  | 'rescheduled'
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

export interface TelemedicineBookingCheck {
  allowed: boolean;
  reason: string;
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

  async canBookTeleconsultation(petId: string, veterinarianId: string): Promise<TelemedicineBookingCheck> {
    const { data, error } = await this.supabase.rpc('can_book_teleconsultation', {
      p_pet_id: petId,
      p_veterinarian_id: veterinarianId,
    });

    if (error) {
      throw new Error(`Erro ao validar teleconsulta: ${error.message}`);
    }

    return {
      allowed: Boolean(data?.allowed ?? data),
      reason: data?.reason ?? 'A relação prévia veterinário-animal-responsável está válida.',
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

  /**
   * Reserva um slot com hold de 10 minutos para evitar duplicidade de agenda em concorrência.
   */
  async reserveAppointmentSlot(appointmentId: string, holdMinutes = 10): Promise<{ status: AppointmentReservationStatus; holdExpiresAt: string | null }> {
    const { data, error } = await this.supabase.rpc('reserve_appointment_slot', {
      p_appointment_id: appointmentId,
      p_hold_minutes: holdMinutes,
    });

    if (error) {
      throw new Error(`Erro ao reservar horário: ${error.message}`);
    }

    return {
      status: data?.status ?? 'reserved',
      holdExpiresAt: data?.hold_expires_at ?? null,
    };
  }

  /**
   * Confirma a reserva, validando transição de status do agendamento.
   */
  async confirmAppointmentReservation(appointmentId: string): Promise<{ status: AppointmentReservationStatus }> {
    const { data, error } = await this.supabase.rpc('confirm_appointment_reservation', {
      p_appointment_id: appointmentId,
    });

    if (error) {
      throw new Error(`Erro ao confirmar agendamento: ${error.message}`);
    }

    return {
      status: data?.status ?? 'confirmed',
    };
  }
}
