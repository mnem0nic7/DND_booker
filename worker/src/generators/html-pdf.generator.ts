import { chromium } from 'playwright-core';

const DEFAULT_EXECUTABLE_PATHS = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
].filter((value): value is string => Boolean(value));

function resolveChromiumExecutablePath(): string {
  return DEFAULT_EXECUTABLE_PATHS[0];
}

export async function generateHtmlPdf(input: {
  html: string;
  title: string;
}): Promise<Buffer> {
  const browser = await chromium.launch({
    executablePath: resolveChromiumExecutablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files'],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(input.html, {
      waitUntil: 'load',
    });
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(300);

    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="width:100%;font-size:8px;padding:0 0.5in;color:#7c6f57;font-family:serif;display:flex;justify-content:space-between;">
          <span>${escapeHtml(input.title)}</span>
          <span class="pageNumber"></span>
        </div>
      `,
      margin: {
        top: '0.4in',
        bottom: '0.45in',
        left: '0.2in',
        right: '0.2in',
      },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
