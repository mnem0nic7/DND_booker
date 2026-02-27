import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const secret = process.env.AI_KEY_ENCRYPTION_SECRET;
  if (!secret || secret.length !== 64) {
    throw new Error('AI_KEY_ENCRYPTION_SECRET must be a 64-character hex string');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(secret)) {
    throw new Error('AI_KEY_ENCRYPTION_SECRET must contain only hexadecimal characters');
  }
  if (new Set(secret.toLowerCase()).size < 4) {
    throw new Error('AI_KEY_ENCRYPTION_SECRET has insufficient entropy');
  }
  return Buffer.from(secret, 'hex');
}

export function encryptApiKey(plaintext: string): { encrypted: string; iv: string; tag: string } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

export function decryptApiKey(encrypted: string, iv: string, tag: string): string {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
