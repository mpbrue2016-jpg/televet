import { authenticate, jsonResponse } from '../_shared/auth.ts';

const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const fileExtensions: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

async function matchesMimeSignature(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (file.type === 'application/pdf') return new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
  if (file.type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.type === 'image/png') return bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10';
  if (file.type === 'image/webp') return new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF'
    && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
  return false;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('Origin') ?? undefined;
  if (request.method === 'OPTIONS') return jsonResponse({}, 200, origin);
  if (request.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405, origin);

  const auth = await authenticate(request);
  if ('error' in auth) return auth.error;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse({ error: 'Formulário inválido.' }, 400, origin);
  }

  const petId = String(form.get('petId') ?? '');
  const vaccinationId = String(form.get('vaccinationId') ?? '');
  const title = String(form.get('title') ?? '').trim();
  const file = form.get('file');
  if (!(file instanceof File) || !petId || !vaccinationId || !title) {
    return jsonResponse({ error: 'Pet, vacina, título e arquivo são obrigatórios.' }, 400, origin);
  }
  if (!allowedTypes.has(file.type) || file.size <= 0 || file.size > 20 * 1024 * 1024) {
    return jsonResponse({ error: 'Envie PDF/JPG/PNG/WebP com até 20 MB.' }, 415, origin);
  }
  if (!await matchesMimeSignature(file)) {
    return jsonResponse({ error: 'O conteúdo do arquivo não corresponde ao tipo informado.' }, 415, origin);
  }

  const { data: authorization, error: accessError } = await auth.userClient.rpc('authorize_vaccination_document_upload', {
    p_pet_id: petId,
    p_vaccination_id: vaccinationId,
  });
  if (accessError || !authorization?.storage_prefix) {
    return jsonResponse({ error: accessError?.message ?? 'Acesso negado.' }, 403, origin);
  }

  const storagePath = `${authorization.storage_prefix}${crypto.randomUUID()}.${fileExtensions[file.type]}`;
  const { error: uploadError } = await auth.serviceClient.storage
    .from('clinical-documents')
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) return jsonResponse({ error: 'Falha ao armazenar o comprovante.' }, 502, origin);

  const { data: documentId, error: registerError } = await auth.userClient.rpc('register_vaccination_document', {
    p_pet_id: petId,
    p_vaccination_id: vaccinationId,
    p_title: title,
    p_storage_path: storagePath,
    p_file_size_bytes: file.size,
    p_mime_type: file.type,
  });

  if (registerError || !documentId) {
    await auth.serviceClient.storage.from('clinical-documents').remove([storagePath]);
    return jsonResponse({ error: registerError?.message ?? 'Falha ao registrar o comprovante.' }, 409, origin);
  }

  return jsonResponse({ success: true, documentId }, 201, origin);
});
