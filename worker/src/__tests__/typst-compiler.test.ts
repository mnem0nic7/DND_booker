import { describe, it, expect } from 'vitest';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';

describe('Typst Compiler', () => {
  it('should compile a simple Typst string to PDF bytes', () => {
    const compiler = NodeCompiler.create();
    try {
      const pdf = compiler.pdf({ mainFileContent: '= Hello World\n\nThis is a test.' });
      expect(pdf).toBeInstanceOf(Uint8Array);
      expect(pdf.length).toBeGreaterThan(0);
      const header = new TextDecoder().decode(pdf.slice(0, 5));
      expect(header).toBe('%PDF-');
    } finally {
      compiler.evictCache(0);
    }
  });

  it('should support two-column layout', () => {
    const compiler = NodeCompiler.create();
    try {
      const source = `#set page(paper: "us-letter", columns: 2)\n= Chapter One\n#lorem(200)\n#colbreak()\n= Chapter Two\n#lorem(200)`;
      const pdf = compiler.pdf({ mainFileContent: source });
      expect(pdf).toBeInstanceOf(Uint8Array);
      expect(pdf.length).toBeGreaterThan(0);
    } finally {
      compiler.evictCache(0);
    }
  });
});
