import React from 'react';
import { LucideIcon } from 'lucide-react';
import { M3Icon, M3IconName } from '../icons';

export type M3BadgeTone = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface M3BadgeProps {
  label: React.ReactNode;
  tone?: M3BadgeTone;
  icon?: LucideIcon;
  iconName?: M3IconName;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Material Design 3 Badge & Status Pill
 * Used for record statuses, categories, counts, and indicators.
 */
export const M3Badge: React.FC<M3BadgeProps> = ({
  label,
  tone = 'neutral',
  icon,
  iconName,
  size = 'md',
  className = '',
}) => {
  const toneClasses: Record<M3BadgeTone, string> = {
    primary: 'bg-[#d8e2ff] text-[#001a41] border-[#005ac1]/20',
    secondary: 'bg-[#dbe2f9] text-[#141b2c] border-[#575e71]/20',
    success: 'bg-[#b7f397] text-[#042100] border-[#386a20]/20',
    warning: 'bg-[#ffdcbe] text-[#2d1600] border-[#8c5000]/20',
    error: 'bg-[#ffdad6] text-[#410002] border-[#ba1a1a]/20',
    info: 'bg-[#cee5ff] text-[#001d32] border-[#00639b]/20',
    neutral: 'bg-[#f3f3fa] text-[#44474e] border-[#e1e2ec]',
  };

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5 gap-1 font-bold',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-semibold',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border tracking-wide select-none ${toneClasses[tone]} ${sizeClasses[size]} ${className}`}
    >
      {(icon || iconName) && (
        <M3Icon icon={icon} name={iconName} size={size === 'sm' ? 'xs' : 'sm'} className="shrink-0" />
      )}
      <span className="whitespace-nowrap">{label}</span>
    </span>
  );
};
