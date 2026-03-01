import { describe, it, expect } from 'vitest';
import { escapeTypst } from '@dnd-booker/shared';

describe('escapeTypst', () => {
  it('should pass through plain text unchanged', () => {
    expect(escapeTypst('Hello World 123')).toBe('Hello World 123');
  });

  it('should escape asterisks', () => {
    expect(escapeTypst('a*b')).toBe('a\\*b');
  });

  it('should escape underscores', () => {
    expect(escapeTypst('a_b')).toBe('a\\_b');
  });

  it('should escape hash signs', () => {
    expect(escapeTypst('#heading')).toBe('\\#heading');
  });

  it('should escape backticks', () => {
    expect(escapeTypst('`code`')).toBe('\\`code\\`');
  });

  it('should escape at-signs', () => {
    expect(escapeTypst('@label')).toBe('\\@label');
  });

  it('should escape dollar signs', () => {
    expect(escapeTypst('$math$')).toBe('\\$math\\$');
  });

  it('should escape angle brackets', () => {
    expect(escapeTypst('<tag>')).toBe('\\<tag\\>');
  });

  it('should escape square brackets', () => {
    expect(escapeTypst('[ref]')).toBe('\\[ref\\]');
  });

  it('should escape backslashes', () => {
    expect(escapeTypst('a\\b')).toBe('a\\\\b');
  });

  it('should escape multiple special characters together', () => {
    expect(escapeTypst('*bold* _italic_ #heading `code`')).toBe(
      '\\*bold\\* \\_italic\\_ \\#heading \\`code\\`'
    );
  });

  it('should handle empty string', () => {
    expect(escapeTypst('')).toBe('');
  });
});
