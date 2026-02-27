import { prisma } from '../config/database.js';

export async function listTemplates(type?: 'campaign' | 'one_shot' | 'supplement' | 'sourcebook') {
  return prisma.template.findMany({
    where: {
      isSystem: true,
      ...(type ? { type } : {}),
    },
    orderBy: { name: 'asc' },
  });
}

export async function getTemplate(id: string) {
  return prisma.template.findUnique({ where: { id } });
}
