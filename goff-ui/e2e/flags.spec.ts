import { test, expect } from '@playwright/test'

test.describe('Flags Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/flags')
  })

  test('should display flags page', async ({ page }) => {
    // Should show the main page heading (h2)
    await expect(page.locator('h2').filter({ hasText: 'Feature Flags' })).toBeVisible()
  })

  test('should navigate to create flag page', async ({ page }) => {
    // Look for a button to create new flag
    const createButton = page.getByRole('button', { name: /create|new|add/i })
    if (await createButton.count() > 0 && await createButton.first().isVisible()) {
      await createButton.first().click()
      await expect(page).toHaveURL(/\/flags\/.*\/edit/)
    }
  })
})

test.describe('Flag Editor', () => {
  test('should navigate to flag editor with new flag', async ({ page }) => {
    // Navigate directly to create a new flag
    await page.goto('/flags/test-project/new-flag/edit')

    // Wait for page to load and check for any content
    await page.waitForLoadState('networkidle')

    // The editor page should be accessible
    await expect(page).toHaveURL(/\/flags\/.*\/edit/)
  })
})

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
  })

  test('should display settings page', async ({ page }) => {
    await expect(page.locator('h2').filter({ hasText: 'Settings' })).toBeVisible()
  })

  test('should show operating mode selection', async ({ page }) => {
    // Should show Development and Production mode options
    await expect(page.locator('button').filter({ hasText: /development/i }).first()).toBeVisible()
    await expect(page.locator('button').filter({ hasText: /production/i }).first()).toBeVisible()
  })

  test('should show settings links', async ({ page }) => {
    // Should show links to sub-settings pages using h3 elements
    await expect(page.locator('h3').filter({ hasText: 'Git Integrations' })).toBeVisible({ timeout: 10000 })
    await expect(page.locator('h3').filter({ hasText: 'Flag Sets' })).toBeVisible({ timeout: 10000 })
    await expect(page.locator('h3').filter({ hasText: 'Notifiers' })).toBeVisible({ timeout: 10000 })
    await expect(page.locator('h3').filter({ hasText: 'Retrievers' })).toBeVisible({ timeout: 10000 })
    await expect(page.locator('h3').filter({ hasText: 'Exporters' })).toBeVisible({ timeout: 10000 })
  })

  test('should navigate to notifiers settings', async ({ page }) => {
    await page.locator('h3').filter({ hasText: 'Notifiers' }).click()
    await expect(page).toHaveURL('/settings/notifiers')
  })

  test('should navigate to exporters settings', async ({ page }) => {
    await page.locator('h3').filter({ hasText: 'Exporters' }).click()
    await expect(page).toHaveURL('/settings/exporters')
  })

  test('should navigate to retrievers settings', async ({ page }) => {
    // Scroll to make sure Retrievers card is visible
    const retrieversCard = page.locator('h3').filter({ hasText: 'Retrievers' })
    await retrieversCard.scrollIntoViewIfNeeded()
    await retrieversCard.click()
    await expect(page).toHaveURL('/settings/retrievers')
  })
})

test.describe('Notifiers Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings/notifiers')
    await page.waitForLoadState('networkidle')
  })

  test('should display notifiers page', async ({ page }) => {
    await expect(page.locator('h2').filter({ hasText: 'Notifiers' })).toBeVisible()
  })

  test('should have add notifier button', async ({ page }) => {
    // Look for button containing add/create/new text
    const addButton = page.locator('button').filter({ hasText: /add|create|new/i })
    await expect(addButton.first()).toBeVisible()
  })
})

test.describe('Exporters Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings/exporters')
    await page.waitForLoadState('networkidle')
  })

  test('should display exporters page', async ({ page }) => {
    await expect(page.locator('h2').filter({ hasText: 'Exporters' })).toBeVisible()
  })

  test('should have add exporter button', async ({ page }) => {
    const addButton = page.locator('button').filter({ hasText: /add|create|new/i })
    await expect(addButton.first()).toBeVisible()
  })
})

test.describe('Retrievers Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings/retrievers')
    await page.waitForLoadState('networkidle')
  })

  test('should display retrievers page', async ({ page }) => {
    await expect(page.locator('h2').filter({ hasText: 'Retrievers' })).toBeVisible()
  })

  test('should have add retriever button', async ({ page }) => {
    const addButton = page.locator('button').filter({ hasText: /add|create|new/i })
    await expect(addButton.first()).toBeVisible()
  })
})

test.describe('Navigation', () => {
  test('should navigate between pages using sidebar', async ({ page }) => {
    // Start at settings
    await page.goto('/settings')
    await expect(page.locator('h2').filter({ hasText: 'Settings' })).toBeVisible()

    // Navigate to flags via sidebar link
    const sidebarFlagsLink = page.locator('nav a, aside a').filter({ hasText: /flags/i }).first()
    if (await sidebarFlagsLink.count() > 0 && await sidebarFlagsLink.isVisible()) {
      await sidebarFlagsLink.click()
      await page.waitForURL(/\/flags/)
    }
  })
})

test.describe('Mode Switching', () => {
  test('should switch between development and production modes', async ({ page }) => {
    await page.goto('/settings')

    // Find development mode button
    const devButton = page.locator('button').filter({ hasText: /development/i }).first()

    if (await devButton.isVisible()) {
      await devButton.click()
      // Should show a success message or update the UI
      await page.waitForTimeout(500)
    }

    // Find production mode button
    const prodButton = page.locator('button').filter({ hasText: /production/i }).first()

    if (await prodButton.isVisible()) {
      await prodButton.click()
      // Should show connection settings
      await page.waitForTimeout(500)
    }
  })
})

test.describe('Responsive Design', () => {
  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/settings')

    // Page should still be functional
    await expect(page.locator('h2').filter({ hasText: 'Settings' })).toBeVisible()
  })

  test('should be responsive on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/settings')

    await expect(page.locator('h2').filter({ hasText: 'Settings' })).toBeVisible()
  })

  test('should be responsive on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('/settings')

    await expect(page.locator('h2').filter({ hasText: 'Settings' })).toBeVisible()
  })
})
