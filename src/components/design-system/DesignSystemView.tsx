import React, { useState } from 'react';
import {
  m3Typography,
  m3Shapes,
  m3Elevation,
  m3IconRegistry,
  m3IconCategories,
  M3IconName,
  M3Button,
  M3FAB,
  M3IconButton,
  M3TextField,
  M3Select,
  M3Card,
  M3TopAppBar,
  M3NavigationBar,
  M3DrawerItem,
  M3Chip,
  M3Dialog,
  M3Badge,
  M3Switch,
  M3Tabs,
  M3Snackbar,
  M3Icon,
  useM3Theme,
  m3Palettes,
  M3ThemeMode,
  M3ContrastLevel,
  M3ColorScheme,
} from '../../design-system';
import {
  Palette,
  Type,
  Layers,
  Box,
  Shapes,
  Sparkles,
  Search,
  Copy,
  Check,
  Plus,
  Trash2,
  Edit2,
  Info,
  Sliders,
  Send,
  Calendar,
  Sun,
  Moon,
  Contrast,
  ShieldCheck,
  Eye,
  SlidersHorizontal,
} from 'lucide-react';

export function DesignSystemView() {
  const { mode, setMode, contrast, setContrast, toggleMode, colors } = useM3Theme();

  const [activeSection, setActiveSection] = useState<
    'tokens' | 'contrast-matrix' | 'typography' | 'shapes' | 'elevation' | 'components' | 'icons'
  >('tokens');

  // Copy helper
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  // Component Demo States
  const [inputVal, setInputVal] = useState('VG-30 Bulk Bitumen');
  const [selectVal, setSelectVal] = useState('hotmix');
  const [switchChecked, setSwitchChecked] = useState(true);
  const [demoActiveTab, setDemoActiveTab] = useState('tab1');
  const [filterChipSelected, setFilterChipSelected] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSnackbarOpen, setIsSnackbarOpen] = useState(false);
  const [demoNavActive, setDemoNavActive] = useState('dashboard');

  // Icon Search & Filter
  const [iconSearch, setIconSearch] = useState('');
  const [selectedIconCategory, setSelectedIconCategory] = useState<string>('all');
  const [iconPreviewSize, setIconPreviewSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('md');

  // Contrast Matrix inspection tab
  const [matrixMode, setMatrixMode] = useState<M3ThemeMode>('light');

  const mainSections = [
    { id: 'tokens', label: 'Active Theme & Roles', icon: Palette },
    { id: 'contrast-matrix', label: 'Contrast Comparison Matrix', icon: Contrast },
    { id: 'typography', label: 'Typography Scale', icon: Type },
    { id: 'shapes', label: 'Shapes & Radii', icon: Shapes },
    { id: 'elevation', label: 'Elevation & Shadows', icon: Layers },
    { id: 'components', label: 'Component Library', icon: Box },
    { id: 'icons', label: 'Icon System', icon: Sparkles },
  ];

  // Filtered icons
  const filteredIcons = Object.keys(m3IconRegistry).filter((iconKey) => {
    const matchesSearch = iconKey.toLowerCase().includes(iconSearch.toLowerCase());
    if (selectedIconCategory === 'all') return matchesSearch;
    const cat = m3IconCategories[selectedIconCategory];
    return matchesSearch && cat && cat.icons.includes(iconKey as M3IconName);
  }) as M3IconName[];

  const renderSwatch = (
    label: string,
    token: keyof M3ColorScheme,
    hex: string,
    textColor: string,
    borderColor?: string
  ) => {
    return (
      <div
        key={token}
        onClick={() => handleCopy(hex, token)}
        className="p-3.5 rounded-2xl cursor-pointer transition-all hover:scale-[1.02] active:scale-98 relative group flex flex-col justify-between shadow-2xs"
        style={{
          backgroundColor: hex,
          color: textColor,
          border: borderColor ? `1px solid ${borderColor}` : undefined,
        }}
      >
        <div className="flex justify-between items-start gap-1">
          <span className="text-xs font-bold leading-tight">{label}</span>
          {copiedKey === token ? (
            <Check className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          )}
        </div>
        <div className="mt-4 flex items-center justify-between font-mono text-[11px] opacity-90">
          <span>{hex}</span>
          <span className="text-[10px] opacity-75 font-sans">m3.{token}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 pb-16 transition-colors duration-200 text-[var(--color-on-surface)]">
      {/* Design System Hero Header */}
      <div className="bg-gradient-to-r from-[var(--color-primary)] to-[#002e69] text-[var(--color-on-primary)] rounded-3xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-white text-xs font-semibold uppercase tracking-wider mb-3">
            <Sparkles className="w-3.5 h-3.5" /> Material Design 3 Architecture
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Design System & Component Library
          </h1>
          <p className="text-sm sm:text-base opacity-90 mt-2 leading-relaxed">
            Centralized design token architecture featuring dynamic Light and Dark modes, 3 contrast tiers (Standard, Medium, High AAA), surface containers, shapes, typography, shadows, and production-ready components.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/20 rounded-full text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Active Mode: <strong className="capitalize">{mode}</strong>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/20 rounded-full text-xs font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-sky-300" />
              Contrast: <strong className="capitalize">{contrast}</strong>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/20 rounded-full text-xs font-medium">
              <Layers className="w-3.5 h-3.5 text-amber-300" />
              Tiers: <strong>5 Surface Containers</strong>
            </div>
          </div>
        </div>

        {/* Decorative background shape */}
        <div className="absolute -bottom-16 -right-16 w-80 h-80 rounded-full bg-white/10 blur-2xl pointer-events-none" />
      </div>

      {/* Global Interactive Theme & Contrast Switcher Bar */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[var(--color-primary)]" />
            <h2 className="text-sm font-bold text-[var(--color-on-surface)]">
              Interactive M3 Theme & Contrast Controller
            </h2>
          </div>
          <p className="text-xs text-[var(--color-on-surface-variant)] mt-0.5">
            Switch between Light/Dark modes and Standard, Medium, or High (WCAG AAA) contrast in real time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Light / Dark Mode Toggle */}
          <div className="flex items-center bg-[var(--color-surface-container-high)] p-1 rounded-full border border-[var(--color-outline-variant)]">
            <button
              onClick={() => setMode('light')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                mode === 'light'
                  ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-xs'
                  : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
              }`}
            >
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span>Light</span>
            </button>
            <button
              onClick={() => setMode('dark')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                mode === 'dark'
                  ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-xs'
                  : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
              }`}
            >
              <Moon className="w-3.5 h-3.5 text-indigo-400" />
              <span>Dark</span>
            </button>
          </div>

          {/* Contrast Selector */}
          <div className="flex items-center bg-[var(--color-surface-container-high)] p-1 rounded-full border border-[var(--color-outline-variant)]">
            {(['standard', 'medium', 'high'] as M3ContrastLevel[]).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setContrast(lvl)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-all ${
                  contrast === lvl
                    ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-xs'
                    : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
                }`}
              >
                {lvl === 'high' ? 'High (AAA)' : lvl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Section Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-[var(--color-outline-variant)]">
        {mainSections.map((sec) => {
          const Icon = sec.icon;
          const isActive = activeSection === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-xs'
                  : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)] hover:text-[var(--color-on-surface)]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{sec.label}</span>
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: ACTIVE THEME & ROLES */}
      {/* ========================================================================= */}
      {activeSection === 'tokens' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-on-surface)]">
              Active Theme Roles & Tonal Tokens
            </h2>
            <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">
              Currently rendering <strong>{mode.toUpperCase()}</strong> mode with{' '}
              <strong>{contrast.toUpperCase()}</strong> contrast. Click any card to copy its hex value or token identifier.
            </p>
          </div>

          {/* Surface Hierarchy (Explicitly requested) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-on-surface-variant)]">
                1. Surface, Containers & Surface Dim / Bright (Elevation Tiers)
              </h3>
              <span className="text-[11px] text-[var(--color-on-surface-variant)]">
                5 Elevation Containers + Dim/Bright
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {renderSwatch('Surface', 'surface', colors.surface, colors.onSurface, colors.outlineVariant)}
              {renderSwatch('Surface Dim', 'surfaceDim', colors.surfaceDim, colors.onSurface, colors.outlineVariant)}
              {renderSwatch('Surface Bright', 'surfaceBright', colors.surfaceBright, colors.onSurface, colors.outlineVariant)}
              {renderSwatch('Lowest (Tier 0)', 'surfaceContainerLowest', colors.surfaceContainerLowest, colors.onSurface, colors.outlineVariant)}
              {renderSwatch('Low (Tier 1)', 'surfaceContainerLow', colors.surfaceContainerLow, colors.onSurface, colors.outlineVariant)}
              {renderSwatch('Container (Tier 2)', 'surfaceContainer', colors.surfaceContainer, colors.onSurface, colors.outlineVariant)}
              {renderSwatch('High (Tier 3)', 'surfaceContainerHigh', colors.surfaceContainerHigh, colors.onSurface, colors.outlineVariant)}
              {renderSwatch('Highest (Tier 4)', 'surfaceContainerHighest', colors.surfaceContainerHighest, colors.onSurface, colors.outlineVariant)}
            </div>
          </div>

          {/* Surface Variants, Outlines, Shadows & Scrim */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-on-surface-variant)]">
              2. Surface Variants, Outlines, Shadows & Scrim
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {renderSwatch('Surface Variant', 'surfaceVariant', colors.surfaceVariant, colors.onSurfaceVariant, colors.outlineVariant)}
              {renderSwatch('On Surface Variant', 'onSurfaceVariant', colors.onSurfaceVariant, colors.surface, colors.outlineVariant)}
              {renderSwatch('Outline', 'outline', colors.outline, '#ffffff')}
              {renderSwatch('Outline Variant', 'outlineVariant', colors.outlineVariant, colors.onSurface, colors.outline)}
              {renderSwatch('Shadow', 'shadow', colors.shadow, '#ffffff')}
              {renderSwatch('Scrim', 'scrim', colors.scrim, '#ffffff')}
            </div>
          </div>

          {/* Inverse Roles */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-on-surface-variant)]">
              3. Inverse Roles (Tooltips, Snackbars & Elevated Contrast)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {renderSwatch('Inverse Surface', 'inverseSurface', colors.inverseSurface, colors.inverseOnSurface)}
              {renderSwatch('Inverse On Surface', 'inverseOnSurface', colors.inverseOnSurface, colors.inverseSurface, colors.outlineVariant)}
              {renderSwatch('Inverse Primary', 'inversePrimary', colors.inversePrimary, '#001a41')}
            </div>
          </div>

          {/* Brand & Tonal System Roles */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-on-surface-variant)]">
              4. Primary, Secondary & Tertiary Brand Palettes
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {renderSwatch('Primary', 'primary', colors.primary, colors.onPrimary)}
              {renderSwatch('On Primary', 'onPrimary', colors.onPrimary, colors.primary, colors.outlineVariant)}
              {renderSwatch('Primary Container', 'primaryContainer', colors.primaryContainer, colors.onPrimaryContainer)}
              {renderSwatch('On Primary Container', 'onPrimaryContainer', colors.onPrimaryContainer, colors.primaryContainer)}

              {renderSwatch('Secondary', 'secondary', colors.secondary, colors.onSecondary)}
              {renderSwatch('On Secondary', 'onSecondary', colors.onSecondary, colors.secondary, colors.outlineVariant)}
              {renderSwatch('Secondary Container', 'secondaryContainer', colors.secondaryContainer, colors.onSecondaryContainer)}
              {renderSwatch('On Secondary Container', 'onSecondaryContainer', colors.onSecondaryContainer, colors.secondaryContainer)}

              {renderSwatch('Tertiary', 'tertiary', colors.tertiary, colors.onTertiary)}
              {renderSwatch('On Tertiary', 'onTertiary', colors.onTertiary, colors.tertiary, colors.outlineVariant)}
              {renderSwatch('Tertiary Container', 'tertiaryContainer', colors.tertiaryContainer, colors.onTertiaryContainer)}
              {renderSwatch('On Tertiary Container', 'onTertiaryContainer', colors.onTertiaryContainer, colors.tertiaryContainer)}

              {renderSwatch('Error', 'error', colors.error, colors.onError)}
              {renderSwatch('On Error', 'onError', colors.onError, colors.error, colors.outlineVariant)}
              {renderSwatch('Error Container', 'errorContainer', colors.errorContainer, colors.onErrorContainer)}
              {renderSwatch('On Error Container', 'onErrorContainer', colors.onErrorContainer, colors.errorContainer)}
            </div>
          </div>

          {/* Semantic Status Roles */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-on-surface-variant)]">
              5. Semantic Status Roles (Success, Warning, Info)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {renderSwatch('Success', 'success', colors.success, colors.onSuccess)}
              {renderSwatch('Success Cont.', 'successContainer', colors.successContainer, colors.onSuccessContainer)}
              {renderSwatch('Warning', 'warning', colors.warning, colors.onWarning)}
              {renderSwatch('Warning Cont.', 'warningContainer', colors.warningContainer, colors.onWarningContainer)}
              {renderSwatch('Info', 'info', colors.info, colors.onInfo)}
              {renderSwatch('Info Cont.', 'infoContainer', colors.infoContainer, colors.onInfoContainer)}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: CONTRAST COMPARISON MATRIX */}
      {/* ========================================================================= */}
      {activeSection === 'contrast-matrix' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-on-surface)]">
              Material Design 3 Contrast Comparison Matrix
            </h2>
            <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">
              Side-by-side comparison of <strong>Standard</strong>, <strong>Medium</strong>, and{' '}
              <strong>High (WCAG AAA)</strong> contrast palettes across light and dark modes.
            </p>
          </div>

          {/* Mode Switch for Matrix */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMatrixMode('light')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
                matrixMode === 'light'
                  ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-xs'
                  : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)]'
              }`}
            >
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span>Light Mode (3 Contrast Levels)</span>
            </button>
            <button
              onClick={() => setMatrixMode('dark')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
                matrixMode === 'dark'
                  ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-xs'
                  : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)]'
              }`}
            >
              <Moon className="w-3.5 h-3.5 text-indigo-400" />
              <span>Dark Mode (3 Contrast Levels)</span>
            </button>
          </div>

          {/* Comparison Table / Grid */}
          <div className="rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] overflow-hidden shadow-2xs">
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[var(--color-outline-variant)]">
              {(['standard', 'medium', 'high'] as M3ContrastLevel[]).map((cLevel) => {
                const paletteKey = `${matrixMode}_${cLevel}` as const;
                const pal = m3Palettes[paletteKey];
                const isCurrentActive = mode === matrixMode && contrast === cLevel;

                return (
                  <div key={cLevel} className="p-5 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-[var(--color-outline-variant)]">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold capitalize text-[var(--color-on-surface)]">
                            {cLevel} Contrast
                          </h3>
                          {cLevel === 'high' && (
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-full">
                              AAA
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                          {cLevel === 'standard'
                            ? 'Default M3 balanced ratio'
                            : cLevel === 'medium'
                            ? 'Higher separation for outdoor/bright use'
                            : 'Maximum contrast adhering to 7:1+'}
                        </p>
                      </div>

                      {isCurrentActive ? (
                        <span className="text-[10px] bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold px-2 py-1 rounded-full">
                          Active
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            setMode(matrixMode);
                            setContrast(cLevel);
                          }}
                          className="text-[11px] font-semibold text-[var(--color-primary)] hover:underline"
                        >
                          Apply
                        </button>
                      )}
                    </div>

                    {/* Palette Swatches */}
                    <div className="space-y-2 text-xs">
                      {/* Primary */}
                      <div
                        className="p-2.5 rounded-xl flex items-center justify-between font-mono font-medium shadow-2xs"
                        style={{ backgroundColor: pal.primary, color: pal.onPrimary }}
                      >
                        <span className="font-sans font-bold">Primary</span>
                        <span>{pal.primary}</span>
                      </div>

                      {/* Primary Container */}
                      <div
                        className="p-2.5 rounded-xl flex items-center justify-between font-mono font-medium border border-[var(--color-outline-variant)]"
                        style={{ backgroundColor: pal.primaryContainer, color: pal.onPrimaryContainer }}
                      >
                        <span className="font-sans font-bold">Primary Container</span>
                        <span>{pal.primaryContainer}</span>
                      </div>

                      {/* Surface */}
                      <div
                        className="p-2.5 rounded-xl flex items-center justify-between font-mono font-medium border border-[var(--color-outline-variant)]"
                        style={{ backgroundColor: pal.surface, color: pal.onSurface }}
                      >
                        <span className="font-sans font-bold">Surface</span>
                        <span>{pal.surface}</span>
                      </div>

                      {/* Surface Container */}
                      <div
                        className="p-2.5 rounded-xl flex items-center justify-between font-mono font-medium border border-[var(--color-outline-variant)]"
                        style={{ backgroundColor: pal.surfaceContainer, color: pal.onSurface }}
                      >
                        <span className="font-sans font-bold">Surface Container</span>
                        <span>{pal.surfaceContainer}</span>
                      </div>

                      {/* Outline */}
                      <div
                        className="p-2.5 rounded-xl flex items-center justify-between font-mono font-medium"
                        style={{ backgroundColor: pal.outline, color: '#ffffff' }}
                      >
                        <span className="font-sans font-bold">Outline</span>
                        <span>{pal.outline}</span>
                      </div>

                      {/* Inverse Surface */}
                      <div
                        className="p-2.5 rounded-xl flex items-center justify-between font-mono font-medium"
                        style={{ backgroundColor: pal.inverseSurface, color: pal.inverseOnSurface }}
                      >
                        <span className="font-sans font-bold">Inverse Surface</span>
                        <span>{pal.inverseSurface}</span>
                      </div>

                      {/* Error */}
                      <div
                        className="p-2.5 rounded-xl flex items-center justify-between font-mono font-medium"
                        style={{ backgroundColor: pal.error, color: pal.onError }}
                      >
                        <span className="font-sans font-bold">Error</span>
                        <span>{pal.error}</span>
                      </div>

                      {/* Success */}
                      <div
                        className="p-2.5 rounded-xl flex items-center justify-between font-mono font-medium"
                        style={{ backgroundColor: pal.success, color: pal.onSuccess }}
                      >
                        <span className="font-sans font-bold">Success</span>
                        <span>{pal.success}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: TYPOGRAPHY SCALE */}
      {/* ========================================================================= */}
      {activeSection === 'typography' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-on-surface)]">Typography Scale</h2>
            <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">
              Material 3 typographic tokens: Display, Headline, Title, Body, and Label.
            </p>
          </div>

          <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] divide-y divide-[var(--color-outline-variant)] overflow-hidden shadow-2xs">
            {Object.entries(m3Typography).map(([key, typo]) => (
              <div
                key={key}
                className="p-4 sm:p-6 hover:bg-[var(--color-surface-container)] transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--color-primary)] uppercase tracking-wider font-mono">
                      {key}
                    </span>
                    <span className="text-xs text-[var(--color-on-surface-variant)] font-medium">
                      ({typo.name})
                    </span>
                  </div>
                  <div className={`${typo.className} text-[var(--color-on-surface)]`}>
                    Hot-Mix Asphalt Plant Operations
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 text-xs font-mono text-[var(--color-on-surface-variant)] bg-[var(--color-surface-container)] px-3 py-2 rounded-xl border border-[var(--color-outline-variant)]">
                  <span>Size: <strong>{typo.fontSize}</strong></span>
                  <span>/</span>
                  <span>Line: <strong>{typo.lineHeight}</strong></span>
                  <span>/</span>
                  <span>Weight: <strong>{typo.fontWeight}</strong></span>
                  <button
                    type="button"
                    onClick={() => handleCopy(typo.className, key)}
                    className="ml-2 p-1 text-[var(--color-on-surface-variant)] hover:text-[var(--color-primary)] transition-colors"
                    title="Copy Tailwind class"
                  >
                    {copiedKey === key ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 4: SHAPES & CORNER RADII */}
      {/* ========================================================================= */}
      {activeSection === 'shapes' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-on-surface)]">Shapes & Corner Radii Scale</h2>
            <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">
              Material 3 geometric radii scale mapping from 0px (none) to 9999px (full pill).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(m3Shapes).map(([key, shape]) => (
              <div
                key={key}
                className="p-5 rounded-2xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] flex flex-col justify-between space-y-4 shadow-2xs"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--color-primary)] uppercase font-mono">
                      {key}
                    </span>
                    <span className="text-xs font-bold text-[var(--color-on-surface)]">
                      {shape.radius}
                    </span>
                  </div>
                  <h4 className="text-base font-bold text-[var(--color-on-surface)] mt-1">
                    {shape.name}
                  </h4>
                  <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">
                    {shape.description}
                  </p>
                </div>

                {/* Visual shape block */}
                <div className="h-20 bg-[var(--color-primary-container)] border border-[var(--color-primary)]/30 flex items-center justify-center font-mono text-xs font-bold text-[var(--color-on-primary-container)]"
                  style={{ borderRadius: shape.radius }}
                >
                  {shape.className}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[var(--color-outline-variant)]">
                  <span className="font-mono text-xs text-[var(--color-on-surface-variant)]">
                    {shape.className}
                  </span>
                  <button
                    onClick={() => handleCopy(shape.className, key)}
                    className="p-1 text-[var(--color-on-surface-variant)] hover:text-[var(--color-primary)]"
                  >
                    {copiedKey === key ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 5: ELEVATION & SHADOWS */}
      {/* ========================================================================= */}
      {activeSection === 'elevation' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-on-surface)]">Elevation & Shadows</h2>
            <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">
              Material 3 uses surface tonal tinting alongside 6 discrete elevation shadow levels.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(m3Elevation).map(([key, elev]) => (
              <div
                key={key}
                className="p-6 rounded-2xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] flex flex-col justify-between space-y-4"
                style={{ boxShadow: elev.shadow }}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--color-primary)] font-mono">
                      Level {elev.level}
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)]">
                      {elev.dp}
                    </span>
                  </div>
                  <h4 className="text-base font-bold text-[var(--color-on-surface)] mt-1">
                    {elev.name}
                  </h4>
                  <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">
                    {elev.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-[var(--color-outline-variant)] flex items-center justify-between text-xs">
                  <span className="font-mono text-[11px] text-[var(--color-on-surface-variant)] truncate max-w-[200px]">
                    {elev.className}
                  </span>
                  <button
                    onClick={() => handleCopy(elev.shadow, key)}
                    className="p-1 text-[var(--color-on-surface-variant)] hover:text-[var(--color-primary)]"
                    title="Copy CSS box-shadow"
                  >
                    {copiedKey === key ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 6: COMPONENT LIBRARY */}
      {/* ========================================================================= */}
      {activeSection === 'components' && (
        <div className="space-y-10 animate-in fade-in duration-200">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-on-surface)]">Material 3 Components</h2>
            <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">
              Production-ready, accessible components built directly with M3 design tokens.
            </p>
          </div>

          {/* 1. Buttons */}
          <div className="p-6 rounded-2xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] space-y-4 shadow-2xs">
            <h3 className="text-sm font-bold text-[var(--color-on-surface)]">
              Buttons (Filled, Elevated, Tonal, Outlined, Text)
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <M3Button variant="filled" icon={Plus}>
                Filled Primary
              </M3Button>
              <M3Button variant="elevated">Elevated</M3Button>
              <M3Button variant="tonal">Tonal</M3Button>
              <M3Button variant="outlined">Outlined</M3Button>
              <M3Button variant="text">Text Button</M3Button>
              <M3Button variant="filled" disabled>Disabled</M3Button>
            </div>
          </div>

          {/* 2. Floating Action Buttons & Icon Buttons */}
          <div className="p-6 rounded-2xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] space-y-4 shadow-2xs">
            <h3 className="text-sm font-bold text-[var(--color-on-surface)]">
              FABs (Floating Action Buttons) & Icon Buttons
            </h3>
            <div className="flex flex-wrap items-center gap-4">
              <M3FAB label="Book Order" icon={Plus} />
              <M3FAB size="small" icon={Send} />
              <M3FAB size="large" icon={Plus} />
              <div className="h-8 w-px bg-[var(--color-outline-variant)] mx-2 hidden sm:block" />
              <M3IconButton variant="filled" icon={Edit2} tooltip="Edit" />
              <M3IconButton variant="tonal" icon={Sliders} tooltip="Filter" />
              <M3IconButton variant="outlined" icon={Search} tooltip="Search" />
              <M3IconButton variant="standard" icon={Trash2} tooltip="Delete" />
            </div>
          </div>

          {/* 3. Text Fields & Dropdowns */}
          <div className="p-6 rounded-2xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] space-y-4 shadow-2xs">
            <h3 className="text-sm font-bold text-[var(--color-on-surface)]">
              Text Fields & Dropdowns
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <M3TextField
                label="Raw Material Name"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                leadingIcon={Search}
                clearable
                onClear={() => setInputVal('')}
                helperText="Standard grade bitumen feedstock"
              />
              <M3TextField
                label="Batch Quantity (Tonnes)"
                type="number"
                placeholder="e.g. 50.0"
                variant="filled"
                helperText="Plant hopper limit is 120T"
              />
              <M3Select
                label="Production Mix Type"
                value={selectVal}
                onChange={(e) => setSelectVal(e.target.value)}
                options={[
                  { value: 'hotmix', label: 'Dense Bituminous Macadam (DBM)' },
                  { value: 'bc', label: 'Bituminous Concrete (BC)' },
                  { value: 'wmm', label: 'Wet Mix Macadam (WMM)' },
                ]}
              />
            </div>
          </div>

          {/* 4. Chips, Badges & Switches */}
          <div className="p-6 rounded-2xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] space-y-4 shadow-2xs">
            <h3 className="text-sm font-bold text-[var(--color-on-surface)]">
              Chips, Status Badges & Switches
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <M3Chip
                selected={filterChipSelected}
                onClick={() => setFilterChipSelected(!filterChipSelected)}
                variant="filter"
              >
                Filter: VG-30
              </M3Chip>
              <M3Chip variant="assist">Highway Project A</M3Chip>
              <M3Chip variant="input" onDelete={() => {}}>Delete Batch Tag</M3Chip>

              <div className="h-6 w-px bg-[var(--color-outline-variant)] mx-2 hidden sm:block" />

              <M3Badge label="Active Lab Passed" variant="success" />
              <M3Badge label="Stock Low" variant="warning" />
              <M3Badge label="QC Rejected" variant="error" />
              <M3Badge label="In Transit" variant="info" />

              <div className="h-6 w-px bg-[var(--color-outline-variant)] mx-2 hidden sm:block" />

              <M3Switch
                checked={switchChecked}
                onChange={setSwitchChecked}
                label="Automatic Pugmill Feeder"
              />
            </div>
          </div>

          {/* 5. Cards */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-[var(--color-on-surface)]">
              M3 Cards (Elevated, Filled, Outlined)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <M3Card variant="elevated" title="Elevated Card" subtitle="Resting at Level 1">
                <p className="text-xs text-[var(--color-on-surface-variant)] leading-relaxed">
                  Elevated cards feature subtle ambient shadow and surface tinting for clear hierarchy.
                </p>
                <div className="mt-4 flex justify-end">
                  <M3Button variant="tonal" size="sm">Inspect</M3Button>
                </div>
              </M3Card>

              <M3Card variant="filled" title="Filled Card" subtitle="Surface Container background">
                <p className="text-xs text-[var(--color-on-surface-variant)] leading-relaxed">
                  Filled cards use the surface container tier to distinguish content blocks on flat surfaces.
                </p>
                <div className="mt-4 flex justify-end">
                  <M3Button variant="tonal" size="sm">Details</M3Button>
                </div>
              </M3Card>

              <M3Card variant="outlined" title="Outlined Card" subtitle="Crisp 1px M3 outline">
                <p className="text-xs text-[var(--color-on-surface-variant)] leading-relaxed">
                  Outlined cards provide clean structural separation with minimal elevation burden.
                </p>
                <div className="mt-4 flex justify-end">
                  <M3Button variant="outlined" size="sm">Action</M3Button>
                </div>
              </M3Card>
            </div>
          </div>

          {/* 6. Dialog & Snackbar Triggers */}
          <div className="p-6 rounded-2xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] space-y-4 shadow-2xs">
            <h3 className="text-sm font-bold text-[var(--color-on-surface)]">
              Dialogs & Feedback Snackbars
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <M3Button variant="filled" onClick={() => setIsDialogOpen(true)}>
                Preview M3 Dialog
              </M3Button>
              <M3Button variant="outlined" onClick={() => setIsSnackbarOpen(true)}>
                Trigger M3 Snackbar
              </M3Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 7: ICON CATALOG & SYSTEM */}
      {/* ========================================================================= */}
      {activeSection === 'icons' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-on-surface)]">Icon System & Registry</h2>
            <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">
              Consolidated registry of {Object.keys(m3IconRegistry).length} application icons, categorised with standard M3 dimensions.
            </p>
          </div>

          {/* Search & Category Filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-on-surface-variant)]" />
              <input
                type="text"
                placeholder="Search icons by name..."
                value={iconSearch}
                onChange={(e) => setIconSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] focus:outline-none focus:border-[var(--color-primary)] transition-all"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedIconCategory('all')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedIconCategory === 'all'
                    ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                    : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)]'
                }`}
              >
                All ({Object.keys(m3IconRegistry).length})
              </button>
              {Object.entries(m3IconCategories).map(([catKey, cat]) => (
                <button
                  key={catKey}
                  onClick={() => setSelectedIconCategory(catKey)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                    selectedIconCategory === catKey
                      ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                      : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)]'
                  }`}
                >
                  {cat.label} ({cat.icons.length})
                </button>
              ))}
            </div>
          </div>

          {/* Icon Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {filteredIcons.map((iconName) => (
              <div
                key={iconName}
                onClick={() => handleCopy(`<M3Icon name="${iconName}" />`, iconName)}
                className="p-3.5 rounded-2xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-container)] flex flex-col items-center justify-center gap-2.5 text-center cursor-pointer transition-all hover:scale-[1.03] group shadow-2xs"
                title="Click to copy M3Icon JSX"
              >
                <div className="w-10 h-10 rounded-xl bg-[var(--color-surface-container)] text-[var(--color-primary)] flex items-center justify-center group-hover:bg-[var(--color-primary)] group-hover:text-[var(--color-on-primary)] transition-colors">
                  <M3Icon name={iconName} size={20} />
                </div>
                <span className="text-[11px] font-mono text-[var(--color-on-surface)] truncate max-w-full">
                  {iconName}
                </span>
                {copiedKey === iconName && (
                  <span className="text-[10px] text-emerald-500 font-bold">Copied!</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Global Interactive Dialog Demo */}
      <M3Dialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title="Confirm Pugmill Batch Run"
        subtitle="Hot-mix plant automation safety check"
        icon={Sparkles}
        confirmLabel="Initiate Batch"
        cancelLabel="Abort"
        onConfirm={() => {
          setIsDialogOpen(false);
          setIsSnackbarOpen(true);
        }}
      >
        <p className="text-xs text-[var(--color-on-surface-variant)] leading-relaxed">
          The selected formula requires <strong>45.5 Tonnes</strong> of Aggregate 10mm and{' '}
          <strong>2.2 Tonnes</strong> of VG-30 Bitumen. Please ensure that the asphalt feeder conveyer belt is clear before proceeding.
        </p>
      </M3Dialog>

      {/* Global Interactive Snackbar Demo */}
      <M3Snackbar
        isOpen={isSnackbarOpen}
        onClose={() => setIsSnackbarOpen(false)}
        message="Production batching operation successfully queued!"
        actionLabel="Dismiss"
        onAction={() => setIsSnackbarOpen(false)}
      />
    </div>
  );
}
