import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface TeleconsultationSession {
  consultationId: string;
  status: 'ready';
  participantRole: 'tutor' | 'veterinarian';
  token: string;
  serverUrl: string;
  consultation: Record<string, unknown>;
}

export interface FinishConsultationInput {
  consultationId: string;
  anamnesis: string;
  physicalExam: string;
  diagnosis: string;
  clinicalConduct: string;
  privateNotes?: string;
}

export interface RecordingConsentInput {
  consultationId: string;
  consented: boolean;
  termsVersion?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RecordingConsentStatus {
  success: boolean;
  consultationId: string;
  userRole: 'tutor' | 'veterinarian' | 'admin';
  consented: boolean;
  tutorConsented: boolean;
  vetConsented: boolean;
  canRecord: boolean;
  recordingStatus: string;
}

export interface UrgencyTriageInput {
  appointmentId: string;
  signals: Record<string, boolean | string | number | null>;
  emergencyDetected: boolean;
  recommendedAction?: string;
}

export interface UrgencyTriageResult {
  success: boolean;
  appointmentId: string;
  emergencyDetected: boolean;
  recommendedAction: string | null;
  triagePassed: boolean;
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
   * Solicita um token efêmero à Edge Function, que valida participante, pagamento e janela.
   */
  async startRoom(consultationId: string): Promise<TeleconsultationSession> {
    const { data, error } = await this.supabase.functions.invoke('create-video-token', {
      body: { consultationId },
    });

    if (error) {
      const responseBody = await error.context?.json?.().catch(() => null);
      throw new Error(responseBody?.message || responseBody?.error || `Falha ao abrir sala de teleconsulta: ${error.message}`);
    }

    return {
      consultationId: data.consultation.consultation_id,
      status: data.status,
      participantRole: data.consultation.participant_role,
      token: data.token,
      serverUrl: data.serverUrl,
      consultation: data.consultation,
    };
  }

  /**
   * Registra a autorização prévia e inequívoca de gravação de um dos participantes (Tutor ou Vet)
   */
  async registerConsent(input: RecordingConsentInput): Promise<RecordingConsentStatus> {
    const { data, error } = await this.supabase.rpc('register_recording_consent', {
      p_consultation_id: input.consultationId,
      p_consented: input.consented,
      p_terms_version: input.termsVersion || 'v1.0-2026',
      p_ip_address: input.ipAddress || null,
      p_user_agent: input.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : null),
    });

    if (error) {
      throw new Error(`Falha ao registrar consentimento de gravação: ${error.message}`);
    }

    return {
      success: data.success,
      consultationId: data.consultation_id,
      userRole: data.user_role,
      consented: data.consented,
      tutorConsented: data.tutor_consented,
      vetConsented: data.vet_consented,
      canRecord: data.can_record,
      recordingStatus: data.recording_status,
    };
  }

  async registerUrgencyTriage(input: UrgencyTriageInput): Promise<UrgencyTriageResult> {
    const { data, error } = await this.supabase.rpc('register_telemedicine_triage', {
      p_appointment_id: input.appointmentId,
      p_signals: input.signals,
      p_emergency_detected: input.emergencyDetected,
      p_recommended_action: input.recommendedAction || null,
    });

    if (error) {
      throw new Error(`Falha ao registrar triagem de urgência: ${error.message}`);
    }

    return {
      success: data.success,
      appointmentId: data.appointment_id,
      emergencyDetected: data.emergency_detected,
      recommendedAction: data.recommended_action,
      triagePassed: data.triage_passed,
    };
  }

  async registerTelemedicineConsent(input: { appointmentId: string; consented: boolean; termsVersion?: string; ipAddress?: string; userAgent?: string }): Promise<{ success: boolean; consented: boolean; appointmentId: string; }> {
    const { data, error } = await this.supabase.rpc('register_telemedicine_consent', {
      p_appointment_id: input.appointmentId,
      p_consented: input.consented,
      p_terms_version: input.termsVersion || 'CFMV_2022_v1',
      p_ip_address: input.ipAddress || null,
      p_user_agent: input.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : null),
    });

    if (error) {
      throw new Error(`Falha ao registrar consentimento de telemedicina: ${error.message}`);
    }

    return {
      success: data.success,
      consented: data.consented,
      appointmentId: data.appointment_id,
    };
  }

  /**
   * Dispara o início da gravação no backend (exige consentimento mútuo prévio)
   */
  async startRecording(consultationId: string): Promise<{ status: string; egressId?: string }> {
    const { data, error } = await this.supabase.functions.invoke('start-video-recording', {
      body: { consultationId },
    });

    if (error) {
      const responseBody = await error.context?.json?.().catch(() => null);
      throw new Error(responseBody?.message || responseBody?.error || `Não foi possível iniciar a gravação: ${error.message}`);
    }

    return {
      status: data.status,
      egressId: data.egressId,
    };
  }

  async stopRecording(consultationId: string): Promise<void> {
    const { error } = await this.supabase.functions.invoke('stop-video-recording', {
      body: { consultationId },
    });

    if (error) {
      const responseBody = await error.context?.json?.().catch(() => null);
      throw new Error(responseBody?.message || responseBody?.error || `Não foi possível encerrar a gravação: ${error.message}`);
    }
  }

  /**
   * Finaliza a teleconsulta e salva a evolução no prontuário médico de forma atômica
   */
  async finishRoom(input: FinishConsultationInput): Promise<{ durationSeconds: number }> {
    const { data, error } = await this.supabase.functions.invoke('finish-video-consultation', {
      body: {
        consultationId: input.consultationId,
        anamnesis: input.anamnesis,
        physicalExam: input.physicalExam,
        diagnosis: input.diagnosis,
        clinicalConduct: input.clinicalConduct,
        privateNotes: input.privateNotes || null,
      },
    });

    if (error) {
          const responseBody = await error.context?.json?.().catch(() => null);
          throw new Error(responseBody?.error || `Erro ao finalizar atendimento: ${error.message}`);
    }

    return { durationSeconds: data.duration_seconds };
  }
}
