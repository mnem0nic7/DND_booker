import { useEffect, useState } from 'react';
import { useImprovementLoopStore } from '../../stores/improvementLoopStore';

interface Props {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

const EMPTY_BINDING = {
  repositoryFullName: '',
  installationId: 0,
  defaultBranch: 'main',
  pathAllowlist: 'docs/,README.md,CLAUDE.md',
  engineeringAutomationEnabled: true,
};

export function ImprovementLoopDialog({ projectId, isOpen, onClose }: Props) {
  const {
    binding,
    validation,
    isSavingBinding,
    isValidatingBinding,
    isStarting,
    error,
    fetchBinding,
    saveBinding,
    validateBinding,
    startRun,
    startRunWithProject,
  } = useImprovementLoopStore();

  const [tab, setTab] = useState<'current_project' | 'create_campaign'>('current_project');
  const [projectTitle, setProjectTitle] = useState('Improvement Loop Campaign');
  const [prompt, setPrompt] = useState('Create a campaign with strong encounter packets, practical GM tools, and publication-ready pacing.');
  const [objective, setObjective] = useState('Run the full creator, designer, editor, and engineering improvement loop.');
  const [repoBinding, setRepoBinding] = useState(EMPTY_BINDING);

  useEffect(() => {
    if (!isOpen) return;
    void fetchBinding(projectId);
  }, [isOpen, projectId, fetchBinding]);

  useEffect(() => {
    if (!binding) return;
    setRepoBinding({
      repositoryFullName: binding.repositoryFullName,
      installationId: binding.installationId,
      defaultBranch: binding.defaultBranch,
      pathAllowlist: binding.pathAllowlist.join(','),
      engineeringAutomationEnabled: binding.engineeringAutomationEnabled,
    });
  }, [binding]);

  if (!isOpen) return null;

  async function handleSaveBinding() {
    await saveBinding(projectId, {
      repositoryFullName: repoBinding.repositoryFullName.trim(),
      installationId: Number(repoBinding.installationId),
      defaultBranch: repoBinding.defaultBranch.trim() || 'main',
      pathAllowlist: repoBinding.pathAllowlist
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
      engineeringAutomationEnabled: repoBinding.engineeringAutomationEnabled,
    });
  }

  async function handleValidateBinding() {
    await handleSaveBinding();
    await validateBinding(projectId);
  }

  async function handleStart() {
    if (tab === 'current_project') {
      const run = await startRun(projectId, {
        prompt: prompt.trim() || undefined,
        objective: objective.trim() || undefined,
        generationMode: 'campaign',
        generationQuality: 'polished',
      });
      if (run) onClose();
      return;
    }

    const run = await startRunWithProject({
      projectTitle: projectTitle.trim() || 'Improvement Loop Campaign',
      prompt: prompt.trim() || undefined,
      objective: objective.trim() || undefined,
      generationMode: 'campaign',
      generationQuality: 'polished',
      repoBinding: {
        repositoryFullName: repoBinding.repositoryFullName.trim(),
        installationId: Number(repoBinding.installationId),
        defaultBranch: repoBinding.defaultBranch.trim() || 'main',
        pathAllowlist: repoBinding.pathAllowlist
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
        engineeringAutomationEnabled: repoBinding.engineeringAutomationEnabled,
      },
    });
    if (run) {
      window.location.assign(`/projects/${run.projectId}`);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="improvement-loop-title"
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto">
        <h2 id="improvement-loop-title" className="text-lg font-semibold text-gray-800 mb-4">
          Improvement Loop
        </h2>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab('current_project')}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
              tab === 'current_project'
                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Current Project
          </button>
          <button
            onClick={() => setTab('create_campaign')}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
              tab === 'create_campaign'
                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Create Campaign And Run
          </button>
        </div>

        {tab === 'create_campaign' && (
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Title</label>
            <input
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              placeholder="Ashes of the Hollow Crown"
            />
          </div>
        )}

        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Loop Objective</label>
          <textarea
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            className="w-full border border-gray-300 rounded-md p-2 text-sm h-20 resize-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Creator Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full border border-gray-300 rounded-md p-2 text-sm h-24 resize-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 mb-4">
          <div className="text-sm font-semibold text-gray-800 mb-3">GitHub Repo Binding</div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Repository</label>
              <input
                value={repoBinding.repositoryFullName}
                onChange={(e) => setRepoBinding((prev) => ({ ...prev, repositoryFullName: e.target.value }))}
                className="w-full border border-gray-300 rounded-md p-2 text-sm"
                placeholder="owner/repo"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Installation ID</label>
              <input
                type="number"
                value={repoBinding.installationId || ''}
                onChange={(e) => setRepoBinding((prev) => ({ ...prev, installationId: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-md p-2 text-sm"
                placeholder="123456"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Default Branch</label>
              <input
                value={repoBinding.defaultBranch}
                onChange={(e) => setRepoBinding((prev) => ({ ...prev, defaultBranch: e.target.value }))}
                className="w-full border border-gray-300 rounded-md p-2 text-sm"
                placeholder="main"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Allowlist</label>
              <input
                value={repoBinding.pathAllowlist}
                onChange={(e) => setRepoBinding((prev) => ({ ...prev, pathAllowlist: e.target.value }))}
                className="w-full border border-gray-300 rounded-md p-2 text-sm"
                placeholder="docs/,README.md,CLAUDE.md"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Comma-separated paths or prefixes. The engineering stage only auto-applies inside this allowlist.
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-700 mb-3">
            <input
              type="checkbox"
              checked={repoBinding.engineeringAutomationEnabled}
              onChange={(e) => setRepoBinding((prev) => ({ ...prev, engineeringAutomationEnabled: e.target.checked }))}
            />
            Enable engineering auto-apply on the bound GitHub repo
          </label>

          <div className="flex gap-2 mb-2">
            <button
              onClick={() => void handleSaveBinding()}
              disabled={isSavingBinding}
              className="text-xs px-3 py-1.5 rounded bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              {isSavingBinding ? 'Saving...' : 'Save Binding'}
            </button>
            <button
              onClick={() => void handleValidateBinding()}
              disabled={isSavingBinding || isValidatingBinding}
              className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {isValidatingBinding ? 'Validating...' : 'Validate Binding'}
            </button>
          </div>

          {validation && (
            <div className={`text-xs rounded border px-3 py-2 ${
              validation.status === 'valid'
                ? 'border-green-200 bg-green-50 text-green-700'
                : validation.status === 'invalid'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-amber-200 bg-amber-50 text-amber-700'
            }`}>
              {validation.message}
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleStart()}
            disabled={isStarting || !repoBinding.repositoryFullName.trim() || !repoBinding.installationId}
            className="text-sm px-4 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isStarting ? 'Starting...' : 'Start Improvement Loop'}
          </button>
        </div>
      </div>
    </div>
  );
}
