import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useProjectStore } from '../stores/projectStore';
import ProjectCard from '../components/projects/ProjectCard';
import CreateProjectModal from '../components/projects/CreateProjectModal';

export default function DashboardPage() {
  const { user, logout } = useAuthStore();
  const { projects, isLoading, fetchError, fetchProjects } = useProjectStore();
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">DND Booker</h1>
            <span className="hidden sm:inline text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
              Dashboard
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.displayName}</span>
            <button
              onClick={() => logout()}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Title bar */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Your Projects</h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Project
          </button>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-gray-400 text-sm">Loading projects...</div>
          </div>
        )}

        {/* Error state */}
        {!isLoading && fetchError && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
            <p className="text-sm text-red-700">{fetchError}</p>
            <button
              onClick={() => fetchProjects()}
              className="text-sm font-medium text-red-600 hover:text-red-800"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !fetchError && projects.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16 px-4">
            <div className="mb-4 rounded-full bg-indigo-50 p-4">
              <svg
                className="h-8 w-8 text-indigo-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No projects yet</h3>
            <p className="text-sm text-gray-500 mb-4">Create your first project to get started.</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Create Your First Project
            </button>
          </div>
        )}

        {/* Project grid */}
        {!isLoading && projects.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </main>

      {/* Create modal */}
      <CreateProjectModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  );
}
