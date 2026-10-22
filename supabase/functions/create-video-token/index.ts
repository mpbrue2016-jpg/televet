import { AccessToken } from 'npm:livekit-server-sdk';
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
    return jsonResponse({
      status: 'pending_configuration',
      message: 'VÍDEO PENDENTE DE CONFIGURAÇÃO',
    }, 503, origin);
  }

  let body: { consultationId?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Corpo JSON inválido.' }, 400, origin);
  }

  if (!body.consultationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.consultationId)) {
    return jsonResponse({ error: 'Identificador de teleconsulta inválido.' }, 400, origin);
  }

  const { data: authorization, error } = await auth.serviceClient.rpc('authorize_video_session', {
    p_consultation_id: body.consultationId,
    p_user_id: auth.user.id,
  });

  if (error || !authorization) {
    return jsonResponse({ error: error?.message ?? 'Acesso à teleconsulta negado.' }, 403, origin);
  }

  const accessToken = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity: authorization.participant_identity,
    name: authorization.participant_role === 'veterinarian' ? 'Veterinário' : 'Tutor',
    ttl: '5m',
  });
  accessToken.addGrant({
    roomJoin: true,
    room: authorization.room_name,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canPublishSources: ['camera', 'microphone', 'screen_share'],
  });

  return jsonResponse({
    status: 'ready',
    token: await accessToken.toJwt(),
    serverUrl: livekitUrl,
    consultation: authorization,
  }, 200, origin);
});
