import React from 'react';
import { LucideIcon } from 'lucide-react';
import { M3Icon, M3IconName } from '../icons';
import { M3IconButton } from './M3IconButton';

export type M3TopAppBarVariant = 'small' | 'center-aligned' | 'medium' | 'large';

export interface M3TopAppBarProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  variant?: M3TopAppBarVariant;
  navigationIcon?: LucideIcon;
  navigationIconName?: M3IconName;
  onNavigationClick?: () => void;
  actions?: React.ReactNode;
  scrolled?: boolean;
  className?: string;
}

/**
 * Material Design 3 Top App Bar
 * Types:
 * - Small (standard 64px row)
 * - Center-aligned (title centered)
 * - Medium (two-row with expanded title)
 * - Large (three-row with hero display title)
 */
export const M3TopAppBar: React.FC<M3TopAppBarProps> = ({
  title,
  subtitle,
  variant = 'small',
  navigationIcon,
  navigationIconName,
  onNavigationClick,
  actions,
  scrolled = false,
  className = '',
}) => {
  const elevationClass = scrolled
    ? 'shadow-xs bg-[#f3f3fa] border-b border-[#e1e2ec]'
    : 'bg-white/95 border-b border-[#e1e2ec]/60 backdrop-blur-md';

  if (variant === 'medium' || variant === 'large') {
    return (
      <header className={`w-full transition-all duration-200 ${elevationClass} ${className}`}>
        <div className="flex items-center justify-between px-4 h-16 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            {(navigationIcon || navigationIconName) && (
              <M3IconButton
                icon={navigationIcon}
                iconName={navigationIconName}
                onClick={onNavigationClick}
              />
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
        <div className={`px-6 pb-6 max-w-7xl mx-auto ${variant === 'large' ? 'pt-6' : 'pt-2'}`}>
          <h1 className={`${variant === 'large' ? 'text-3xl' : 'text-2xl'} font-bold text-[#1c1b1f]`}>
            {title}
          </h1>
          {subtitle && <p className="text-sm text-[#44474e] mt-1">{subtitle}</p>}
        </div>
      </header>
    );
  }

  const isCenter = variant === 'center-aligned';

  return (
    <header className={`w-full transition-all duration-200 ${elevationClass} ${className}`}>
      <div className="flex items-center justify-between px-4 sm:px-6 h-16 max-w-7xl mx-auto gap-4">
        {/* Navigation Icon */}
        <div className="flex items-center gap-3 shrink-0">
          {(navigationIcon || navigationIconName) && (
            <M3IconButton
              icon={navigationIcon}
              iconName={navigationIconName}
              onClick={onNavigationClick}
            />
          )}
          {!isCenter && (
            <div>
              <div className="text-base sm:text-lg font-bold text-[#1c1b1f] leading-tight">
                {title}
              </div>
              {subtitle && <div className="text-xs text-[#74777f]">{subtitle}</div>}
            </div>
          )}
        </div>

        {/* Center Title if requested */}
        {isCenter && (
          <div className="text-center flex-1">
            <div className="text-base sm:text-lg font-bold text-[#1c1b1f]">{title}</div>
            {subtitle && <div className="text-xs text-[#74777f]">{subtitle}</div>}
          </div>
        )}

        {/* Actions */}
        {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
      </div>
    </header>
  );
};
