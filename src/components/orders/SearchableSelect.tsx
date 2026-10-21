import React from 'react';
import { createPortal } from 'react-dom';

/** Typable, searchable picker used by every <select> inside the line-item rows,
 *  so all columns feel the same (type-to-filter, option list, escaped dropdown).
 *  Renders as a non-interactive text when `disabledText` is given.
 *
 *  The option list renders through a PORTAL (fixed position from the input's
 *  live rect) so no ancestor overflow (overflow-x-auto grid/tables,
 *  overflow-hidden cards) can ever clip the expanded options. */
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
  const [menuPos, setMenuPos] = React.useState<{ left: number; top: number; minWidth: number } | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
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

  // While the menu is open, page/container scrolls REPOSITION the list next to
  // its input (scroll chaining from the list into the page never closes it —
  // that's how long option lists are browsed with the wheel). The menu closes
  // only when the input scrolls out of the viewport, or on a resize.
  // (Runs before the `disabledText` early return below — hook order must
  // never change between renders.)
  React.useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const el = inputRef.current;
      if (!el) return setOpen(false);
      const r = el.getBoundingClientRect();
      // The anchor scrolled out of sight → the list has nowhere useful to sit
      if (r.bottom < 48 || r.top > window.innerHeight - 48) return setOpen(false);
      const MENU_H = 232; // max-h-56 + margins
      setMenuPos({
        left: Math.max(8, r.left),
        top: window.innerHeight - r.bottom < MENU_H && r.top > MENU_H + 12 ? r.top - MENU_H - 4 : r.bottom + 1,
        minWidth: Math.max(r.width, 200),
      });
    };
    const onResize = () => setOpen(false);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  if (disabledText !== undefined) {
    return (
      <div className="w-full text-xs font-medium text-[var(--color-outline)] cursor-not-allowed select-none truncate">
        {disabledText}
      </div>
    );
  }

  const display = closedDisplay ?? options.find((o) => o.value === value)?.label ?? '';

  // Position the portal menu off the input's live rect — flipping ABOVE the
  // input when there is not enough room underneath it.
  const openMenu = () => {
    const el = inputRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const MENU_H = 232; // max-h-56 + margins
      setMenuPos({
        left: Math.max(8, r.left),
        top: window.innerHeight - r.bottom < MENU_H && r.top > MENU_H + 12 ? r.top - MENU_H - 4 : r.bottom + 1,
        minWidth: Math.max(r.width, 200),
      });
    }
    setQuery('');
    setOpen(true);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={open ? query : display}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={openMenu}
        onBlur={() => setOpen(false)}
        placeholder={placeholder}
        className="w-full bg-transparent text-xs font-medium text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] focus:outline-none"
      />
      {open && menuPos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', left: menuPos.left, top: menuPos.top, minWidth: menuPos.minWidth, maxWidth: 320 }}
          className="z-[70] max-h-56 overflow-y-auto rounded-xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] shadow-lg"
          onMouseDown={(e) => e.preventDefault()}
        >
          {matches.length === 0 ? (
            <p className="px-3 py-2.5 text-[10px] text-[var(--color-on-surface-variant)]">
              No matches for "{query}"
            </p>
          ) : (
            matches.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                  setQuery('');
                }}
                className={`w-full px-3 py-2 text-left text-[11px] hover:bg-[var(--color-surface-container)] transition-colors border-t border-[var(--color-outline-variant)]/50 first:border-t-0 ${
                  o.value === value ? 'bg-[var(--color-primary-container)]/60' : ''
                }`}
              >
                <span className="font-bold text-[var(--color-on-surface)] truncate block">{o.label}</span>
                {o.sub && (
                  <span className="block text-[9px] text-[var(--color-on-surface-variant)] truncate">{o.sub}</span>
                )}
              </button>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  );
}