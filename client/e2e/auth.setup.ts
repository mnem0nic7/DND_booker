import { test as setup, expect } from '@playwright/test';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { AUTH_FILE, TEST_EMAIL, TEST_PASSWORD } from './test-account';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.E2E_DATABASE_URL ?? 'postgresql://dnd_booker:dnd_booker_dev@127.0.0.1:5433/dnd_booker',
    },
  },
});
const TEST_DISPLAY_NAME = 'Mnem0nic7';

async function ensureTestUser() {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);

  await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: {
      passwordHash,
      displayName: TEST_DISPLAY_NAME,
    },
    create: {
      email: TEST_EMAIL,
      passwordHash,
      displayName: TEST_DISPLAY_NAME,
    },
  });
}

setup('authenticate', async ({ page }) => {
  try {
    await ensureTestUser();

    await page.goto('/');
    await page.waitForTimeout(1500);

    // If already authenticated (e.g. from a previous run), save state and return
    const loginField = page.locator('input[type="email"]');
    if (!(await loginField.isVisible({ timeout: 3000 }).catch(() => false))) {
      await page.context().storageState({ path: AUTH_FILE });
      return;
    }

    await loginField.fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').click();

    // Wait for dashboard
    await expect(page.locator('text=New Project').first()).toBeVisible({ timeout: 10_000 });

    // Save auth state (localStorage with JWT token)
    await page.context().storageState({ path: AUTH_FILE });
  } finally {
    await prisma.$disconnect();
  }
});
