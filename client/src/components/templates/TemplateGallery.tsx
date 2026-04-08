import { useEffect, useState } from 'react';
import api from '../../lib/api';
import TemplateCard, { type Template } from './TemplateCard';

interface TemplateGalleryProps {
  onSelect: (template: Template) => void;
  onSkip: () => void;
}

export default function TemplateGallery({ onSelect, onSkip }: TemplateGalleryProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTemplates() {
      try {
        const { data } = await api.get('/v1/templates');
        setTemplates(data);
      } catch {
        setError('Failed to load templates.');
      } finally {
        setIsLoading(false);
      }
    }
    fetchTemplates();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400 text-sm">Loading templates...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="text-red-500 text-sm mb-3">{error}</div>
        <button
          onClick={onSkip}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Skip and create blank project
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-gray-900">Choose a Template</h3>
        <p className="text-sm text-gray-500 mt-1">
          Start with a pre-built structure, or skip to create a blank project.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {templates.map((template) => (
          <TemplateCard key={template.id} template={template} onSelect={onSelect} />
        ))}
      </div>

      <div className="mt-4 text-center">
        <button
          onClick={onSkip}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Skip — start with a blank project
        </button>
      </div>
    </div>
  );
}
