import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase-client';

// Teletriagem/teleorientacao conforme Res. CFMV 1.465/2022.
export type ReferralModality = 'teletriage' | 'teleorientation' | 'in_person';
export type ReferralPriority = 'routine' | 'urgent' | 'emergency';
export type ReferralStatus = 'pending' | 'accepted' | 'in_progress' | 'completed' | 'rejected' | 'expired' | 'cancelled';
export type ReferralScope = 'read_clinical' | 'exams' | 'documents' | 'prescriptions';

export interface ReferralSpecialistCandidate {
  veterinarianId: string;
  fullName: string;
  crmvNumber: string;
  crmvUf: string;
  bio: string | null;
  telemedicineEnabled: boolean;
}

export interface CreateReferralInput {
  petId: string;
  specialtyId: string;
  reason: string;
  clinicalSummary?: string;
  priority?: ReferralPriority;
  modality?: ReferralModality;
  targetVeterinarianId?: string | null;
  scopes?: ReferralScope[];
  expirationDays?: number;
  consultationId?: string | null;
}

export interface ReferralListItem {
  referralId: string;
  status: ReferralStatus;
  priority: ReferralPriority;
  modality: ReferralModality;
  reason: string;
  clinicalSummary: string | null;
  scopes: ReferralScope[];
  specialtyId: string | null;
  specialtyName: string | null;
  referringVeterinarianName: string | null;
  referringCrmvNumber: string | null;
  referringCrmvUf: string | null;
  targetVeterinarianName: string | null;
  rejectionReason: string | null;
  createdAt: string;
  expiresAt: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
}

export interface ReferralAttachment {
  attachmentId: string;
  documentId: string | null;
  examId: string | null;
  title: string | null;
  kind: 'document' | 'exam';
  notes: string | null;
  createdAt: string;
}

export interface ReferralReturn {
  returnId: string;
  returnSummary: string;
  diagnosis: string | null;
  conduct: string | null;
  followUpAt: string | null;
  medicalRecordId: string | null;
  attendingVeterinarianName: string;
  createdAt: string;
}

export interface ReferralDetail {
  referralId: string;
  petId: string;
  status: ReferralStatus;
  priority: ReferralPriority;
  modality: ReferralModality;
  reason: string;
  clinicalSummary: string | null;
  scopes: ReferralScope[];
  specialtyId: string | null;
  referringVeterinarianName: string | null;
  referringCrmvNumber: string | null;
  referringCrmvUf: string | null;
  rejectionReason: string | null;
  createdAt: string;
  expiresAt: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  attachments: ReferralAttachment[];
  returns: ReferralReturn[];
}

export interface ReferralReturnInput {
  referralId: string;
  returnSummary: string;
  diagnosis?: string;
  conduct?: string;
  followUpAt?: string | null;
}

export class ReferralService {
  private supabase: SupabaseClient;

  constructor(supabaseUrl: string = SUPABASE_URL, supabaseAnonKey: string = SUPABASE_ANON_KEY) {
    this.supabase = (supabaseUrl === SUPABASE_URL && supabaseAnonKey === SUPABASE_ANON_KEY)
      ? getSupabaseClient()
      : createClient(supabaseUrl, supabaseAnonKey);
  }

  // Candidatos a especialista para uma especialidade (catalogo unico, CRMV validado).
  async listCandidates(specialtyId: string, stateUf?: string): Promise<ReferralSpecialistCandidate[]> {
    const { data, error } = await this.supabase.rpc('list_referral_candidates', {
      p_specialty_id: specialtyId,
      p_state_uf: stateUf ?? null,
    });
    if (error) throw new Error(`Não foi possível carregar especialistas: ${error.message}`);
    return ((data as any)?.candidates ?? []).map((c: any) => ({
      veterinarianId: c.veterinarian_id,
      fullName: c.full_name,
      crmvNumber: c.crmv_number,
      crmvUf: c.crmv_uf,
      bio: c.bio ?? null,
      telemedicineEnabled: Boolean(c.is_telemedicine_enabled),
    }));
  }

  async createReferral(input: CreateReferralInput): Promise<string> {
    const { data, error } = await this.supabase.rpc('create_referral', {
      p_pet_id: input.petId,
      p_specialty_id: input.specialtyId,
      p_reason: input.reason,
      p_clinical_summary: input.clinicalSummary ?? null,
      p_priority: input.priority ?? 'routine',
      p_modality: input.modality ?? 'teletriage',
      p_target_veterinarian_id: input.targetVeterinarianId ?? null,
      p_scopes: input.scopes ?? ['read_clinical'],
      p_expiration_days: input.expirationDays ?? 7,
      p_consultation_id: input.consultationId ?? null,
    });
    if (error) throw new Error(`Não foi possível criar o encaminhamento: ${error.message}`);
    return data as string;
  }

  async listByPet(petId: string): Promise<ReferralListItem[]> {
    const { data, error } = await this.supabase.rpc('list_pet_referrals', { p_pet_id: petId });
    if (error) throw new Error(`Não foi possível carregar os encaminhamentos: ${error.message}`);
    return ((data as any)?.referrals ?? []).map((r: any) => ({
      referralId: r.referral_id,
      status: r.status,
      priority: r.priority,
      modality: r.modality,
      reason: r.reason,
      clinicalSummary: r.clinical_summary ?? null,
      scopes: r.scopes ?? [],
      specialtyId: r.specialty_id ?? null,
      specialtyName: r.specialty_name ?? null,
      referringVeterinarianName: r.referring_veterinarian_name ?? null,
      referringCrmvNumber: r.referring_crmv_number ?? null,
      referringCrmvUf: r.referring_crmv_uf ?? null,
      targetVeterinarianName: r.target_veterinarian_name ?? null,
      rejectionReason: r.rejection_reason ?? null,
      createdAt: r.created_at,
      expiresAt: r.expires_at ?? null,
      acceptedAt: r.accepted_at ?? null,
      completedAt: r.completed_at ?? null,
    }));
  }

  async getDetail(referralId: string): Promise<ReferralDetail> {
    const { data, error } = await this.supabase.rpc('get_referral_detail', {
      p_referral_id: referralId,
    });
    if (error) throw new Error(`Não foi possível carregar o encaminhamento: ${error.message}`);
    const d = data as any;
    return {
      referralId: d.referral_id,
      petId: d.pet_id,
      status: d.status,
      priority: d.priority,
      modality: d.modality,
      reason: d.reason,
      clinicalSummary: d.clinical_summary ?? null,
      scopes: d.scopes ?? [],
      specialtyId: d.specialty_id ?? null,
      referringVeterinarianName: d.referring_veterinarian_name ?? null,
      referringCrmvNumber: d.referring_crmv_number ?? null,
      referringCrmvUf: d.referring_crmv_uf ?? null,
      rejectionReason: d.rejection_reason ?? null,
      createdAt: d.created_at,
      expiresAt: d.expires_at ?? null,
      acceptedAt: d.accepted_at ?? null,
      completedAt: d.completed_at ?? null,
      attachments: (d.attachments ?? []).map((a: any) => ({
        attachmentId: a.attachment_id,
        documentId: a.document_id ?? null,
        examId: a.exam_id ?? null,
        title: a.title ?? null,
        kind: a.kind,
        notes: a.notes ?? null,
        createdAt: a.created_at,
      })),
      returns: (d.returns ?? []).map((r: any) => ({
        returnId: r.return_id,
        returnSummary: r.return_summary,
        diagnosis: r.diagnosis ?? null,
        conduct: r.conduct ?? null,
        followUpAt: r.follow_up_at ?? null,
        medicalRecordId: r.medical_record_id ?? null,
        attendingVeterinarianName: r.attending_veterinarian_name,
        createdAt: r.created_at,
      })),
    };
  }

  async accept(referralId: string): Promise<void> {
    const { error } = await this.supabase.rpc('accept_referral', { p_referral_id: referralId });
    if (error) throw new Error(`Não foi possível aceitar o encaminhamento: ${error.message}`);
  }

  async updateStatus(referralId: string, newStatus: ReferralStatus, reason?: string): Promise<void> {
    const { error } = await this.supabase.rpc('update_referral_status', {
      p_referral_id: referralId,
      p_new_status: newStatus,
      p_reason: reason ?? null,
    });
    if (error) throw new Error(`Não foi possível atualizar o estado: ${error.message}`);
  }

  async attachDocument(
    referralId: string,
    opts: { documentId?: string; examId?: string; notes?: string } = {},
  ): Promise<string> {
    const { data, error } = await this.supabase.rpc('attach_referral_document', {
      p_referral_id: referralId,
      p_document_id: opts.documentId ?? null,
      p_exam_id: opts.examId ?? null,
      p_notes: opts.notes ?? null,
    });
    if (error) throw new Error(`Não foi possível anexar o item: ${error.message}`);
    return data as string;
  }

  async recordReturn(input: ReferralReturnInput): Promise<{ returnId: string; medicalRecordId: string }> {
    const { data, error } = await this.supabase.rpc('record_referral_return', {
      p_referral_id: input.referralId,
      p_return_summary: input.returnSummary,
      p_diagnosis: input.diagnosis ?? null,
      p_conduct: input.conduct ?? null,
      p_follow_up_at: input.followUpAt ?? null,
    });
    if (error) throw new Error(`Não foi possível registrar o retorno: ${error.message}`);
    return { returnId: (data as any).return_id, medicalRecordId: (data as any).medical_record_id };
  }
}

