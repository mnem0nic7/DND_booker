import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ImprovementLoopWorkspaceRunSummary } from '@dnd-booker/shared';
import { useAuthStore } from '../stores/authStore';
import { useProjectStore } from '../stores/projectStore';
import { useImprovementLoopStore } from '../stores/improvementLoopStore';
import { ImprovementLoopPanel } from '../components/ai/ImprovementLoopPanel';
import { formatRelativeTime } from '../lib/formatRelativeTime';

type LaunchTab = 'current_project' | 'create_campaign';

interface RepoBindingFormState {
  repositoryFullName: string;
  installationId: number;
  defaultBranch: string;
  pathAllowlist: string;
  engineeringAutomationEnabled: boolean;
}

const EMPTY_BINDING: RepoBindingFormState = {
  repositoryFullName: '',
  installationId: 1,
  defaultBranch: 'main',
  pathAllowlist: 'docs/,README.md,CLAUDE.md',
  engineeringAutomationEnabled: false,
};

function bindingFormFromTarget(target: NonNullable<ReturnType<typeof useImprovementLoopStore.getState>['defaultEngineeringTarget']>): RepoBindingFormState {
  return {
    repositoryFullName: target.repositoryFullName,
    installationId: target.installationId,
    defaultBranch: target.defaultBranch,
    pathAllowlist: target.pathAllowlist.join(','),
    engineeringAutomationEnabled: target.engineeringAutomationEnabled,
  };
}

function bindingFormFromProjectBinding(binding: NonNullable<ReturnType<typeof useImprovementLoopStore.getState>['binding']>): RepoBindingFormState {
  return {
    repositoryFullName: binding.repositoryFullName,
    installationId: binding.installationId,
    defaultBranch: binding.defaultBranch,
    pathAllowlist: binding.pathAllowlist.join(','),
    engineeringAutomationEnabled: binding.engineeringAutomationEnabled,
  };
}

function toBindingPayload(binding: RepoBindingFormState) {
  return {
    repositoryFullName: binding.repositoryFullName.trim(),
    installationId: Math.max(1, Number(binding.installationId) || 1),
    defaultBranch: binding.defaultBranch.trim() || 'main',
    pathAllowlist: binding.pathAllowlist
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
    engineeringAutomationEnabled: binding.engineeringAutomationEnabled,
  };
}

function statusTone(status: ImprovementLoopWorkspaceRunSummary['status']) {
  if (status === 'completed') return 'bg-emerald-100 text-emerald-700';
  if (status === 'failed' || status === 'cancelled') return 'bg-red-100 text-red-700';
  if (status === 'paused') return 'bg-amber-100 text-amber-700';
  return 'bg-sky-100 text-sky-700';
}

function roleStatusTone(status: ImprovementLoopWorkspaceRunSummary['roles'][number]['status']) {
  if (status === 'completed') return 'bg-emerald-100 text-emerald-700';
  if (status === 'failed') return 'bg-red-100 text-red-700';
  if (status === 'skipped') return 'bg-stone-200 text-stone-600';
  if (status === 'running') return 'bg-sky-100 text-sky-700';
  return 'bg-stone-100 text-stone-600';
}

export default function AiTeamPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedRunProjectParam = searchParams.get('projectId');
  const selectedRunIdParam = searchParams.get('runId');
  const { user, logout } = useAuthStore();
  const { projects, isLoading, fetchError, fetchProjects } = useProjectStore();
  const {
    currentRun,
    recentRuns,
    binding,
    validation,
    defaultEngineeringTarget,
    isLoadingDefaultEngineeringTarget,
    isLoadingRecentRuns,
    isSavingBinding,
    isValidatingBinding,
    isStarting,
    error,
    fetchLatestRun,
    fetchRecentRuns,
    selectRun,
    fetchBinding,
    fetchDefaultEngineeringTarget,
    saveBinding,
    validateBinding,
    startRun,
    startRunWithProject,
  } = useImprovementLoopStore();

  const [tab, setTab] = useState<LaunchTab>('current_project');
  const [launchProjectId, setLaunchProjectId] = useState('');
  const [projectTitle, setProjectTitle] = useState('The Lantern Company');
  const [objective, setObjective] = useState('Have the AI team create, improve, review, and engineer a stronger campaign package for DND Booker.');
  const [prompt, setPrompt] = useState('Create a campaign with practical DM tools, strong encounter packets, reusable tables, and publication-ready pacing.');
  const [repoBinding, setRepoBinding] = useState<RepoBindingFormState>(EMPTY_BINDING);

  useEffect(() => {
    void fetchProjects();
    void fetchDefaultEngineeringTarget();
    void fetchRecentRuns();
  }, [fetchProjects, fetchDefaultEngineeringTarget, fetchRecentRuns]);

  useEffect(() => {
    if (selectedRunProjectParam && selectedRunIdParam) {
      if (currentRun?.id !== selectedRunIdParam || currentRun.projectId !== selectedRunProjectParam) {
        void selectRun(selectedRunProjectParam, selectedRunIdParam);
      }
      return;
    }

    if (selectedRunProjectParam && !selectedRunIdParam) {
      setLaunchProjectId(selectedRunProjectParam);
      void fetchLatestRun(selectedRunProjectParam);
    }
  }, [selectedRunProjectParam, selectedRunIdParam, currentRun, selectRun, fetchLatestRun]);

  useEffect(() => {
    if (launchProjectId) return;
    if (projects.length === 0) return;
    setLaunchProjectId(projects[0].id);
  }, [projects, launchProjectId]);

  useEffect(() => {
    if (!selectedRunProjectParam && !selectedRunIdParam && !currentRun && recentRuns.length > 0) {
      const latest = recentRuns[0];
      setSearchParams({
        projectId: latest.projectId,
        runId: latest.runId,
      }, { replace: true });
    }
  }, [currentRun, recentRuns, selectedRunProjectParam, selectedRunIdParam, setSearchParams]);

  useEffect(() => {
    if (!defaultEngineeringTarget) return;
    setRepoBinding((current) => current.repositoryFullName.trim()
      ? current
      : bindingFormFromTarget(defaultEngineeringTarget));
  }, [defaultEngineeringTarget]);

  useEffect(() => {
    if (!launchProjectId) return;
    void fetchBinding(launchProjectId);
    if (defaultEngineeringTarget) {
      setRepoBinding(bindingFormFromTarget(defaultEngineeringTarget));
    }
  }, [launchProjectId, defaultEngineeringTarget, fetchBinding]);

  useEffect(() => {
    if (!binding) return;
    setRepoBinding(bindingFormFromProjectBinding(binding));
  }, [binding]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === launchProjectId) ?? null,
    [projects, launchProjectId],
  );

  const selectedWorkspaceRun = useMemo(
    () => recentRuns.find((run) => run.runId === currentRun?.id) ?? null,
    [recentRuns, currentRun],
  );

  const previousRunForProject = useMemo(() => {
    if (!currentRun) return null;
    const runsForProject = recentRuns.filter((run) => run.projectId === currentRun.projectId);
    const currentIndex = runsForProject.findIndex((run) => run.runId === currentRun.id);
    if (currentIndex < 0) return null;
    return runsForProject[currentIndex + 1] ?? null;
  }, [recentRuns, currentRun]);

  const selectedRunProjectTitle = useMemo(() => {
    if (!currentRun) return null;
    return selectedWorkspaceRun?.projectTitle
      ?? projects.find((project) => project.id === currentRun.projectId)?.title
      ?? currentRun.input.projectTitle
      ?? 'Selected project';
  }, [currentRun, projects, selectedWorkspaceRun]);

  async function handleSaveBinding() {
    if (!launchProjectId) return null;
    return saveBinding(launchProjectId, toBindingPayload(repoBinding));
  }

  async function handleValidateBinding() {
    if (!launchProjectId) return null;
    const saved = await handleSaveBinding();
    if (!saved) return null;
    return validateBinding(launchProjectId);
  }

  async function handleStartCurrentProjectRun() {
    if (!launchProjectId) return;
    const bindingValidation = await handleValidateBinding();
    if (!bindingValidation || bindingValidation.status !== 'valid') return;

    const run = await startRun(launchProjectId, {
      prompt: prompt.trim() || undefined,
      objective: objective.trim() || undefined,
      generationMode: 'campaign',
      generationQuality: 'polished',
    });
    if (!run) return;

    setSearchParams({
      projectId: run.projectId,
      runId: run.id,
    });
  }

  async function handleCreateCampaignAndRun() {
    const run = await startRunWithProject({
      projectTitle: projectTitle.trim() || 'AI Team Campaign',
      prompt: prompt.trim() || undefined,
      objective: objective.trim() || undefined,
      generationMode: 'campaign',
      generationQuality: 'polished',
      repoBinding: toBindingPayload(repoBinding),
    });
    if (!run) return;

    setTab('current_project');
    setLaunchProjectId(run.projectId);
    void fetchProjects();
    setSearchParams({
      projectId: run.projectId,
      runId: run.id,
    });
  }

  const targetModeLabel = defaultEngineeringTarget?.engineeringAutomationAvailable
    ? 'Full GitHub auto-apply'
    : 'Report-only fallback';

  return (
    <div className="min-h-screen bg-stone-100">
      <header className="border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-600 transition-colors hover:bg-stone-50"
            >
              Dashboard
            </button>
            <div>
              <h1 className="text-xl font-semibold text-stone-900">AI Team</h1>
              <p className="text-xs text-stone-500">Creator, designer, editor, and engineer working from one dashboard-first control surface.</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-stone-600">{user?.displayName}</span>
            <button
              onClick={() => logout()}
              className="text-sm text-stone-500 hover:text-stone-700"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Launch</div>
                <h2 className="mt-1 text-2xl font-semibold text-stone-900">Run the AI team from the dashboard</h2>
                <p className="mt-2 max-w-2xl text-sm text-stone-600">
                  Launch from the current project or start a fresh campaign, then keep the creative, editorial, and engineering outputs visible in one place.
                </p>
              </div>
              <div className={`rounded-full px-3 py-1 text-xs font-medium ${
                defaultEngineeringTarget?.engineeringAutomationAvailable
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {targetModeLabel}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Default Repo</div>
                <div className="mt-1 text-sm font-medium text-stone-900">
                  {defaultEngineeringTarget?.repositoryFullName ?? 'Loading...'}
                </div>
                <div className="mt-1 text-xs text-stone-500">
                  Branch: {defaultEngineeringTarget?.defaultBranch ?? 'main'}
                </div>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Engineering Mode</div>
                <div className="mt-1 text-sm font-medium text-stone-900">{targetModeLabel}</div>
                <div className="mt-1 text-xs text-stone-500">
                  {isLoadingDefaultEngineeringTarget ? 'Loading target configuration...' : defaultEngineeringTarget?.message ?? 'No target configuration loaded yet.'}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-stone-200 bg-gradient-to-br from-emerald-950 via-emerald-900 to-stone-900 p-6 text-white shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Focus</div>
            <h2 className="mt-1 text-2xl font-semibold">All-projects AI-team control</h2>
            <p className="mt-3 text-sm leading-6 text-emerald-50/85">
              This page now tracks recent AI-team runs across the workspace, so you can compare outcomes, editor ratings, and engineering follow-through without opening the editor.
            </p>
            <div className="mt-4 text-sm text-emerald-100/90">
              {selectedRunProjectTitle ? (
                <>Selected run target: <span className="font-semibold text-white">{selectedRunProjectTitle}</span></>
              ) : selectedProject ? (
                <>Launch target: <span className="font-semibold text-white">{selectedProject.title}</span></>
              ) : (
                <>Choose an existing project or create a fresh campaign to start.</>
              )}
            </div>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex gap-2">
              <button
                onClick={() => setTab('current_project')}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  tab === 'current_project'
                    ? 'bg-stone-900 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                Current Project
              </button>
              <button
                onClick={() => setTab('create_campaign')}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  tab === 'create_campaign'
                    ? 'bg-stone-900 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                Create Campaign And Run
              </button>
            </div>

            {tab === 'current_project' && (
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-stone-700">Launch Project</label>
                <select
                  value={launchProjectId}
                  onChange={(event) => setLaunchProjectId(event.target.value)}
                  className="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">Select a project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.title}</option>
                  ))}
                </select>
                {selectedProject && (
                  <div className="mt-2 text-xs text-stone-500">
                    Open editor: <Link className="text-emerald-700 hover:text-emerald-900" to={`/projects/${selectedProject.id}`}>{selectedProject.title}</Link>
                  </div>
                )}
              </div>
            )}

            {tab === 'create_campaign' && (
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-stone-700">Campaign Title</label>
                <input
                  value={projectTitle}
                  onChange={(event) => setProjectTitle(event.target.value)}
                  className="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-emerald-500 focus:outline-none"
                  placeholder="Ashes of the Hollow Crown"
                />
              </div>
            )}

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-stone-700">AI Team Objective</label>
              <textarea
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
                className="h-24 w-full rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="mb-6">
              <label className="mb-1 block text-sm font-medium text-stone-700">Creator Prompt</label>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="h-28 w-full rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="rounded-3xl border border-stone-200 bg-stone-50 p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-stone-900">Engineering Target</div>
                  <div className="text-xs text-stone-500">
                    Defaults come from the server so the AI team can target DND Booker consistently.
                  </div>
                </div>
                {defaultEngineeringTarget && (
                  <button
                    onClick={() => setRepoBinding(bindingFormFromTarget(defaultEngineeringTarget))}
                    className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
                  >
                    Use Default Target
                  </button>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Repository</label>
                  <input
                    value={repoBinding.repositoryFullName}
                    onChange={(event) => setRepoBinding((current) => ({ ...current, repositoryFullName: event.target.value }))}
                    className="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-emerald-500 focus:outline-none"
                    placeholder="owner/repo"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Installation ID</label>
                  <input
                    type="number"
                    value={repoBinding.installationId || ''}
                    onChange={(event) => setRepoBinding((current) => ({ ...current, installationId: Number(event.target.value) }))}
                    className="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-emerald-500 focus:outline-none"
                    placeholder="123456"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Default Branch</label>
                  <input
                    value={repoBinding.defaultBranch}
                    onChange={(event) => setRepoBinding((current) => ({ ...current, defaultBranch: event.target.value }))}
                    className="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-emerald-500 focus:outline-none"
                    placeholder="main"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Allowlist</label>
                  <input
                    value={repoBinding.pathAllowlist}
                    onChange={(event) => setRepoBinding((current) => ({ ...current, pathAllowlist: event.target.value }))}
                    className="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-emerald-500 focus:outline-none"
                    placeholder="docs/,README.md,CLAUDE.md"
                  />
                  <p className="mt-1 text-[11px] text-stone-500">
                    Comma-separated prefixes or file paths. The engineer role only auto-applies inside this boundary.
                  </p>
                </div>
              </div>

              <label className="mt-4 flex items-center gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  checked={repoBinding.engineeringAutomationEnabled}
                  onChange={(event) => setRepoBinding((current) => ({ ...current, engineeringAutomationEnabled: event.target.checked }))}
                />
                Enable GitHub auto-apply when the server has GitHub App credentials available
              </label>

              {validation && (
                <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                  validation.status === 'valid'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : validation.status === 'invalid'
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700'
                }`}>
                  {validation.message}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {tab === 'current_project' && (
                  <>
                    <button
                      onClick={() => void handleSaveBinding()}
                      disabled={isSavingBinding || !launchProjectId}
                      className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSavingBinding ? 'Saving...' : 'Save Target'}
                    </button>
                    <button
                      onClick={() => void handleValidateBinding()}
                      disabled={isSavingBinding || isValidatingBinding || !launchProjectId}
                      className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isValidatingBinding ? 'Validating...' : 'Validate Project Target'}
                    </button>
                  </>
                )}
                <button
                  onClick={() => void (tab === 'current_project' ? handleStartCurrentProjectRun() : handleCreateCampaignAndRun())}
                  disabled={isStarting || !repoBinding.repositoryFullName.trim() || (tab === 'current_project' && !launchProjectId)}
                  className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isStarting ? 'Starting...' : tab === 'current_project' ? 'Start AI Team Run' : 'Create Campaign And Run'}
                </button>
              </div>
            </div>

            {(fetchError || error) && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {fetchError ?? error}
              </div>
            )}

            {isLoading && (
              <div className="mt-4 text-sm text-stone-500">Loading projects...</div>
            )}
          </section>

          <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Recent Runs</div>
                <h2 className="mt-1 text-2xl font-semibold text-stone-900">Workspace AI-team history</h2>
                <p className="mt-2 text-sm text-stone-600">
                  Compare run outcomes across all projects and jump straight into the run detail that matters.
                </p>
              </div>
              <button
                onClick={() => void fetchRecentRuns()}
                className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
              >
                Refresh
              </button>
            </div>

            {isLoadingRecentRuns && recentRuns.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-stone-200 bg-stone-50 px-5 py-10 text-center text-sm text-stone-500">
                Loading recent AI-team runs...
              </div>
            ) : recentRuns.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-stone-200 bg-stone-50 px-5 py-10 text-center">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">History</div>
                <h3 className="mt-2 text-lg font-semibold text-stone-900">No AI-team runs yet</h3>
                <p className="mt-2 text-sm text-stone-600">
                  Start from the launch panel and the most recent runs across your projects will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentRuns.map((run) => {
                  const isSelected = run.runId === currentRun?.id;
                  return (
                    <div
                      key={run.runId}
                      className={`rounded-3xl border px-4 py-4 transition-colors ${
                        isSelected
                          ? 'border-emerald-300 bg-emerald-50 shadow-sm'
                          : 'border-stone-200 bg-stone-50 hover:border-stone-300 hover:bg-white'
                      }`}
                    >
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-stone-900">{run.projectTitle}</div>
                          <div className="mt-1 text-xs text-stone-500">
                            {run.mode === 'create_campaign' ? 'Create campaign' : 'Current project'} • Updated {formatRelativeTime(run.updatedAt)}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusTone(run.status)}`}>
                            {run.currentStage ?? run.status}
                          </span>
                          {run.editorRecommendation && (
                            <span className="rounded-full bg-stone-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                              Editor {run.editorScore ?? 'n/a'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mb-3 flex flex-wrap gap-2">
                        {run.roles.map((role) => (
                          <span
                            key={role.id}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${roleStatusTone(role.status)}`}
                          >
                            {role.role}: {role.status}
                          </span>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-stone-500">
                        <span>{run.artifactCount} artifact{run.artifactCount === 1 ? '' : 's'}</span>
                        {run.githubPullRequestUrl ? (
                          <a
                            href={run.githubPullRequestUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-emerald-700 underline hover:text-emerald-900"
                          >
                            PR #{run.githubPullRequestNumber}
                          </a>
                        ) : (
                          <span>No engineering PR yet</span>
                        )}
                        {run.failureReason && <span className="text-red-600">{run.failureReason}</span>}
                      </div>
                      <button
                        onClick={() => setSearchParams({ projectId: run.projectId, runId: run.runId })}
                        className="mt-3 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
                      >
                        {isSelected ? 'Viewing run' : 'View run'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <section className="mt-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          {currentRun ? (
            <ImprovementLoopPanel
              title="Selected AI Team Run"
              projectTitle={selectedRunProjectTitle ?? undefined}
              previousRun={previousRunForProject}
              onSelectRun={(run) => setSearchParams({ projectId: run.projectId, runId: run.runId })}
            />
          ) : (
            <div className="rounded-3xl border border-dashed border-stone-200 bg-stone-50 px-5 py-12 text-center">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Run Detail</div>
              <h2 className="mt-2 text-xl font-semibold text-stone-900">Select a recent run to compare outputs</h2>
              <p className="mt-2 text-sm text-stone-600">
                The selected run view keeps role lineage, editor rating, artifacts, and engineering follow-through together for quick comparison.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
