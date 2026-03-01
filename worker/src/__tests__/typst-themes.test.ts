import { describe, it, expect } from 'vitest';
import { getTypstThemeVariables } from '../renderers/typst-themes.js';

describe('Typst Theme Variables', () => {
  it('should return classic-parchment variables', () => {
    const vars = getTypstThemeVariables('classic-parchment');

    expect(vars).toContain('#let theme-primary = rgb("#58180d")');
    expect(vars).toContain('#let theme-secondary = rgb("#c9ad6a")');
    expect(vars).toContain('#let theme-bg = rgb("#f4e4c1")');
    expect(vars).toContain('#let theme-text = rgb("#1a1a1a")');
    expect(vars).toContain('#let theme-stat-block-bg = rgb("#fdf1dc")');
    expect(vars).toContain('#let theme-stat-block-border = rgb("#e69a28")');
    expect(vars).toContain('#let theme-read-aloud-bg = rgb("#e8dcc8")');
    expect(vars).toContain('#let theme-read-aloud-border = rgb("#5c3a1e")');
    expect(vars).toContain('#let theme-sidebar-bg = rgb("#e8edf3")');
    expect(vars).toContain('#let theme-table-header-bg = rgb("#78350f")');
    expect(vars).toContain('#let theme-table-stripe-bg = rgb("#fef3c7")');
    expect(vars).toContain('#let theme-divider = rgb("#8b1a1a")');
    expect(vars).toContain('#let theme-spell-card-accent = rgb("#7c3aed")');
    expect(vars).toContain('#let theme-magic-item-accent = rgb("#16a34a")');
    expect(vars).toContain('#let theme-class-feature-accent = rgb("#991b1b")');
    expect(vars).toContain('#let heading-font = "Cinzel"');
    expect(vars).toContain('#let body-font = "Crimson Text"');
    expect(vars).toContain('#let theme-texture = "parchment-classic.jpg"');
  });

  it('should return dark-tome variables', () => {
    const vars = getTypstThemeVariables('dark-tome');

    expect(vars).toContain('#let theme-primary = rgb("#c9a84c")');
    expect(vars).toContain('#let theme-secondary = rgb("#7b68ae")');
    expect(vars).toContain('#let theme-bg = rgb("#1a1a2e")');
    expect(vars).toContain('#let theme-text = rgb("#e0d6c2")');
    expect(vars).toContain('#let heading-font = "Uncial Antiqua"');
    expect(vars).toContain('#let body-font = "EB Garamond"');
    expect(vars).toContain('#let theme-texture = "dark-leather.jpg"');
  });

  it('should return clean-modern variables with no texture', () => {
    const vars = getTypstThemeVariables('clean-modern');

    expect(vars).toContain('#let theme-primary = rgb("#2563eb")');
    expect(vars).toContain('#let theme-secondary = rgb("#64748b")');
    expect(vars).toContain('#let theme-bg = rgb("#ffffff")');
    expect(vars).toContain('#let theme-text = rgb("#1f2937")');
    expect(vars).toContain('#let heading-font = "Inter"');
    expect(vars).toContain('#let body-font = "Merriweather"');
    expect(vars).toContain('#let theme-texture = ""');
  });

  it('should return fey-wild variables', () => {
    const vars = getTypstThemeVariables('fey-wild');

    expect(vars).toContain('#let theme-primary = rgb("#166534")');
    expect(vars).toContain('#let theme-secondary = rgb("#ca8a04")');
    expect(vars).toContain('#let theme-bg = rgb("#f0f7ee")');
    expect(vars).toContain('#let heading-font = "Dancing Script"');
    expect(vars).toContain('#let body-font = "Lora"');
    expect(vars).toContain('#let theme-texture = "fey-vines.jpg"');
  });

  it('should return infernal variables', () => {
    const vars = getTypstThemeVariables('infernal');

    expect(vars).toContain('#let theme-primary = rgb("#dc2626")');
    expect(vars).toContain('#let theme-secondary = rgb("#ea580c")');
    expect(vars).toContain('#let theme-bg = rgb("#1c1517")');
    expect(vars).toContain('#let theme-text = rgb("#e8d5c4")');
    expect(vars).toContain('#let heading-font = "Pirata One"');
    expect(vars).toContain('#let body-font = "Bitter"');
    expect(vars).toContain('#let theme-texture = "infernal-flame.jpg"');
  });

  it('should return dmguild variables', () => {
    const vars = getTypstThemeVariables('dmguild');

    expect(vars).toContain('#let theme-primary = rgb("#58180D")');
    expect(vars).toContain('#let theme-secondary = rgb("#C9AD6A")');
    expect(vars).toContain('#let theme-bg = rgb("#EEE5CE")');
    expect(vars).toContain('#let theme-text = rgb("#1a1a1a")');
    expect(vars).toContain('#let theme-stat-block-bg = rgb("#FDF1DC")');
    expect(vars).toContain('#let theme-stat-block-border = rgb("#E69A28")');
    expect(vars).toContain('#let theme-read-aloud-bg = rgb("#FAF7EA")');
    expect(vars).toContain('#let theme-read-aloud-border = rgb("#58180D")');
    expect(vars).toContain('#let theme-sidebar-bg = rgb("#E0E5C1")');
    expect(vars).toContain('#let theme-table-header-bg = rgb("#58180D")');
    expect(vars).toContain('#let theme-table-stripe-bg = rgb("#FDF1DC")');
    expect(vars).toContain('#let theme-divider = rgb("#9C2B1B")');
    expect(vars).toContain('#let theme-spell-card-accent = rgb("#58180D")');
    expect(vars).toContain('#let theme-magic-item-accent = rgb("#58180D")');
    expect(vars).toContain('#let theme-class-feature-accent = rgb("#58180D")');
    expect(vars).toContain('#let heading-font = "Cinzel Decorative"');
    expect(vars).toContain('#let body-font = "Libre Baskerville"');
    expect(vars).toContain('#let theme-texture = "parchment-dmguild.jpg"');
  });

  it('should fall back to classic-parchment for unknown themes', () => {
    const vars = getTypstThemeVariables('nonexistent');

    expect(vars).toContain('#let theme-primary = rgb("#58180d")');
    expect(vars).toContain('#let heading-font = "Cinzel"');
    expect(vars).toContain('#let body-font = "Crimson Text"');
  });

  it('should output valid Typst #let declarations', () => {
    const vars = getTypstThemeVariables('classic-parchment');
    const lines = vars.split('\n');

    for (const line of lines) {
      expect(line).toMatch(/^#let [\w-]+ = /);
    }
  });

  it('should include only the first font name without fallback', () => {
    // classic-parchment CSS: 'Cinzel', serif → Typst: "Cinzel"
    const vars = getTypstThemeVariables('classic-parchment');
    expect(vars).toContain('#let heading-font = "Cinzel"');
    expect(vars).not.toContain('serif');

    // dmguild CSS: 'Cinzel Decorative', 'Cinzel', serif → Typst: "Cinzel Decorative"
    const dmVars = getTypstThemeVariables('dmguild');
    expect(dmVars).toContain('#let heading-font = "Cinzel Decorative"');
    expect(dmVars).not.toContain('serif');
  });
});
