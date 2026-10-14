import React from 'react';

export type M3CardVariant = 'elevated' | 'filled' | 'outlined';

export interface M3CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: M3CardVariant;
  interactive?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

/**
 * Material Design 3 Card Component
 * Variants:
 * - Elevated: Surface color with Level 1 elevation (shadow-xs), rises to Level 2 on hover
 * - Filled: Surface-container background (#f8f9fc / #f3f3fa) with flat elevation
 * - Outlined: Surface color with crisp 1px outline (#e1e2ec)
 */
export const M3Card: React.FC<M3CardProps> = ({
  variant = 'outlined',
  interactive = false,
  padding = 'md',
  children,
  className = '',
  ...props
}) => {
  const paddingClasses = {
    none: 'p-0',
    sm: 'p-3 sm:p-4',
    md: 'p-4 sm:p-6',
    lg: 'p-6 sm:p-8',
  };

  const variantClasses: Record<M3CardVariant, string> = {
    elevated:
      'bg-white text-[#1c1b1f] shadow-xs border border-[#e1e2ec]/60' +
      (interactive
        ? ' hover:shadow-md hover:border-[#005ac1]/30 transition-all duration-200 cursor-pointer active:scale-[0.99]'
        : ''),
    filled:
      'bg-[#f8f9fc] text-[#1c1b1f] border border-transparent' +
      (interactive
        ? ' hover:bg-[#f3f3fa] hover:border-[#e1e2ec] transition-all duration-200 cursor-pointer active:scale-[0.99]'
        : ''),
    outlined:
      'bg-white text-[#1c1b1f] border border-[#e1e2ec]' +
      (interactive
        ? ' hover:border-[#005ac1] hover:shadow-xs transition-all duration-200 cursor-pointer active:scale-[0.99]'
        : ''),
  };

  return (
    <div
      className={`rounded-2xl overflow-hidden transition-all ${variantClasses[variant]} ${paddingClasses[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
