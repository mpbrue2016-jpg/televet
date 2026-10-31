// ==============================================================================
// src/app/api/notifications/worker/route.ts
// Endpoint para acionar o processamento resiliente da Fila Outbox
// ==============================================================================

import { NextResponse } from 'next/server';
import { NotificationService } from '@/notifications/notification-service';

export async function POST(req: Request) {
  try {
    const service = new NotificationService();
    const result = await service.processOutbox(25);

    return NextResponse.json({
      success: true,
      message: 'Processamento da outbox executado.',
      result,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Erro ao processar fila outbox.',
      },
      { status: 500 }
    );
  }
}
