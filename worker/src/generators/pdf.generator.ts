import puppeteer from 'puppeteer';

/**
 * Generate a standard PDF from an HTML string using Puppeteer.
 *
 * The resulting PDF is Letter-sized with 1-inch margins, a page-number
 * footer, and background colors/images printed.
 */
// Enable sandbox when running outside Docker (set PUPPETEER_SANDBOX=true)
const NO_SANDBOX_ARGS = process.env.PUPPETEER_SANDBOX === 'true'
  ? []
  : ['--no-sandbox', '--disable-setuid-sandbox'];

/** Maximum time for page.setContent (loading HTML + resources). */
const PAGE_TIMEOUT_MS = 60_000;

export async function generatePdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: NO_SANDBOX_ARGS,
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: PAGE_TIMEOUT_MS });
    await page.emulateMediaType('screen');

    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '1in', right: '1in', bottom: '1in', left: '1in' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="font-size:9px;width:100%;text-align:center;"><span class="pageNumber"></span></div>',
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
