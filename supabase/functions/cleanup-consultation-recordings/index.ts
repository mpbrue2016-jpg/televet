import { createClient } from 'npm:@supabase/supabase-js@2';
import { jsonResponse } from '../_shared/auth.ts';

Deno.serve(async (request: Request) => {
  const secret = Deno.env.get('VIDEO_RECONCILE_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ status: 'pending_configuration' }, 503);
  }
  if (request.headers.get('Authorization') !== `Bearer ${secret}`) {
    return jsonResponse({ error: 'Não autorizado.' }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: recordings, error: listError } = await supabase.rpc('list_expired_recordings');
  if (listError) return jsonResponse({ error: 'Não foi possível listar gravações expiradas.' }, 500);

  let deletedCount = 0;
  const failures: string[] = [];
  for (const recording of recordings ?? []) {
    const { error: removeError } = await supabase.storage
      .from('consultation-recordings')
      .remove([recording.storage_path]);
    if (removeError) {
      failures.push(recording.consultation_id);
      continue;
    }

    const { error: updateError } = await supabase
      .from('consultations')
      .update({ recording_storage_path: null, recording_url: null, recording_deleted_at: new Date().toISOString() })
      .eq('id', recording.consultation_id);
    if (updateError) {
      failures.push(recording.consultation_id);
      continue;
    }

    await supabase.from('consultation_recording_access_log').insert({
      tenant_id: recording.tenant_id,
      consultation_id: recording.consultation_id,
      user_id: null,
      purpose: 'retention_cleanup',
      metadata: { result: 'deleted_after_retention' },
    });
    deletedCount += 1;
  }

  return jsonResponse({ success: failures.length === 0, deletedCount, failures });
});
