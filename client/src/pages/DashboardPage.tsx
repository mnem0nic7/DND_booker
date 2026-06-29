import { useState, useEffect } from 'react';
import { LogOut, Plus } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useProjectStore, type Project } from '../stores/projectStore';
import { ChatProjectCreation } from '../components/projects/ChatProjectCreation';
import { ForgeShell } from '../components/console/ForgeShell';
import '../styles/forge-console.css';

function sortProjects(projects: Project[]) {
  return [...projects].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export default function DashboardPage() {
  const { logout } = useAuthStore();
  const { projects, fetchProjects, isLoading, fetchError } = useProjectStore();
  const sorted = sortProjects(projects);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // Load the user's projects on mount so existing work is visible instead of
  // dropping straight into project creation with an empty roster.
  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (selectedProjectId === null && sorted.length > 0) {
      setSelectedProjectId(sorted[0].id);
    }
  }, [sorted, selectedProjectId]);

  const showCreate = isCreatingProject || (!selectedProjectId && !isLoading);

  return (
    <div className="forge-console-page forge-page">
      <div className="forge-topbar">
        <span className="forge-brand" aria-hidden="true">⚔ DND&nbsp;Booker</span>
        <div className="forge-topbar__projects">
          {sorted.map(p => (
            <button
              key={p.id}
              className={`forge-topbar__project${p.id === selectedProjectId && !isCreatingProject ? ' forge-topbar__project--active' : ''}`}
              title={p.title}
              onClick={() => { setSelectedProjectId(p.id); setIsCreatingProject(false); }}
            >
              {p.title}
            </button>
          ))}
          {isLoading && sorted.length === 0 && (
            <span className="forge-topbar__hint">Loading your projects…</span>
          )}
          <button
            className="forge-topbar__new"
            title="Start a new project"
            onClick={() => setIsCreatingProject(true)}
          >
            <Plus size={14} />
            <span>New project</span>
          </button>
        </div>
        <button
          className="forge-topbar__logout"
          title="Sign out"
          onClick={() => { void logout(); }}
        >
          <LogOut size={14} />
          <span>Sign out</span>
        </button>
      </div>

      {fetchError && sorted.length === 0 && !showCreate && (
        <div className="forge-banner forge-banner--error" role="alert">
          Couldn’t load your projects. Check your connection and refresh.
        </div>
      )}

      {showCreate ? (
        <ChatProjectCreation
          onCreated={(project) => {
            void fetchProjects();
            setSelectedProjectId(project.id);
            setIsCreatingProject(false);
          }}
        />
      ) : selectedProjectId ? (
        <ForgeShell key={selectedProjectId} projectId={selectedProjectId} />
      ) : (
        <div className="forge-empty">Loading…</div>
      )}
    </div>
  );
}
