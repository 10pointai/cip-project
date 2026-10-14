import React from 'react';
import { m3Typography, M3TypographyKey } from '../tokens';

export interface M3TextProps extends React.HTMLAttributes<HTMLElement> {
  variant?: M3TypographyKey;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span' | 'div' | 'label';
  children: React.ReactNode;
}

const defaultElementMap: Record<M3TypographyKey, NonNullable<M3TextProps['as']>> = {
  displayLarge: 'h1',
  displayMedium: 'h1',
  displaySmall: 'h1',
  headlineLarge: 'h1',
  headlineMedium: 'h2',
  headlineSmall: 'h2',
  titleLarge: 'h3',
  titleMedium: 'h4',
  titleSmall: 'h5',
  bodyLarge: 'p',
  bodyMedium: 'p',
  bodySmall: 'p',
  labelLarge: 'span',
  labelMedium: 'span',
  labelSmall: 'span',
};

/**
 * Material Design 3 Central Typography Component
 * Restricts all typography scales across the app to the centralized design tokens in tokens.ts.
 */
export const M3Text: React.FC<M3TextProps> = ({
  variant = 'bodyMedium',
  as,
  children,
  className = '',
  ...props
}) => {
  const Component = as || defaultElementMap[variant] || 'p';
  const m3Style = m3Typography[variant];

  return (
    <Component
      className={`${m3Style.className} ${className}`.trim()}
      style={{ fontFamily: 'var(--font-family-m3)' }}
      {...props}
    >
      {children}
    </Component>
  );
};
