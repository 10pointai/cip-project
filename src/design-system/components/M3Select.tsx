import React, { useState } from 'react';
import { ChevronDown, LucideIcon, AlertCircle } from 'lucide-react';
import { M3Icon, M3IconName } from '../icons';

export interface M3SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
  hint?: string;
}

export interface M3SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  helperText?: string;
  error?: string;
  leadingIcon?: LucideIcon;
  leadingIconName?: M3IconName;
  options?: M3SelectOption[];
  placeholder?: string;
}

/**
 * Material Design 3 Select / Dropdown Component
 * Clean outlined container, floating label, custom dropdown chevron, error handling.
 */
export const M3Select: React.FC<M3SelectProps> = ({
  label,
  helperText,
  error,
  leadingIcon,
  leadingIconName,
  options = [],
  placeholder,
  value,
  defaultValue,
  onChange,
  className = '',
  disabled,
  required,
  children,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const isError = Boolean(error);

  const containerClasses = `relative rounded-xl border transition-all duration-200 bg-white ${
    disabled
      ? 'border-[#1c1b1f]/12 bg-[#1c1b1f]/4 text-[#1c1b1f]/38'
      : isError
      ? 'border-[#ba1a1a] ring-1 ring-[#ba1a1a]'
      : isFocused
      ? 'border-[#005ac1] ring-2 ring-[#005ac1]/20'
      : 'border-[#74777f]/40 hover:border-[#1c1b1f]'
  }`;

  return (
    <div className={`w-full flex flex-col gap-1 ${className}`}>
      <div className={containerClasses}>
        {label && (
          <label
            className={`block px-3 pt-2 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
              disabled
                ? 'text-[#1c1b1f]/38'
                : isError
                ? 'text-[#ba1a1a]'
                : isFocused
                ? 'text-[#005ac1]'
                : 'text-[#44474e]'
            }`}
          >
            {label}
            {required && <span className="text-[#ba1a1a] ml-0.5">*</span>}
          </label>
        )}

        <div className="flex items-center px-3 pb-2 pt-0.5 relative">
          {(leadingIcon || leadingIconName) && (
            <div
              className={`mr-2.5 shrink-0 ${
                disabled
                  ? 'text-[#1c1b1f]/38'
                  : isError
                  ? 'text-[#ba1a1a]'
                  : isFocused
                  ? 'text-[#005ac1]'
                  : 'text-[#44474e]'
              }`}
            >
              <M3Icon icon={leadingIcon} name={leadingIconName} size="sm" />
            </div>
          )}

          <select
            value={value}
            defaultValue={defaultValue}
            onChange={onChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={disabled}
            className="w-full bg-transparent text-sm font-medium text-[#1c1b1f] focus:outline-none appearance-none pr-8 cursor-pointer disabled:cursor-not-allowed h-6"
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.length > 0
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                    {opt.label} {opt.hint ? `(${opt.hint})` : ''}
                  </option>
                ))
              : children}
          </select>

          {/* Custom Chevron Indicator */}
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#74777f]">
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Helper text or error */}
      {(error || helperText) && (
        <div className="px-3 text-[11px]">
          {isError ? (
            <span className="text-[#ba1a1a] font-medium flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 inline" /> {error}
            </span>
          ) : (
            <span className="text-[#74777f]">{helperText}</span>
          )}
        </div>
      )}
    </div>
  );
};
