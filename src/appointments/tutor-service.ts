import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface PetDTO {
  id?: string;
  tenantId: string;
  tutorId: string;
  name: string;
  species: 'canine' | 'feline' | 'avian' | 'reptile' | 'rodent' | 'other';
  breed?: string;
  sex: 'male' | 'female' | 'unknown';
  birthDate?: string;
  weightKg?: number;
  microchipNumber?: string;
  allergies?: string;
  chronicConditions?: string;
  photoUrl?: string;
}

export interface TutorProfileDTO {
  id: string;
  userId: string;
  tenantId: string;
  fullName: string;
  email: string;
  phone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  address?: Record<string, any>;
  notes?: string;
}

import { getSupabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase-client';

export class TutorService {
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
   * Obtém o perfil completo do tutor com seus pets
   */
  async getTutorProfile(userId: string): Promise<{ tutor: TutorProfileDTO | null; pets: PetDTO[] }> {
    const { data: tutorData, error: tutorError } = await this.supabase
      .from('tutors')
      .select('*, users(full_name, email, phone)')
      .eq('user_id', userId)
      .single();

    if (tutorError || !tutorData) {
      return { tutor: null, pets: [] };
    }

    const { data: petsData } = await this.supabase
      .from('pets')
      .select('*')
      .eq('tutor_id', tutorData.id)
      .eq('is_active', true);

    const tutor: TutorProfileDTO = {
      id: tutorData.id,
      userId: tutorData.user_id,
      tenantId: tutorData.tenant_id,
      fullName: tutorData.users?.full_name,
      email: tutorData.users?.email,
      phone: tutorData.users?.phone,
      emergencyContactName: tutorData.emergency_contact_name,
      emergencyContactPhone: tutorData.emergency_contact_phone,
      address: tutorData.address,
      notes: tutorData.notes,
    };

    const pets: PetDTO[] = (petsData || []).map((p: any) => ({
      id: p.id,
      tenantId: p.tenant_id,
      tutorId: p.tutor_id,
      name: p.name,
      species: p.species,
      breed: p.breed,
      sex: p.sex,
      birthDate: p.birth_date,
      weightKg: p.weight_kg ? Number(p.weight_kg) : undefined,
      microchipNumber: p.microchip_number,
      allergies: p.allergies,
      chronicConditions: p.chronic_conditions,
      photoUrl: p.photo_url,
    }));

    return { tutor, pets };
  }

  /**
   * Cadastra ou atualiza um animal de estimação
   */
  async savePet(pet: PetDTO): Promise<PetDTO> {
    const payload = {
      tenant_id: pet.tenantId,
      tutor_id: pet.tutorId,
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      sex: pet.sex,
      birth_date: pet.birthDate,
      weight_kg: pet.weightKg,
      microchip_number: pet.microchipNumber,
      allergies: pet.allergies,
      chronic_conditions: pet.chronicConditions,
      photo_url: pet.photoUrl,
      updated_at: new Date().toISOString(),
    };

    if (pet.id) {
      const { data, error } = await this.supabase
        .from('pets')
        .update(payload)
        .eq('id', pet.id)
        .select()
        .single();

      if (error) throw new Error(`Erro ao atualizar pet: ${error.message}`);
      return data;
    } else {
      const { data, error } = await this.supabase
        .from('pets')
        .insert(payload)
        .select()
        .single();

      if (error) throw new Error(`Erro ao cadastrar pet: ${error.message}`);
      return data;
    }
  }
}
