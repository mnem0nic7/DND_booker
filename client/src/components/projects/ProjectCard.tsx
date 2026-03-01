import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore, type Project } from '../../stores/projectStore';

const typeConfig: Record<Project['type'], { label: string; color: string; gradient: string }> = {
  campaign: {
    label: 'Campaign',
    color: 'bg-indigo-100 text-indigo-800',
    gradient: 'from-indigo-500/10 to-purple-500/10',
  },
  one_shot: {
    label: 'One-Shot',
    color: 'bg-emerald-100 text-emerald-800',
    gradient: 'from-emerald-500/10 to-green-500/10',
  },
  supplement: {
    label: 'Supplement',
    color: 'bg-blue-100 text-blue-800',
    gradient: 'from-blue-500/10 to-cyan-500/10',
  },
  sourcebook: {
    label: 'Sourcebook',
    color: 'bg-amber-100 text-amber-800',
    gradient: 'from-amber-500/10 to-orange-500/10',
  },
};

const statusConfig: Record<Project['status'], { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-600' },
  in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-800' },
  review: { label: 'Review', color: 'bg-blue-100 text-blue-800' },
  published: { label: 'Published', color: 'bg-green-100 text-green-800' },
};

interface ProjectCardProps {
  project: Project;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const navigate = useNavigate();
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const typeInfo = typeConfig[project.type] ?? typeConfig.campaign;
  const statusInfo = statusConfig[project.status] ?? statusConfig.draft;

  const formattedDate = new Date(project.updatedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setIsDeleting(true);
    try {
      await deleteProject(project.id);
    } catch {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
  };

  return (
    <div
      onClick={() => navigate(`/projects/${project.id}`)}
      className={`relative cursor-pointer rounded-lg border border-gray-200 bg-gradient-to-br ${typeInfo.gradient} bg-white p-5 shadow-sm transition-all hover:shadow-md hover:border-gray-300 hover:-translate-y-0.5`}
    >
      {/* Badges */}
      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${typeInfo.color}`}>
          {typeInfo.label}
        </span>
        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-lg font-semibold text-gray-900 mb-1 line-clamp-1">{project.title}</h3>

      {/* Description */}
      {project.description && (
        <p className="text-sm text-gray-500 mb-3 line-clamp-2">{project.description}</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span>{project._count?.documents ?? 0} docs</span>
          <span>Updated {formattedDate}</span>
        </div>

        {/* Delete */}
        <div className="flex items-center gap-1">
          {confirmDelete && (
            <button
              onClick={handleCancelDelete}
              className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className={`rounded px-2 py-1 text-xs transition-colors ${
              confirmDelete
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
            } ${isDeleting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isDeleting ? 'Deleting...' : confirmDelete ? 'Confirm' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
