import { PDFDocument, PageSizes, StandardFonts, rgb } from 'npm:pdf-lib';
import { authenticate, jsonResponse } from '../_shared/auth.ts';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('Origin') ?? undefined;
  if (request.method === 'OPTIONS') return jsonResponse({}, 200, origin);
  if (request.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405, origin);

  const auth = await authenticate(request);
  if ('error' in auth) return auth.error;
  let body: { petId?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Corpo JSON inválido.' }, 400, origin);
  }
  if (!body.petId) return jsonResponse({ error: 'Pet obrigatório.' }, 400, origin);

  const { data, error } = await auth.userClient.rpc('get_pet_medical_timeline', {
    p_pet_id: body.petId,
    p_from: null,
    p_to: null,
    p_veterinarian_id: null,
    p_event_type: null,
    p_search: null,
  });
  if (error || !data) return jsonResponse({ error: error?.message ?? 'Acesso ao prontuário negado.' }, 403, origin);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage(PageSizes.A4);
  const margin = 48;
  const lineHeight = 13;
  let y = page.getHeight() - margin;
  const color = rgb(0.1, 0.25, 0.21);

  const write = (text: string, options: { bold?: boolean; size?: number } = {}) => {
    if (y < margin + 40) {
      page = pdf.addPage(PageSizes.A4);
      y = page.getHeight() - margin;
    }
    page.drawText(text, {
      x: margin,
      y,
      size: options.size ?? 9,
      font: options.bold ? bold : font,
      color: options.bold ? color : rgb(0.15, 0.18, 0.17),
      maxWidth: page.getWidth() - margin * 2,
    });
    y -= options.size && options.size > 13 ? 24 : lineHeight;
  };

  write('TeleVet | Prontuário do paciente', { bold: true, size: 18 });
  write(`Paciente: ${data.pet.name} | ${data.pet.species}${data.pet.breed ? ` | ${data.pet.breed}` : ''}`, { bold: true });
  write(`Alergias declaradas: ${data.pet.allergies || 'Não informadas'}`);
  write(`Gerado em: ${new Date().toISOString()}`);
  y -= 8;

  for (const event of data.timeline as Array<Record<string, unknown>>) {
    write(`${event.created_at} | ${event.kind} | ${event.title}`, { bold: true });
    for (const key of ['complaint', 'anamnesis', 'physical_exam', 'assessment', 'diagnosis', 'plan', 'details', 'clinical_justification', 'results_text', 'recommendations']) {
      if (event[key]) write(`${key}: ${String(event[key])}`);
    }
    if (Array.isArray(event.addenda)) {
      for (const addendum of event.addenda as Array<Record<string, unknown>>) {
        write(`Adendo v${addendum.version_number}: ${addendum.reason} | ${addendum.content}`);
      }
    }
    y -= 8;
  }

  return jsonResponse({ pdfBase64: toBase64(await pdf.save()) }, 200, origin);
});
