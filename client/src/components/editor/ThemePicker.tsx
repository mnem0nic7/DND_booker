import { useThemeStore, type ThemeName } from '../../stores/themeStore';

interface ThemeOption {
  id: ThemeName;
  label: string;
  description: string;
  colors: {
    bg: string;
    text: string;
    accent: string;
    secondary: string;
  };
}

const themes: ThemeOption[] = [
  {
    id: 'classic-parchment',
    label: 'Classic Parchment',
    description: 'Traditional D&D look',
    colors: { bg: '#f4e4c1', text: '#1a1a1a', accent: '#58180d', secondary: '#c9ad6a' },
  },
  {
    id: 'dark-tome',
    label: 'Dark Tome',
    description: 'Dark mode spellbook',
    colors: { bg: '#1a1a2e', text: '#e0d6c2', accent: '#c9a84c', secondary: '#7b68ae' },
  },
  {
    id: 'clean-modern',
    label: 'Clean Modern',
    description: 'Modern RPG layout',
    colors: { bg: '#ffffff', text: '#1f2937', accent: '#2563eb', secondary: '#64748b' },
  },
  {
    id: 'fey-wild',
    label: 'Fey Wild',
    description: 'Fairy & nature theme',
    colors: { bg: '#f0f7ee', text: '#1a2e1a', accent: '#166534', secondary: '#ca8a04' },
  },
  {
    id: 'infernal',
    label: 'Infernal',
    description: 'Demon & hellfire theme',
    colors: { bg: '#1c1517', text: '#e8d5c4', accent: '#dc2626', secondary: '#ea580c' },
  },
  {
    id: 'dmguild',
    label: 'DMGuild',
    description: "Player's Handbook style",
    colors: { bg: '#EEE5CE', text: '#1a1a1a', accent: '#58180D', secondary: '#C9AD6A' },
  },
];

export function ThemePicker() {
  const { currentTheme, setTheme } = useThemeStore();

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Theme
      </h3>
      <div className="flex flex-col gap-2">
        {themes.map((theme) => {
          const isActive = currentTheme === theme.id;
          return (
            <button
              key={theme.id}
              onClick={() => setTheme(theme.id)}
              className={`w-full text-left rounded-lg border-2 p-2 transition-all ${
                isActive
                  ? 'border-purple-500 ring-1 ring-purple-500'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {/* Color swatch row */}
              <div className="flex gap-1 mb-1.5">
                <div
                  className="w-6 h-6 rounded border border-gray-300"
                  style={{ backgroundColor: theme.colors.bg }}
                  title="Page background"
                />
                <div
                  className="w-6 h-6 rounded border border-gray-300"
                  style={{ backgroundColor: theme.colors.text }}
                  title="Text color"
                />
                <div
                  className="w-6 h-6 rounded border border-gray-300"
                  style={{ backgroundColor: theme.colors.accent }}
                  title="Accent color"
                />
                <div
                  className="w-6 h-6 rounded border border-gray-300"
                  style={{ backgroundColor: theme.colors.secondary }}
                  title="Secondary accent"
                />
              </div>
              {/* Label and description */}
              <div className="text-xs font-semibold text-gray-800">{theme.label}</div>
              <div className="text-[10px] text-gray-500">{theme.description}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
