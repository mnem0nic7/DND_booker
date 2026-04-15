import { useState, useEffect } from 'react';
import { LogOut, Plus } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useProjectStore, type Project } from '../stores/projectStore';
import CreateProjectModal from '../components/projects/CreateProjectModal';
import { ForgeShell } from '../components/console/ForgeShell';
import '../styles/forge-console.css';

function sortProjects(projects: Project[]) {
  return [...projects].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export default function DashboardPage() {
  const { logout } = useAuthStore();
  const { projects } = useProjectStore();
  const sorted = sortProjects(projects);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    sorted[0]?.id ?? null,
  );
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (selectedProjectId === null && sorted.length > 0) {
      setSelectedProjectId(sorted[0].id);
    }
  }, [sorted, selectedProjectId]);

  return (
    <div className="forge-console-page forge-page">
      <div className="forge-topbar">
        <div className="forge-topbar__projects">
          {sorted.map(p => (
            <button
              key={p.id}
              className={`forge-topbar__project${p.id === selectedProjectId ? ' forge-topbar__project--active' : ''}`}
              onClick={() => setSelectedProjectId(p.id)}
            >
              {p.title}
            </button>
          ))}
          <button
            className="forge-topbar__new"
            aria-label="New project"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={14} />
          </button>
        </div>
        <button
          className="forge-topbar__logout"
          aria-label="Log out"
          onClick={() => { void logout(); }}
        >
          <LogOut size={14} />
        </button>
      </div>

      {selectedProjectId ? (
        <ForgeShell key={selectedProjectId} projectId={selectedProjectId} />
      ) : (
        <div className="forge-empty">Create a project to get started.</div>
      )}

      {showCreateModal && (
        <CreateProjectModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          navigateOnCreate={false}
          onCreated={(project) => {
            setSelectedProjectId(project.id);
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
}
