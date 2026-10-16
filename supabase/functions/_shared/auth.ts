import { createClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

export function jsonResponse(body: unknown, status = 200, origin?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Access-Control-Allow-Origin': origin || '*',
      'Content-Type': 'application/json',
    },
  });
}

export async function authenticate(request: Request) {
  const authorization = request.headers.get('Authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!token || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return { error: jsonResponse({ error: 'Sessão não autenticada.' }, 401, request.headers.get('Origin') ?? undefined) };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) {
    return { error: jsonResponse({ error: 'Sessão inválida ou expirada.' }, 401, request.headers.get('Origin') ?? undefined) };
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { user: data.user, userClient, serviceClient };
}
