import { expect, test } from '@playwright/test';

const petId = process.env.PLAYWRIGHT_VACCINATION_PET_ID ?? process.env.PLAYWRIGHT_MEDICAL_RECORD_PET_ID;
const tutorState = process.env.PLAYWRIGHT_TUTOR_STORAGE_STATE;
const vetState = process.env.PLAYWRIGHT_VET_STORAGE_STATE;
const petshopState = process.env.PLAYWRIGHT_PETSHOP_STORAGE_STATE;

function skipWithout(...values: Array<string | undefined>) {
  test.skip(values.some((value) => !value), 'Configure usuários e registros reais de staging para este fluxo.');
}

test('tutor vê a carteira de vacinação e exporta PDF', async ({ browser }) => {
  skipWithout(petId, tutorState);
  const context = await browser.newContext({ storageState: tutorState });
  const page = await context.newPage();
  await page.goto(`/dashboard/pet/${petId}`);
  await expect(page.getByRole('heading', { name: /Carteira de vacinação/ })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF' }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('carteira-vacinacao');
  await context.close();
});

test('tutor exporta a carteira em JPG', async ({ browser }) => {
  skipWithout(petId, tutorState);
  const context = await browser.newContext({ storageState: tutorState });
  const page = await context.newPage();
  await page.goto(`/dashboard/pet/${petId}`);
  await expect(page.getByRole('heading', { name: /Carteira de vacinação/ })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JPG' }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('carteira-vacinacao');
  await context.close();
});

test('tutor abre o histórico de vacinação e consultas', async ({ browser }) => {
  skipWithout(petId, tutorState);
  const context = await browser.newContext({ storageState: tutorState });
  const page = await context.newPage();
  await page.goto(`/dashboard/pet/${petId}`);
  await page.getByRole('button', { name: /Histórico/ }).click();
  await expect(page.getByRole('heading', { name: 'Histórico de vacinação e consultas' })).toBeVisible();
  await context.close();
});

test('veterinário abre o formulário de nova vacina sem pré-preencher dados clínicos', async ({ browser }) => {
  skipWithout(petId, vetState);
  const context = await browser.newContext({ storageState: vetState });
  const page = await context.newPage();
  await page.goto(`/dashboard/pet/${petId}`);
  await page.getByRole('button', { name: 'Nova vacina' }).click();
  await expect(page.getByLabel('Vacina *')).toBeVisible();
  await expect(page.getByLabel('Data de aplicação *')).toBeVisible();
  // fabricante/lote/próxima dose são opcionais e começam vazios (nada inventado)
  await expect(page.getByLabel('Fabricante')).toHaveValue('');
  await expect(page.getByLabel('Próxima dose')).toHaveValue('');
  await page.getByRole('button', { name: 'Cancelar' }).first().click();
  await context.close();
});

test('pet shop não acessa a carteira de vacinação', async ({ browser }) => {
  skipWithout(petId, petshopState);
  const context = await browser.newContext({ storageState: petshopState });
  const page = await context.newPage();
  await page.goto(`/dashboard/pet/${petId}`);
  await expect(page.getByText('Prontuário indisponível')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Carteira de vacinação/ })).toHaveCount(0);
  await context.close();
});
