import React, { useState } from 'react';
import { LucideIcon, AlertCircle, X } from 'lucide-react';
import { M3Icon, M3IconName } from '../icons';

export type M3TextFieldVariant = 'outlined' | 'filled';

export interface M3TextFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement>, 'size'> {
  variant?: M3TextFieldVariant;
  label?: string;
  helperText?: string;
  error?: string;
  leadingIcon?: LucideIcon;
  leadingIconName?: M3IconName;
  trailingIcon?: LucideIcon;
  trailingIconName?: M3IconName;
  onTrailingIconClick?: () => void;
  clearable?: boolean;
  onClear?: () => void;
  multiline?: boolean;
  rows?: number;
  showCharCount?: boolean;
  maxLength?: number;
}

/**
 * Material Design 3 Text Field
 * Variants:
 * - Outlined (Default, crisp border with 8px radius or full pill)
 * - Filled (Surface container background with bottom border accent)
 * Features:
 * - Floating/stacked label
 * - Leading and trailing icons
 * - Helper text & Error message with Alert icon
 * - Character count counter
 * - Single-line and Multiline textarea support
 */
export const M3TextField: React.FC<M3TextFieldProps> = ({
  variant = 'outlined',
  label,
  helperText,
  error,
  leadingIcon,
  leadingIconName,
  trailingIcon,
  trailingIconName,
  onTrailingIconClick,
  clearable = false,
  onClear,
  multiline = false,
  rows = 3,
  showCharCount = false,
  maxLength,
  value,
  defaultValue,
  onChange,
  className = '',
  disabled,
  required,
  ...props
}) => {
  const [internalVal, setInternalVal] = useState(value ?? defaultValue ?? '');
  const [isFocused, setIsFocused] = useState(false);

  const currentVal = value !== undefined ? value : internalVal;
  const strVal = String(currentVal || '');
  const hasValue = strVal.length > 0;
  const isError = Boolean(error);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (value === undefined) {
      setInternalVal(e.target.value);
    }
    onChange?.(e);
  };

  const handleClear = () => {
    if (value === undefined) {
      setInternalVal('');
    }
    onClear?.();
  };

  // Base container classes
  const containerClasses =
    variant === 'outlined'
      ? `relative rounded-xl border transition-all duration-200 bg-white ${
          disabled
            ? 'border-[#1c1b1f]/12 bg-[#1c1b1f]/4 text-[#1c1b1f]/38'
            : isError
            ? 'border-[#ba1a1a] ring-1 ring-[#ba1a1a]'
            : isFocused
            ? 'border-[#005ac1] ring-2 ring-[#005ac1]/20'
            : 'border-[#74777f]/40 hover:border-[#1c1b1f]'
        }`
      : `relative rounded-t-xl rounded-b-none border-b-2 transition-all duration-200 bg-[#f3f3fa] hover:bg-[#e8def8]/25 ${
          disabled
            ? 'border-b-[#1c1b1f]/12 bg-[#1c1b1f]/4 text-[#1c1b1f]/38'
            : isError
            ? 'border-b-[#ba1a1a] bg-[#ffdad6]/20'
            : isFocused
            ? 'border-b-[#005ac1] bg-[#d8e2ff]/20'
            : 'border-b-[#74777f]/60'
        }`;

  return (
    <div className={`w-full flex flex-col gap-1 ${className}`}>
      <div className={containerClasses}>
        {/* Label */}
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

        {/* Input row */}
        <div className="flex items-center px-3 pb-2 pt-0.5">
          {/* Leading Icon */}
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

          {/* Actual Input or Textarea */}
          {multiline ? (
            <textarea
              rows={rows}
              value={currentVal}
              onChange={handleChange}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              disabled={disabled}
              maxLength={maxLength}
              className="w-full bg-transparent text-sm text-[#1c1b1f] placeholder:text-[#74777f] focus:outline-none resize-none disabled:cursor-not-allowed leading-relaxed"
              {...props}
            />
          ) : (
            <input
              type={props.type || 'text'}
              value={currentVal}
              onChange={handleChange}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              disabled={disabled}
              maxLength={maxLength}
              className="w-full bg-transparent text-sm font-medium text-[#1c1b1f] placeholder:text-[#74777f] focus:outline-none disabled:cursor-not-allowed h-6"
              {...props}
            />
          )}

          {/* Clear button */}
          {clearable && hasValue && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-[#74777f] hover:text-[#1c1b1f] rounded-full hover:bg-[#1c1b1f]/8 transition-colors shrink-0"
              title="Clear text"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Trailing Icon */}
          {(trailingIcon || trailingIconName) && (
            <button
              type="button"
              onClick={onTrailingIconClick}
              disabled={!onTrailingIconClick || disabled}
              className={`ml-2 shrink-0 ${
                onTrailingIconClick
                  ? 'cursor-pointer p-1 rounded-full hover:bg-[#1c1b1f]/8 text-[#44474e]'
                  : 'cursor-default text-[#74777f]'
              }`}
            >
              <M3Icon icon={trailingIcon} name={trailingIconName} size="sm" />
            </button>
          )}

          {/* Error Icon */}
          {isError && !trailingIcon && !trailingIconName && (
            <div className="ml-2 text-[#ba1a1a] shrink-0">
              <AlertCircle className="w-4 h-4" />
            </div>
          )}
        </div>
      </div>

      {/* Helper text, Error message, & Character counter */}
      <div className="flex items-center justify-between px-3 text-[11px]">
        {isError ? (
          <span className="text-[#ba1a1a] font-medium flex items-center gap-1">
            {error}
          </span>
        ) : helperText ? (
          <span className="text-[#74777f]">{helperText}</span>
        ) : (
          <span />
        )}

        {showCharCount && maxLength && (
          <span className="text-[#74777f] ml-auto">
            {strVal.length}/{maxLength}
          </span>
        )}
      </div>
    </div>
  );
};
