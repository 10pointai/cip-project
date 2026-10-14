import React from 'react';
import { LogOut, AlertTriangle, ShieldCheck, X } from 'lucide-react';
import { AppUser } from '../../types';

interface SignOutConfirmModalProps {
  isOpen: boolean;
  currentUser: AppUser | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SignOutConfirmModal({
  isOpen,
  currentUser,
  onConfirm,
  onCancel,
}: SignOutConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="w-full max-w-sm bg-[var(--color-surface-container-lowest)] rounded-3xl border border-[var(--color-outline-variant)] shadow-2xl overflow-hidden animate-scaleUp">
        {/* Header */}
        <div className="p-5 pb-3 border-b border-[var(--color-outline-variant)] flex items-center justify-between bg-[var(--color-surface-container-low)]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--color-error-container)]/70 text-[var(--color-error)]">
              <LogOut className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-on-surface)]">Sign Out</h3>
              <p className="text-xs text-[var(--color-on-surface-variant)]">Terminate current work session</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-full text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-highest)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-3">
          <p className="text-sm text-[var(--color-on-surface)]">
            Are you sure you want to sign out, <strong className="text-[var(--color-primary)]">{currentUser?.fullName || 'User'}</strong>?
          </p>

          <div className="p-3 rounded-2xl bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] text-xs text-[var(--color-on-surface-variant)] space-y-1.5">
            <div className="flex items-center gap-2 text-[var(--color-on-surface)] font-semibold">
              <ShieldCheck className="w-4 h-4 text-[var(--color-primary)]" />
              <span>Session & Data Safety</span>
            </div>
            <p>
              Your token will be cleared and the application will lock into the secure Sign In screen. All saved entries and vouchers remain intact.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 bg-[var(--color-surface-container-low)] border-t border-[var(--color-outline-variant)] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-bold text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 bg-[var(--color-error)] hover:opacity-90 text-[var(--color-on-error)] text-xs font-bold rounded-xl transition-all shadow-2xs flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
