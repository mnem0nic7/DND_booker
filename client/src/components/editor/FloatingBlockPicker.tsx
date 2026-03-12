import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { BLOCK_TYPES, CATEGORY_ORDER } from './blockDefinitions';
import type { BlockField, BlockFormValues, BlockType } from './blockDefinitions';

const CATEGORY_STYLES: Record<string, { chip: string; panel: string }> = {
  'Creatures & NPCs': {
    chip: 'bg-amber-100 text-amber-900 border-amber-200',
    panel: 'from-amber-50 via-white to-orange-50',
  },
  'Spells, Loot & Rules': {
    chip: 'bg-emerald-100 text-emerald-900 border-emerald-200',
    panel: 'from-emerald-50 via-white to-lime-50',
  },
  'Encounters & Tables': {
    chip: 'bg-sky-100 text-sky-900 border-sky-200',
    panel: 'from-sky-50 via-white to-cyan-50',
  },
  Writing: {
    chip: 'bg-rose-100 text-rose-900 border-rose-200',
    panel: 'from-rose-50 via-white to-pink-50',
  },
  'Book Structure': {
    chip: 'bg-violet-100 text-violet-900 border-violet-200',
    panel: 'from-violet-50 via-white to-fuchsia-50',
  },
  Layout: {
    chip: 'bg-slate-100 text-slate-900 border-slate-200',
    panel: 'from-slate-50 via-white to-zinc-100',
  },
  Basic: {
    chip: 'bg-gray-100 text-gray-800 border-gray-200',
    panel: 'from-gray-50 via-white to-slate-50',
  },
};

interface FloatingBlockPickerProps {
  editor: Editor;
  isOpen: boolean;
  onClose: () => void;
}

export function FloatingBlockPicker({ editor, isOpen, onClose }: FloatingBlockPickerProps) {
  const [search, setSearch] = useState('');
  const [selectedName, setSelectedName] = useState<string>(BLOCK_TYPES[0]?.name ?? '');
  const [formValues, setFormValues] = useState<BlockFormValues>({});

  const query = search.trim().toLowerCase();
  const filteredBlocks = !query
    ? BLOCK_TYPES
    : BLOCK_TYPES.filter((block) => {
      const haystack = [
        block.label,
        block.description,
        block.category,
        ...block.keywords,
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });

  const selectedBlock = filteredBlocks.find((block) => block.name === selectedName) ?? filteredBlocks[0] ?? null;

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setSelectedName((prev) => prev || BLOCK_TYPES[0]?.name || '');
  }, [isOpen]);

  useEffect(() => {
    if (!selectedBlock) return;
    setSelectedName(selectedBlock.name);
    setFormValues(selectedBlock.getInitialValues());
  }, [selectedBlock?.name]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const categories = CATEGORY_ORDER.reduce<Record<string, BlockType[]>>((acc, category) => {
    const blocks = filteredBlocks.filter((block) => block.category === category);
    if (blocks.length > 0) {
      acc[category] = blocks;
    }
    return acc;
  }, {});

  function updateValue(key: string, value: string | number | boolean) {
    setFormValues((current) => ({ ...current, [key]: value }));
  }

  function applyPreset(values: BlockFormValues) {
    if (!selectedBlock) return;
    setFormValues({
      ...selectedBlock.getInitialValues(),
      ...values,
    });
  }

  function handleCreate() {
    if (!selectedBlock) return;
    selectedBlock.insertContent(editor, formValues);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-[2px] flex items-center justify-center p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-6xl h-[78vh] min-h-[620px] bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex">
        <div className="w-[42%] min-w-[340px] border-r border-slate-200 bg-slate-50/70 flex flex-col">
          <div className="p-5 border-b border-slate-200 bg-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400 font-semibold">Component Library</p>
                <h2 className="text-2xl font-semibold text-slate-900 mt-1">Build D&D content blocks</h2>
                <p className="text-sm text-slate-500 mt-2">
                  Creatures, spells, NPCs, handouts, chapter openers, and layout components.
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-colors"
                aria-label="Close creator"
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 relative">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search creatures, spells, NPCs, handouts..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300"
              />
            </div>
          </div>
          <div className="overflow-y-auto px-4 py-4 space-y-5">
            {Object.entries(categories).map(([category, blocks]) => {
              const style = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.Basic;
              return (
                <section key={category}>
                  <div className="flex items-center justify-between px-1 mb-2">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${style.chip}`}>
                      {category}
                    </span>
                    <span className="text-[11px] text-slate-400">{blocks.length}</span>
                  </div>
                  <div className="space-y-2">
                    {blocks.map((block) => {
                      const active = selectedBlock?.name === block.name;
                      return (
                        <button
                          key={block.name}
                          type="button"
                          onClick={() => setSelectedName(block.name)}
                          className={`w-full text-left rounded-2xl border px-4 py-3 transition-all ${
                            active
                              ? 'border-slate-900 bg-white shadow-sm'
                              : 'border-transparent bg-white/75 hover:bg-white hover:border-slate-200'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`min-w-11 h-11 rounded-2xl flex items-center justify-center text-xs font-bold ${
                              active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {block.icon}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-900">{block.label}</span>
                                {block.fields && block.fields.length > 0 && (
                                  <span className="text-[10px] uppercase tracking-wide text-slate-400">Configured</span>
                                )}
                              </div>
                              <p className="text-sm text-slate-500 mt-1 line-clamp-2">{block.description}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            {filteredBlocks.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
                <p className="text-slate-700 font-medium">No matching components</p>
                <p className="text-sm text-slate-500 mt-1">Try a broader search like “creature”, “spell”, or “layout”.</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {selectedBlock ? (
            <>
              <div className={`px-7 py-6 border-b border-slate-200 bg-gradient-to-br ${CATEGORY_STYLES[selectedBlock.category]?.panel ?? CATEGORY_STYLES.Basic.panel}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-sm font-bold shadow-sm">
                        {selectedBlock.icon}
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-500 font-semibold">{selectedBlock.category}</p>
                        <h3 className="text-3xl font-semibold text-slate-950">{selectedBlock.label}</h3>
                      </div>
                    </div>
                    <p className="text-slate-600 max-w-2xl">{selectedBlock.description}</p>
                  </div>
                  <div className="hidden xl:flex max-w-xs rounded-2xl bg-white/80 border border-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                    Add the shell here, then use the inline AI controls inside the block if you want the content filled automatically.
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-7 py-6">
                {selectedBlock.presets && selectedBlock.presets.length > 0 && (
                  <section className="mb-8">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-slate-900">Quick starts</h4>
                      <span className="text-xs text-slate-400">Apply a preset, then tweak the details.</span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {selectedBlock.presets.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => applyPreset(preset.values as BlockFormValues)}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left hover:border-slate-300 hover:shadow-sm transition-all"
                        >
                          <div className="font-semibold text-slate-900">{preset.label}</div>
                          <div className="text-sm text-slate-500 mt-1">{preset.description}</div>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                <section className="space-y-5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-900">Configure the block</h4>
                    <button
                      type="button"
                      onClick={() => setFormValues(selectedBlock.getInitialValues())}
                      className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
                    >
                      Reset fields
                    </button>
                  </div>
                  {selectedBlock.fields && selectedBlock.fields.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {selectedBlock.fields.map((field) => (
                        <FieldControl
                          key={field.key}
                          field={field}
                          value={formValues[field.key]}
                          onChange={(value) => updateValue(field.key, value)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-slate-500">
                      This block does not need any setup. Insert it directly, then edit it in place.
                    </div>
                  )}
                </section>
              </div>

              <div className="border-t border-slate-200 bg-white px-7 py-4 flex items-center justify-between gap-4">
                <div className="text-sm text-slate-500">
                  Inserts directly into the current cursor position in the active document.
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreate}
                    className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 transition-colors shadow-sm"
                  >
                    {selectedBlock.createLabel ?? `Insert ${selectedBlock.label}`}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              No blocks available.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: BlockField;
  value: string | number | boolean | undefined;
  onChange: (value: string | number | boolean) => void;
}) {
  const commonClasses = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300';

  return (
    <label className={`block ${field.type === 'textarea' ? 'md:col-span-2' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-800">{field.label}</span>
        {field.description && (
          <span className="text-xs text-slate-400">{field.description}</span>
        )}
      </div>

      {field.type === 'textarea' ? (
        <textarea
          rows={field.rows ?? 4}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className={`${commonClasses} resize-y min-h-[120px]`}
        />
      ) : field.type === 'select' ? (
        <select
          value={typeof value === 'number' ? String(value) : typeof value === 'string' ? value : ''}
          onChange={(event) => {
            const matchedNumber = field.options?.find((option) => String(option.value) === event.target.value && typeof option.value === 'number');
            onChange(matchedNumber ? Number(event.target.value) : event.target.value);
          }}
          className={commonClasses}
        >
          {field.options?.map((option) => (
            <option key={`${field.key}-${option.value}`} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.type === 'checkbox' ? (
        <button
          type="button"
          onClick={() => onChange(!(value === true))}
          className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
            value === true
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
          }`}
        >
          <span className="font-medium">{value === true ? 'Enabled' : 'Disabled'}</span>
        </button>
      ) : field.type === 'number' ? (
        <input
          type="number"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={typeof value === 'number' ? value : typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
          placeholder={field.placeholder}
          className={commonClasses}
        />
      ) : (
        <input
          type="text"
          value={typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className={commonClasses}
        />
      )}
    </label>
  );
}
