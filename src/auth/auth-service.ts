import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';

export type UserRole = 'superadmin' | 'tenant_admin' | 'veterinarian' | 'receptionist' | 'tutor';
export type AccountStatus = 'pending_verification' | 'active' | 'suspended' | 'blocked';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  cpf?: string;
  systemRole: UserRole;
  isSuperadmin: boolean;
  isActive: boolean;
  accountStatus: AccountStatus;
  tenantId?: string;
}

export interface SignUpOptions {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  cpf?: string;
  role: UserRole;
  tenantId?: string;
  extraMeta?: Record<string, any>;
}

import { getSupabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase-client';

export class AuthService {
  private supabase: SupabaseClient;

  constructor(
    supabaseUrl: string = SUPABASE_URL, 
    supabaseAnonKey: string = SUPABASE_ANON_KEY
  ) {
    this.supabase = (supabaseUrl === SUPABASE_URL && supabaseAnonKey === SUPABASE_ANON_KEY)
      ? getSupabaseClient()
      : createClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
          },
        });
  }

  /**
   * Cadastro unificado de usuários com metadados e papel seguro
   */
  async signUp(options: SignUpOptions): Promise<{ user: User | null; session: Session | null; error: Error | null }> {
    const { data, error } = await this.supabase.auth.signUp({
      email: options.email,
      password: options.password,
      options: {
        data: {
          full_name: options.fullName,
          phone: options.phone,
          cpf: options.cpf,
          role: options.role,
          tenant_id: options.tenantId,
          ...options.extraMeta,
        },
      },
    });

    if (error) return { user: null, session: null, error };
    return { user: data.user, session: data.session, error: null };
  }

  /**
   * Login do usuário com validação de status de conta ativa
   */
  async signIn(email: string, password: string): Promise<{ profile: UserProfile | null; session: Session | null; error: string | null }> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      return { profile: null, session: null, error: error?.message || 'Falha ao autenticar usuário.' };
    }

    // Busca o perfil público para checar status de bloqueio
    const { data: profileData, error: profileError } = await this.supabase
      .from('users')
      .select('*, tenant_users(tenant_id, role)')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profileData) {
      return { profile: null, session: null, error: 'Perfil de usuário não encontrado.' };
    }

    // Se usuário estiver bloqueado ou suspenso, invalida sessão imediatamente
    if (!profileData.is_active || profileData.account_status !== 'active') {
      await this.signOut();
      return {
        profile: null,
        session: null,
        error: `Acesso negado: sua conta encontra-se ${profileData.account_status}. Contate o suporte.`,
      };
    }

    const profile: UserProfile = {
      id: profileData.id,
      email: profileData.email,
      fullName: profileData.full_name,
      phone: profileData.phone,
      cpf: profileData.cpf,
      systemRole: profileData.system_role,
      isSuperadmin: profileData.is_superadmin,
      isActive: profileData.is_active,
      accountStatus: profileData.account_status,
      tenantId: profileData.tenant_users?.[0]?.tenant_id,
    };

    return { profile, session: data.session, error: null };
  }

  /**
   * Logout seguro da sessão
   */
  async signOut(): Promise<{ error: Error | null }> {
    const { error } = await this.supabase.auth.signOut();
    return { error };
  }

  /**
   * Recuperação de Senha via E-mail
   */
  async resetPasswordForEmail(email: string, redirectTo?: string): Promise<{ error: Error | null }> {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    return { error };
  }

  /**
   * Atualização de Senha autenticada
   */
  async updatePassword(newPassword: string): Promise<{ error: Error | null }> {
    const { error } = await this.supabase.auth.updateUser({
      password: newPassword,
    });
    return { error };
  }

  /**
   * Bloqueio ou Desbloqueio de Usuário via RPC no banco de dados
   */
  async setUserStatus(targetUserId: string, newStatus: AccountStatus, reason?: string): Promise<{ success: boolean; message: string }> {
    const { data, error } = await this.supabase.rpc('set_user_status', {
      p_target_user_id: targetUserId,
      p_new_status: newStatus,
      p_reason: reason,
    });

    if (error) {
      throw new Error(`Erro ao alterar status: ${error.message}`);
    }

    return data;
  }
}
