import { test, expect } from '@playwright/test';

test('carte équipements : puce de forçage sur l’équipement actuellement forcé', async ({ page }) => {
  await page.goto('/demo/cards.html');
  const card = page.locator('flowio-equipment-card');
  await expect(card.locator('.tile-slot')).toHaveCount(7);
  await expect(card.locator('.tile-flag')).toHaveCount(0);
  await page.evaluate(() => {
    const el = document.querySelector('flowio-equipment-card') as any;
    const states = { ...el.hass.states };
    const current = states['switch.fio_io_flt_pmp'];
    states['switch.fio_io_flt_pmp'] = { ...current, attributes: { ...current.attributes, forced: true } };
    el.hass = { ...el.hass, states };
  });
  await expect(card.locator('.tile-flag')).toHaveCount(1);
  await expect(card.locator('.tile-slot').first().locator('.tile-flag')).toHaveCount(1);
  await expect(card.locator('.tile-flag')).toHaveAttribute('aria-label', 'Forçage actif');
});
