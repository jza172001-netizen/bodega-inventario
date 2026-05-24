import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 390, height: 844 });

// Login screen
await page.goto('http://localhost:5173');
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/screen1_login.png' });

// Click "Bodeguero"
const bodegueroBtn = page.locator('text=Bodeguero').first();
if (await bodegueroBtn.count()) {
  await bodegueroBtn.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/screen2_users.png' });
}

// Click "Juli"
const juliBtn = page.locator('text=Juli').first();
if (await juliBtn.count()) {
  await juliBtn.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/screen3_password.png' });
}

// Type password
const pwInput = page.locator('input[type="password"]').first();
if (await pwInput.count()) {
  await pwInput.fill('6274');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/screen4_dashboard.png' });
}

// Navigate to Kardex
const kardexBtn = page.locator('text=Kardex').first();
if (await kardexBtn.count()) {
  await kardexBtn.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/screen5_kardex.png' });
}

// Click Trazabilidad tab
const trazBtn = page.locator('text=Trazabilidad').first();
if (await trazBtn.count()) {
  await trazBtn.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/screen6_traceability.png' });
}

await browser.close();
console.log('Done');
