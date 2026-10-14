import React, { useEffect } from 'react';
import { X, LucideIcon } from 'lucide-react';
import { M3Icon, M3IconName } from '../icons';

export interface M3DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  iconName?: M3IconName;
  actions?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  children: React.ReactNode;
  showCloseButton?: boolean;
}

/**
 * Material Design 3 Dialog Component
 * Uses M3 extra-large shape (rounded-[28px]), Level 5 elevation,
 * headline, optional hero icon, and action button bar.
 */
export const M3Dialog: React.FC<M3DialogProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  iconName,
  actions,
  maxWidth = 'md',
  children,
  showCloseButton = true,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#001d34]/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className={`bg-white w-full ${maxWidthClasses[maxWidth]} rounded-[28px] shadow-2xl border border-[#e1e2ec] overflow-hidden flex flex-col max-h-[90vh] transition-all`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header / Hero Icon */}
        <div className="px-6 pt-6 pb-2">
          <div className="flex items-start justify-between">
            <div>
              {(icon || iconName) && (
                <div className="w-12 h-12 rounded-2xl bg-[#d8e2ff] text-[#005ac1] flex items-center justify-center mb-3">
                  <M3Icon icon={icon} name={iconName} size="lg" />
                </div>
              )}
              {title && (
                <h2 className="text-xl font-bold text-[#1c1b1f] leading-tight">{title}</h2>
              )}
              {subtitle && (
                <p className="text-xs text-[#44474e] mt-1 leading-relaxed">{subtitle}</p>
              )}
            </div>

            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-[#74777f] hover:text-[#1c1b1f] rounded-full hover:bg-[#1c1b1f]/8 transition-colors -mr-2 -mt-2"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Dialog Content */}
        <div className="px-6 py-4 overflow-y-auto flex-1">{children}</div>

        {/* Action Button Bar */}
        {actions && (
          <div className="px-6 py-4 bg-[#f8f9fc] border-t border-[#e1e2ec] flex items-center justify-end gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};
