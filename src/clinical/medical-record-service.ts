import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface MedicationItem {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  route: 'oral' | 'topical' | 'injectable' | 'ophthalmic' | 'otic';
  instructions?: string;
}

export interface PrescriptionDTO {
  id: string;
  consultationId: string;
  petName: string;
  veterinarianName: string;
  crmv: string;
  medications: MedicationItem[];
  recommendations?: string;
  validationCode: string;
  signedAt: string;
  expiresAt: string;
}

import { getSupabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase-client';

export class MedicalRecordService {
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
   * Emite uma receita digital com código de validação público
   */
  async issuePrescription(
    consultationId: string,
    medications: MedicationItem[],
    recommendations?: string
  ): Promise<{ prescriptionId: string; validationCode: string; expiresAt: string }> {
    const { data, error } = await this.supabase.rpc('issue_digital_prescription', {
      p_consultation_id: consultationId,
      p_medications: medications,
      p_recommendations: recommendations || null,
    });

    if (error) {
      throw new Error(`Erro ao emitir prescrição digital: ${error.message}`);
    }

    return {
      prescriptionId: data.prescription_id,
      validationCode: data.validation_code,
      expiresAt: data.expires_at,
    };
  }

  /**
   * Registra um exame complementar associado ao Pet e à Consulta
   */
  async requestExam(
    tenantId: string,
    consultationId: string,
    petId: string,
    veterinarianId: string,
    title: string,
    category: string,
    justification?: string
  ): Promise<string> {
    const { data, error } = await this.supabase
      .from('exams')
      .insert({
        tenant_id: tenantId,
        consultation_id: consultationId,
        pet_id: petId,
        veterinarian_id: veterinarianId,
        title,
        category,
        clinical_justification: justification,
        status: 'requested',
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Erro ao solicitar exame: ${error.message}`);
    }

    return data.id;
  }

  /**
   * Cria um encaminhamento clínico para especialista
   */
  async createReferral(
    tenantId: string,
    consultationId: string,
    veterinarianId: string,
    petId: string,
    specialtyId: string,
    reason: string,
    priority: 'routine' | 'urgent' | 'emergency' = 'routine'
  ): Promise<string> {
    const { data, error } = await this.supabase
      .from('referrals_clinical')
      .insert({
        tenant_id: tenantId,
        consultation_id: consultationId,
        veterinarian_id: veterinarianId,
        pet_id: petId,
        specialty_id: specialtyId,
        reason,
        priority,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Erro ao criar encaminhamento clínico: ${error.message}`);
    }

    return data.id;
  }
}
