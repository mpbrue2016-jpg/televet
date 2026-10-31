// ==============================================================================
// src/app/api/notifications/webhook/route.ts
// Webhook para Recepção de Status de Entrega (WhatsApp Oficial e E-mail)
// ==============================================================================

import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/config/supabase-client';
import { NotificationWebhookHandler } from '@/notifications/webhooks/notification-webhook-handler';

export async function GET(req: Request) {
  // Verificação de Webhook da Meta (WhatsApp Cloud API challenge)
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'televet_meta_verify_token';

  if (mode === 'subscribe' && token === expectedToken) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Verificação inválida' }, { status: 403 });
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const supabase = getSupabaseClient();
    const handler = new NotificationWebhookHandler(supabase);

    // Identifica se é Meta WhatsApp
    if (payload.object === 'whatsapp_business_account') {
      const result = await handler.handleMetaWhatsAppWebhook(payload);
      return NextResponse.json({ success: true, processed: result.processed });
    }

    // Identifica se é Resend / SendGrid
    if (payload.type && payload.type.startsWith('email.')) {
      const ok = await handler.handleEmailDeliveryWebhook(payload);
      return NextResponse.json({ success: ok });
    }

    return NextResponse.json({ success: true, ignored: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erro no webhook' },
      { status: 500 }
    );
  }
}
