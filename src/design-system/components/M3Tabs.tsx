import React from 'react';
import { LucideIcon } from 'lucide-react';
import { M3Icon, M3IconName } from '../icons';

export interface M3TabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  iconName?: M3IconName;
  badge?: string | number | null;
}

export interface M3TabsProps {
  tabs: M3TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: 'primary' | 'secondary';
  className?: string;
}

/**
 * Material Design 3 Tabs Component
 * - Primary: Underline indicator with primary blue accent
 * - Secondary: Pill-based tab container
 */
export const M3Tabs: React.FC<M3TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = 'primary',
  className = '',
}) => {
  if (variant === 'secondary') {
    return (
      <div className={`inline-flex p-1 bg-[var(--color-surface-container)] rounded-full border border-[var(--color-outline-variant)] gap-1 ${className}`}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 select-none ${
                isActive
                  ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-xs'
                  : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)]'
              }`}
            >
              {(tab.icon || tab.iconName) && (
                <M3Icon
                  icon={tab.icon}
                  name={tab.iconName}
                  size="xs"
                  className={isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-on-surface-variant)]'}
                />
              )}
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge !== null && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    isActive
                      ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'
                      : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`w-full border-b border-[var(--color-outline-variant)] flex gap-2 sm:gap-6 overflow-x-auto ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`group relative flex items-center gap-2 py-3 px-2 text-sm font-semibold transition-colors duration-150 whitespace-nowrap focus:outline-none ${
              isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
            }`}
          >
            {(tab.icon || tab.iconName) && (
              <M3Icon
                icon={tab.icon}
                name={tab.iconName}
                size="sm"
                className={isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-on-surface-variant)] group-hover:text-[var(--color-on-surface)]'}
              />
            )}
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge !== null && (
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  isActive
                    ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'
                    : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)]'
                }`}
              >
                {tab.badge}
              </span>
            )}

            {/* M3 Active Underline Indicator */}
            {isActive && (
              <span className="absolute bottom-0 inset-x-0 h-0.75 bg-[var(--color-primary)] rounded-t-full" />
            )}
          </button>
        );
      })}
    </div>
  );
};
