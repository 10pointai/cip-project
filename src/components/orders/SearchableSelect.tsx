import React from 'react';

/** Typable, searchable picker used by every <select> inside the line-item rows,
 *  so all columns feel the same (type-to-filter, option list, escaped dropdown).
 *  Renders as a non-interactive text when `disabledText` is given. */
export function SearchableSelect({
  options,
  value,
  onChange,
  closedDisplay,
  placeholder = 'Type to search...',
  disabledText,
}: {
  options?: Array<{ value: string; label: string; sub?: string }>;
  value: string;
  onChange: (value: string) => void;
  /** What to show in the closed input; defaults to the selected option's label. */
  closedDisplay?: string;
  placeholder?: string;
  /** When set, renders a dimmed non-interactive placeholder instead of the picker. */
  disabledText?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const lowerQuery = query.trim().toLowerCase();
  const matches = (
    lowerQuery
      ? (options ?? []).filter(
          (o) =>
            o.label.toLowerCase().includes(lowerQuery) ||
            (o.sub ?? '').toLowerCase().includes(lowerQuery)
        )
      : options ?? []
  ).slice(0, 50);

  if (disabledText !== undefined) {
    return (
      <div className="w-full text-xs font-medium text-[var(--color-outline)] cursor-not-allowed select-none truncate">
        {disabledText}
      </div>
    );
  }

  const display = closedDisplay ?? options.find((o) => o.value === value)?.label ?? '';

  return (
    <div className="relative">
      <input
        type="text"
        value={open ? query : display}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery('');
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        placeholder={placeholder}
        className="w-full bg-transparent text-xs font-medium text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] focus:outline-none"
      />
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-max min-w-[200px] max-w-[280px] max-h-56 overflow-y-auto rounded-xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] shadow-lg">
          {matches.length === 0 ? (
            <p className="px-3 py-2.5 text-[10px] text-[var(--color-on-surface-variant)]">
              No matches for "{query}"
            </p>
          ) : (
            matches.map((o) => (
              <button
                key={o.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                  setQuery('');
                }}
                className={`w-full px-3 py-2 text-left text-[11px] hover:bg-[var(--color-surface-container)] transition-colors border-t border-[var(--color-outline-variant)]/50 first:border-t-0 ${
                  o.value === value ? 'bg-[var(--color-primary-container)]/60' : ''
                }`}
              >
                <span className="font-bold text-[var(--color-on-surface)]">{o.label}</span>
                {o.sub && (
                  <span className="block text-[9px] text-[var(--color-on-surface-variant)]">{o.sub}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}