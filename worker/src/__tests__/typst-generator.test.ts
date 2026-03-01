import { describe, it, expect } from 'vitest';
import { generateTypstPdf } from '../generators/typst.generator.js';

describe('Typst PDF Generator', () => {
  it('should compile a simple Typst string to a valid PDF buffer', async () => {
    const source = '= Hello World\n\nThis is a test document.';
    const pdf = await generateTypstPdf(source);

    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.length).toBeGreaterThan(0);

    // Check for PDF magic header
    const header = pdf.subarray(0, 5).toString('ascii');
    expect(header).toBe('%PDF-');
  });

  it('should throw an error for invalid Typst source', async () => {
    // Deliberately malformed Typst that should cause a compilation error
    const source = '#let x = \n#let y = ';

    await expect(generateTypstPdf(source)).rejects.toThrow();
  });
});
