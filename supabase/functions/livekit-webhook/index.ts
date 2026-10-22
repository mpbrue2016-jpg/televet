import { WebhookReceiver } from 'npm:livekit-server-sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { jsonResponse } from '../_shared/auth.ts';

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405);

  const livekitApiKey = Deno.env.get('LIVEKIT_API_KEY');
  const livekitApiSecret = Deno.env.get('LIVEKIT_API_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorizationHeader = request.headers.get('Authorization');

  if (!livekitApiKey || !livekitApiSecret || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Webhook LiveKit pendente de configuração.' }, 503);
  }

  if (!authorizationHeader) return jsonResponse({ error: 'Assinatura do webhook ausente.' }, 401);

  let event;
  try {
    const rawBody = await request.text();
    const receiver = new WebhookReceiver(livekitApiKey, livekitApiSecret);
    event = await receiver.receive(rawBody, authorizationHeader);
  } catch {
    return jsonResponse({ error: 'Assinatura do webhook LiveKit inválida.' }, 401);
  }

  const roomName = event.room?.name ?? event.egressInfo?.roomName;
  if (!event.id || !event.event || !roomName) {
    return jsonResponse({ error: 'Evento LiveKit sem identificadores obrigatórios.' }, 400);
  }

  const roomUuid = roomName;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roomUuid)) {
    return jsonResponse({ error: 'Nome de sala desconhecido.' }, 400);
  }

  const egressFile = event.egressInfo?.fileResults?.[0];
  const safePayload = event.egressInfo ? {
    egress_status: event.egressInfo.status,
    egressInfo: {
      fileResults: egressFile ? [{ filename: egressFile.filename }] : [],
    },
  } : {};
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await client.rpc('process_livekit_room_event', {
    p_provider_event_id: event.id,
    p_event_type: event.event,
    p_room_name: roomUuid,
    p_participant_identity: event.participant?.identity ?? null,
    p_payload: safePayload,
  });

  if (error) return jsonResponse({ error: 'Não foi possível persistir o evento da sala.' }, 500);
  return jsonResponse({ success: true, duplicate: Boolean(data?.duplicate) });
});
