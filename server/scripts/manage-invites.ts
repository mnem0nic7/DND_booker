import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function usage() {
  console.log([
    'Usage:',
    '  npm run invites --workspace=server -- list',
    '  npm run invites --workspace=server -- add <email> [note]',
    '  npm run invites --workspace=server -- revoke <email>',
  ].join('\n'));
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

async function listInvites() {
  const invites = await prisma.registrationInvite.findMany({
    orderBy: [{ revokedAt: 'asc' }, { createdAt: 'asc' }],
  });

  if (invites.length === 0) {
    console.log('No registration invites found.');
    return;
  }

  for (const invite of invites) {
    console.log([
      invite.email,
      invite.revokedAt ? 'revoked' : 'active',
      invite.note ? `note=${invite.note}` : null,
      `created=${invite.createdAt.toISOString()}`,
      invite.revokedAt ? `revokedAt=${invite.revokedAt.toISOString()}` : null,
    ].filter(Boolean).join(' | '));
  }
}

async function addInvite(emailArg: string | undefined, note: string | undefined) {
  if (!emailArg) {
    usage();
    process.exitCode = 1;
    return;
  }

  const email = normalizeEmail(emailArg);
  const invite = await prisma.registrationInvite.upsert({
    where: { email },
    update: {
      note: note?.trim() || null,
      revokedAt: null,
    },
    create: {
      email,
      note: note?.trim() || null,
    },
  });

  console.log(`Invite active for ${invite.email}`);
}

async function revokeInvite(emailArg: string | undefined) {
  if (!emailArg) {
    usage();
    process.exitCode = 1;
    return;
  }

  const email = normalizeEmail(emailArg);
  const invite = await prisma.registrationInvite.findUnique({
    where: { email },
  });

  if (!invite) {
    console.error(`No invite found for ${email}`);
    process.exitCode = 1;
    return;
  }

  await prisma.registrationInvite.update({
    where: { email },
    data: { revokedAt: new Date() },
  });

  console.log(`Invite revoked for ${email}`);
}

async function main() {
  const [command, arg1, ...rest] = process.argv.slice(2);
  const note = rest.join(' ').trim() || undefined;

  if (!command || command === '--help' || command === '-h') {
    usage();
    return;
  }

  if (command === 'list') {
    await listInvites();
    return;
  }

  if (command === 'add') {
    await addInvite(arg1, note);
    return;
  }

  if (command === 'revoke') {
    await revokeInvite(arg1);
    return;
  }

  usage();
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
