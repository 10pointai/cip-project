import React from 'react';
import { LucideIcon } from 'lucide-react';
import { M3Icon, M3IconName } from '../icons';

export type M3ButtonVariant = 'filled' | 'elevated' | 'tonal' | 'outlined' | 'text';
export type M3ButtonSize = 'sm' | 'md' | 'lg';

export interface M3ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: M3ButtonVariant;
  size?: M3ButtonSize;
  icon?: LucideIcon;
  iconName?: M3IconName;
  iconPosition?: 'start' | 'end';
  loading?: boolean;
  fullWidth?: boolean;
  children?: React.ReactNode;
}

/**
 * Material Design 3 Button Component
 * Supports:
 * - Filled (Primary action, high emphasis)
 * - Elevated (Tonal with elevation shadow)
 * - Tonal (Secondary container, medium emphasis)
 * - Outlined (Bordered, medium-low emphasis)
 * - Text (Low emphasis, flat)
 */
export const M3Button: React.FC<M3ButtonProps> = ({
  variant = 'filled',
  size = 'md',
  icon,
  iconName,
  iconPosition = 'start',
  loading = false,
  fullWidth = false,
  children,
  className = '',
  disabled,
  ...props
}) => {
  // Base M3 styling: rounded-full (full shape), font-semibold, transitions
  const baseClasses =
    'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed';

  // Size specifications based on M3 specs (40px height for standard MD, 32px for SM, 48px for LG)
  const sizeClasses: Record<M3ButtonSize, string> = {
    sm: 'h-8 px-3.5 text-xs tracking-[0.1px]',
    md: 'h-10 px-5 text-sm tracking-[0.1px]',
    lg: 'h-12 px-6 text-base tracking-[0.15px]',
  };

  // Variant styling matching M3 colors & state layers
  const variantClasses: Record<M3ButtonVariant, string> = {
    filled:
      'bg-[#005ac1] text-white shadow-xs hover:bg-[#004899] hover:shadow-sm active:bg-[#003d82] focus-visible:ring-[#005ac1] disabled:bg-[#1c1b1f]/12 disabled:text-[#1c1b1f]/38 disabled:shadow-none',
    elevated:
      'bg-[#fdfbff] text-[#005ac1] shadow-sm hover:shadow-md hover:bg-[#f3f3fa] active:shadow-xs active:bg-[#e8e8f0] focus-visible:ring-[#005ac1] disabled:bg-[#1c1b1f]/12 disabled:text-[#1c1b1f]/38 disabled:shadow-none',
    tonal:
      'bg-[#d8e2ff] text-[#001a41] hover:bg-[#c6d7ff] active:bg-[#b3cbff] focus-visible:ring-[#005ac1] disabled:bg-[#1c1b1f]/12 disabled:text-[#1c1b1f]/38',
    outlined:
      'border border-[#74777f]/40 bg-transparent text-[#005ac1] hover:bg-[#005ac1]/8 hover:border-[#005ac1] active:bg-[#005ac1]/12 focus-visible:ring-[#005ac1] disabled:border-[#1c1b1f]/12 disabled:text-[#1c1b1f]/38',
    text:
      'bg-transparent text-[#005ac1] hover:bg-[#005ac1]/8 active:bg-[#005ac1]/12 focus-visible:ring-[#005ac1] disabled:text-[#1c1b1f]/38',
  };

  const widthClass = fullWidth ? 'w-full' : '';

  const renderIcon = () => {
    if (loading) {
      return (
        <svg
          className="animate-spin -ml-1 mr-1 h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      );
    }

    if (icon || iconName) {
      return (
        <M3Icon
          icon={icon}
          name={iconName}
          size={size === 'sm' ? 'xs' : 'sm'}
          className="shrink-0"
        />
      );
    }

    return null;
  };

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${widthClass} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {iconPosition === 'start' && renderIcon()}
      {children && <span className="whitespace-nowrap">{children}</span>}
      {iconPosition === 'end' && renderIcon()}
    </button>
  );
};
