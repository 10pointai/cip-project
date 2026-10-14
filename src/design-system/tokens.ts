/**
 * Material Design 3 (M3) Design Tokens
 * Single source of truth for:
 * - Complete Color Roles (Primary, Secondary, Tertiary, Error, Surface, Surface Containers, Outlines, Shadows, Scrim, Inverse, Status)
 * - Light & Dark Mode Palettes
 * - Standard, Medium, and High Contrast Palettes for both modes (6 distinct M3 palettes)
 * - Typography Scale (Display, Headline, Title, Body, Label)
 * - Shapes & Corner Radii (None, XS, SM, MD, LG, XL, Full)
 * - Elevation & Shadows (Levels 0 through 5)
 * - State Layers & Motion
 */

export type M3ThemeMode = 'light' | 'dark';
export type M3ContrastLevel = 'standard' | 'medium' | 'high';

export interface M3ColorScheme {
  // Primary (Key Brand / High Emphasis)
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  inversePrimary: string;

  // Secondary (Less prominent components / Filter chips / FABs)
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;

  // Tertiary (Contrasting accent / balance / Badges)
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;

  // Error
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;

  // Surface & Surface Dim / Bright
  surface: string;
  onSurface: string;
  surfaceDim: string;
  surfaceBright: string;

  // Surface Containers (5-tier elevation hierarchy)
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;

  // Surface Variants
  surfaceVariant: string;
  onSurfaceVariant: string;

  // Outlines & Dividers
  outline: string;
  outlineVariant: string;

  // Shadows & Scrim
  shadow: string;
  scrim: string;

  // Inverse Roles (Tooltips, Snackbars, Drawers)
  inverseSurface: string;
  inverseOnSurface: string;

  // Semantic Status Colors
  success: string;
  onSuccess: string;
  successContainer: string;
  onSuccessContainer: string;

  warning: string;
  onWarning: string;
  warningContainer: string;
  onWarningContainer: string;

  info: string;
  onInfo: string;
  infoContainer: string;
  onInfoContainer: string;
}

/**
 * 1. Light Mode - Standard Contrast
 */
export const m3LightPalette: M3ColorScheme = {
  primary: '#005ac1',
  onPrimary: '#ffffff',
  primaryContainer: '#d8e2ff',
  onPrimaryContainer: '#001a41',
  inversePrimary: '#adc6ff',

  secondary: '#575e71',
  onSecondary: '#ffffff',
  secondaryContainer: '#dbe2f9',
  onSecondaryContainer: '#141b2c',

  tertiary: '#715573',
  onTertiary: '#ffffff',
  tertiaryContainer: '#fbd7fc',
  onTertiaryContainer: '#29132d',

  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#410002',

  surface: '#fdfbff',
  onSurface: '#1c1b1f',
  surfaceDim: '#ded8e1',
  surfaceBright: '#fdfbff',

  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f7f2fa',
  surfaceContainer: '#f3f3fa',
  surfaceContainerHigh: '#ece6f0',
  surfaceContainerHighest: '#e6e0e9',

  surfaceVariant: '#e1e2ec',
  onSurfaceVariant: '#44474e',

  outline: '#74777f',
  outlineVariant: '#c4c6cf',

  shadow: '#000000',
  scrim: '#000000',

  inverseSurface: '#313033',
  inverseOnSurface: '#f4eff4',

  success: '#386a20',
  onSuccess: '#ffffff',
  successContainer: '#b7f397',
  onSuccessContainer: '#042100',

  warning: '#8c5000',
  onWarning: '#ffffff',
  warningContainer: '#ffdcbe',
  onWarningContainer: '#2d1600',

  info: '#00639b',
  onInfo: '#ffffff',
  infoContainer: '#cee5ff',
  onInfoContainer: '#001d32',
};

/**
 * 2. Light Mode - Medium Contrast
 */
export const m3LightMediumContrastPalette: M3ColorScheme = {
  primary: '#004394',
  onPrimary: '#ffffff',
  primaryContainer: '#2670dc',
  onPrimaryContainer: '#ffffff',
  inversePrimary: '#adc6ff',

  secondary: '#3c4355',
  onSecondary: '#ffffff',
  secondaryContainer: '#6e7589',
  onSecondaryContainer: '#ffffff',

  tertiary: '#543b57',
  onTertiary: '#ffffff',
  tertiaryContainer: '#896b8b',
  onTertiaryContainer: '#ffffff',

  error: '#8c0009',
  onError: '#ffffff',
  errorContainer: '#da342e',
  onErrorContainer: '#ffffff',

  surface: '#fdfbff',
  onSurface: '#111114',
  surfaceDim: '#d5cfd8',
  surfaceBright: '#fdfbff',

  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f5eff7',
  surfaceContainer: '#ede7f0',
  surfaceContainerHigh: '#e7e1ea',
  surfaceContainerHighest: '#e1dce4',

  surfaceVariant: '#d8d9e3',
  onSurfaceVariant: '#34363d',

  outline: '#5c5f67',
  outlineVariant: '#777a83',

  shadow: '#000000',
  scrim: '#000000',

  inverseSurface: '#313033',
  inverseOnSurface: '#f4eff4',

  success: '#285213',
  onSuccess: '#ffffff',
  successContainer: '#4a8030',
  onSuccessContainer: '#ffffff',

  warning: '#6e3d00',
  onWarning: '#ffffff',
  warningContainer: '#a56200',
  onWarningContainer: '#ffffff',

  info: '#004d7a',
  onInfo: '#ffffff',
  infoContainer: '#0078bb',
  onInfoContainer: '#ffffff',
};

/**
 * 3. Light Mode - High Contrast (WCAG AAA)
 */
export const m3LightHighContrastPalette: M3ColorScheme = {
  primary: '#00275c',
  onPrimary: '#ffffff',
  primaryContainer: '#00469b',
  onPrimaryContainer: '#ffffff',
  inversePrimary: '#d8e2ff',

  secondary: '#21293a',
  onSecondary: '#ffffff',
  secondaryContainer: '#3f4658',
  onSecondaryContainer: '#ffffff',

  tertiary: '#37203b',
  onTertiary: '#ffffff',
  tertiaryContainer: '#573e5a',
  onTertiaryContainer: '#ffffff',

  error: '#4e0002',
  onError: '#ffffff',
  errorContainer: '#8c0009',
  onErrorContainer: '#ffffff',

  surface: '#ffffff',
  onSurface: '#000000',
  surfaceDim: '#cbbfce',
  surfaceBright: '#ffffff',

  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#ece2f0',
  surfaceContainer: '#e4d9e7',
  surfaceContainerHigh: '#dcd1df',
  surfaceContainerHighest: '#d4c9d7',

  surfaceVariant: '#cbccd6',
  onSurfaceVariant: '#1c1d23',

  outline: '#27292f',
  outlineVariant: '#27292f',

  shadow: '#000000',
  scrim: '#000000',

  inverseSurface: '#000000',
  inverseOnSurface: '#ffffff',

  success: '#123304',
  onSuccess: '#ffffff',
  successContainer: '#2a5615',
  onSuccessContainer: '#ffffff',

  warning: '#412100',
  onWarning: '#ffffff',
  warningContainer: '#6e3d00',
  onWarningContainer: '#ffffff',

  info: '#002a45',
  onInfo: '#ffffff',
  infoContainer: '#00507e',
  onInfoContainer: '#ffffff',
};

/**
 * 4. Dark Mode - Standard Contrast
 */
export const m3DarkPalette: M3ColorScheme = {
  primary: '#adc6ff',
  onPrimary: '#002e69',
  primaryContainer: '#004494',
  onPrimaryContainer: '#d8e2ff',
  inversePrimary: '#005ac1',

  secondary: '#bfc6dc',
  onSecondary: '#293041',
  secondaryContainer: '#3f4759',
  onSecondaryContainer: '#dbe2f9',

  tertiary: '#debcdf',
  onTertiary: '#402843',
  tertiaryContainer: '#583e5a',
  onTertiaryContainer: '#fbd7fc',

  error: '#ffb4ab',
  onError: '#690005',
  errorContainer: '#93000a',
  onErrorContainer: '#ffdad6',

  surface: '#111318',
  onSurface: '#e2e2e9',
  surfaceDim: '#111318',
  surfaceBright: '#37393e',

  surfaceContainerLowest: '#0c0e13',
  surfaceContainerLow: '#191c20',
  surfaceContainer: '#1d2024',
  surfaceContainerHigh: '#282a2f',
  surfaceContainerHighest: '#33353a',

  surfaceVariant: '#44474f',
  onSurfaceVariant: '#c4c6d0',

  outline: '#8e9099',
  outlineVariant: '#44474f',

  shadow: '#000000',
  scrim: '#000000',

  inverseSurface: '#e2e2e9',
  inverseOnSurface: '#2f3036',

  success: '#9cd67d',
  onSuccess: '#103800',
  successContainer: '#22510b',
  onSuccessContainer: '#b7f397',

  warning: '#ffb77c',
  onWarning: '#4b2800',
  warningContainer: '#6b3b00',
  onWarningContainer: '#ffdcbe',

  info: '#97cbff',
  onInfo: '#003353',
  infoContainer: '#004a75',
  onInfoContainer: '#cee5ff',
};

/**
 * 5. Dark Mode - Medium Contrast
 */
export const m3DarkMediumContrastPalette: M3ColorScheme = {
  primary: '#b9d0ff',
  onPrimary: '#00173b',
  primaryContainer: '#72a4f9',
  onPrimaryContainer: '#000000',
  inversePrimary: '#004596',

  secondary: '#c3cbdf',
  onSecondary: '#131b2c',
  secondaryContainer: '#8890a5',
  onSecondaryContainer: '#000000',

  tertiary: '#e3c1e3',
  onTertiary: '#29132c',
  tertiaryContainer: '#a586a6',
  onTertiaryContainer: '#000000',

  error: '#ffbab1',
  onError: '#370001',
  errorContainer: '#ff5449',
  onErrorContainer: '#000000',

  surface: '#111318',
  onSurface: '#fbf9ff',
  surfaceDim: '#111318',
  surfaceBright: '#43444a',

  surfaceContainerLowest: '#06070c',
  surfaceContainerLow: '#1d1f25',
  surfaceContainer: '#272930',
  surfaceContainerHigh: '#32343b',
  surfaceContainerHighest: '#3d3f46',

  surfaceVariant: '#44474f',
  onSurfaceVariant: '#c8cbd4',

  outline: '#9fa2ac',
  outlineVariant: '#80838c',

  shadow: '#000000',
  scrim: '#000000',

  inverseSurface: '#e2e2e9',
  inverseOnSurface: '#282a2f',

  success: '#a8e289',
  onSuccess: '#072100',
  successContainer: '#5f9745',
  onSuccessContainer: '#000000',

  warning: '#ffc291',
  onWarning: '#281300',
  warningContainer: '#be7200',
  onWarningContainer: '#000000',

  info: '#a7d3ff',
  onInfo: '#001b2f',
  infoContainer: '#2a90d6',
  onInfoContainer: '#000000',
};

/**
 * 6. Dark Mode - High Contrast (WCAG AAA)
 */
export const m3DarkHighContrastPalette: M3ColorScheme = {
  primary: '#f9f9ff',
  onPrimary: '#000000',
  primaryContainer: '#b9d0ff',
  onPrimaryContainer: '#000000',
  inversePrimary: '#00275c',

  secondary: '#f9f9ff',
  onSecondary: '#000000',
  secondaryContainer: '#c3cbdf',
  onSecondaryContainer: '#000000',

  tertiary: '#fff9fb',
  onTertiary: '#000000',
  tertiaryContainer: '#e3c1e3',
  onTertiaryContainer: '#000000',

  error: '#fff9f9',
  onError: '#000000',
  errorContainer: '#ffbab1',
  onErrorContainer: '#000000',

  surface: '#000000',
  onSurface: '#ffffff',
  surfaceDim: '#111318',
  surfaceBright: '#505259',

  surfaceContainerLowest: '#000000',
  surfaceContainerLow: '#1c1e24',
  surfaceContainer: '#272930',
  surfaceContainerHigh: '#33353c',
  surfaceContainerHighest: '#3f4148',

  surfaceVariant: '#44474f',
  onSurfaceVariant: '#f9f9ff',

  outline: '#c8cbd4',
  outlineVariant: '#c8cbd4',

  shadow: '#000000',
  scrim: '#000000',

  inverseSurface: '#ffffff',
  inverseOnSurface: '#000000',

  success: '#f2ffe6',
  onSuccess: '#000000',
  successContainer: '#a8e289',
  onSuccessContainer: '#000000',

  warning: '#fff3eb',
  onWarning: '#000000',
  warningContainer: '#ffc291',
  onWarningContainer: '#000000',

  info: '#f3f8ff',
  onInfo: '#000000',
  infoContainer: '#a7d3ff',
  onInfoContainer: '#000000',
};

/**
 * Master Registry of all 6 Material Design 3 Palettes
 */
export const m3Palettes: Record<
  `${M3ThemeMode}_${M3ContrastLevel}`,
  M3ColorScheme
> = {
  light_standard: m3LightPalette,
  light_medium: m3LightMediumContrastPalette,
  light_high: m3LightHighContrastPalette,
  dark_standard: m3DarkPalette,
  dark_medium: m3DarkMediumContrastPalette,
  dark_high: m3DarkHighContrastPalette,
};

/**
 * Helper function to retrieve the active M3 Color Scheme
 */
export function getM3Palette(
  mode: M3ThemeMode = 'light',
  contrast: M3ContrastLevel = 'standard'
): M3ColorScheme {
  const key = `${mode}_${contrast}` as const;
  return m3Palettes[key] || m3LightPalette;
}

// Default export for backward compatibility
export const m3Colors = m3LightPalette;
export type M3ColorKey = keyof M3ColorScheme;

/**
 * Material Design 3 Typography Scale
 * Defined with exact font sizes, line heights, font weights, and tracking (letter-spacing).
 */
export const m3Typography = {
  displayLarge: {
    name: 'Display Large',
    fontSize: '57px',
    lineHeight: '64px',
    fontWeight: '400',
    tracking: '-0.25px',
    className: 'text-[57px] leading-[64px] font-normal tracking-[-0.25px]',
  },
  displayMedium: {
    name: 'Display Medium',
    fontSize: '45px',
    lineHeight: '52px',
    fontWeight: '400',
    tracking: '0px',
    className: 'text-[45px] leading-[52px] font-normal tracking-[0px]',
  },
  displaySmall: {
    name: 'Display Small',
    fontSize: '36px',
    lineHeight: '44px',
    fontWeight: '400',
    tracking: '0px',
    className: 'text-[36px] leading-[44px] font-normal tracking-[0px]',
  },
  headlineLarge: {
    name: 'Headline Large',
    fontSize: '32px',
    lineHeight: '40px',
    fontWeight: '600',
    tracking: '0px',
    className: 'text-[32px] leading-[40px] font-semibold tracking-[0px]',
  },
  headlineMedium: {
    name: 'Headline Medium',
    fontSize: '28px',
    lineHeight: '36px',
    fontWeight: '600',
    tracking: '0px',
    className: 'text-[28px] leading-[36px] font-semibold tracking-[0px]',
  },
  headlineSmall: {
    name: 'Headline Small',
    fontSize: '24px',
    lineHeight: '32px',
    fontWeight: '600',
    tracking: '0px',
    className: 'text-[24px] leading-[32px] font-semibold tracking-[0px]',
  },
  titleLarge: {
    name: 'Title Large',
    fontSize: '22px',
    lineHeight: '28px',
    fontWeight: '600',
    tracking: '0px',
    className: 'text-[22px] leading-[28px] font-semibold tracking-[0px]',
  },
  titleMedium: {
    name: 'Title Medium',
    fontSize: '16px',
    lineHeight: '24px',
    fontWeight: '600',
    tracking: '0.15px',
    className: 'text-[16px] leading-[24px] font-semibold tracking-[0.15px]',
  },
  titleSmall: {
    name: 'Title Small',
    fontSize: '14px',
    lineHeight: '20px',
    fontWeight: '600',
    tracking: '0.1px',
    className: 'text-[14px] leading-[20px] font-semibold tracking-[0.1px]',
  },
  bodyLarge: {
    name: 'Body Large',
    fontSize: '16px',
    lineHeight: '24px',
    fontWeight: '400',
    tracking: '0.5px',
    className: 'text-[16px] leading-[24px] font-normal tracking-[0.5px]',
  },
  bodyMedium: {
    name: 'Body Medium',
    fontSize: '14px',
    lineHeight: '20px',
    fontWeight: '400',
    tracking: '0.25px',
    className: 'text-[14px] leading-[20px] font-normal tracking-[0.25px]',
  },
  bodySmall: {
    name: 'Body Small',
    fontSize: '12px',
    lineHeight: '16px',
    fontWeight: '400',
    tracking: '0.4px',
    className: 'text-[12px] leading-[16px] font-normal tracking-[0.4px]',
  },
  labelLarge: {
    name: 'Label Large (Buttons & Prompts)',
    fontSize: '14px',
    lineHeight: '20px',
    fontWeight: '600',
    tracking: '0.1px',
    className: 'text-[14px] leading-[20px] font-semibold tracking-[0.1px]',
  },
  labelMedium: {
    name: 'Label Medium (Chips & Badges)',
    fontSize: '12px',
    lineHeight: '16px',
    fontWeight: '600',
    tracking: '0.5px',
    className: 'text-[12px] leading-[16px] font-semibold tracking-[0.5px]',
  },
  labelSmall: {
    name: 'Label Small (Metadata & Captions)',
    fontSize: '11px',
    lineHeight: '16px',
    fontWeight: '600',
    tracking: '0.5px',
    className: 'text-[11px] leading-[16px] font-semibold tracking-[0.5px]',
  },
} as const;

export type M3TypographyKey = keyof typeof m3Typography;

/**
 * Material Design 3 Shape Scale
 * Corner radii mapping from None to Full Pill.
 */
export const m3Shapes = {
  none: {
    name: 'None',
    radius: '0px',
    className: 'rounded-none',
    description: 'Borders, full-width banners, dividers',
  },
  extraSmall: {
    name: 'Extra Small',
    radius: '4px',
    className: 'rounded',
    description: 'Badges, text field outlines, small indicators',
  },
  small: {
    name: 'Small',
    radius: '8px',
    className: 'rounded-lg',
    description: 'Tooltips, compact chips, snackbars',
  },
  medium: {
    name: 'Medium',
    radius: '12px',
    className: 'rounded-xl',
    description: 'Cards, small menus, dropdowns, input elements',
  },
  large: {
    name: 'Large',
    radius: '16px',
    className: 'rounded-2xl',
    description: 'Standard cards, navigation drawers, bottom sheets',
  },
  extraLarge: {
    name: 'Extra Large',
    radius: '28px',
    className: 'rounded-[28px]',
    description: 'Modal dialogs, large containers, hero cards',
  },
  full: {
    name: 'Full',
    radius: '9999px',
    className: 'rounded-full',
    description: 'Buttons, search bars, floating action buttons (FAB), status pills',
  },
} as const;

export type M3ShapeKey = keyof typeof m3Shapes;

/**
 * Material Design 3 Elevation & Shadow Scale
 * 6 levels from Level 0 (flat) to Level 5 (picker / modal dialog).
 */
export const m3Elevation = {
  level0: {
    level: 0,
    dp: '0dp',
    name: 'Level 0 (Flat)',
    shadow: 'none',
    className: 'shadow-none',
    description: 'Flat surfaces, un-elevated cards, outlines',
  },
  level1: {
    level: 1,
    dp: '1dp',
    name: 'Level 1 (Surface / Card)',
    shadow: '0 1px 3px 1px rgba(0, 29, 52, 0.08), 0 1px 2px 0 rgba(0, 29, 52, 0.12)',
    className: 'shadow-xs',
    description: 'Elevated cards, resting chips, top app bar (scrolled)',
  },
  level2: {
    level: 2,
    dp: '3dp',
    name: 'Level 2 (Hovered Card)',
    shadow: '0 2px 6px 2px rgba(0, 29, 52, 0.10), 0 1px 2px 0 rgba(0, 29, 52, 0.14)',
    className: 'shadow-sm',
    description: 'Elevated buttons, hovering cards, small menus',
  },
  level3: {
    level: 3,
    dp: '6dp',
    name: 'Level 3 (FAB / Menu / Sheet)',
    shadow: '0 4px 8px 3px rgba(0, 29, 52, 0.12), 0 1px 3px 0 rgba(0, 29, 52, 0.15)',
    className: 'shadow-md',
    description: 'Floating action button (FAB), dropdown menus, side sheets',
  },
  level4: {
    level: 4,
    dp: '8dp',
    name: 'Level 4 (Drawer / Navigation)',
    shadow: '0 6px 10px 4px rgba(0, 29, 52, 0.12), 0 2px 3px 0 rgba(0, 29, 52, 0.16)',
    className: 'shadow-lg',
    description: 'Modal navigation drawers, active action bottom sheets',
  },
  level5: {
    level: 5,
    dp: '12dp',
    name: 'Level 5 (Modal Dialog / Picker)',
    shadow: '0 8px 16px 6px rgba(0, 29, 52, 0.14), 0 4px 4px 0 rgba(0, 29, 52, 0.18)',
    className: 'shadow-xl',
    description: 'Modal dialogs, date/time pickers, alerts',
  },
} as const;

export type M3ElevationLevel = keyof typeof m3Elevation;

/**
 * Material Design 3 Motion Tokens
 */
export const m3Motion = {
  durations: {
    short1: '50ms',
    short2: '100ms',
    short3: '150ms',
    short4: '200ms',
    medium1: '250ms',
    medium2: '300ms',
    medium3: '350ms',
    medium4: '400ms',
    long1: '450ms',
    long2: '500ms',
  },
  easings: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
    decelerate: 'cubic-bezier(0.0, 0, 0.2, 1)',
    accelerate: 'cubic-bezier(0.3, 0, 1, 1)',
  },
} as const;

/**
 * Material Design 3 Typography Font Family
 * The central font configuration for the entire application.
 */
export const m3FontFamily = "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
