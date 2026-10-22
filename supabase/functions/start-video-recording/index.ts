import { EncodedFileOutput, EgressClient } from 'npm:livekit-server-sdk';
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
  const storageEndpoint = Deno.env.get('LIVEKIT_RECORDING_S3_ENDPOINT');
  const storageBucket = Deno.env.get('LIVEKIT_RECORDING_S3_BUCKET');
  const storageAccessKey = Deno.env.get('LIVEKIT_RECORDING_S3_ACCESS_KEY');
  const storageSecret = Deno.env.get('LIVEKIT_RECORDING_S3_SECRET');
  const storageRegion = Deno.env.get('LIVEKIT_RECORDING_S3_REGION') ?? 'us-east-1';

  if (!livekitUrl || !livekitApiKey || !livekitApiSecret || !storageEndpoint || !storageBucket || !storageAccessKey || !storageSecret) {
    return jsonResponse({
      status: 'pending_configuration',
      message: 'GRAVAÇÃO PENDENTE DE CONFIGURAÇÃO',
    }, 503, origin);
  }

  let body: { consultationId?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Corpo JSON inválido.' }, 400, origin);
  }
  if (!body.consultationId) return jsonResponse({ error: 'Teleconsulta obrigatória.' }, 400, origin);

  const { data: authorization, error: authorizationError } = await auth.userClient.rpc('authorize_video_recording', {
    p_consultation_id: body.consultationId,
  });
  if (authorizationError || !authorization) {
    return jsonResponse({ error: authorizationError?.message ?? 'Gravação não autorizada.' }, 403, origin);
  }

  const storagePath = `${body.consultationId}/${crypto.randomUUID()}.mp4`;
  const output = new EncodedFileOutput({
    filepath: storagePath,
    output: {
      case: 's3',
      value: {
        accessKey: storageAccessKey,
        secret: storageSecret,
        region: storageRegion,
        bucket: storageBucket,
        endpoint: storageEndpoint,
        forcePathStyle: true,
      },
    },
  });

  const egressClient = new EgressClient(livekitUrl, livekitApiKey, livekitApiSecret);
  let egressId: string;
  try {
    const egress = await egressClient.startRoomCompositeEgress(authorization.room_name, output);
    egressId = egress.egressId;
  } catch {
    return jsonResponse({ error: 'O provedor não conseguiu iniciar a gravação.' }, 502, origin);
  }

  const { data: started, error: persistenceError } = await auth.serviceClient.rpc('record_video_egress_started', {
    p_consultation_id: body.consultationId,
    p_egress_id: egressId,
    p_storage_path: storagePath,
    p_retention_days: Number(Deno.env.get('CONSULTATION_RECORDING_RETENTION_DAYS') ?? '90'),
  });

  if (persistenceError || !started?.success) {
    await egressClient.stopEgress(egressId).catch(() => undefined);
    return jsonResponse({ error: 'Consentimento não pôde ser confirmado; gravação interrompida.' }, 409, origin);
  }

  return jsonResponse({ status: 'recording_active', egressId }, 200, origin);
});
