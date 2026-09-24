import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface PetShopPublicProfile {
  tenantId: string;
  petshopId: string;
  slug: string;
  name: string;
  tradeName: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: {
    street?: string;
    number?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  logoUrl?: string;
  bannerUrl?: string;
  galleryImages: string[];
  businessHours: Record<string, string>;
  socialLinks: {
    instagram?: string;
    facebook?: string;
    website?: string;
  };
  commercialInfo?: string;
  whiteLabelConfig: {
    primaryColor: string;
    secondaryColor: string;
    brandName?: string;
  };
  referralCode?: string;
  exclusiveLink: string;
}

import { getSupabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase-client';

export class PetShopService {
  private supabase: SupabaseClient;
  private baseUrl: string;

  constructor(
    supabaseUrl: string = SUPABASE_URL, 
    supabaseAnonKey: string = SUPABASE_ANON_KEY, 
    baseUrl: string = 'https://tele-veterinaria.com.br'
  ) {
    this.supabase = (supabaseUrl === SUPABASE_URL && supabaseAnonKey === SUPABASE_ANON_KEY)
      ? getSupabaseClient()
      : createClient(supabaseUrl, supabaseAnonKey);
    this.baseUrl = baseUrl;
  }

  /**
   * Obtém os dados completos do Pet Shop pelo slug (ex: 'animal-feliz') ou domínio personalizado
   */
  async getPublicProfile(identifier: string): Promise<PetShopPublicProfile | null> {
    const { data, error } = await this.supabase.rpc('get_public_petshop_profile', {
      p_identifier: identifier,
    });

    if (error || !data) {
      return null;
    }

    const exclusiveLink = `${this.baseUrl}/petshop/${data.slug}?ref=${data.referral_code || data.slug}`;

    return {
      tenantId: data.tenant_id,
      petshopId: data.petshop_id,
      slug: data.slug,
      name: data.name,
      tradeName: data.trade_name,
      phone: data.phone,
      whatsapp: data.whatsapp,
      email: data.email,
      address: data.address,
      logoUrl: data.logo_url,
      bannerUrl: data.banner_url,
      galleryImages: data.gallery_images || [],
      businessHours: data.business_hours || {},
      socialLinks: data.social_links || {},
      commercialInfo: data.commercial_info,
      whiteLabelConfig: {
        primaryColor: data.white_label_config?.primary_color || '#0ea5e9',
        secondaryColor: data.white_label_config?.secondary_color || '#0284c7',
        brandName: data.white_label_config?.brand_name || data.trade_name,
      },
      referralCode: data.referral_code,
      exclusiveLink,
    };
  }

  /**
   * Gera o link formatado para compartilhamento no WhatsApp com mensagem de atração
   */
  generateWhatsAppShareLink(profile: PetShopPublicProfile): string {
    const message = encodeURIComponent(
      `Olá! Conheça o serviço de Telemedicina Veterinária do *${profile.tradeName}*! 🐶🐱\n\n` +
      `Fale agora com veterinários qualificados sem sair de casa através do nosso link exclusivo:\n` +
      `${profile.exclusiveLink}\n\n` +
      `Seu pet atendido com o carinho e a confiança que você já conhece!`
    );

    return `https://api.whatsapp.com/send?text=${message}`;
  }

  /**
   * Gera URL de QR Code dinâmico para balcão ou compartilhamento
   */
  generateQrCodeUrl(profile: PetShopPublicProfile, size: number = 300): string {
    const encodedTarget = encodeURIComponent(profile.exclusiveLink);
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodedTarget}&margin=10`;
  }
}
