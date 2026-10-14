import React from 'react';
import { LucideIcon } from 'lucide-react';
import { M3Icon, M3IconName } from '../icons';

export interface M3NavItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  iconName?: M3IconName;
  badge?: string | number | null;
}

export interface M3NavigationBarProps {
  items: M3NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
}

/**
 * Material Design 3 Navigation Bar (Bottom Navigation / Mobile Bar)
 * Features the signature M3 pill active indicator (64x32px primary container pill)
 * with label below.
 */
export const M3NavigationBar: React.FC<M3NavigationBarProps> = ({
  items,
  activeId,
  onSelect,
  className = '',
}) => {
  return (
    <nav
      className={`w-full bg-[#f3f3fa] border-t border-[#e1e2ec] px-2 py-2 flex items-center justify-around select-none ${className}`}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className="flex flex-col items-center justify-center flex-1 py-1 group focus:outline-none"
          >
            {/* Pill Container */}
            <div className="relative">
              <div
                className={`w-16 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${
                  isActive
                    ? 'bg-[#d8e2ff] text-[#001a41]'
                    : 'text-[#44474e] group-hover:bg-[#1c1b1f]/8'
                }`}
              >
                <M3Icon
                  icon={item.icon}
                  name={item.iconName}
                  size="sm"
                  className={isActive ? 'text-[#001a41]' : 'text-[#44474e]'}
                />
              </div>

              {/* Badge */}
              {item.badge !== undefined && item.badge !== null && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.5 min-w-[18px] text-[10px] font-bold bg-[#ba1a1a] text-white rounded-full flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </div>

            {/* Label */}
            <span
              className={`text-[11px] mt-1 font-semibold tracking-wider transition-colors ${
                isActive ? 'text-[#001a41]' : 'text-[#44474e]'
              }`}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

export interface M3DrawerItemProps {
  label: string;
  icon?: LucideIcon;
  iconName?: M3IconName;
  active?: boolean;
  badge?: string | number | null;
  onClick?: () => void;
  className?: string;
}

/**
 * Material Design 3 Navigation Drawer Item
 * Features full pill rounded-full selection with primaryContainer background.
 */
export const M3DrawerItem: React.FC<M3DrawerItemProps> = ({
  label,
  icon,
  iconName,
  active = false,
  badge,
  onClick,
  className = '',
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-full text-sm font-semibold transition-all duration-200 select-none ${
        active
          ? 'bg-[#d8e2ff] text-[#001a41] shadow-xs'
          : 'text-[#44474e] hover:bg-[#1c1b1f]/8 hover:text-[#1c1b1f]'
      } ${className}`}
    >
      <div className="flex items-center gap-3">
        <M3Icon
          icon={icon}
          name={iconName}
          size="md"
          className={active ? 'text-[#001a41]' : 'text-[#44474e]'}
        />
        <span>{label}</span>
      </div>

      {badge !== undefined && badge !== null && (
        <span
          className={`px-2 py-0.5 text-xs font-bold rounded-full ${
            active ? 'bg-[#005ac1] text-white' : 'bg-[#e1e2ec] text-[#44474e]'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
};
