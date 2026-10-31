import { expect, test } from '@playwright/test';

test('página de preferências de notificação renderiza os controles e opt-in de WhatsApp', async ({ page }) => {
  await page.goto('/notificacoes/preferencias');
  await expect(page.getByRole('heading', { name: 'Preferências de Comunicação e Notificações' })).toBeVisible();
  await expect(page.getByText('Notificações por E-mail')).toBeVisible();
  await expect(page.getByText('WhatsApp Oficial (Business API)')).toBeVisible();
  await expect(page.getByText('Privacidade e Sigilo Clínico Garantidos')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar Preferências' })).toBeVisible();
});

test('página administrativa de auditoria da outbox renderiza os filtros e painel', async ({ page }) => {
  await page.goto('/admin/notificacoes');
  await expect(page.getByRole('heading', { name: /Auditoria de Notificações/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Processar Outbox/ })).toBeVisible();
  await expect(page.getByText('Total Registradas')).toBeVisible();
});
