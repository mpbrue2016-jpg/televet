// ==============================================================================
// src/admin/export-service.ts
// Exportador Sanitizado CSV com Minimização de Dados Pessoais (LGPD)
// ==============================================================================

import { FinancialLedgerEntry } from './types';

export class ExportService {
  /**
   * Converte entradas do ledger em formato CSV sanitizado,
   * garantindo que nenhum CPF ou dado clínico seja exposto no arquivo.
   */
  static formatLedgerToCsv(entries: FinancialLedgerEntry[]): string {
    const headers = [
      'Data/Hora',
      'ID Transação',
      'ID Consulta',
      'Parceiro / Tenant',
      'Valor Bruto (R$)',
      'Taxa Gateway (R$)',
      'Comissão Plataforma (R$)',
      'Comissão Parceiro (R$)',
      'Repasse Veterinário Líquido (R$)',
      'Status',
    ];

    const rows = entries.map((e) => {
      return [
        `"${new Date(e.createdAt).toISOString()}"`,
        `"${e.paymentId}"`,
        `"${e.appointmentId}"`,
        `"${this.sanitizeString(e.tenantName)}"`,
        (e.grossAmountCents / 100).toFixed(2),
        (e.gatewayFeeCents / 100).toFixed(2),
        (e.platformCommissionCents / 100).toFixed(2),
        (e.petshopCommissionCents / 100).toFixed(2),
        (e.veterinarianNetCents / 100).toFixed(2),
        `"${e.status}"`,
      ].join(';');
    });

    return [headers.join(';'), ...rows].join('\n');
  }

  /**
   * Mascara CPF para formato anonimizado (ex: ***.456.789-**)
   */
  static maskCpf(cpf: string): string {
    if (!cpf) return '';
    const clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11) return '***.***.***-**';
    return `***.${clean.substring(3, 6)}.${clean.substring(6, 9)}-**`;
  }

  /**
   * Previne injeção de fórmulas CSV (ex: =cmd|', +cmd)
   */
  private static sanitizeString(str: string): string {
    if (!str) return '';
    const clean = str.replace(/[";]/g, ' ');
    if (clean.startsWith('=') || clean.startsWith('+') || clean.startsWith('-') || clean.startsWith('@')) {
      return `'${clean}`;
    }
    return clean;
  }
}
