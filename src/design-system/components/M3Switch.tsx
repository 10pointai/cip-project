import React from 'react';
import { Check } from 'lucide-react';

export interface M3SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  showIcon?: boolean;
  className?: string;
}

/**
 * Material Design 3 Switch Component
 * Features standard 52x32mm proportion, animated handle, and optional state icon.
 */
export const M3Switch: React.FC<M3SwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  showIcon = false,
  className = '',
}) => {
  return (
    <label
      className={`inline-flex items-center gap-3 cursor-pointer select-none ${
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      } ${className}`}
    >
      <div className="relative inline-flex items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only"
        />

        {/* Track */}
        <div
          className={`w-12 h-7 rounded-full border-2 transition-colors duration-200 ${
            checked
              ? 'bg-[#005ac1] border-[#005ac1]'
              : 'bg-[#e6e0e9] border-[#74777f]/40 hover:border-[#1c1b1f]'
          }`}
        />

        {/* Thumb / Handle */}
        <div
          className={`absolute left-1 w-5 h-5 rounded-full transition-transform duration-200 flex items-center justify-center ${
            checked
              ? 'translate-x-5 bg-white shadow-xs'
              : 'translate-x-0 bg-[#74777f] hover:bg-[#44474e]'
          }`}
        >
          {showIcon && checked && <Check className="w-3 h-3 text-[#005ac1] stroke-[3]" />}
        </div>
      </div>

      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <span className="text-sm font-semibold text-[#1c1b1f] leading-tight">{label}</span>
          )}
          {description && (
            <span className="text-xs text-[#74777f] mt-0.5">{description}</span>
          )}
        </div>
      )}
    </label>
  );
};
