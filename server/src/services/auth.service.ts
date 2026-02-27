import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database.js';

function requireEnvSecret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`FATAL: ${name} must be set to a strong secret (>=16 chars) in production.`);
    }
    console.warn(`[auth] WARNING: ${name} is not set. Using insecure dev fallback. DO NOT use in production.`);
    return `insecure-dev-${name}`;
  }
  return value;
}

const JWT_SECRET = requireEnvSecret('JWT_SECRET');
const JWT_REFRESH_SECRET = requireEnvSecret('JWT_REFRESH_SECRET');

export function generateAccessToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '15m' });
}

export function generateRefreshToken(userId: string): string {
  return jwt.sign({ userId }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): { userId: string } {
  return jwt.verify(token, JWT_SECRET) as { userId: string };
}

export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, JWT_REFRESH_SECRET) as { userId: string };
}

export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, displayName: true, avatarUrl: true },
  });
  return user;
}

export async function registerUser(email: string, password: string, displayName: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error('EMAIL_EXISTS');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, displayName },
    select: { id: true, email: true, displayName: true, avatarUrl: true, createdAt: true, updatedAt: true },
  });

  return user;
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
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
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
