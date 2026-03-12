import { describe, it, expect } from 'vitest';
import { getTypstThemeVariables } from '../renderers/typst-themes.js';

describe('Typst Theme Variables', () => {
  it('should return classic-parchment variables', () => {
    const vars = getTypstThemeVariables('classic-parchment');

    expect(vars).toContain('#let theme-primary = rgb("#58180d")');
    expect(vars).toContain('#let theme-secondary = rgb("#c9ad6a")');
    expect(vars).toContain('#let theme-bg = rgb("#EEE5CE")');
    expect(vars).toContain('#let theme-text = rgb("#1a1a1a")');
    expect(vars).toContain('#let theme-stat-block-bg = rgb("#F2E5B5")');
    expect(vars).toContain('#let theme-stat-block-border = rgb("#E69A28")');
    expect(vars).toContain('#let theme-read-aloud-bg = rgb("#FAF7EA")');
    expect(vars).toContain('#let theme-read-aloud-border = rgb("#58180D")');
    expect(vars).toContain('#let theme-sidebar-bg = rgb("#E0E5C1")');
    expect(vars).toContain('#let theme-table-header-bg = rgb("#58180D")');
    expect(vars).toContain('#let theme-table-stripe-bg = rgb("#E0E5C1")');
    expect(vars).toContain('#let theme-divider = rgb("#9C2B1B")');
    expect(vars).toContain('#let theme-spell-card-accent = rgb("#58180D")');
    expect(vars).toContain('#let theme-magic-item-accent = rgb("#58180D")');
    expect(vars).toContain('#let theme-class-feature-accent = rgb("#58180D")');
    expect(vars).toContain('#let heading-font = "Mr Eaves Small Caps"');
    expect(vars).toContain('#let body-font = "Bookinsanity"');
    expect(vars).toContain('#let title-font = "Nodesto Caps Condensed"');
    expect(vars).toContain('#let stat-font = "Scaly Sans"');
    expect(vars).toContain('#let theme-header-underline = rgb("#C0AD6A")');
    expect(vars).toContain('#let theme-texture = "parchment-classic.jpg"');
  });

  it('should return gilded-folio variables', () => {
    const vars = getTypstThemeVariables('gilded-folio');

    expect(vars).toContain('#let theme-primary = rgb("#58180D")');
    expect(vars).toContain('#let theme-secondary = rgb("#C9AD6A")');
    expect(vars).toContain('#let theme-bg = rgb("#EEE5CE")');
    expect(vars).toContain('#let theme-text = rgb("#1a1a1a")');
    expect(vars).toContain('#let heading-font = "Mr Eaves Small Caps"');
    expect(vars).toContain('#let body-font = "Bookinsanity"');
    expect(vars).toContain('#let title-font = "Nodesto Caps Condensed"');
    expect(vars).toContain('#let stat-font = "Scaly Sans"');
    expect(vars).toContain('#let theme-texture = "parchment-dmguild.jpg"');
  });

  it('should return dark-tome variables', () => {
    const vars = getTypstThemeVariables('dark-tome');

    expect(vars).toContain('#let theme-primary = rgb("#c9a84c")');
    expect(vars).toContain('#let theme-secondary = rgb("#7b68ae")');
    expect(vars).toContain('#let theme-bg = rgb("#1a1a2e")');
    expect(vars).toContain('#let theme-text = rgb("#e0d6c2")');
    expect(vars).toContain('#let heading-font = "Uncial Antiqua"');
    expect(vars).toContain('#let body-font = "EB Garamond"');
    expect(vars).toContain('#let theme-texture = "parchment-dark.jpg"');
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
    expect(vars).toContain('#let theme-texture = "parchment-fey.jpg"');
  });

  it('should return infernal variables', () => {
    const vars = getTypstThemeVariables('infernal');

    expect(vars).toContain('#let theme-primary = rgb("#dc2626")');
    expect(vars).toContain('#let theme-secondary = rgb("#ea580c")');
    expect(vars).toContain('#let theme-bg = rgb("#1c1517")');
    expect(vars).toContain('#let theme-text = rgb("#e8d5c4")');
    expect(vars).toContain('#let heading-font = "Pirata One"');
    expect(vars).toContain('#let body-font = "Bitter"');
    expect(vars).toContain('#let theme-texture = "parchment-infernal.jpg"');
  });

  it('should return dmguild variables', () => {
    const vars = getTypstThemeVariables('dmguild');

    expect(vars).toContain('#let theme-primary = rgb("#58180D")');
    expect(vars).toContain('#let theme-secondary = rgb("#C9AD6A")');
    expect(vars).toContain('#let theme-bg = rgb("#EEE5CE")');
    expect(vars).toContain('#let theme-text = rgb("#1a1a1a")');
    expect(vars).toContain('#let theme-stat-block-bg = rgb("#F2E5B5")');
    expect(vars).toContain('#let theme-stat-block-border = rgb("#E69A28")');
    expect(vars).toContain('#let theme-read-aloud-bg = rgb("#FAF7EA")');
    expect(vars).toContain('#let theme-read-aloud-border = rgb("#58180D")');
    expect(vars).toContain('#let theme-sidebar-bg = rgb("#E0E5C1")');
    expect(vars).toContain('#let theme-table-header-bg = rgb("#58180D")');
    expect(vars).toContain('#let theme-table-stripe-bg = rgb("#E0E5C1")');
    expect(vars).toContain('#let theme-divider = rgb("#9C2B1B")');
    expect(vars).toContain('#let theme-spell-card-accent = rgb("#58180D")');
    expect(vars).toContain('#let theme-magic-item-accent = rgb("#58180D")');
    expect(vars).toContain('#let theme-class-feature-accent = rgb("#58180D")');
    expect(vars).toContain('#let heading-font = "Mr Eaves Small Caps"');
    expect(vars).toContain('#let body-font = "Bookinsanity"');
    expect(vars).toContain('#let title-font = "Nodesto Caps Condensed"');
    expect(vars).toContain('#let stat-font = "Scaly Sans"');
    expect(vars).toContain('#let theme-header-underline = rgb("#C0AD6A")');
    expect(vars).toContain('#let theme-texture = "parchment-dmguild.jpg"');
  });

  it('should fall back to classic-parchment for unknown themes', () => {
    const vars = getTypstThemeVariables('nonexistent');

    expect(vars).toContain('#let theme-primary = rgb("#58180d")');
    expect(vars).toContain('#let heading-font = "Mr Eaves Small Caps"');
    expect(vars).toContain('#let body-font = "Bookinsanity"');
  });

  it('should output valid Typst #let declarations', () => {
    const vars = getTypstThemeVariables('classic-parchment');
    const lines = vars.split('\n');

    for (const line of lines) {
      expect(line).toMatch(/^#let [\w-]+ = /);
    }
  });

  it('should include only the font name without fallback', () => {
    // classic-parchment uses Solbera fonts directly (no CSS fallbacks in Typst)
    const vars = getTypstThemeVariables('classic-parchment');
    expect(vars).toContain('#let heading-font = "Mr Eaves Small Caps"');
    expect(vars).not.toContain('serif');

    // gilded-folio uses same Solbera fonts
    const gildedVars = getTypstThemeVariables('gilded-folio');
    expect(gildedVars).toContain('#let heading-font = "Mr Eaves Small Caps"');
    expect(gildedVars).not.toContain('serif');

    // dmguild compatibility alias uses same Solbera fonts
    const dmVars = getTypstThemeVariables('dmguild');
    expect(dmVars).toContain('#let heading-font = "Mr Eaves Small Caps"');
    expect(dmVars).not.toContain('serif');
  });
});
