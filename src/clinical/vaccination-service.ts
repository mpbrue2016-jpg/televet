import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase-client';

export type VaccinationStatus = 'none' | 'upcoming' | 'due_soon' | 'overdue';

export interface VaccinationAttachment {
  document_id: string;
  title: string;
  mime_type: string | null;
  file_size_bytes: number | null;
}

export interface VaccinationItem {
  id: string;
  vaccine_name: string;
  manufacturer: string | null;
  lot_number: string | null;
  application_date: string;
  dose_number: string | null;
  observations: string | null;
  next_dose_at: string | null;
  reminder_enabled: boolean;
  consultation_id: string | null;
  veterinarian_id: string | null;
  veterinarian_name: string | null;
  created_at: string;
  status: VaccinationStatus;
  days_until_next: number | null;
  attachments: VaccinationAttachment[];
}

export interface VaccinationWallet {
  pet: { id: string; name: string; species: string; breed: string | null };
  can_write: boolean;
  vaccinations: VaccinationItem[];
}

export interface VaccinationHistoryEntry {
  kind: 'vaccination' | 'vaccination_legacy' | 'consultation';
  source: 'vaccinations' | 'medical_records' | 'consultations';
  id: string;
  title: string;
  application_date?: string;
  occurred_at?: string;
  manufacturer?: string | null;
  lot_number?: string | null;
  dose_number?: string | null;
  observations?: string | null;
  next_dose_at?: string | null;
  veterinarian_name?: string | null;
  details?: string | null;
  status?: string;
}

export interface VaccinationInput {
  petId: string;
  vaccineName: string;
  applicationDate: string;
  manufacturer?: string;
  lotNumber?: string;
  doseNumber?: string;
  observations?: string;
  nextDoseAt?: string;
  reminderEnabled?: boolean;
  consultationId?: string;
}

export interface VaccinationUpdateInput {
  vaccinationId: string;
  manufacturer?: string;
  lotNumber?: string;
  observations?: string;
  nextDoseAt?: string;
  reminderEnabled?: boolean;
  doseNumber?: string;
}

export class VaccinationService {
  private supabase: SupabaseClient;

  constructor(supabaseUrl: string = SUPABASE_URL, supabaseAnonKey: string = SUPABASE_ANON_KEY) {
    this.supabase = (supabaseUrl === SUPABASE_URL && supabaseAnonKey === SUPABASE_ANON_KEY)
      ? getSupabaseClient()
      : createClient(supabaseUrl, supabaseAnonKey);
  }

  async getWallet(petId: string): Promise<VaccinationWallet> {
    const { data, error } = await this.supabase.rpc('get_pet_vaccinations', { p_pet_id: petId });
    if (error) throw new Error(`Não foi possível carregar a carteira de vacinação: ${error.message}`);
    return data as VaccinationWallet;
  }

  async getHistory(petId: string): Promise<VaccinationHistoryEntry[]> {
    const { data, error } = await this.supabase.rpc('get_pet_vaccination_history', { p_pet_id: petId });
    if (error) throw new Error(`Não foi possível carregar o histórico: ${error.message}`);
    return (data?.history ?? []) as VaccinationHistoryEntry[];
  }

  async createVaccination(input: VaccinationInput): Promise<string> {
    const { data, error } = await this.supabase.rpc('create_vaccination', {
      p_pet_id: input.petId,
      p_vaccine_name: input.vaccineName,
      p_application_date: input.applicationDate,
      p_manufacturer: input.manufacturer ?? null,
      p_lot_number: input.lotNumber ?? null,
      p_dose_number: input.doseNumber ?? null,
      p_observations: input.observations ?? null,
      p_next_dose_at: input.nextDoseAt ?? null,
      p_reminder_enabled: input.reminderEnabled ?? false,
      p_consultation_id: input.consultationId ?? null,
    });
    if (error) throw new Error(`Não foi possível registrar a vacina: ${error.message}`);
    return data.vaccination_id as string;
  }

  async updateVaccination(input: VaccinationUpdateInput): Promise<void> {
    const { error } = await this.supabase.rpc('update_vaccination', {
      p_vaccination_id: input.vaccinationId,
      p_manufacturer: input.manufacturer ?? null,
      p_lot_number: input.lotNumber ?? null,
      p_observations: input.observations ?? null,
      p_next_dose_at: input.nextDoseAt ?? null,
      p_reminder_enabled: input.reminderEnabled ?? false,
      p_dose_number: input.doseNumber ?? null,
    });
    if (error) throw new Error(`Não foi possível atualizar a vacina: ${error.message}`);
  }

  async uploadProof(input: { petId: string; vaccinationId: string; file: File; title: string }): Promise<string> {
    const formData = new FormData();
    formData.set('petId', input.petId);
    formData.set('vaccinationId', input.vaccinationId);
    formData.set('title', input.title);
    formData.set('file', input.file);

    const { data, error } = await this.supabase.functions.invoke('upload-vaccination-document', { body: formData });
    if (error) {
      const responseBody = await error.context?.json?.().catch(() => null);
      throw new Error(responseBody?.error || `Falha no envio do comprovante: ${error.message}`);
    }
    return data.documentId as string;
  }

  async getProofUrl(documentId: string): Promise<string> {
    const { data, error } = await this.supabase.functions.invoke('get-vaccination-document-url', {
      body: { documentId },
    });
    if (error) throw new Error(`Acesso ao comprovante negado: ${error.message}`);
    return data.signedUrl as string;
  }

  async downloadCardPdf(petId: string): Promise<Blob> {
    const { data, error } = await this.supabase.functions.invoke('generate-vaccination-card', {
      body: { petId },
    });
    if (error) throw new Error(`Não foi possível gerar o PDF da carteira: ${error.message}`);
    const binary = atob(data.pdfBase64 as string);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new Blob([bytes], { type: 'application/pdf' });
  }
}
