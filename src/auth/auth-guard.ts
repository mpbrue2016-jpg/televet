import { UserProfile, UserRole } from './auth-service';

export interface RoutePermissionRule {
  allowedRoles: UserRole[];
  requireSuperadmin?: boolean;
  allowSameTenantOnly?: boolean;
}

/**
 * Middleware / Guardião de Rotas para validação estrita no backend
 */
export class AuthGuard {
  /**
   * Valida se o perfil possui permissão para executar a ação na rota solicitada
   */
  static checkPermission(
    user: UserProfile | null,
    rule: RoutePermissionRule,
    targetTenantId?: string
  ): { allowed: boolean; reason?: string } {
    if (!user) {
      return { allowed: false, reason: 'Usuário não autenticado.' };
    }

    // Validação de bloqueio de conta
    if (!user.isActive || user.accountStatus !== 'active') {
      return { allowed: false, reason: `Conta de usuário ${user.accountStatus}. Operação bloqueada.` };
    }

    // Superadministrador tem acesso global irrestrito
    if (user.isSuperadmin || user.systemRole === 'superadmin') {
      return { allowed: true };
    }

    // Se a rota exige superadministrador
    if (rule.requireSuperadmin) {
      return { allowed: false, reason: 'Acesso restrito ao Administrador Geral da plataforma.' };
    }

    // Validação de papel (Role)
    if (!rule.allowedRoles.includes(user.systemRole)) {
      return {
        allowed: false,
        reason: `Permissão negada. O perfil '${user.systemRole}' não tem acesso a este recurso.`,
      };
    }

    // Validação de isolamento do Tenant
    if (rule.allowSameTenantOnly && targetTenantId) {
      if (user.tenantId !== targetTenantId) {
        return {
          allowed: false,
          reason: 'Acesso negado: tentativa de manipulação de dados de outro Pet Shop / Tenant.',
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Regras padronizadas do sistema
   */
  static readonly RULES = {
    ADMIN_ONLY: {
      allowedRoles: ['superadmin'] as UserRole[],
      requireSuperadmin: true,
    },
    PETSHOP_PORTAL: {
      allowedRoles: ['superadmin', 'tenant_admin'] as UserRole[],
      allowSameTenantOnly: true,
    },
    VETERINARIAN_PORTAL: {
      allowedRoles: ['superadmin', 'veterinarian'] as UserRole[],
    },
    TUTOR_PORTAL: {
      allowedRoles: ['superadmin', 'tutor'] as UserRole[],
      allowSameTenantOnly: true,
    },
    MEDICAL_RECORDS: {
      // Pet shop NUNCA tem permissão de ver prontuário clínico confidencial
      allowedRoles: ['superadmin', 'veterinarian', 'tutor'] as UserRole[],
      allowSameTenantOnly: true,
    },
  };
}
