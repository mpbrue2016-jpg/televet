import { PDFDocument, PageSizes, StandardFonts, rgb } from 'npm:pdf-lib';
import QRCode from 'npm:qrcode';
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
  let body: { prescriptionId?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Corpo JSON inválido.' }, 400, origin);
  }
  if (!body.prescriptionId) return jsonResponse({ error: 'Receita obrigatória.' }, 400, origin);

  const { data, error } = await auth.userClient.rpc('get_prescription_pdf_data', {
    p_prescription_id: body.prescriptionId,
  });
  if (error || !data) return jsonResponse({ error: error?.message ?? 'Acesso à receita negado.' }, 403, origin);

  const publicAppUrl = Deno.env.get('PUBLIC_APP_URL')?.replace(/\/$/, '');
  if (!publicAppUrl) return jsonResponse({ status: 'pending_configuration', message: 'URL pública pendente de configuração.' }, 503, origin);

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage(PageSizes.A4);
  const { width } = page.getSize();
  const margin = 48;
  let y = page.getHeight() - margin;
  const color = rgb(0.1, 0.25, 0.21);
  const qrPng = await QRCode.toBuffer(`${publicAppUrl}/receita/${encodeURIComponent(String(data.validation_code))}`, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 180,
  });
  const qrImage = await pdf.embedPng(qrPng);

  page.drawText('TeleVet | Receita veterinária', { x: margin, y, size: 18, font: bold, color });
  y -= 32;
  page.drawText(`Código de validação: ${data.validation_code}`, { x: margin, y, size: 10, font: regular });
  page.drawImage(qrImage, { x: width - margin - 88, y: y - 92, width: 88, height: 88 });
  y -= 16;
  page.drawText(`Emissão: ${data.issued_at}  |  Validade: ${data.expires_at ?? 'não informada'}`, { x: margin, y, size: 9, font: regular });
  y -= 28;

  const sections: Array<[string, string]> = [
    ['Paciente', `${data.pet.name} | ${data.pet.species}${data.pet.breed ? ` | ${data.pet.breed}` : ''}`],
    ['Alergias declaradas', data.pet.allergies || 'Não informadas'],
    ['Responsável', data.tutor.name],
    ['Médico-veterinário', `${data.veterinarian.name} | CRMV ${data.veterinarian.crmv_number}/${data.veterinarian.crmv_uf}`],
  ];
  for (const [heading, text] of sections) {
    page.drawText(heading, { x: margin, y, size: 10, font: bold, color });
    y -= 14;
    page.drawText(text, { x: margin, y, size: 10, font: regular, maxWidth: width - margin * 2 });
    y -= 25;
  }

  page.drawText('Prescrição', { x: margin, y, size: 12, font: bold, color });
  y -= 20;
  for (const [index, medication] of (data.medications as Array<Record<string, string>>).entries()) {
    const description = `${index + 1}. ${medication.name} (${medication.presentation ?? ''})\n   Posologia: ${medication.dosage} | ${medication.frequency} | ${medication.duration}\n   Via: ${medication.route ?? 'não informada'}${medication.instructions ? ` | ${medication.instructions}` : ''}`;
    page.drawText(description, { x: margin, y, size: 9, font: regular, maxWidth: width - margin * 2, lineHeight: 13 });
    y -= 48;
  }
  if (data.recommendations) {
    y -= 6;
    page.drawText('Recomendações', { x: margin, y, size: 10, font: bold, color });
    y -= 15;
    page.drawText(String(data.recommendations), { x: margin, y, size: 9, font: regular, maxWidth: width - margin * 2, lineHeight: 13 });
  }
  const bytes = await pdf.save();
  return jsonResponse({ pdfBase64: toBase64(bytes) }, 200, origin);
});
