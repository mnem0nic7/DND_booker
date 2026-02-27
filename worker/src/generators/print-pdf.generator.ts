import puppeteer, { type Page } from 'puppeteer';

/**
 * Bleed allowance added on every side for print-ready output.
 * Standard print bleed is 0.125 inches.
 */
const BLEED_INCHES = 0.125;

/**
 * Inject crop-mark CSS into the page.
 *
 * Crop marks are thin lines at the four corners of the bleed area so the
 * print shop knows where to trim. They are rendered as fixed-position
 * pseudo-elements via an injected stylesheet.
 */
async function injectCropMarks(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      @media print {
        @page {
          marks: crop;
        }
      }

      /* Crop mark overlays at each corner */
      body::before,
      body::after {
        content: '';
        position: fixed;
        z-index: 9999;
        pointer-events: none;
      }

      /* Top-left crop marks */
      .crop-mark-tl-h, .crop-mark-tl-v,
      .crop-mark-tr-h, .crop-mark-tr-v,
      .crop-mark-bl-h, .crop-mark-bl-v,
      .crop-mark-br-h, .crop-mark-br-v {
        position: fixed;
        background: black;
        z-index: 9999;
        pointer-events: none;
      }

      /* Horizontal marks: 0.25in long, 0.5pt thick */
      .crop-mark-tl-h { top: 0; left: 0; width: 0.25in; height: 0.5pt; }
      .crop-mark-tr-h { top: 0; right: 0; width: 0.25in; height: 0.5pt; }
      .crop-mark-bl-h { bottom: 0; left: 0; width: 0.25in; height: 0.5pt; }
      .crop-mark-br-h { bottom: 0; right: 0; width: 0.25in; height: 0.5pt; }

      /* Vertical marks: 0.5pt wide, 0.25in tall */
      .crop-mark-tl-v { top: 0; left: 0; width: 0.5pt; height: 0.25in; }
      .crop-mark-tr-v { top: 0; right: 0; width: 0.5pt; height: 0.25in; }
      .crop-mark-bl-v { bottom: 0; left: 0; width: 0.5pt; height: 0.25in; }
      .crop-mark-br-v { bottom: 0; right: 0; width: 0.5pt; height: 0.25in; }
    `,
  });

  // Insert crop mark elements into the DOM
  await page.evaluate(() => {
    const marks = [
      'crop-mark-tl-h', 'crop-mark-tl-v',
      'crop-mark-tr-h', 'crop-mark-tr-v',
      'crop-mark-bl-h', 'crop-mark-bl-v',
      'crop-mark-br-h', 'crop-mark-br-v',
    ];
    for (const cls of marks) {
      const el = document.createElement('div');
      el.className = cls;
      document.body.appendChild(el);
    }
  });
}

/**
 * Generate a print-ready PDF from an HTML string using Puppeteer.
 *
 * Differences from the standard PDF generator:
 *  - 0.125" bleed margins added to every side
 *  - Crop marks injected as CSS overlays
 *  - preferCSSPageSize enabled for precise sizing
 *  - No header/footer (print shop handles pagination)
 */
export async function generatePrintPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');

    // Inject crop marks into the rendered page
    await injectCropMarks(page);

    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      preferCSSPageSize: true,
      scale: 1,
      margin: {
        top: `${1 + BLEED_INCHES}in`,
        right: `${1 + BLEED_INCHES}in`,
        bottom: `${1 + BLEED_INCHES}in`,
        left: `${1 + BLEED_INCHES}in`,
      },
      // No header/footer — print shop handles pagination
      displayHeaderFooter: false,
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
