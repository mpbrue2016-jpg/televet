import { authenticate, jsonResponse } from '../_shared/auth.ts';

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('Origin') ?? undefined;
  if (request.method === 'OPTIONS') return jsonResponse({}, 200, origin);
  if (request.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405, origin);

  const auth = await authenticate(request);
  if ('error' in auth) return auth.error;
  let body: { documentId?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Corpo JSON inválido.' }, 400, origin);
  }
  if (!body.documentId) return jsonResponse({ error: 'Documento obrigatório.' }, 400, origin);

  const { data: document, error: authorizationError } = await auth.userClient.rpc('get_clinical_document_download', {
    p_document_id: body.documentId,
  });
  if (authorizationError || !document?.path) {
    return jsonResponse({ error: authorizationError?.message ?? 'Acesso ao documento negado.' }, 403, origin);
  }

  const { data: signedUrl, error } = await auth.serviceClient.storage
    .from('clinical-documents')
    .createSignedUrl(document.path, 60, { download: document.title });
  if (error || !signedUrl) return jsonResponse({ error: 'Não foi possível criar link privado.' }, 502, origin);
  return jsonResponse({ signedUrl: signedUrl.signedUrl }, 200, origin);
});
