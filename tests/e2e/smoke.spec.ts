import { expect, test } from '@playwright/test';

test('la portada carga', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Chugi');
});
