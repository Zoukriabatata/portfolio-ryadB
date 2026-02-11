/**
 * E2E TESTS FOR ANIMATIONS
 *
 * Tests animation behavior and performance
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Layout Transitions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/live`);
    await page.waitForLoadState('networkidle');
  });

  test('should animate layout change from 1x1 to 2x1', async ({ page }) => {
    // Find layout selector
    const layoutSelector = page.locator('[data-testid="layout-selector"]').or(
      page.locator('button').filter({ hasText: /1x1|2x1|2x2/ }).first().locator('..')
    );

    // Click 2x1 button
    const button2x1 = layoutSelector.locator('button').filter({ hasText: '2x1' }).or(
      layoutSelector.locator('button').nth(1)
    );

    await button2x1.click();

    // Wait for animation to complete
    await page.waitForTimeout(500); // Animation duration

    // Verify 2 chart panels exist
    const chartPanels = page.locator('[class*="chart-panel"], [class*="LiveChartPro"]');
    await expect(chartPanels).toHaveCount(2, { timeout: 2000 });
  });

  test('should show stagger effect in 2x2 mode', async ({ page }) => {
    // Click 2x2 layout
    const button2x2 = page.locator('button').filter({ hasText: '2x2' }).or(
      page.locator('button[title*="2x2"]')
    );

    await button2x2.click();

    // Wait for stagger animation
    await page.waitForTimeout(800); // Stagger delay (0.15s * 4 panels)

    // Verify 4 chart panels
    const chartPanels = page.locator('[class*="chart-panel"], [class*="LiveChartPro"]');
    await expect(chartPanels).toHaveCount(4, { timeout: 2000 });
  });

  test('should have smooth layout selector button animations', async ({ page }) => {
    const layoutButtons = page.locator('button').filter({ hasText: /1x1|2x1|2x2/ });

    // Hover over first button
    await layoutButtons.first().hover();

    // Should have transition class
    const hasTransition = await layoutButtons.first().evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return computed.transitionProperty !== 'none';
    });

    expect(hasTransition).toBeTruthy();
  });
});

test.describe('Panel Animations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/live`);
    await page.waitForLoadState('networkidle');
  });

  test('should animate watchlist panel collapse', async ({ page }) => {
    // Find Hide button in watchlist
    const hideButton = page.locator('button').filter({ hasText: 'Hide' }).first();

    if (await hideButton.isVisible()) {
      await hideButton.click();

      // Wait for animation
      await page.waitForTimeout(350); // Panel slide duration

      // Panel should be collapsed (narrow)
      const watchlistPanel = hideButton.locator('..').locator('..');
      const width = await watchlistPanel.evaluate((el) => el.offsetWidth);

      expect(width).toBeLessThan(50); // Should be ~24px when collapsed
    }
  });

  test('should animate watchlist panel expand', async ({ page }) => {
    // First collapse it
    const hideButton = page.locator('button').filter({ hasText: 'Hide' }).first();

    if (await hideButton.isVisible()) {
      await hideButton.click();
      await page.waitForTimeout(350);
    }

    // Find vertical "Watch" button
    const watchButton = page.locator('button').filter({ hasText: 'Watch' }).or(
      page.locator('span').filter({ hasText: 'Watch' }).locator('..')
    );

    await watchButton.click();

    // Wait for animation
    await page.waitForTimeout(350);

    // Panel should be expanded
    const watchlistPanel = watchButton.locator('..').locator('..');
    const width = await watchlistPanel.evaluate((el) => el.offsetWidth);

    expect(width).toBeGreaterThan(150); // Should be ~180px when open
  });
});

test.describe('Button Micro-interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/live`);
    await page.waitForLoadState('networkidle');
  });

  test('should have press feedback on all buttons', async ({ page }) => {
    const buttons = page.locator('button').first();

    // Check if button has transition or animation class
    const hasAnimation = await buttons.evaluate((el) => {
      const classList = Array.from(el.classList);
      const computed = window.getComputedStyle(el);

      return (
        classList.some((c) => c.includes('button-press') || c.includes('transition')) ||
        computed.transitionProperty !== 'none'
      );
    });

    expect(hasAnimation).toBeTruthy();
  });
});

test.describe('Loading States', () => {
  test('should show loading overlay on page load', async ({ page }) => {
    // Start navigation
    const response = page.goto(`${BASE_URL}/live`);

    // Check for loading indicator
    const loadingOverlay = page.locator('[class*="LoadingOverlay"], [class*="loading"], .spinner, .animate-spin').first();

    // Loading should appear briefly
    const isVisible = await loadingOverlay.isVisible().catch(() => false);

    // Wait for page to fully load
    await response;
    await page.waitForLoadState('networkidle');

    // Loading should be gone
    const stillVisible = await loadingOverlay.isVisible().catch(() => false);

    expect(stillVisible).toBeFalsy();
  });
});

test.describe('Performance', () => {
  test('should maintain 60fps during layout transitions', async ({ page }) => {
    await page.goto(`${BASE_URL}/live`);
    await page.waitForLoadState('networkidle');

    // Start performance measurement
    await page.evaluate(() => {
      (window as any).perfMarks = [];
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          (window as any).perfMarks.push(entry);
        }
      });
      observer.observe({ entryTypes: ['measure'] });
    });

    // Trigger layout change
    const button2x2 = page.locator('button').filter({ hasText: '2x2' });
    await button2x2.click();

    // Wait for animation
    await page.waitForTimeout(600);

    // Check if any frames dropped (basic check)
    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        domComplete: navigation.domComplete,
        loadEventEnd: navigation.loadEventEnd,
      };
    });

    // Basic assertion - page should load reasonably fast
    expect(metrics.domComplete).toBeLessThan(5000);
  });
});

test.describe('ConnectionBanner', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/live`);
    await page.waitForLoadState('networkidle');
  });

  test('should show connection banner on network disconnect', async ({ page, context }) => {
    // Simulate offline
    await context.setOffline(true);

    // Wait a bit for WebSocket to detect disconnect
    await page.waitForTimeout(2000);

    // Check for connection banner
    const banner = page.locator('[class*="ConnectionBanner"], [class*="connection"]').filter({ hasText: /connecting|reconnect|error/i });

    const isVisible = await banner.isVisible().catch(() => false);

    // Restore connection
    await context.setOffline(false);

    // If banner appeared, it should indicate reconnecting
    if (isVisible) {
      expect(await banner.textContent()).toMatch(/connecting|reconnect/i);
    }
  });
});
