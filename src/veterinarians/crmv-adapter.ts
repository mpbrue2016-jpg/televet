export type CrmvStatus = 
  | 'pending'
  | 'in_validation'
  | 'validated'
  | 'needs_revalidation'
  | 'not_validated'
  | 'inactive'
  | 'suspended'
  | 'irregular';

export interface CrmvValidationResult {
  isValid: boolean;
  status: CrmvStatus;
  crmvNumber: string;
  stateUf: string;
  professionalName?: string;
  validationSource: 'cfmv_api' | 'manual_audit' | 'mock_adapter';
  validationTimestamp: Date;
  details?: Record<string, any>;
  notes?: string;
}

/**
 * Adaptador de validação de CRMV preparado para integração oficial com CFMV/CRMV
 */
export class CrmvValidatorAdapter {
  private apiUrl?: string;
  private apiKey?: string;

  constructor(apiUrl?: string, apiKey?: string) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  /**
   * Executa a validação do registro profissional no Conselho de Medicina Veterinária
   */
  async validateRegistration(crmvNumber: string, stateUf: string): Promise<CrmvValidationResult> {
    const cleanNumber = crmvNumber.replace(/\D/g, '');
    const cleanUf = stateUf.trim().toUpperCase();

    // Se as credenciais da API oficial do CFMV estiverem configuradas, executa a requisição real
    if (this.apiUrl && this.apiKey) {
      try {
        const response = await fetch(`${this.apiUrl}/consultas/crmv`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            registro: cleanNumber,
            uf: cleanUf,
          }),
        });

        if (!response.ok) {
          throw new Error(`Falha na resposta do CFMV: status ${response.status}`);
        }

        const data = await response.json();

        return {
          isValid: data.situacao === 'REGULAR',
          status: data.situacao === 'REGULAR' ? 'validated' : 'irregular',
          crmvNumber: `${cleanNumber}/${cleanUf}`,
          stateUf: cleanUf,
          professionalName: data.nome_profissional,
          validationSource: 'cfmv_api',
          validationTimestamp: new Date(),
          details: data,
        };
      } catch (err: any) {
        // Fallback em caso de indisponibilidade da API do conselho
        return {
          isValid: false,
          status: 'in_validation',
          crmvNumber: `${cleanNumber}/${cleanUf}`,
          stateUf: cleanUf,
          validationSource: 'manual_audit',
          validationTimestamp: new Date(),
          notes: `Erro de comunicação com serviço oficial: ${err.message}. Encaminhado para auditoria manual.`,
        };
      }
    }

    // Ambiente sem credenciais da API: deixa arquitetura pronta com validação estrutural segura
    return {
      isValid: false,
      status: 'in_validation',
      crmvNumber: `${cleanNumber}/${cleanUf}`,
      stateUf: cleanUf,
      validationSource: 'manual_audit',
      validationTimestamp: new Date(),
      notes: 'Aguardando conferência documental e ativação da chave da API oficial do CFMV.',
    };
  }
}
