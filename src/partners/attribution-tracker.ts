import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface AttributionPayload {
  tenantId: string;
  petshopId: string;
  sessionToken: string;
  referralCode?: string;
  timestamp: number;
}

const COOKIE_NAME = 'televet_partner_attribution';
const STORAGE_KEY = 'televet_partner_session';
const COOKIE_EXPIRY_DAYS = 90;

import { getSupabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase-client';

export class AttributionTracker {
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
   * Gera ou recupera um identificador único de sessão do visitante
   */
  getOrCreateSessionToken(): string {
    if (typeof window === 'undefined') return 'server_side_session';

    let token = localStorage.getItem(STORAGE_KEY);
    if (!token) {
      token = 'sess_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem(STORAGE_KEY, token);
    }
    return token;
  }

  /**
   * Registra a visita no Supabase e armazena a atribuição em Cookies e Storage (90 dias)
   */
  async trackVisit(tenantId: string, petshopId: string, referralCode?: string): Promise<void> {
    const sessionToken = this.getOrCreateSessionToken();
    const payload: AttributionPayload = {
      tenantId,
      petshopId,
      sessionToken,
      referralCode,
      timestamp: Date.now(),
    };

    // 1. Armazena no LocalStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY + '_data', JSON.stringify(payload));
      
      // 2. Armazena em Cookie com validade de 90 dias
      const expires = new Date();
      expires.setDate(expires.getDate() + COOKIE_EXPIRY_DAYS);
      document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(payload))}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
    }

    // 3. Registra no banco via RPC
    await this.supabase.rpc('track_partner_attribution', {
      p_tenant_id: tenantId,
      p_petshop_id: petshopId,
      p_session_token: sessionToken,
      p_referral_code: referralCode || null,
      p_source_url: typeof window !== 'undefined' ? window.location.href : null,
      p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });
  }

  /**
   * Recupera a atribuição ativa mesmo se a URL não tiver mais parâmetros
   */
  getActiveAttribution(): AttributionPayload | null {
    if (typeof window === 'undefined') return null;

    // Tenta do Cookie
    const match = document.cookie.match(new RegExp('(^| )' + COOKIE_NAME + '=([^;]+)'));
    if (match) {
      try {
        return JSON.parse(decodeURIComponent(match[2]));
      } catch (e) {
        // Fallback para storage
      }
    }

    // Tenta do LocalStorage
    const stored = localStorage.getItem(STORAGE_KEY + '_data');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        return null;
      }
    }

    return null;
  }

  /**
   * Associa o tutor ao Pet Shop no banco de dados durante o cadastro/conversão
   */
  async bindTutorOnSignUp(userId: string): Promise<{ bound: boolean; tenantId?: string }> {
    const active = this.getActiveAttribution();
    if (!active) {
      return { bound: false };
    }

    const { data, error } = await this.supabase.rpc('bind_tutor_to_partner', {
      p_user_id: userId,
      p_session_token: active.sessionToken,
    });

    if (error || !data?.bound) {
      return { bound: false };
    }

    return { bound: true, tenantId: data.tenant_id };
  }
}
