import React from 'react';
import { LucideIcon, Check, X } from 'lucide-react';
import { M3Icon, M3IconName } from '../icons';

export type M3ChipVariant = 'assist' | 'filter' | 'input' | 'suggestion';

export interface M3ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: M3ChipVariant;
  selected?: boolean;
  icon?: LucideIcon;
  iconName?: M3IconName;
  onDelete?: () => void;
  children: React.ReactNode;
}

/**
 * Material Design 3 Chip
 * Variants:
 * - Assist (Actions that assist user, e.g. "Add to calendar")
 * - Filter (Toggle filter options, showing checkmark when selected)
 * - Input (Tags or tokens with delete "x" button)
 * - Suggestion (Dynamic suggestions)
 */
export const M3Chip: React.FC<M3ChipProps> = ({
  variant = 'assist',
  selected = false,
  icon,
  iconName,
  onDelete,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const isFilter = variant === 'filter';
  const isInput = variant === 'input';

  const baseClasses =
    'inline-flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-semibold tracking-[0.1px] transition-all duration-150 select-none border disabled:opacity-38 disabled:cursor-not-allowed';

  const styleClasses = selected
    ? 'bg-[#d8e2ff] text-[#001a41] border-[#005ac1]/30 shadow-2xs hover:bg-[#c6d7ff]'
    : 'bg-white text-[#44474e] border-[#74777f]/30 hover:bg-[#1c1b1f]/8 hover:text-[#1c1b1f] hover:border-[#1c1b1f]';

  return (
    <button
      type="button"
      className={`${baseClasses} ${styleClasses} ${className}`}
      disabled={disabled}
      {...props}
    >
      {/* Selection Check for Filter Chip */}
      {isFilter && selected && <Check className="w-3.5 h-3.5 text-[#001a41] shrink-0" />}

      {/* Leading Icon */}
      {(!isFilter || !selected) && (icon || iconName) && (
        <M3Icon
          icon={icon}
          name={iconName}
          size="xs"
          className={selected ? 'text-[#001a41]' : 'text-[#44474e]'}
        />
      )}

      <span>{children}</span>

      {/* Trailing Delete Icon for Input Chip */}
      {isInput && onDelete && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-0.5 rounded-full hover:bg-[#1c1b1f]/12 text-[#44474e] transition-colors"
        >
          <X className="w-3 h-3" />
        </span>
      )}
    </button>
  );
};
