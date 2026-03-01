interface Template {
  id: string;
  name: string;
  description: string;
  type: 'campaign' | 'one_shot' | 'supplement' | 'sourcebook';
  content: unknown;
  isSystem: boolean;
}

const typeConfig: Record<Template['type'], { label: string; color: string; border: string }> = {
  campaign: {
    label: 'Campaign',
    color: 'bg-indigo-100 text-indigo-800',
    border: 'border-indigo-200 hover:border-indigo-400',
  },
  one_shot: {
    label: 'One-Shot',
    color: 'bg-emerald-100 text-emerald-800',
    border: 'border-emerald-200 hover:border-emerald-400',
  },
  supplement: {
    label: 'Supplement',
    color: 'bg-blue-100 text-blue-800',
    border: 'border-blue-200 hover:border-blue-400',
  },
  sourcebook: {
    label: 'Sourcebook',
    color: 'bg-amber-100 text-amber-800',
    border: 'border-amber-200 hover:border-amber-400',
  },
};

interface TemplateCardProps {
  template: Template;
  onSelect: (template: Template) => void;
}

export type { Template };

export default function TemplateCard({ template, onSelect }: TemplateCardProps) {
  const typeInfo = typeConfig[template.type] ?? typeConfig.campaign;

  return (
    <div
      className={`flex flex-col rounded-lg border bg-white p-5 shadow-sm transition-all hover:shadow-md ${typeInfo.border}`}
    >
      <div className="mb-3">
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${typeInfo.color}`}
        >
          {typeInfo.label}
        </span>
      </div>

      <h3 className="text-base font-semibold text-gray-900 mb-1">{template.name}</h3>

      {template.description && (
        <p className="text-sm text-gray-500 mb-4 line-clamp-2 flex-1">{template.description}</p>
      )}

      <button
        onClick={() => onSelect(template)}
        className="mt-auto w-full rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 transition-colors"
      >
        Use Template
      </button>
    </div>
  );
}
