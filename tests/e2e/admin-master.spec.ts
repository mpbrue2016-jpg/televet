import { expect, test } from '@playwright/test';

test('painel de superadmin renderiza métricas executivas, MFA e navegação master', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: /Painel Executivo Admin Master/ })).toBeVisible();
  await expect(page.getByText('MFA Ativo')).toBeVisible();
  await expect(page.getByText('MRR (Mensalidades SaaS)')).toBeVisible();
  await expect(page.getByText('GMV Total Transacionado')).toBeVisible();
  await expect(page.getByText('Transparência na Origem dos Dados')).toBeVisible();
});

test('página de moderação de veterinários renderiza controles de validação de CRMV', async ({ page }) => {
  await page.goto('/admin/veterinarios');
  await expect(page.getByRole('heading', { name: /Gestão e Moderação de Veterinários/ })).toBeVisible();
  await expect(page.getByPlaceholder(/Buscar por nome, e-mail ou CRMV/)).toBeVisible();
});

test('página financeira renderiza ledger e botão de exportação sanitizada LGPD', async ({ page }) => {
  await page.goto('/admin/financeiro');
  await expect(page.getByRole('heading', { name: /Financeiro, Conciliação e Ledger/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Exportar Ledger/ })).toBeVisible();
  await expect(page.getByText('Exportação com Minimização de Dados (LGPD)')).toBeVisible();
});

test('página de suporte renderiza helpdesk com SLA e notas internas', async ({ page }) => {
  await page.goto('/admin/suporte');
  await expect(page.getByRole('heading', { name: /Central de Suporte & Helpdesk Master/ })).toBeVisible();
  await expect(page.getByText('Chamados (')).toBeVisible();
});

test('página de configurações renderiza feature flags em tempo real', async ({ page }) => {
  await page.goto('/admin/configuracoes');
  await expect(page.getByRole('heading', { name: /Governança Global & Feature Flags/ })).toBeVisible();
  await expect(page.getByText('Telemedicina Imediata (Plantão 24h)')).toBeVisible();
  await expect(page.getByText('Exigência Estrita de MFA para Superadmin')).toBeVisible();
});
