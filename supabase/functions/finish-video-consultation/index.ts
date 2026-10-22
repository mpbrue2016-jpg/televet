import { RoomServiceClient } from 'npm:livekit-server-sdk';
import { authenticate, jsonResponse } from '../_shared/auth.ts';

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('Origin') ?? undefined;
  if (request.method === 'OPTIONS') return jsonResponse({}, 200, origin);
  if (request.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405, origin);

  const auth = await authenticate(request);
  if ('error' in auth) return auth.error;
  let body: {
    consultationId?: string;
    anamnesis?: string;
    physicalExam?: string;
    diagnosis?: string;
    clinicalConduct?: string;
    privateNotes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Corpo JSON inválido.' }, 400, origin);
  }
  if (!body.consultationId) return jsonResponse({ error: 'Teleconsulta obrigatória.' }, 400, origin);

  const { data, error } = await auth.userClient.rpc('finish_video_consultation', {
    p_consultation_id: body.consultationId,
    p_anamnesis: body.anamnesis ?? '',
    p_physical_exam: body.physicalExam ?? '',
    p_diagnosis: body.diagnosis ?? '',
    p_clinical_conduct: body.clinicalConduct ?? '',
    p_private_notes: body.privateNotes ?? null,
  });
  if (error) return jsonResponse({ error: error.message }, 403, origin);

  const livekitUrl = Deno.env.get('LIVEKIT_URL');
  const apiKey = Deno.env.get('LIVEKIT_API_KEY');
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
  let roomClosePending = false;
  if (data.room_name && livekitUrl && apiKey && apiSecret) {
    try {
      const rooms = new RoomServiceClient(livekitUrl, apiKey, apiSecret);
      await rooms.deleteRoom(data.room_name);
    } catch {
      roomClosePending = true;
    }
  } else if (data.room_name) {
    roomClosePending = true;
  }

  return jsonResponse({ ...data, room_close_pending: roomClosePending }, 200, origin);
});
