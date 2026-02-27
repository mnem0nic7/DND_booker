import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { encryptApiKey, decryptApiKey, _resetKeyCache } from '../utils/encryption.js';

// Unit tests for AES-256-GCM encryption/decryption.
// Requires AI_KEY_ENCRYPTION_SECRET env var (64 hex chars).

const TEST_SECRET = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
let originalSecret: string | undefined;

describe('Encryption Utility', () => {
  beforeAll(() => {
    originalSecret = process.env.AI_KEY_ENCRYPTION_SECRET;
    process.env.AI_KEY_ENCRYPTION_SECRET = TEST_SECRET;
  });

  afterAll(() => {
    _resetKeyCache();
    if (originalSecret !== undefined) {
      process.env.AI_KEY_ENCRYPTION_SECRET = originalSecret;
    } else {
      delete process.env.AI_KEY_ENCRYPTION_SECRET;
    }
  });

  describe('encryptApiKey / decryptApiKey round-trip', () => {
    it('should encrypt and decrypt a simple API key', () => {
      const key = 'sk-test-1234567890';
      const { encrypted, iv, tag } = encryptApiKey(key);
      const decrypted = decryptApiKey(encrypted, iv, tag);
      expect(decrypted).toBe(key);
    });

    it('should encrypt and decrypt a long API key', () => {
      const key = 'sk-' + 'a'.repeat(200);
      const { encrypted, iv, tag } = encryptApiKey(key);
      const decrypted = decryptApiKey(encrypted, iv, tag);
      expect(decrypted).toBe(key);
    });

    it('should encrypt and decrypt keys with special characters', () => {
      const key = 'sk-test_key-with/special+chars=and&more!@#$%';
      const { encrypted, iv, tag } = encryptApiKey(key);
      const decrypted = decryptApiKey(encrypted, iv, tag);
      expect(decrypted).toBe(key);
    });

    it('should produce different ciphertext for the same plaintext (random IV)', () => {
      const key = 'sk-test-1234567890';
      const result1 = encryptApiKey(key);
      const result2 = encryptApiKey(key);
      // Different IVs should produce different encrypted values
      expect(result1.iv).not.toBe(result2.iv);
      expect(result1.encrypted).not.toBe(result2.encrypted);
    });
  });

  describe('encryptApiKey output format', () => {
    it('should return hex-encoded strings', () => {
      const { encrypted, iv, tag } = encryptApiKey('sk-test');
      expect(encrypted).toMatch(/^[0-9a-f]+$/);
      expect(iv).toMatch(/^[0-9a-f]+$/);
      expect(tag).toMatch(/^[0-9a-f]+$/);
    });

    it('should return a 32-char IV (16 bytes hex)', () => {
      const { iv } = encryptApiKey('sk-test');
      expect(iv.length).toBe(32); // 16 bytes = 32 hex chars
    });

    it('should return a 32-char auth tag (16 bytes hex)', () => {
      const { tag } = encryptApiKey('sk-test');
      expect(tag.length).toBe(32);
    });
  });

  describe('decryption with tampered data', () => {
    it('should fail if ciphertext is tampered', () => {
      const { encrypted, iv, tag } = encryptApiKey('sk-test-key');
      const tampered = 'ff' + encrypted.slice(2);
      expect(() => decryptApiKey(tampered, iv, tag)).toThrow();
    });

    it('should fail if IV is tampered', () => {
      const { encrypted, iv, tag } = encryptApiKey('sk-test-key');
      const tampered = 'ff' + iv.slice(2);
      expect(() => decryptApiKey(encrypted, tampered, tag)).toThrow();
    });

    it('should fail if auth tag is tampered', () => {
      const { encrypted, iv, tag } = encryptApiKey('sk-test-key');
      const tampered = 'ff' + tag.slice(2);
      expect(() => decryptApiKey(encrypted, iv, tampered)).toThrow();
    });
  });

  describe('encryption key validation', () => {
    beforeEach(() => {
      _resetKeyCache();
    });

    it('should throw when secret is missing', () => {
      const saved = process.env.AI_KEY_ENCRYPTION_SECRET;
      delete process.env.AI_KEY_ENCRYPTION_SECRET;
      expect(() => encryptApiKey('test')).toThrow('AI_KEY_ENCRYPTION_SECRET');
      process.env.AI_KEY_ENCRYPTION_SECRET = saved;
      _resetKeyCache();
    });

    it('should throw when secret is too short', () => {
      const saved = process.env.AI_KEY_ENCRYPTION_SECRET;
      process.env.AI_KEY_ENCRYPTION_SECRET = 'abcd1234';
      expect(() => encryptApiKey('test')).toThrow('64-character');
      process.env.AI_KEY_ENCRYPTION_SECRET = saved;
      _resetKeyCache();
    });

    it('should throw when secret has non-hex characters', () => {
      const saved = process.env.AI_KEY_ENCRYPTION_SECRET;
      process.env.AI_KEY_ENCRYPTION_SECRET = 'g'.repeat(64);
      expect(() => encryptApiKey('test')).toThrow('hexadecimal');
      process.env.AI_KEY_ENCRYPTION_SECRET = saved;
      _resetKeyCache();
    });

    it('should throw when secret has insufficient entropy', () => {
      const saved = process.env.AI_KEY_ENCRYPTION_SECRET;
      process.env.AI_KEY_ENCRYPTION_SECRET = 'a'.repeat(64);
      expect(() => encryptApiKey('test')).toThrow('entropy');
      process.env.AI_KEY_ENCRYPTION_SECRET = saved;
      _resetKeyCache();
    });
  });
});
