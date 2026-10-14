import React from 'react';
import { LucideIcon } from 'lucide-react';
import { M3Icon, M3IconName } from '../icons';

export type M3FABSize = 'small' | 'medium' | 'large';
export type M3FABColor = 'primary' | 'secondary' | 'tertiary' | 'surface';

export interface M3FABProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: M3FABSize;
  color?: M3FABColor;
  icon?: LucideIcon;
  iconName?: M3IconName;
  label?: string; // If label is provided, it turns into an Extended FAB
  lowered?: boolean;
}

/**
 * Material Design 3 Floating Action Button (FAB)
 * Standard (56px), Small (40px), Large (96px), and Extended FAB.
 * Level 3 Elevation with standard M3 shape tokens.
 */
export const M3FAB: React.FC<M3FABProps> = ({
  size = 'medium',
  color = 'primary',
  icon,
  iconName,
  label,
  lowered = false,
  className = '',
  disabled,
  ...props
}) => {
  const isExtended = Boolean(label);

  const colorClasses: Record<M3FABColor, string> = {
    primary: 'bg-[#d8e2ff] text-[#001a41] hover:bg-[#c4d6ff] active:bg-[#b0cbff]',
    secondary: 'bg-[#dbe2f9] text-[#141b2c] hover:bg-[#c7d2f3] active:bg-[#b5c3ed]',
    tertiary: 'bg-[#fbd7fc] text-[#29132d] hover:bg-[#f6c6f8] active:bg-[#f1b4f4]',
    surface: 'bg-[#fdfbff] text-[#005ac1] border border-[#e1e2ec] hover:bg-[#f3f3fa] active:bg-[#ece6f0]',
  };

  const elevationClasses = lowered
    ? 'shadow-xs hover:shadow-sm'
    : 'shadow-md hover:shadow-lg active:shadow-sm';

  const sizeClasses = isExtended
    ? 'h-14 px-6 rounded-2xl gap-3 text-sm font-semibold tracking-[0.1px]'
    : size === 'small'
    ? 'w-10 h-10 rounded-xl'
    : size === 'large'
    ? 'w-24 h-24 rounded-[28px]'
    : 'w-14 h-14 rounded-2xl';

  const iconSize = size === 'small' ? 'sm' : size === 'large' ? 'xl' : 'md';

  return (
    <button
      className={`inline-flex items-center justify-center transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#005ac1] disabled:opacity-50 disabled:cursor-not-allowed ${colorClasses[color]} ${elevationClasses} ${sizeClasses} ${className}`}
      disabled={disabled}
      {...props}
    >
      {(icon || iconName) && (
        <M3Icon icon={icon} name={iconName} size={iconSize} className="shrink-0" />
      )}
      {isExtended && <span>{label}</span>}
    </button>
  );
};
