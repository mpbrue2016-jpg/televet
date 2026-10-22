import { expect, test } from '@playwright/test';

const consultationId = process.env.PLAYWRIGHT_TELECONSULTATION_ID;
const tutorState = process.env.PLAYWRIGHT_TUTOR_STORAGE_STATE;
const veterinarianState = process.env.PLAYWRIGHT_VET_STORAGE_STATE;
const thirdPartyState = process.env.PLAYWRIGHT_THIRD_PARTY_STORAGE_STATE;
const unpaidConsultationId = process.env.PLAYWRIGHT_UNPAID_CONSULTATION_ID;
const credentialsConfigured = Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
const recordingConfigured = Boolean(
  process.env.LIVEKIT_RECORDING_S3_ENDPOINT
  && process.env.LIVEKIT_RECORDING_S3_BUCKET
  && process.env.LIVEKIT_RECORDING_S3_ACCESS_KEY
  && process.env.LIVEKIT_RECORDING_S3_SECRET,
);

function requireVideoFixture(...values: Array<string | undefined>) {
  test.skip(!credentialsConfigured || values.some((value) => !value), 'Configure LiveKit e os storage states de staging para executar este fluxo real.');
}

test('rota da teleconsulta renderiza a sala de espera sem simular vídeo', async ({ page }) => {
  await page.goto('/teleconsulta/00000000-0000-4000-8000-000000000001');
  await expect(page.getByRole('heading', { name: 'Prepare seu atendimento' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar na teleconsulta' })).toBeVisible();
});

test('tutor e veterinário entram, conversam e encerram a teleconsulta real', async ({ browser }) => {
  requireVideoFixture(consultationId, tutorState, veterinarianState);

  const tutorContext = await browser.newContext({ storageState: tutorState, permissions: ['camera', 'microphone'] });
  const vetContext = await browser.newContext({ storageState: veterinarianState, permissions: ['camera', 'microphone'] });
  const tutor = await tutorContext.newPage();
  const vet = await vetContext.newPage();

  await Promise.all([
    tutor.goto(`/teleconsulta/${consultationId}`),
    vet.goto(`/teleconsulta/${consultationId}`),
  ]);
  await Promise.all([
    tutor.getByRole('button', { name: 'Testar câmera, microfone e dispositivos' }).click(),
    vet.getByRole('button', { name: 'Testar câmera, microfone e dispositivos' }).click(),
  ]);
  await Promise.all([
    tutor.getByRole('button', { name: 'Entrar na teleconsulta' }).click(),
    vet.getByRole('button', { name: 'Entrar na teleconsulta' }).click(),
  ]);

  await expect(tutor.getByText('Conectado à sala LiveKit')).toBeVisible({ timeout: 30_000 });
  await expect(vet.getByText('Conectado à sala LiveKit')).toBeVisible({ timeout: 30_000 });
  await tutor.getByRole('textbox', { name: 'Mensagem' }).fill('Mensagem de teste da consulta');
  await tutor.getByRole('button', { name: 'Enviar mensagem' }).click();
  await expect(vet.getByText('Mensagem de teste da consulta')).toBeVisible();

  vet.on('dialog', (dialog) => dialog.accept());
  await vet.getByRole('button', { name: 'Encerrar consulta' }).click();
  await expect(vet.getByText('Você saiu da sala.')).toBeVisible({ timeout: 15_000 });
  await tutorContext.close();
  await vetContext.close();
});

test('pagamento não capturado impede emitir token ou entrar na sala', async ({ browser }) => {
  requireVideoFixture(unpaidConsultationId, tutorState);
  const context = await browser.newContext({ storageState: tutorState, permissions: ['camera', 'microphone'] });
  const page = await context.newPage();
  await page.goto(`/teleconsulta/${unpaidConsultationId}`);
  await page.getByRole('button', { name: 'Entrar na teleconsulta' }).click();
  await expect(page.getByRole('alert')).toContainText('Pagamento ainda não confirmado pelo gateway.');
  await context.close();
});

test('usuário terceiro não recebe token de entrada', async ({ browser }) => {
  requireVideoFixture(consultationId, thirdPartyState);
  const context = await browser.newContext({ storageState: thirdPartyState, permissions: ['camera', 'microphone'] });
  const page = await context.newPage();
  await page.goto(`/teleconsulta/${consultationId}`);
  await page.getByRole('button', { name: 'Entrar na teleconsulta' }).click();
  await expect(page.getByRole('alert')).toContainText('Este usuário não participa da teleconsulta.');
  await context.close();
});

test('Edge Function rejeita gravação sem consentimento bilateral', async ({ browser }) => {
  test.skip(
    !credentialsConfigured || !recordingConfigured || !consultationId || !veterinarianState
      || !process.env.PLAYWRIGHT_SUPABASE_URL || !process.env.PLAYWRIGHT_SUPABASE_ANON_KEY,
    'Configure LiveKit Egress, Supabase anon e uma consulta ativa de staging sem consentimentos.',
  );

  const context = await browser.newContext({ storageState: veterinarianState });
  const page = await context.newPage();
  await page.goto(`/teleconsulta/${consultationId}`);
  const result = await page.evaluate(async ({ supabaseUrl, anonKey, id }) => {
    const session = Object.values(localStorage)
      .map((value) => {
        try { return JSON.parse(value); } catch { return null; }
      })
      .find((value) => value?.access_token);
    if (!session?.access_token) throw new Error('Sessão Supabase não encontrada no navegador.');

    const response = await fetch(`${supabaseUrl}/functions/v1/start-video-recording`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ consultationId: id }),
    });
    return { status: response.status, body: await response.json() };
  }, {
    supabaseUrl: process.env.PLAYWRIGHT_SUPABASE_URL!,
    anonKey: process.env.PLAYWRIGHT_SUPABASE_ANON_KEY!,
    id: consultationId!,
  });

  expect(result.status).toBe(403);
  expect(result.body.error).toContain('consentimento bilateral');
  await context.close();
});
