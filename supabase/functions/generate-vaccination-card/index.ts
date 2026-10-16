import { PDFDocument, PageSizes, StandardFonts, rgb } from 'npm:pdf-lib';
import { authenticate, jsonResponse } from '../_shared/auth.ts';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(`${value}`.includes('T') ? value : `${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
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

  const { data, error } = await auth.userClient.rpc('get_pet_vaccination_card_data', { p_pet_id: body.petId });
  if (error || !data) return jsonResponse({ error: error?.message ?? 'Acesso à carteira negado.' }, 403, origin);

  const pet = data.pet as Record<string, unknown>;
  const vaccinations = (data.vaccinations as Array<Record<string, unknown>>) ?? [];

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

  write('TeleVet | Carteira de vacinação', { bold: true, size: 18 });
  write(`Paciente: ${pet.name} | ${pet.species}${pet.breed ? ` | ${pet.breed}` : ''}`, { bold: true });
  write(`Nascimento: ${fmtDate(pet.birth_date as string | null)}`);
  write(`Emissão: ${new Date(data.generated_at as string).toLocaleString('pt-BR')}`);
  y -= 8;

  if (vaccinations.length === 0) {
    write('Nenhuma vacina registrada até o momento.');
  } else {
    for (const item of vaccinations) {
      write(`${fmtDate(item.application_date as string)} | ${String(item.vaccine_name)}`, { bold: true, size: 11 });
      if (item.manufacturer) write(`Fabricante: ${String(item.manufacturer)}`);
      if (item.lot_number) write(`Lote: ${String(item.lot_number)}`);
      if (item.dose_number) write(`Dose: ${String(item.dose_number)}`);
      if (item.veterinarian_name) write(`Profissional: ${String(item.veterinarian_name)}`);
      if (item.observations) write(`Observações: ${String(item.observations)}`);
      if (item.next_dose_at) write(`Próxima dose: ${fmtDate(item.next_dose_at as string)}`);
      else write('Próxima dose: não definida');
      y -= 6;
    }
  }

  y -= 8;
  write('Documento gerado pelo TeleVet a partir dos registros autorizados. Datas e doses conforme registro profissional.', { size: 8 });

  return jsonResponse({ pdfBase64: toBase64(await pdf.save()) }, 200, origin);
});
