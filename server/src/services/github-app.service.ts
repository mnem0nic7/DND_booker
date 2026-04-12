import jwt from 'jsonwebtoken';

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';

interface GitHubRepoRef {
  repositoryFullName: string;
  installationId: number;
  defaultBranch: string;
}

interface GitHubRepoInfo {
  defaultBranch: string;
  htmlUrl: string;
}

interface GitHubBranchRef {
  ref: string;
  object: {
    sha: string;
  };
}

interface GitHubPullRequestSummary {
  number: number;
  html_url: string;
  state: string;
  draft: boolean;
  head: {
    ref: string;
  };
  base: {
    ref: string;
  };
}

function normalizePrivateKey(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes('BEGIN')) {
    return trimmed.replace(/\\n/g, '\n');
  }

  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    if (decoded.includes('BEGIN')) {
      return decoded.replace(/\\n/g, '\n');
    }
  } catch {
    // Ignore base64 decode failure and fall through.
  }

  return trimmed.replace(/\\n/g, '\n');
}

function requireGitHubAppConfig() {
  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKeyRaw = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (!appId || !privateKeyRaw) {
    throw new Error('GitHub App integration is not configured.');
  }

  return {
    appId,
    privateKey: normalizePrivateKey(privateKeyRaw),
  };
}

function buildHeaders(token: string) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'dnd-booker-improvement-loop',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
}

function buildPublicHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'dnd-booker-improvement-loop',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
}

function splitRepoFullName(repositoryFullName: string) {
  const [owner, repo] = repositoryFullName.split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid repository name: ${repositoryFullName}`);
  }
  return { owner, repo };
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`GitHub API ${response.status}${text ? `: ${text}` : ''}`);
  }

  return response.json() as Promise<T>;
}

export function isGitHubAppConfigured() {
  return Boolean(process.env.GITHUB_APP_ID?.trim() && process.env.GITHUB_APP_PRIVATE_KEY?.trim());
}

export async function createGitHubAppJwt(): Promise<string> {
  const { appId, privateKey } = requireGitHubAppConfig();
  return jwt.sign({}, privateKey, {
    algorithm: 'RS256',
    issuer: appId,
    expiresIn: '9m',
  });
}

export async function getGitHubInstallationAccessToken(installationId: number): Promise<string> {
  const appJwt = await createGitHubAppJwt();
  const response = await fetch(`${GITHUB_API_BASE}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: buildHeaders(appJwt),
  });
  const data = await parseResponse<{ token: string }>(response);
  return data.token;
}

async function githubInstallationRequest<T>(
  installationId: number,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getGitHubInstallationAccessToken(installationId);
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...init,
    headers: {
      ...buildHeaders(token),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  return parseResponse<T>(response);
}

function encodeRepoPath(path: string) {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

export async function getGitHubRepoInfo(input: GitHubRepoRef): Promise<GitHubRepoInfo> {
  const { owner, repo } = splitRepoFullName(input.repositoryFullName);
  const data = await githubInstallationRequest<{
    default_branch: string;
    html_url: string;
  }>(input.installationId, `/repos/${owner}/${repo}`);

  return {
    defaultBranch: data.default_branch,
    htmlUrl: data.html_url,
  };
}

export async function getPublicGitHubRepoInfo(repositoryFullName: string): Promise<GitHubRepoInfo> {
  const { owner, repo } = splitRepoFullName(repositoryFullName);
  const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
    headers: buildPublicHeaders(),
  });
  const data = await parseResponse<{
    default_branch: string;
    html_url: string;
  }>(response);

  return {
    defaultBranch: data.default_branch,
    htmlUrl: data.html_url,
  };
}

export async function getGitHubBranchHeadSha(input: GitHubRepoRef, branchName = input.defaultBranch): Promise<string> {
  const { owner, repo } = splitRepoFullName(input.repositoryFullName);
  const ref = await githubInstallationRequest<GitHubBranchRef>(
    input.installationId,
    `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branchName)}`,
  );
  return ref.object.sha;
}

export async function ensureGitHubBranch(input: GitHubRepoRef, branchName: string): Promise<string> {
  const { owner, repo } = splitRepoFullName(input.repositoryFullName);

  try {
    return await getGitHubBranchHeadSha(input, branchName);
  } catch {
    const baseSha = await getGitHubBranchHeadSha(input, input.defaultBranch);
    await githubInstallationRequest(
      input.installationId,
      `/repos/${owner}/${repo}/git/refs`,
      {
        method: 'POST',
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: baseSha,
        }),
      },
    );
    return baseSha;
  }
}

export async function readGitHubFile(
  input: GitHubRepoRef,
  filePath: string,
  ref = input.defaultBranch,
): Promise<{ content: string; sha: string } | null> {
  const { owner, repo } = splitRepoFullName(input.repositoryFullName);
  const token = await getGitHubInstallationAccessToken(input.installationId);
  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${encodeRepoPath(filePath)}?ref=${encodeURIComponent(ref)}`,
    {
      headers: buildHeaders(token),
    },
  );

  if (response.status === 404) return null;
  const data = await parseResponse<{ content: string; encoding: string; sha: string }>(response);
  const decoded = data.encoding === 'base64'
    ? Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8')
    : data.content;
  return { content: decoded, sha: data.sha };
}

export async function upsertGitHubFile(input: GitHubRepoRef & {
  branchName: string;
  filePath: string;
  content: string;
  message: string;
}): Promise<{ sha: string; path: string }> {
  const { owner, repo } = splitRepoFullName(input.repositoryFullName);
  const existing = await readGitHubFile(input, input.filePath, input.branchName);

  const data = await githubInstallationRequest<{ content: { path: string; sha: string } }>(
    input.installationId,
    `/repos/${owner}/${repo}/contents/${encodeRepoPath(input.filePath)}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        message: input.message,
        content: Buffer.from(input.content, 'utf8').toString('base64'),
        branch: input.branchName,
        ...(existing ? { sha: existing.sha } : {}),
      }),
    },
  );

  return {
    sha: data.content.sha,
    path: data.content.path,
  };
}

export async function findOpenGitHubPullRequest(
  input: GitHubRepoRef,
  branchName: string,
): Promise<GitHubPullRequestSummary | null> {
  const { owner, repo } = splitRepoFullName(input.repositoryFullName);
  const pulls = await githubInstallationRequest<GitHubPullRequestSummary[]>(
    input.installationId,
    `/repos/${owner}/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branchName}`)}&per_page=1`,
  );
  return pulls[0] ?? null;
}

export async function createOrUpdateGitHubDraftPullRequest(input: GitHubRepoRef & {
  branchName: string;
  title: string;
  body: string;
}): Promise<{ number: number; url: string }> {
  const { owner, repo } = splitRepoFullName(input.repositoryFullName);
  const existing = await findOpenGitHubPullRequest(input, input.branchName);
  if (existing) {
    return {
      number: existing.number,
      url: existing.html_url,
    };
  }

  const created = await githubInstallationRequest<{ number: number; html_url: string }>(
    input.installationId,
    `/repos/${owner}/${repo}/pulls`,
    {
      method: 'POST',
      body: JSON.stringify({
        title: input.title,
        head: input.branchName,
        base: input.defaultBranch,
        body: input.body,
        draft: true,
      }),
    },
  );

  return {
    number: created.number,
    url: created.html_url,
  };
}
