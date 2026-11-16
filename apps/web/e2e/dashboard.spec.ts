import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import type { YieldOverview } from '../src/lib/api.ts';

const UPSTREAM_URL = process.env.E2E_UPSTREAM_URL ?? 'http://127.0.0.1:4011';
const ABOVE_CUT_OUT_MS = 30;
const RATED_SPEED_MS = 16;
const RATED_POWER_KW = 3600;
const LIGHT_PAGE = 'rgb(246, 245, 242)';
const DARK_PAGE = 'rgb(17, 17, 16)';

async function readyYield(request: APIRequestContext) {
  const overview: YieldOverview = await (await request.get('/api/yield')).json();

  if (overview.state !== 'ready') {
    throw new Error('the yield is not ready');
  }

  return overview.result;
}

test('shows the yield and the three views', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Windpark Spreewald');
  await expect(page.getByTestId('hero-value')).toHaveText(/^\d{1,3}(\.\d{3})*$/);
  await expect(page.getByRole('heading', { name: 'Rechenweg' })).toBeVisible();

  await page.getByRole('link', { name: 'Projektierer' }).click();
  await expect(page.getByRole('heading', { name: 'Netto-Ertrag je Monat' })).toBeVisible();

  await page.getByRole('link', { name: 'Bank' }).click();
  await expect(page.getByRole('heading', { name: 'P50 und P90 im Live-Betrieb' })).toBeHidden();

  await page.getByText('Entwicklung des Ergebnisses').click();
  await expect(page.getByRole('heading', { name: 'P50 und P90 im Live-Betrieb' })).toBeVisible();
});

test('updates the numbers without a reload when the source corrects a value', async ({
  page,
  request,
}) => {
  const latestHour = (await readyYield(request)).windowEnd;
  const firstVersion = Math.floor(Date.now() / 1000);
  const correct = (windSpeedMs: number, version: number) =>
    request.post(`${UPSTREAM_URL}/_control/measurements`, {
      data: [
        {
          timestamp: latestHour,
          wind_speed: windSpeedMs,
          unit: 'm/s',
          wind_direction_deg: 180,
          version,
          updated_at: new Date().toISOString(),
        },
      ],
    });

  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Live');
  await page.evaluate(() => {
    document.body.dataset.loadedOnce = 'yes';
  });

  const correctedAt = new Date().toISOString();
  await correct(ABOVE_CUT_OUT_MS, firstVersion);
  await expect
    .poll(async () => (await readyYield(request)).computedAt > correctedAt, { timeout: 30_000 })
    .toBe(true);

  const expectedMwh = (await readyYield(request)).measuredGrossMwh + RATED_POWER_KW / 1000;
  await correct(RATED_SPEED_MS, firstVersion + 1);
  await expect
    .poll(async () => (await readyYield(request)).measuredGrossMwh, { timeout: 30_000 })
    .toBeCloseTo(expectedMwh, 6);

  const grossMwh = (await readyYield(request)).grossMwh;

  await expect(page.getByTestId('gross-value')).toHaveText(
    Math.round(grossMwh).toLocaleString('de-DE'),
    { timeout: 15_000 },
  );
  await expect(page.locator('body')).toHaveAttribute('data-loaded-once', 'yes');
});

test('reports the operating state', async ({ page }) => {
  await page.goto('/status');

  await expect(page.getByTestId('status-headline')).toHaveText('Daten aktuell');
  await expect(page.getByText('Letzte Abrufe')).toBeVisible();
});

async function countViewTransitions(page: Page): Promise<void> {
  await page.evaluate(() => {
    const start = document.startViewTransition.bind(document);

    document.body.dataset.transitions = '0';
    document.startViewTransition = (update) => {
      document.body.dataset.transitions = String(Number(document.body.dataset.transitions) + 1);

      return start(update);
    };
  });
}

test('starts light, changes to dark with a transition and keeps the choice', async ({ page }) => {
  const body = page.locator('body');

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(body).toHaveCSS('background-color', LIGHT_PAGE);

  await countViewTransitions(page);
  await page.getByRole('button', { name: 'Dunkel' }).click();
  await expect(body).toHaveCSS('background-color', DARK_PAGE);
  await expect(body).toHaveAttribute('data-transitions', '1');

  await page.reload();
  await expect(body).toHaveCSS('background-color', DARK_PAGE);
  await expect(page.getByRole('button', { name: 'Dunkel' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await countViewTransitions(page);
  await page.getByRole('button', { name: 'Hell' }).click();
  await expect(body).toHaveCSS('background-color', LIGHT_PAGE);
  await expect(body).toHaveAttribute('data-transitions', '0');
});

test('keeps one live connection when the page changes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Live');
  await page.getByRole('status').evaluate((element) => {
    new MutationObserver(() => {
      document.body.dataset.liveChanged = 'yes';
    }).observe(element, { childList: true, characterData: true, subtree: true });
  });

  await page.getByRole('link', { name: 'Betrieb' }).click();
  await expect(page.getByTestId('status-headline')).toBeVisible();
  await page.getByRole('link', { name: 'Ertrag', exact: true }).click();
  await expect(page.getByTestId('hero-value')).toBeVisible();

  await expect(page.getByRole('status')).toHaveText('Live');
  await expect(page.locator('body')).not.toHaveAttribute('data-live-changed');
});
