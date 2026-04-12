import { prisma } from '../config/database.js';
import type {
  ProjectGitHubRepoBinding,
  ProjectGitHubRepoBindingInput,
  ProjectGitHubRepoBindingValidation,
} from '@dnd-booker/shared';
import { getGitHubRepoInfo, getPublicGitHubRepoInfo, isGitHubAppConfigured } from './github-app.service.js';

function serializeBinding(binding: any): ProjectGitHubRepoBinding {
  return {
    id: binding.id,
    projectId: binding.projectId,
    repositoryFullName: binding.repositoryFullName,
    installationId: binding.installationId,
    defaultBranch: binding.defaultBranch,
    pathAllowlist: Array.isArray(binding.pathAllowlistJson) ? binding.pathAllowlistJson as string[] : [],
    engineeringAutomationEnabled: binding.engineeringAutomationEnabled,
    lastValidatedAt: binding.lastValidatedAt?.toISOString() ?? null,
    lastValidationStatus: binding.lastValidationStatus,
    lastValidationMessage: binding.lastValidationMessage ?? null,
    createdAt: binding.createdAt.toISOString(),
    updatedAt: binding.updatedAt.toISOString(),
  };
}

async function getOwnedProject(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
}

function normalizePathAllowlist(value: string[] | undefined) {
  const entries = (value ?? [])
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 64);

  return entries.length > 0 ? [...new Set(entries)] : ['docs/', 'README.md', 'CLAUDE.md'];
}

export async function getProjectGitHubRepoBinding(projectId: string, userId: string): Promise<ProjectGitHubRepoBinding | null> {
  const project = await getOwnedProject(projectId, userId);
  if (!project) return null;

  const binding = await prisma.projectGitHubRepoBinding.findUnique({
    where: { projectId },
  });

  return binding ? serializeBinding(binding) : null;
}

export async function upsertProjectGitHubRepoBinding(
  projectId: string,
  userId: string,
  input: ProjectGitHubRepoBindingInput,
): Promise<ProjectGitHubRepoBinding | null> {
  const project = await getOwnedProject(projectId, userId);
  if (!project) return null;

  const binding = await prisma.projectGitHubRepoBinding.upsert({
    where: { projectId },
    create: {
      projectId,
      repositoryFullName: input.repositoryFullName.trim(),
      installationId: input.installationId,
      defaultBranch: input.defaultBranch.trim(),
      pathAllowlistJson: normalizePathAllowlist(input.pathAllowlist) as any,
      engineeringAutomationEnabled: input.engineeringAutomationEnabled ?? true,
      lastValidationStatus: 'unconfigured',
    },
    update: {
      repositoryFullName: input.repositoryFullName.trim(),
      installationId: input.installationId,
      defaultBranch: input.defaultBranch.trim(),
      pathAllowlistJson: normalizePathAllowlist(input.pathAllowlist) as any,
      engineeringAutomationEnabled: input.engineeringAutomationEnabled ?? true,
      lastValidationStatus: 'unconfigured',
      lastValidationMessage: null,
      lastValidatedAt: null,
    },
  });

  return serializeBinding(binding);
}

export async function validateProjectGitHubRepoBinding(
  projectId: string,
  userId: string,
): Promise<ProjectGitHubRepoBindingValidation | null> {
  const project = await getOwnedProject(projectId, userId);
  if (!project) return null;

  const binding = await prisma.projectGitHubRepoBinding.findUnique({
    where: { projectId },
  });

  const checkedAt = new Date().toISOString();
  if (!binding) {
    return {
      status: 'unconfigured',
      message: 'No GitHub repo binding is configured for this project.',
      repositoryFullName: null,
      defaultBranch: null,
      checkedAt,
    };
  }

  try {
    const repoInfo = !isGitHubAppConfigured() && !binding.engineeringAutomationEnabled
      ? await getPublicGitHubRepoInfo(binding.repositoryFullName)
      : await getGitHubRepoInfo({
        repositoryFullName: binding.repositoryFullName,
        installationId: binding.installationId,
        defaultBranch: binding.defaultBranch,
      });

    const normalizedDefaultBranch = binding.defaultBranch.trim() || repoInfo.defaultBranch;
    const message = !isGitHubAppConfigured() && !binding.engineeringAutomationEnabled
      ? `Validated GitHub repo binding against public repo ${binding.repositoryFullName} with engineering automation disabled.`
      : `Validated GitHub repo binding against ${binding.repositoryFullName}.`;
    await prisma.projectGitHubRepoBinding.update({
      where: { projectId },
      data: {
        defaultBranch: normalizedDefaultBranch,
        lastValidationStatus: 'valid',
        lastValidationMessage: message,
        lastValidatedAt: new Date(),
      },
    });

    return {
      status: 'valid',
      message,
      repositoryFullName: binding.repositoryFullName,
      defaultBranch: normalizedDefaultBranch,
      checkedAt,
    };
  } catch (error) {
    const message = !isGitHubAppConfigured() && binding.engineeringAutomationEnabled
      ? 'GitHub App integration is not configured on the server.'
      : (error instanceof Error ? error.message : 'GitHub validation failed.');
    await prisma.projectGitHubRepoBinding.update({
      where: { projectId },
      data: {
        lastValidationStatus: 'invalid',
        lastValidationMessage: message,
        lastValidatedAt: new Date(),
      },
    });

    return {
      status: 'invalid',
      message,
      repositoryFullName: binding.repositoryFullName,
      defaultBranch: binding.defaultBranch,
      checkedAt,
    };
  }
}
