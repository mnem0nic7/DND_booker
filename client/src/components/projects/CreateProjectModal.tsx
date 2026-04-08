import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProjectType } from '@dnd-booker/shared';
import { useProjectStore } from '../../stores/projectStore';
import TemplateGallery from '../templates/TemplateGallery';
import type { Template } from '../templates/TemplateCard';

const projectTypes = [
  {
    value: 'campaign',
    label: 'Campaign',
    description: 'A multi-session adventure arc',
    color: 'border-indigo-400 bg-indigo-50 text-indigo-900',
    selected: 'ring-2 ring-indigo-500 border-indigo-500 bg-indigo-100',
  },
  {
    value: 'one_shot',
    label: 'One-Shot',
    description: 'A single-session adventure',
    color: 'border-emerald-400 bg-emerald-50 text-emerald-900',
    selected: 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-100',
  },
  {
    value: 'supplement',
    label: 'Supplement',
    description: 'Additional rules or content',
    color: 'border-blue-400 bg-blue-50 text-blue-900',
    selected: 'ring-2 ring-blue-500 border-blue-500 bg-blue-100',
  },
  {
    value: 'sourcebook',
    label: 'Sourcebook',
    description: 'A comprehensive reference guide',
    color: 'border-amber-400 bg-amber-50 text-amber-900',
    selected: 'ring-2 ring-amber-500 border-amber-500 bg-amber-100',
  },
] as const;

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
}

type Step = 'template' | 'details';

export default function CreateProjectModal({ open, onClose }: CreateProjectModalProps) {
  const navigate = useNavigate();
  const createProject = useProjectStore((s) => s.createProject);

  const [step, setStep] = useState<Step>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ProjectType>('campaign');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleTemplateSelect = (template: Template) => {
    setSelectedTemplate(template);
    setType(template.type);
    setStep('details');
  };

  const handleSkipTemplate = () => {
    setSelectedTemplate(null);
    setStep('details');
  };

  const handleBack = () => {
    setStep('template');
    setSelectedTemplate(null);
    setError(null);
  };

  const handleClose = () => {
    // Reset state
    setStep('template');
    setSelectedTemplate(null);
    setTitle('');
    setDescription('');
    setType('campaign');
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsCreating(true);
    setError(null);
    try {
      const project = await createProject({
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        templateId: selectedTemplate?.id,
      });
      handleClose();
      navigate(`/projects/${project.id}`);
    } catch {
      setError('Failed to create project. Please try again.');
      setIsCreating(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            {step === 'details' && (
              <button
                onClick={handleBack}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h2 className="text-lg font-semibold text-gray-900">
              {step === 'template' ? 'New Project' : 'Project Details'}
            </h2>
            {selectedTemplate && step === 'details' && (
              <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                {selectedTemplate.name}
              </span>
            )}
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-6">
          {step === 'template' && (
            <TemplateGallery onSelect={handleTemplateSelect} onSkip={handleSkipTemplate} />
          )}

          {step === 'details' && (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
              )}

              {/* Title */}
              <div>
                <label htmlFor="project-title" className="block text-sm font-medium text-gray-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  id="project-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter project title..."
                  required
                  autoFocus
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <label htmlFor="project-description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  id="project-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Briefly describe your project..."
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 focus:outline-none resize-none"
                />
              </div>

              {/* Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Project Type</label>
                <div className="grid grid-cols-2 gap-3">
                  {projectTypes.map((pt) => (
                    <button
                      key={pt.value}
                      type="button"
                      onClick={() => setType(pt.value)}
                      className={`rounded-lg border p-3 text-left transition-all ${
                        type === pt.value ? pt.selected : `${pt.color} hover:shadow-sm`
                      }`}
                    >
                      <div className="text-sm font-medium">{pt.label}</div>
                      <div className="text-xs opacity-70 mt-0.5">{pt.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!title.trim() || isCreating}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isCreating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
