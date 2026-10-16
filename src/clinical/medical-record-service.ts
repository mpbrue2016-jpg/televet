import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface MedicationItem {
  catalogId: string;
  dosage: string;
  frequency: string;
  duration: string;
  route: 'oral' | 'topical' | 'injectable' | 'ophthalmic' | 'otic' | 'other';
  instructions?: string;
}

export interface MedicalTimelineEvent extends Record<string, unknown> {
  id: string;
  kind: 'medical_record' | 'exam' | 'prescription' | 'referral' | 'document';
  title: string;
  created_at: string;
}

export interface PetMedicalTimeline {
  pet: {
    id: string;
    tenant_id: string;
    name: string;
    species: string;
    breed: string | null;
    sex: string | null;
    birth_date: string | null;
    weight_kg: number | null;
    microchip_number: string | null;
    allergies: string | null;
    chronic_conditions: string | null;
  };
  viewer_role: 'tutor' | 'veterinarian' | 'admin';
  can_write: boolean;
  timeline: MedicalTimelineEvent[];
}

export interface MedicalTimelineFilters {
  from?: string;
  to?: string;
  veterinarianId?: string;
  eventType?: string;
  search?: string;
}

export interface SignedMedicalRecordInput {
  petId: string;
  title: string;
  complaint: string;
  anamnesis: string;
  physicalExam: string;
  assessment: string;
  diagnosis: string;
  plan: string;
  vitalSigns?: Record<string, number | string | null>;
  followUpAt?: string;
  observations?: string;
}

export interface MedicationCatalogItem {
  id: string;
  name: string;
  active_ingredient: string;
  presentation: string;
  species: string[];
  requires_qualified_signature: boolean;
}

export interface PetRecordAccessControls {
  grants: Array<{
    grant_id: string;
    veterinarian_id: string;
    veterinarian_name: string;
    crmv_number: string | null;
    crmv_uf: string | null;
    scopes: string[];
    granted_at: string;
    expires_at: string;
    revoked_at: string | null;
  }>;
  veterinarian_candidates: Array<{
    veterinarian_id: string;
    name: string;
    crmv_number: string;
    crmv_uf: string;
  }>;
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

export interface SpecialtyOption {
  id: string;
  name: string;
}

export interface ReferralInput {
  petId: string;
  specialtyId: string;
  reason: string;
  clinicalSummary?: string;
  priority?: 'routine' | 'urgent' | 'emergency';
  consultationId?: string;
}

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
  ): Promise<
    | { status: 'issued'; prescriptionId: string; validationCode: string; expiresAt: string; signatureKind: string }
    | { status: 'pending_configuration'; message: string; signatureRequestId: string }
  > {
    const { data, error } = await this.supabase.rpc('issue_digital_prescription', {
      p_consultation_id: consultationId,
      p_medications: medications.map((medication) => ({
        catalog_id: medication.catalogId,
        dosage: medication.dosage,
        frequency: medication.frequency,
        duration: medication.duration,
        route: medication.route,
        instructions: medication.instructions ?? null,
      })),
      p_recommendations: recommendations || null,
      p_digital_signature_hash: null,
    });

    if (error) {
      throw new Error(`Erro ao emitir prescrição digital: ${error.message}`);
    }

    if (data?.status === 'pending_configuration') {
      return {
        status: 'pending_configuration',
        message: data.message,
        signatureRequestId: data.signature_request_id,
      };
    }

    return {
      status: 'issued',
      prescriptionId: data.prescription_id,
      validationCode: data.validation_code,
      expiresAt: data.expires_at,
      signatureKind: data.signature_kind,
    };
  }

  async requestExam(
    petId: string,
    title: string,
    category: string,
    justification?: string,
    consultationId?: string,
    medicalRecordId?: string,
  ): Promise<string> {
    const { data, error } = await this.supabase.rpc('request_clinical_exam', {
      p_pet_id: petId,
      p_title: title,
      p_category: category,
      p_justification: justification ?? null,
      p_consultation_id: consultationId ?? null,
      p_medical_record_id: medicalRecordId ?? null,
    });

    if (error) {
      throw new Error(`Erro ao solicitar exame: ${error.message}`);
    }

    return data;
  }

  async getPetTimeline(petId: string, filters: MedicalTimelineFilters = {}): Promise<PetMedicalTimeline> {
    const { data, error } = await this.supabase.rpc('get_pet_medical_timeline', {
      p_pet_id: petId,
      p_from: filters.from ?? null,
      p_to: filters.to ?? null,
      p_veterinarian_id: filters.veterinarianId ?? null,
      p_event_type: filters.eventType ?? null,
      p_search: filters.search?.trim() || null,
    });
    if (error) throw new Error(`Não foi possível carregar o prontuário: ${error.message}`);
    return data as PetMedicalTimeline;
  }

  async getAccessLog(petId: string): Promise<Array<Record<string, unknown>>> {
    const { data, error } = await this.supabase.rpc('get_pet_record_access_log', { p_pet_id: petId });
    if (error) throw new Error(`Não foi possível consultar os acessos ao prontuário: ${error.message}`);
    return (data ?? []) as Array<Record<string, unknown>>;
  }

  async getAccessControls(petId: string): Promise<PetRecordAccessControls> {
    const { data, error } = await this.supabase.rpc('get_pet_record_access_controls', {
      p_pet_id: petId,
    });
    if (error) throw new Error(`Não foi possível carregar as autorizações: ${error.message}`);
    return data as PetRecordAccessControls;
  }

  async createSignedRecord(input: SignedMedicalRecordInput): Promise<{ recordId: string; signedAt: string }> {
    const { data, error } = await this.supabase.rpc('create_signed_medical_record', {
      p_pet_id: input.petId,
      p_title: input.title,
      p_complaint: input.complaint,
      p_anamnesis: input.anamnesis,
      p_physical_exam: input.physicalExam,
      p_assessment: input.assessment,
      p_diagnosis: input.diagnosis,
      p_plan: input.plan,
      p_vital_signs: input.vitalSigns ?? {},
      p_follow_up_at: input.followUpAt ?? null,
      p_observations: input.observations ?? null,
    });
    if (error) throw new Error(`Não foi possível assinar o registro clínico: ${error.message}`);
    return { recordId: data.record_id, signedAt: data.signed_at };
  }

  async addAddendum(input: { recordId: string; reason: string; content: string }): Promise<string> {
    const { data, error } = await this.supabase.rpc('append_medical_record_addendum', {
      p_medical_record_id: input.recordId,
      p_reason: input.reason,
      p_content: input.content,
    });
    if (error) throw new Error(`Não foi possível registrar o adendo: ${error.message}`);
    return data;
  }

  async requestAccess(input: { petId: string; veterinarianId: string; scopes: string[]; expiresAt: string }): Promise<string> {
    const { data, error } = await this.supabase.rpc('request_medical_record_access', {
      p_pet_id: input.petId,
      p_veterinarian_id: input.veterinarianId,
      p_scopes: input.scopes,
      p_expires_at: input.expiresAt,
    });
    if (error) throw new Error(`Não foi possível autorizar o acesso: ${error.message}`);
    return data;
  }

  async revokeAccess(grantId: string): Promise<void> {
    const { error } = await this.supabase.rpc('revoke_medical_record_access', { p_grant_id: grantId });
    if (error) throw new Error(`Não foi possível revogar o acesso: ${error.message}`);
  }

  async listMedicationCatalog(): Promise<MedicationCatalogItem[]> {
    const { data, error } = await this.supabase
      .from('clinical_medication_catalog')
      .select('id,name,active_ingredient,presentation,species,requires_qualified_signature')
      .eq('is_active', true)
      .order('name');
    if (error) throw new Error(`Não foi possível carregar o catálogo: ${error.message}`);
    return (data ?? []) as MedicationCatalogItem[];
  }

  async listMedicationFavorites(): Promise<Array<Record<string, unknown>>> {
    const { data, error } = await this.supabase.rpc('get_veterinarian_medication_favorites');
    if (error) throw new Error(`Não foi possível carregar suas posologias favoritas: ${error.message}`);
    return (data ?? []) as Array<Record<string, unknown>>;
  }

  async addMedicationFavorite(input: {
    medicationId: string;
    dosage: string;
    frequency: string;
    duration: string;
    route: MedicationItem['route'];
    instructions?: string;
  }): Promise<string> {
    const { data, error } = await this.supabase.rpc('add_veterinarian_medication_favorite', {
      p_medication_id: input.medicationId,
      p_dosage: input.dosage,
      p_frequency: input.frequency,
      p_duration: input.duration,
      p_route: input.route,
      p_instructions: input.instructions ?? null,
    });
    if (error) throw new Error(`Não foi possível salvar a posologia favorita: ${error.message}`);
    return data;
  }

  async uploadClinicalDocument(input: {
    petId: string;
    file: File;
    title: string;
    documentType: string;
    examId?: string;
    medicalRecordId?: string;
    resultsText?: string;
  }): Promise<string> {
    const formData = new FormData();
    formData.set('petId', input.petId);
    formData.set('title', input.title);
    formData.set('documentType', input.documentType);
    formData.set('file', input.file);
    if (input.examId) formData.set('examId', input.examId);
    if (input.medicalRecordId) formData.set('medicalRecordId', input.medicalRecordId);
    if (input.resultsText) formData.set('resultsText', input.resultsText);

    const { data, error } = await this.supabase.functions.invoke('upload-clinical-document', { body: formData });
    if (error) {
      const responseBody = await error.context?.json?.().catch(() => null);
      throw new Error(responseBody?.error || `Falha no envio do documento: ${error.message}`);
    }
    return data.documentId;
  }

  async getDocumentUrl(documentId: string): Promise<string> {
    const { data, error } = await this.supabase.functions.invoke('get-clinical-document-url', {
      body: { documentId },
    });
    if (error) throw new Error(`Acesso ao documento negado: ${error.message}`);
    return data.signedUrl;
  }

  async verifyPrescription(validationCode: string): Promise<Record<string, unknown>> {
    const { data, error } = await this.supabase.rpc('verify_prescription_public', {
      p_validation_code: validationCode,
    });
    if (error) throw new Error(`Não foi possível validar a receita: ${error.message}`);
    return data as Record<string, unknown>;
  }

  async downloadPrescriptionPdf(prescriptionId: string): Promise<Blob> {
    const { data, error } = await this.supabase.functions.invoke('generate-prescription-pdf', {
      body: { prescriptionId },
    });
    if (error) throw new Error(`Não foi possível gerar o PDF: ${error.message}`);
    const binary = atob(data.pdfBase64 as string);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new Blob([bytes], { type: 'application/pdf' });
  }

  async downloadMedicalRecordPdf(petId: string): Promise<Blob> {
    const { data, error } = await this.supabase.functions.invoke('generate-medical-record-pdf', {
      body: { petId },
    });
    if (error) throw new Error(`Não foi possível gerar o PDF do prontuário: ${error.message}`);
    const binary = atob(data.pdfBase64 as string);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new Blob([bytes], { type: 'application/pdf' });
  }

  /**
   * Cria um encaminhamento clínico para especialista.
   * A autorização (vínculo assistencial + CRMV) é validada exclusivamente no servidor.
   */
  async createReferral(input: ReferralInput): Promise<string> {
    const { data, error } = await this.supabase.rpc('create_clinical_referral', {
      p_pet_id: input.petId,
      p_specialty_id: input.specialtyId,
      p_reason: input.reason,
      p_clinical_summary: input.clinicalSummary ?? null,
      p_priority: input.priority ?? 'routine',
      p_consultation_id: input.consultationId ?? null,
      p_target_clinic_id: null,
    });

    if (error) {
      throw new Error(`Erro ao criar encaminhamento clínico: ${error.message}`);
    }

    return data;
  }

  /**
   * Catálogo público de especialidades (leitura permitida por RLS para autenticados).
   */
  async listSpecialties(): Promise<SpecialtyOption[]> {
    const { data, error } = await this.supabase
      .from('specialties')
      .select('id,name')
      .eq('is_active', true)
      .order('name');
    if (error) throw new Error(`Não foi possível carregar as especialidades: ${error.message}`);
    return (data ?? []) as SpecialtyOption[];
  }
}
