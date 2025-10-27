import { test, expect } from '@playwright/test';

test('dashboard renders and filtering works', async ({ page }) => {
  await page.goto('http://localhost:8000');

  // Main elements exist
  await expect(page.locator('#chart-investment-main')).toBeVisible();
  await expect(page.locator('#chart-private-main')).toBeVisible();
  await expect(page.locator('#chart-public-main')).toBeVisible();

  // Check center total info text for default view (Investment Platform -> total should be visible)
  const invInfo = page.locator('#investment-info');
  await expect(invInfo).toContainText('Total');

  // Ensure a swatch exists and can be toggled: find the Technology swatch
  const techSwatch = page.locator('#filterList .swatch', { hasText: 'Technology' }).first();
  await expect(techSwatch).toBeVisible();

  // Click swatch to toggle off
  await techSwatch.click();

  // After toggle, aria-pressed should be 'false'
  const afterPressed = await techSwatch.getAttribute('aria-pressed');
  expect(afterPressed).toBe('false');

  // Toggle back on via keyboard (focus + press Space)
  await techSwatch.focus();
  await page.keyboard.press('Space');
  const ariaPressed2 = await techSwatch.getAttribute('aria-pressed');
  expect(ariaPressed2).toBe('true');
});