import type { ImprovementLoopDefaultEngineeringTarget } from '@dnd-booker/shared';
import { isGitHubAppConfigured } from '../github-app.service.js';

const FALLBACK_REPOSITORY = 'mnem0nic7/DND_booker';
const FALLBACK_DEFAULT_BRANCH = 'main';
const FALLBACK_INSTALLATION_ID = 1;
const FALLBACK_ALLOWLIST = [
  'docs/',
  'README.md',
  'CLAUDE.md',
  'client/src/components/ai/',
  'client/src/pages/',
  'server/src/services/improvement-loop/',
  'shared/src/types/improvement-loop.ts',
  'shared/src/api/v1.ts',
  'deploy/cloudrun/',
  'scripts/',
];

function parseInstallationId(value: string | undefined) {
  const parsed = Number.parseInt(value?.trim() ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseAllowlist(value: string | undefined) {
  const entries = (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.length > 0 ? [...new Set(entries)] : FALLBACK_ALLOWLIST;
}

export function getDefaultImprovementLoopEngineeringTarget(): ImprovementLoopDefaultEngineeringTarget {
  const repositoryFullName = process.env.DEFAULT_ENGINEERING_REPOSITORY_FULL_NAME?.trim() || FALLBACK_REPOSITORY;
  const configuredInstallationId = parseInstallationId(process.env.DEFAULT_ENGINEERING_INSTALLATION_ID);
  const installationId = configuredInstallationId ?? FALLBACK_INSTALLATION_ID;
  const defaultBranch = process.env.DEFAULT_ENGINEERING_DEFAULT_BRANCH?.trim() || FALLBACK_DEFAULT_BRANCH;
  const pathAllowlist = parseAllowlist(process.env.DEFAULT_ENGINEERING_PATH_ALLOWLIST);
  const githubAppConfigured = isGitHubAppConfigured();
  const engineeringAutomationAvailable = githubAppConfigured && configuredInstallationId !== null;

  return {
    repositoryFullName,
    installationId,
    defaultBranch,
    pathAllowlist,
    engineeringAutomationEnabled: engineeringAutomationAvailable,
    engineeringAutomationAvailable,
    source: process.env.DEFAULT_ENGINEERING_REPOSITORY_FULL_NAME ? 'env' : 'fallback',
    message: engineeringAutomationAvailable
      ? `AI team runs will default to ${repositoryFullName} with GitHub auto-apply enabled.`
      : githubAppConfigured
        ? `GitHub App credentials are configured, but DEFAULT_ENGINEERING_INSTALLATION_ID is missing. Runs will fall back to report-only mode until a real installation id is provided.`
        : `GitHub App credentials are not configured. AI team runs will default to report-only mode for ${repositoryFullName}.`,
  };
}
