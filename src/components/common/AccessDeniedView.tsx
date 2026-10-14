import React from 'react';
import { ShieldAlert, ArrowLeft, Lock, KeyRound } from 'lucide-react';
import { NavigationTab } from '../layout/Sidebar';
import { useAuth } from '../../context/AuthContext';

interface AccessDeniedViewProps {
  tab: NavigationTab;
  requiredPermissionName: string;
  onNavigateToAllowed?: () => void;
}

export function AccessDeniedView({
  tab,
  requiredPermissionName,
  onNavigateToAllowed,
}: AccessDeniedViewProps) {
  const { currentUser } = useAuth();

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 animate-fadeIn">
      <div className="p-8 sm:p-10 rounded-[32px] bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] shadow-lg text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-[var(--color-error-container)]/70 text-[var(--color-error)] flex items-center justify-center shadow-inner">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-[var(--color-error-container)] text-[var(--color-on-error-container)]">
            <Lock className="w-3.5 h-3.5 text-[var(--color-error)]" />
            <span>Access Restricted</span>
          </div>

          <h2 className="text-2xl font-black text-[var(--color-on-surface)] tracking-tight">
            Restricted Module: {tab.replace('-', ' ').toUpperCase()}
          </h2>

          <p className="text-sm text-[var(--color-on-surface-variant)] max-w-md mx-auto">
            Your account <strong className="text-[var(--color-on-surface)]">@{currentUser?.username}</strong> ({currentUser?.role.replace('_', ' ')}) does not possess the <strong className="text-[var(--color-error)]">"{requiredPermissionName}"</strong> administrative authorization.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] text-xs text-[var(--color-on-surface-variant)] text-left space-y-2">
          <div className="flex items-center gap-2 font-bold text-[var(--color-on-surface)]">
            <KeyRound className="w-4 h-4 text-[var(--color-primary)]" />
            <span>How to gain access?</span>
          </div>
          <p>
            Contact your Organization Super Admin to modify your profile privileges in <strong>User & Access Management</strong>. Role-Based Access Control (RBAC) enforces strict separation of duties across Plant, Fleet, Inventory, and Accounting books.
          </p>
        </div>

        {onNavigateToAllowed && (
          <div className="pt-2">
            <button
              onClick={onNavigateToAllowed}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold shadow-xs hover:opacity-95 transition-all hover:scale-[1.02] active:scale-95"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Permitted View</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
