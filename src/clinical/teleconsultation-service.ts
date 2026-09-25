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

export interface SaveRecordingInput {
  consultationId: string;
  recordingUrl: string;
  storagePath?: string;
  durationSeconds?: number;
  fileSizeBytes?: number;
  sha256Hash?: string;
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

  /**
   * Dispara o início da gravação no backend (exige consentimento mútuo prévio)
   */
  async startRecording(consultationId: string): Promise<{ success: boolean; startedAt: string }> {
    const { data, error } = await this.supabase.rpc('start_consultation_recording', {
      p_consultation_id: consultationId,
    });

    if (error) {
      throw new Error(`Não foi possível iniciar a gravação: ${error.message}`);
    }

    return {
      success: data.success,
      startedAt: data.started_at,
    };
  }

  /**
   * Salva os metadados da gravação, hash de integridade e vincula ao prontuário médico
   */
  async saveRecording(input: SaveRecordingInput): Promise<{ success: boolean; recordingUrl: string; durationSeconds: number }> {
    const { data, error } = await this.supabase.rpc('save_consultation_recording', {
      p_consultation_id: input.consultationId,
      p_recording_url: input.recordingUrl,
      p_storage_path: input.storagePath || null,
      p_duration_seconds: input.durationSeconds || 0,
      p_file_size_bytes: input.fileSizeBytes || 0,
      p_sha256_hash: input.sha256Hash || null,
    });

    if (error) {
      throw new Error(`Erro ao salvar gravação da teleconsulta: ${error.message}`);
    }

    return {
      success: data.success,
      recordingUrl: data.recording_url,
      durationSeconds: data.duration_seconds,
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
