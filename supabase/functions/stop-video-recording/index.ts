import { EgressClient } from 'npm:livekit-server-sdk';
import { authenticate, jsonResponse } from '../_shared/auth.ts';

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('Origin') ?? undefined;
  if (request.method === 'OPTIONS') return jsonResponse({}, 200, origin);
  if (request.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405, origin);

  const auth = await authenticate(request);
  if ('error' in auth) return auth.error;

  const livekitUrl = Deno.env.get('LIVEKIT_URL');
  const livekitApiKey = Deno.env.get('LIVEKIT_API_KEY');
  const livekitApiSecret = Deno.env.get('LIVEKIT_API_SECRET');
  if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
    return jsonResponse({ status: 'pending_configuration', message: 'GRAVAÇÃO PENDENTE DE CONFIGURAÇÃO' }, 503, origin);
  }

  let body: { consultationId?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Corpo JSON inválido.' }, 400, origin);
  }
  if (!body.consultationId) return jsonResponse({ error: 'Teleconsulta obrigatória.' }, 400, origin);

  const { data: authorization, error } = await auth.userClient.rpc('authorize_video_recording_stop', {
    p_consultation_id: body.consultationId,
  });
  if (error || !authorization?.egress_id) {
    return jsonResponse({ error: error?.message ?? 'Gravação não está ativa.' }, 403, origin);
  }

  const egressClient = new EgressClient(livekitUrl, livekitApiKey, livekitApiSecret);
  try {
    await egressClient.stopEgress(authorization.egress_id);
  } catch {
    return jsonResponse({ error: 'O provedor não conseguiu encerrar a gravação.' }, 502, origin);
  }

  const { error: updateError } = await auth.serviceClient.rpc('record_video_egress_stopped', {
    p_consultation_id: body.consultationId,
  });
  if (updateError) {
    return jsonResponse({ error: 'Gravação encerrada no provedor, mas o status não pôde ser persistido.' }, 500, origin);
  }

  return jsonResponse({ status: 'recording_stopping' }, 200, origin);
});
