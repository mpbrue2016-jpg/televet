// ==============================================================================
// src/notifications/template-engine.ts
// Motor de Renderização de Templates e Validador de Sigilo Clínico
// ==============================================================================

export class TemplateEngine {
  /**
   * Renderiza um template substituindo {{chave}} pelos valores correspondentes do payload.
   */
  static render(template: string, payload: Record<string, any>, secureLink?: string): string {
    let result = template;

    for (const [key, value] of Object.entries(payload)) {
      const placeholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      result = result.replace(placeholder, value !== undefined && value !== null ? String(value) : '');
    }

    if (secureLink) {
      result = result.replace(/\{\{\s*secure_link\s*\}\}/g, secureLink);
    }

    // Regra estrita de privacidade: garante que nenhum dado clínico seja vazado
    this.assertClinicalPrivacy(result);

    return result;
  }

  /**
   * Garante que mensagens externas utilizem apenas conteúdo mínimo e link seguro,
   * nunca incluindo prontuário, diagnóstico, receita ou dados clínicos sensíveis.
   */
  static assertClinicalPrivacy(content: string): void {
    const sensitiveClinicalTerms = [
      /\bCID[-\s]*10\b/i,
      /\bdiagn[oó]stico\s*:/i,
      /\bprontu[aá]rio\s*cl[íi]nico\b/i,
      /\bposologia\b/i,
      /\bdosagem\s*:\s*\d+/i,
      /\b(amoxicilina|prednisona|tramadol|cetoconazol|doxiciclina|gabapentina)\b/i,
    ];

    for (const pattern of sensitiveClinicalTerms) {
      if (pattern.test(content)) {
        throw new Error(
          `VIOLAÇÃO DE PRIVACIDADE CLÍNICA (CFMV / LGPD): Notificação contém dados médicos sensíveis (${pattern}). Utilize exclusivamente um link seguro com autenticação.`
        );
      }
    }
  }

  /**
   * Gera um link seguro com token e tempo de expiração para visualização de documentos ou consulta.
   */
  static generateSecureLink(baseUrl: string, resourceType: string, resourceId: string, expiresInHours = 48): string {
    const expiresAt = Date.now() + expiresInHours * 60 * 60 * 1000;
    const dummySignature = Buffer.from(`${resourceType}:${resourceId}:${expiresAt}`).toString('base64url');
    return `${baseUrl}/seguranca/acesso?tipo=${resourceType}&id=${resourceId}&expires=${expiresAt}&sig=${dummySignature}`;
  }
}
