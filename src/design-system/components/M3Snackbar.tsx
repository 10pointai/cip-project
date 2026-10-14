import React from 'react';
import { X, LucideIcon } from 'lucide-react';
import { M3Icon, M3IconName } from '../icons';

export interface M3SnackbarProps {
  message: string;
  isOpen: boolean;
  onClose?: () => void;
  actionLabel?: string;
  onAction?: () => void;
  icon?: LucideIcon;
  iconName?: M3IconName;
  duration?: number;
  className?: string;
}

/**
 * Material Design 3 Snackbar Component
 * Follows M3 inverse surface tokens (#313033) with inverse on-surface (#f4eff4)
 * and inverse primary action button.
 */
export const M3Snackbar: React.FC<M3SnackbarProps> = ({
  message,
  isOpen,
  onClose,
  actionLabel,
  onAction,
  icon,
  iconName,
  className = '',
}) => {
  if (!isOpen) return null;

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center justify-between gap-4 px-4 py-3 min-w-[320px] max-w-md bg-[#313033] text-[#f4eff4] rounded-xl shadow-lg animate-in fade-in slide-in-from-bottom-3 duration-200 ${className}`}
    >
      <div className="flex items-center gap-3">
        {(icon || iconName) && (
          <M3Icon icon={icon} name={iconName} size="sm" className="text-[#adc6ff] shrink-0" />
        )}
        <span className="text-xs sm:text-sm font-medium leading-tight">{message}</span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {actionLabel && (
          <button
            type="button"
            onClick={onAction}
            className="text-xs font-bold text-[#adc6ff] hover:text-white uppercase tracking-wider px-2 py-1 rounded hover:bg-white/10 transition-colors"
          >
            {actionLabel}
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-[#c4c6cf] hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
