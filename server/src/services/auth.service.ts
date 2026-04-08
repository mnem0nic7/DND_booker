import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database.js';

function requireEnvSecret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      console.error(`FATAL: ${name} must be set to a strong secret (>=16 chars) in production.`);
      process.exit(1);
    }
    console.warn(`[auth] WARNING: ${name} is not set. Using insecure dev fallback. DO NOT use in production.`);
    return `insecure-dev-${name}`;
  }
  return value;
}

const JWT_SECRET = requireEnvSecret('JWT_SECRET');
const JWT_REFRESH_SECRET = requireEnvSecret('JWT_REFRESH_SECRET');

async function hasActiveRegistrationInvite(email: string): Promise<boolean> {
  const invite = await prisma.registrationInvite.findFirst({
    where: {
      email,
      revokedAt: null,
    },
    select: { id: true },
  });
  return Boolean(invite);
}

export function generateAccessToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '15m' });
}

export function generateRefreshToken(userId: string, tokenVersion: number): string {
  return jwt.sign({ userId, tokenVersion }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): { userId: string } {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as { userId: string };
}

export function verifyRefreshToken(token: string): { userId: string; tokenVersion: number } {
  const payload = jwt.verify(token, JWT_REFRESH_SECRET, { algorithms: ['HS256'] }) as { userId: string; tokenVersion?: number };
  if (typeof payload.tokenVersion !== 'number') {
    throw new Error('Invalid token: missing tokenVersion');
  }
  return payload as { userId: string; tokenVersion: number };
}

export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      tokenVersion: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return user;
}

export async function incrementTokenVersion(userId: string): Promise<number> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  });
  return user.tokenVersion;
}

export async function registerUser(email: string, password: string, displayName: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const isInvited = await hasActiveRegistrationInvite(normalizedEmail);
  if (!isInvited) {
    throw new Error('REGISTRATION_NOT_ALLOWED');
  }

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    throw new Error('EMAIL_EXISTS');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email: normalizedEmail, passwordHash, displayName },
    select: { id: true, email: true, displayName: true, avatarUrl: true, createdAt: true, updatedAt: true },
  });

  return user;
}

// Pre-hashed dummy for timing-safe user-not-found path
const DUMMY_HASH = '$2b$12$LJ3m4yPmLsgJJl8t2nOmqOQYCmn3qGZ7.QfGv0u9y7PdVLKXFKWeS';

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Perform a dummy compare to normalize response timing
    await bcrypt.compare(password, DUMMY_HASH);
    throw new Error('INVALID_CREDENTIALS');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new Error('INVALID_CREDENTIALS');
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    tokenVersion: user.tokenVersion,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
