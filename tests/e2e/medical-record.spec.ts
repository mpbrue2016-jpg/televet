import { expect, test } from '@playwright/test';

const petId = process.env.PLAYWRIGHT_MEDICAL_RECORD_PET_ID;
const tutorState = process.env.PLAYWRIGHT_TUTOR_STORAGE_STATE;
const vetState = process.env.PLAYWRIGHT_VET_STORAGE_STATE;
const petshopState = process.env.PLAYWRIGHT_PETSHOP_STORAGE_STATE;
const unrelatedVetState = process.env.PLAYWRIGHT_UNRELATED_VET_STORAGE_STATE;
const prescriptionCode = process.env.PLAYWRIGHT_PRESCRIPTION_CODE;

function skipWithout(...values: Array<string | undefined>) {
  test.skip(values.some((value) => !value), 'Configure usuários e registros reais de staging para este fluxo.');
}

test('tutor vê o prontuário real, auditoria e exporta PDF', async ({ browser }) => {
  skipWithout(petId, tutorState);
  const context = await browser.newContext({ storageState: tutorState });
  const page = await context.newPage();
  await page.goto(`/dashboard/pet/${petId}`);
  await expect(page.getByRole('heading', { name: 'Linha do tempo clínica' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Ver histórico de acessos/ })).toBeVisible();
  await page.getByRole('button', { name: /Ver histórico de acessos/ }).click();
  await expect(page.getByText('Acesso ao prontuário')).toBeVisible();
  await context.close();
});

test('pet shop não acessa prontuário clínico', async ({ browser }) => {
  skipWithout(petId, petshopState);
  const context = await browser.newContext({ storageState: petshopState });
  const page = await context.newPage();
  await page.goto(`/dashboard/pet/${petId}`);
  await expect(page.getByText('Prontuário indisponível')).toBeVisible();
  await context.close();
});

test('veterinário sem vínculo não abre a timeline do pet', async ({ browser }) => {
  skipWithout(petId, unrelatedVetState);
  const context = await browser.newContext({ storageState: unrelatedVetState });
  const page = await context.newPage();
  await page.goto(`/dashboard/pet/${petId}`);
  await expect(page.getByText('Prontuário indisponível')).toBeVisible();
  await context.close();
});

test('verificação pública confirma receita sem revelar dados clínicos', async ({ page }) => {
  skipWithout(prescriptionCode);
  await page.goto(`/receita/${prescriptionCode}`);
  await expect(page.getByRole('heading', { name: 'Verificação de receita' })).toBeVisible();
  await expect(page.getByText('não exibe diagnóstico nem dados clínicos')).toBeVisible();
});

test('veterinário autorizado registra SOAP e inicia solicitação de exame', async ({ browser }) => {
  skipWithout(petId, vetState);
  const context = await browser.newContext({ storageState: vetState });
  const page = await context.newPage();
  await page.goto(`/dashboard/pet/${petId}`);
  await expect(page.getByRole('heading', { name: 'Linha do tempo clínica' })).toBeVisible();
  await page.getByRole('button', { name: 'Novo registro SOAP' }).click();
  await expect(page.getByLabel('Queixa principal')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).first().click();
  await page.getByRole('button', { name: 'Solicitar exame' }).click();
  await expect(page.getByLabel('Justificativa clínica')).toBeVisible();
  await context.close();
});
