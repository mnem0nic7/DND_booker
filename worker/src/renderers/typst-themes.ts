/**
 * Typst theme variable definitions for all 6 supported themes.
 *
 * Returns `#let` variable declarations that match the CSS custom properties
 * from the HTML assembler (html-assembler.ts → getThemeVariables()).
 *
 * Theme names must match client ThemeName type:
 * 'classic-parchment' | 'dark-tome' | 'clean-modern' | 'fey-wild' | 'infernal' | 'dmguild'
 */

interface ThemeDefinition {
  primary: string;
  secondary: string;
  bg: string;
  text: string;
  statBlockBg: string;
  statBlockBorder: string;
  readAloudBg: string;
  readAloudBorder: string;
  sidebarBg: string;
  tableHeaderBg: string;
  tableStripeBg: string;
  divider: string;
  spellCardAccent: string;
  magicItemAccent: string;
  classFeatureAccent: string;
  headingFont: string;
  bodyFont: string;
  texture: string;
}

const themes: Record<string, ThemeDefinition> = {
  'classic-parchment': {
    primary: '#58180d',
    secondary: '#c9ad6a',
    bg: '#f4e4c1',
    text: '#1a1a1a',
    statBlockBg: '#fdf1dc',
    statBlockBorder: '#e69a28',
    readAloudBg: '#e8dcc8',
    readAloudBorder: '#5c3a1e',
    sidebarBg: '#e8edf3',
    tableHeaderBg: '#78350f',
    tableStripeBg: '#fef3c7',
    divider: '#8b1a1a',
    spellCardAccent: '#7c3aed',
    magicItemAccent: '#16a34a',
    classFeatureAccent: '#991b1b',
    headingFont: 'Cinzel',
    bodyFont: 'Crimson Text',
    texture: 'parchment-classic.jpg',
  },
  'dark-tome': {
    primary: '#c9a84c',
    secondary: '#7b68ae',
    bg: '#1a1a2e',
    text: '#e0d6c2',
    statBlockBg: '#252545',
    statBlockBorder: '#c9a84c',
    readAloudBg: '#2a2a3e',
    readAloudBorder: '#c9a84c',
    sidebarBg: '#252540',
    tableHeaderBg: '#3d2e6b',
    tableStripeBg: '#22223a',
    divider: '#7b68ae',
    spellCardAccent: '#7b68ae',
    magicItemAccent: '#c9a84c',
    classFeatureAccent: '#c9a84c',
    headingFont: 'Uncial Antiqua',
    bodyFont: 'EB Garamond',
    texture: 'parchment-dark.jpg',
  },
  'clean-modern': {
    primary: '#2563eb',
    secondary: '#64748b',
    bg: '#ffffff',
    text: '#1f2937',
    statBlockBg: '#f1f5f9',
    statBlockBorder: '#2563eb',
    readAloudBg: '#f8fafc',
    readAloudBorder: '#2563eb',
    sidebarBg: '#f1f5f9',
    tableHeaderBg: '#1e40af',
    tableStripeBg: '#f1f5f9',
    divider: '#2563eb',
    spellCardAccent: '#7c3aed',
    magicItemAccent: '#16a34a',
    classFeatureAccent: '#dc2626',
    headingFont: 'Inter',
    bodyFont: 'Merriweather',
    texture: '',
  },
  'fey-wild': {
    primary: '#166534',
    secondary: '#ca8a04',
    bg: '#f0f7ee',
    text: '#1a2e1a',
    statBlockBg: '#e8f5e2',
    statBlockBorder: '#22c55e',
    readAloudBg: '#ecfdf5',
    readAloudBorder: '#166534',
    sidebarBg: '#fefce8',
    tableHeaderBg: '#166534',
    tableStripeBg: '#f0fdf4',
    divider: '#22c55e',
    spellCardAccent: '#7c3aed',
    magicItemAccent: '#22c55e',
    classFeatureAccent: '#ca8a04',
    headingFont: 'Dancing Script',
    bodyFont: 'Lora',
    texture: 'parchment-fey.jpg',
  },
  'infernal': {
    primary: '#dc2626',
    secondary: '#ea580c',
    bg: '#1c1517',
    text: '#e8d5c4',
    statBlockBg: '#2a1f1f',
    statBlockBorder: '#dc2626',
    readAloudBg: '#2e1c1c',
    readAloudBorder: '#dc2626',
    sidebarBg: '#2a1a1a',
    tableHeaderBg: '#7f1d1d',
    tableStripeBg: '#231515',
    divider: '#ea580c',
    spellCardAccent: '#ea580c',
    magicItemAccent: '#ea580c',
    classFeatureAccent: '#dc2626',
    headingFont: 'Pirata One',
    bodyFont: 'Bitter',
    texture: 'parchment-infernal.jpg',
  },
  'dmguild': {
    primary: '#58180D',
    secondary: '#C9AD6A',
    bg: '#EEE5CE',
    text: '#1a1a1a',
    statBlockBg: '#FDF1DC',
    statBlockBorder: '#E69A28',
    readAloudBg: '#FAF7EA',
    readAloudBorder: '#58180D',
    sidebarBg: '#E0E5C1',
    tableHeaderBg: '#58180D',
    tableStripeBg: '#FDF1DC',
    divider: '#9C2B1B',
    spellCardAccent: '#58180D',
    magicItemAccent: '#58180D',
    classFeatureAccent: '#58180D',
    headingFont: 'Cinzel Decorative',
    bodyFont: 'Libre Baskerville',
    texture: 'parchment-dmguild.jpg',
  },
};

/**
 * Returns Typst `#let` variable declarations for the given theme.
 * Falls back to classic-parchment for unknown themes.
 */
export function getTypstThemeVariables(theme: string): string {
  const t = themes[theme] || themes['classic-parchment'];

  return `#let theme-primary = rgb("${t.primary}")
#let theme-secondary = rgb("${t.secondary}")
#let theme-bg = rgb("${t.bg}")
#let theme-text = rgb("${t.text}")
#let theme-stat-block-bg = rgb("${t.statBlockBg}")
#let theme-stat-block-border = rgb("${t.statBlockBorder}")
#let theme-read-aloud-bg = rgb("${t.readAloudBg}")
#let theme-read-aloud-border = rgb("${t.readAloudBorder}")
#let theme-sidebar-bg = rgb("${t.sidebarBg}")
#let theme-table-header-bg = rgb("${t.tableHeaderBg}")
#let theme-table-stripe-bg = rgb("${t.tableStripeBg}")
#let theme-divider = rgb("${t.divider}")
#let theme-spell-card-accent = rgb("${t.spellCardAccent}")
#let theme-magic-item-accent = rgb("${t.magicItemAccent}")
#let theme-class-feature-accent = rgb("${t.classFeatureAccent}")
#let heading-font = "${t.headingFont}"
#let body-font = "${t.bodyFont}"
#let theme-texture = "${t.texture}"`;
}
