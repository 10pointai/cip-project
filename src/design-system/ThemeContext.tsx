import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import {
  M3ThemeMode,
  M3ContrastLevel,
  M3ColorScheme,
  getM3Palette,
  m3FontFamily,
} from './tokens';

interface M3ThemeContextValue {
  mode: M3ThemeMode;
  contrast: M3ContrastLevel;
  colors: M3ColorScheme;
  setMode: (mode: M3ThemeMode) => void;
  setContrast: (contrast: M3ContrastLevel) => void;
  toggleMode: () => void;
}

const M3ThemeContext = createContext<M3ThemeContextValue | undefined>(undefined);

const THEME_MODE_STORAGE_KEY = 'm3-app-theme-mode';
const THEME_CONTRAST_STORAGE_KEY = 'm3-app-theme-contrast';

export const M3ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<M3ThemeMode>(() => {
    try {
      const stored = localStorage.getItem(THEME_MODE_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') return stored;
      // DEFAULT THEME: light — an explicit system-dark preference no longer
      // auto-switches to dark; the user opts into dark via the toggle.
    } catch {
      // fallback
    }
    return 'light';
  });

  const [contrast, setContrastState] = useState<M3ContrastLevel>(() => {
    try {
      const stored = localStorage.getItem(THEME_CONTRAST_STORAGE_KEY);
      if (stored === 'standard' || stored === 'medium' || stored === 'high') {
        return stored;
      }
    } catch {
      // fallback
    }
    return 'standard';
  });

  const colors = useMemo(() => getM3Palette(mode, contrast), [mode, contrast]);

  const setMode = (newMode: M3ThemeMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem(THEME_MODE_STORAGE_KEY, newMode);
    } catch {
      // ignore
    }
  };

  const setContrast = (newContrast: M3ContrastLevel) => {
    setContrastState(newContrast);
    try {
      localStorage.setItem(THEME_CONTRAST_STORAGE_KEY, newContrast);
    } catch {
      // ignore
    }
  };

  const toggleMode = () => {
    setMode(mode === 'light' ? 'dark' : 'light');
  };

  // Sync DOM attributes and CSS variables with active theme
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', mode);
    root.setAttribute('data-contrast', contrast);

    if (mode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Apply color scheme as CSS variables
    root.style.setProperty('--color-primary', colors.primary);
    root.style.setProperty('--color-on-primary', colors.onPrimary);
    root.style.setProperty('--color-primary-container', colors.primaryContainer);
    root.style.setProperty('--color-on-primary-container', colors.onPrimaryContainer);
    root.style.setProperty('--color-inverse-primary', colors.inversePrimary);

    root.style.setProperty('--color-secondary', colors.secondary);
    root.style.setProperty('--color-on-secondary', colors.onSecondary);
    root.style.setProperty('--color-secondary-container', colors.secondaryContainer);
    root.style.setProperty('--color-on-secondary-container', colors.onSecondaryContainer);

    root.style.setProperty('--color-tertiary', colors.tertiary);
    root.style.setProperty('--color-on-tertiary', colors.onTertiary);
    root.style.setProperty('--color-tertiary-container', colors.tertiaryContainer);
    root.style.setProperty('--color-on-tertiary-container', colors.onTertiaryContainer);

    root.style.setProperty('--color-error', colors.error);
    root.style.setProperty('--color-on-error', colors.onError);
    root.style.setProperty('--color-error-container', colors.errorContainer);
    root.style.setProperty('--color-on-error-container', colors.onErrorContainer);

    root.style.setProperty('--color-surface', colors.surface);
    root.style.setProperty('--color-on-surface', colors.onSurface);
    root.style.setProperty('--color-surface-dim', colors.surfaceDim);
    root.style.setProperty('--color-surface-bright', colors.surfaceBright);

    root.style.setProperty('--color-surface-container-lowest', colors.surfaceContainerLowest);
    root.style.setProperty('--color-surface-container-low', colors.surfaceContainerLow);
    root.style.setProperty('--color-surface-container', colors.surfaceContainer);
    root.style.setProperty('--color-surface-container-high', colors.surfaceContainerHigh);
    root.style.setProperty('--color-surface-container-highest', colors.surfaceContainerHighest);

    root.style.setProperty('--color-surface-variant', colors.surfaceVariant);
    root.style.setProperty('--color-on-surface-variant', colors.onSurfaceVariant);

    root.style.setProperty('--color-outline', colors.outline);
    root.style.setProperty('--color-outline-variant', colors.outlineVariant);

    root.style.setProperty('--color-shadow', colors.shadow);
    root.style.setProperty('--color-scrim', colors.scrim);

    root.style.setProperty('--color-inverse-surface', colors.inverseSurface);
    root.style.setProperty('--color-inverse-on-surface', colors.inverseOnSurface);

    root.style.setProperty('--color-success', colors.success);
    root.style.setProperty('--color-on-success', colors.onSuccess);
    root.style.setProperty('--color-success-container', colors.successContainer);
    root.style.setProperty('--color-on-success-container', colors.onSuccessContainer);

    root.style.setProperty('--color-warning', colors.warning);
    root.style.setProperty('--color-on-warning', colors.onWarning);
    root.style.setProperty('--color-warning-container', colors.warningContainer);
    root.style.setProperty('--color-on-warning-container', colors.onWarningContainer);

    root.style.setProperty('--color-info', colors.info);
    root.style.setProperty('--color-on-info', colors.onInfo);
    root.style.setProperty('--color-info-container', colors.infoContainer);
    root.style.setProperty('--color-on-info-container', colors.onInfoContainer);

    // Apply centralized font family token
    root.style.setProperty('--font-family-m3', m3FontFamily);
  }, [mode, contrast, colors]);

  return (
    <M3ThemeContext.Provider
      value={{
        mode,
        contrast,
        colors,
        setMode,
        setContrast,
        toggleMode,
      }}
    >
      {children}
    </M3ThemeContext.Provider>
  );
};

export function useM3Theme() {
  const context = useContext(M3ThemeContext);
  if (!context) {
    // Fallback safe value when provider is not mounted
    const fallbackColors = getM3Palette('light', 'standard');
    return {
      mode: 'light' as M3ThemeMode,
      contrast: 'standard' as M3ContrastLevel,
      colors: fallbackColors,
      setMode: () => {},
      setContrast: () => {},
      toggleMode: () => {},
    };
  }
  return context;
}
