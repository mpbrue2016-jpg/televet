// ==============================================================================
// src/directory/cnpj-validator.ts
// Validador Oficial de CNPJ (Módulo 11 da Receita Federal)
// ==============================================================================

export class CnpjValidator {
  /**
   * Remove caracteres não numéricos de uma string de CNPJ.
   */
  static clean(cnpj: string): string {
    return (cnpj || '').replace(/\D/g, '');
  }

  /**
   * Formata uma string numérica de 14 dígitos no padrão CNPJ (XX.XXX.XXX/XXXX-XX).
   */
  static format(cnpj: string): string {
    const cleaned = this.clean(cnpj);
    if (cleaned.length !== 14) return cnpj;
    return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

  /**
   * Valida matematicamente se um CNPJ é válido de acordo com o algoritmo de Módulo 11.
   */
  static isValid(cnpj: string): boolean {
    const cleanCnpj = this.clean(cnpj);

    // O CNPJ precisa ter exatamente 14 dígitos
    if (cleanCnpj.length !== 14) {
      return false;
    }

    // Bloqueia dígitos repetidos óbvios (ex: 00000000000000, 11111111111111)
    if (/^(\d)\1{13}$/.test(cleanCnpj)) {
      return false;
    }

    // Cálculo do primeiro dígito verificador
    const weightsFirst = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum1 = 0;
    for (let i = 0; i < 12; i++) {
      sum1 += parseInt(cleanCnpj[i], 10) * weightsFirst[i];
    }
    const remainder1 = sum1 % 11;
    const digit1 = remainder1 < 2 ? 0 : 11 - remainder1;

    if (parseInt(cleanCnpj[12], 10) !== digit1) {
      return false;
    }

    // Cálculo do segundo dígito verificador
    const weightsSecond = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum2 = 0;
    for (let i = 0; i < 13; i++) {
      sum2 += parseInt(cleanCnpj[i], 10) * weightsSecond[i];
    }
    const remainder2 = sum2 % 11;
    const digit2 = remainder2 < 2 ? 0 : 11 - remainder2;

    if (parseInt(cleanCnpj[13], 10) !== digit2) {
      return false;
    }

    return true;
  }
}
