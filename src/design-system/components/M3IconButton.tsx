import React from 'react';
import { LucideIcon } from 'lucide-react';
import { M3Icon, M3IconName, M3IconSize } from '../icons';

export type M3IconButtonVariant = 'standard' | 'filled' | 'tonal' | 'outlined';

export interface M3IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: M3IconButtonVariant;
  icon?: LucideIcon;
  iconName?: M3IconName;
  iconSize?: M3IconSize | number;
  selected?: boolean;
  tooltip?: string;
}

/**
 * Material Design 3 Icon Button
 * 40x40px touch target with 24px icon.
 * Variants: Standard (flat), Filled, Tonal, Outlined.
 */
export const M3IconButton: React.FC<M3IconButtonProps> = ({
  variant = 'standard',
  icon,
  iconName,
  iconSize = 'md',
  selected = false,
  tooltip,
  className = '',
  disabled,
  ...props
}) => {
  const variantClasses: Record<M3IconButtonVariant, string> = {
    standard: selected
      ? 'bg-[#005ac1]/12 text-[#005ac1]'
      : 'text-[#44474e] hover:bg-[#1c1b1f]/8 active:bg-[#1c1b1f]/12 hover:text-[#1c1b1f]',
    filled: selected
      ? 'bg-[#005ac1] text-white hover:bg-[#004899] active:bg-[#003d82]'
      : 'bg-[#f3f3fa] text-[#1c1b1f] hover:bg-[#e1e2ec] active:bg-[#d8e2ff]',
    tonal: selected
      ? 'bg-[#d8e2ff] text-[#001a41] hover:bg-[#c6d7ff]'
      : 'bg-[#f3f3fa] text-[#44474e] hover:bg-[#e8def8]/50 hover:text-[#1c1b1f]',
    outlined: selected
      ? 'border border-[#005ac1] bg-[#005ac1]/8 text-[#005ac1]'
      : 'border border-[#74777f]/30 text-[#44474e] hover:bg-[#1c1b1f]/8 hover:border-[#1c1b1f]',
  };

  return (
    <button
      className={`w-10 h-10 rounded-full inline-flex items-center justify-center transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#005ac1] disabled:opacity-40 disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
      disabled={disabled}
      title={tooltip}
      {...props}
    >
      <M3Icon icon={icon} name={iconName} size={iconSize} />
    </button>
  );
};
