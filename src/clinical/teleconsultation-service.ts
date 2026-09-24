import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface TeleconsultationSession {
  consultationId: string;
  status: 'waiting_room' | 'active' | 'finished' | 'interrupted';
  tutorToken: string;
  vetToken: string;
  roomUrl: string;
}

export interface FinishConsultationInput {
  consultationId: string;
  anamnesis: string;
  physicalExam: string;
  diagnosis: string;
  clinicalConduct: string;
  privateNotes?: string;
}

import { getSupabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase-client';

export class TeleconsultationService {
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
   * Inicializa a sala virtual de atendimento e gera tokens efêmeros de acesso
   */
  async startRoom(consultationId: string): Promise<TeleconsultationSession> {
    const { data, error } = await this.supabase.rpc('start_teleconsultation', {
      p_consultation_id: consultationId,
    });

    if (error) {
      throw new Error(`Falha ao abrir sala de teleconsulta: ${error.message}`);
    }

    return {
      consultationId: data.consultation_id,
      status: data.status,
      tutorToken: data.tutor_token,
      vetToken: data.vet_token,
      roomUrl: data.room_url,
    };
  }

  /**
   * Finaliza a teleconsulta e salva a evolução no prontuário médico de forma atômica
   */
  async finishRoom(input: FinishConsultationInput): Promise<{ durationSeconds: number }> {
    const { data, error } = await this.supabase.rpc('finish_teleconsultation', {
      p_consultation_id: input.consultationId,
      p_anamnesis: input.anamnesis,
      p_physical_exam: input.physicalExam,
      p_diagnosis: input.diagnosis,
      p_clinical_conduct: input.clinicalConduct,
      p_private_notes: input.privateNotes || null,
    });

    if (error) {
      throw new Error(`Erro ao finalizar atendimento: ${error.message}`);
    }

    return { durationSeconds: data.duration_seconds };
  }
}
