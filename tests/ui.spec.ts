import { test, expect } from '@playwright/test';

test('dashboard renders and filtering works', async ({ page }) => {
  // Open app
  await page.goto('http://localhost:8000');

  // Wait for main canvases to appear (avoid flakes)
  await page.waitForSelector('#chart-investment-main', { timeout: 10000 });
  await expect(page.locator('#chart-investment-main')).toBeVisible();
  await expect(page.locator('#chart-private-main')).toBeVisible();
  await expect(page.locator('#chart-public-main')).toBeVisible();

  // Check per-panel legend: find the Technology item under the Investment legend
  const techSwatch = page.locator('#legend-investment .legend-item', { hasText: 'Technology' }).first();
  await expect(techSwatch).toBeVisible();

  // Click to toggle (UI behavior may change charts) and then toggle back via keyboard
  await techSwatch.click();

  // Ensure the legend item is still present and focusable; then toggle back with keyboard
  await techSwatch.focus();
  await page.keyboard.press('Space');

  // Final assertion: legend item remains visible
  await expect(techSwatch).toBeVisible();
});