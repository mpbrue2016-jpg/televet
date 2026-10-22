import { RoomServiceClient } from 'npm:livekit-server-sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { jsonResponse } from '../_shared/auth.ts';

Deno.serve(async (request: Request) => {
  const secret = Deno.env.get('VIDEO_RECONCILE_SECRET');
  const livekitUrl = Deno.env.get('LIVEKIT_URL');
  const apiKey = Deno.env.get('LIVEKIT_API_KEY');
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret || !livekitUrl || !apiKey || !apiSecret || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ status: 'pending_configuration' }, 503);
  }
  if (request.headers.get('Authorization') !== `Bearer ${secret}`) {
    return jsonResponse({ error: 'Não autorizado.' }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: staleRooms, error: listError } = await supabase.rpc('list_expired_video_rooms');
  if (listError) return jsonResponse({ error: 'Não foi possível listar salas expiradas.' }, 500);

  const roomService = new RoomServiceClient(livekitUrl, apiKey, apiSecret);
  let providerRoomsClosed = 0;
  const roomsPendingClose: string[] = [];
  for (const room of staleRooms ?? []) {
    if (!room.room_name) continue;
    try {
      const activeRooms = await roomService.listRooms([room.room_name]);
      if (activeRooms.length > 0) {
        await roomService.deleteRoom(room.room_name);
        providerRoomsClosed += 1;
      }
    } catch {
      roomsPendingClose.push(room.consultation_id);
    }
  }

  if (roomsPendingClose.length > 0) {
    return jsonResponse({
      error: 'Algumas salas ainda não foram fechadas no provedor; a reconciliação será repetida.',
      roomsPendingClose,
    }, 502);
  }

  const { data: updatedCount, error: closeError } = await supabase.rpc('auto_close_expired_video_rooms');
  if (closeError) return jsonResponse({ error: 'Salas fechadas no provedor, mas o estado não foi reconciliado.' }, 500);

  return jsonResponse({ success: true, providerRoomsClosed, databaseRoomsUpdated: updatedCount ?? 0 });
});
