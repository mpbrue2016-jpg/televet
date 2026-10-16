export interface QualifiedSignatureRequest {
  signatureRequestId: string;
  status: 'pending_configuration' | 'pending_provider' | 'signed' | 'rejected' | 'failed';
  message: string;
}

export interface QualifiedSignatureAdapter {
  readonly configured: boolean;
  requestSignature(input: {
    prescriptionRequestId: string;
    veterinarianId: string;
    tutorId: string;
    petId: string;
    medications: unknown[];
  }): Promise<QualifiedSignatureRequest>;
}

export class PendingQualifiedSignatureAdapter implements QualifiedSignatureAdapter {
  readonly configured = false;

  async requestSignature(input: { prescriptionRequestId: string }): Promise<QualifiedSignatureRequest> {
    return {
      signatureRequestId: input.prescriptionRequestId,
      status: 'pending_configuration',
      message: 'ASSINATURA ICP-BRASIL PENDENTE DE CONFIGURAÇÃO. Nenhuma receita controlada foi emitida.',
    };
  }
}

export const qualifiedSignatureAdapter: QualifiedSignatureAdapter = new PendingQualifiedSignatureAdapter();
