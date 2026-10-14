import React from 'react';
import {
  LayoutDashboard,
  Users,
  Settings,
  Package,
  Layers,
  Truck,
  FileText,
  Building2,
  UserCheck,
  HardHat,
  ChevronRight,
  Shield,
  ShieldCheck,
  X,
  Boxes,
  Warehouse,
  ArrowUpRight,
  ArrowDownLeft,
  Contact,
  Sparkles,
  Landmark,
  FolderOpen,
  LogOut,
  KeyRound,
  User,
} from 'lucide-react';
import { CompanySettings, UserPermissions } from '../../types';
import { useAuth } from '../../context/AuthContext';

export type NavigationTab =
  | 'dashboard'
  | 'parties'
  | 'cash-bank'
  | 'items'
  | 'evidence'
  | 'settings'
  | 'logistics'
  | 'sales'
  | 'purchases'
  | 'production'
  | 'employees'
  | 'users'
  | 'design-system';

interface SidebarProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  partiesCount: number;
  itemsCount?: number;
  salesCount?: number;
  purchasesCount?: number;
  accountsCount?: number;
  settings: CompanySettings;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  employeesCount?: number;
  onOpenAuthModal?: () => void;
  onRequestSignOut?: () => void;
}

export function Sidebar({
  activeTab,
  onSelectTab,
  partiesCount,
  itemsCount = 0,
  salesCount = 0,
  purchasesCount = 0,
  accountsCount = 0,
  settings,
  isOpenMobile,
  onCloseMobile,
  employeesCount = 0,
  onOpenAuthModal,
  onRequestSignOut,
}: SidebarProps) {
  const { currentUser, logout, isAuthenticated, hasPermission } = useAuth();

  const allNavItems: Array<{
    id: NavigationTab;
    label: string;
    icon: any;
    badge: React.ReactNode;
    permissionCheck?: (has: (k: keyof UserPermissions) => boolean) => boolean;
  }> = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null,
      permissionCheck: (has) => has('view_dashboard'),
    },
    {
      id: 'parties',
      label: 'Parties',
      icon: Users,
      badge: partiesCount,
      permissionCheck: (has) => has('manage_parties') || has('record_payments'),
    },
    {
      id: 'cash-bank',
      label: 'Cash & Bank',
      icon: Landmark,
      badge: accountsCount > 0 ? accountsCount : null,
      permissionCheck: (has) => has('manage_cash_bank'),
    },
    {
      id: 'items',
      label: 'Inventory',
      icon: Boxes,
      badge: itemsCount,
      permissionCheck: (has) => has('manage_inventory'),
    },
    {
      id: 'sales',
      label: 'Sales',
      icon: ArrowUpRight,
      badge: salesCount > 0 ? salesCount : null,
      permissionCheck: (has) => has('manage_sales'),
    },
    {
      id: 'purchases',
      label: 'Purchases',
      icon: ArrowDownLeft,
      badge: purchasesCount > 0 ? purchasesCount : null,
      permissionCheck: (has) => has('manage_purchases'),
    },
    {
      id: 'production',
      label: 'Production',
      icon: Building2,
      badge: null,
      permissionCheck: (has) => has('manage_production'),
    },
    {
      id: 'logistics',
      label: 'Fleets',
      icon: Truck,
      badge: null,
      permissionCheck: (has) => has('manage_fleet'),
    },
    {
      id: 'employees',
      label: 'Employees',
      icon: Contact,
      badge: employeesCount > 0 ? employeesCount : null,
      permissionCheck: (has) => has('manage_employees'),
    },
    {
      id: 'evidence',
      label: 'Document Vault',
      icon: FolderOpen,
      badge: null,
      permissionCheck: (has) => has('manage_evidence'),
    },
    {
      id: 'users',
      label: 'User Management',
      icon: ShieldCheck,
      badge: 'Admin',
      permissionCheck: (has) => has('manage_users'),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      badge: null,
      permissionCheck: (has) => has('manage_settings'),
    },
    {
      id: 'design-system',
      label: 'Design System',
      icon: Sparkles,
      badge: 'M3',
      permissionCheck: (has) => has('manage_settings'),
    },
  ];

  const primaryNavItems = allNavItems.filter((item) => {
    if (!currentUser) return false;
    if (currentUser.role === 'super_admin') return true;
    if (!item.permissionCheck) return true;
    return item.permissionCheck(hasPermission);
  });

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-[var(--color-scrim)]/40 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-72 bg-[var(--color-surface-container)] text-[var(--color-on-surface)] border-r border-[var(--color-outline-variant)] flex flex-col justify-between transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)]/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] flex items-center justify-center font-black shadow-md shadow-[var(--color-primary)]/20 shrink-0">
                <HardHat className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-[var(--color-on-surface)] tracking-tight truncate">
                  {settings.tradeName || settings.companyName}
                </h1>
                <p className="text-[11px] text-[var(--color-primary)] font-bold uppercase tracking-wider">
                  Operations Suite
                </p>
              </div>
            </div>

            {/* Mobile close button */}
            <button
              onClick={onCloseMobile}
              className="lg:hidden p-1.5 text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] rounded-full hover:bg-[var(--color-surface-container-high)]"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Body */}
        <div className="p-3 space-y-6 overflow-y-auto flex-1">
          {/* Main Modules */}
          <div>
            <p className="px-4 text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-2">
              Core Operations
            </p>
            <div className="space-y-1">
              {primaryNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onSelectTab(item.id);
                      onCloseMobile();
                    }}
                    className={`w-full flex items-center justify-between px-4 py-2.5 rounded-full font-medium text-xs transition-all ${
                      isActive
                        ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-xs'
                        : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 ${
                        isActive
                          ? 'text-[var(--color-on-primary)]'
                          : 'text-[var(--color-on-surface-variant)]'
                      }`} />
                      <span className="truncate">{item.label}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.badge !== null && (
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            isActive ? 'bg-[var(--color-on-primary)] text-[var(--color-primary)]' : 'bg-[var(--color-surface-container-highest)] text-[var(--color-on-surface)]'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>


        </div>

        {/* User Session Status */}
        <div className="p-3 border-t border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)]">
          {currentUser ? (
            <div className="p-2 rounded-2xl bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs uppercase shrink-0 ${
                    currentUser.role === 'super_admin'
                      ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                      : 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'
                  }`}>
                    {currentUser.fullName.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[var(--color-on-surface)] truncate">
                      {currentUser.fullName}
                    </p>
                    <p className="text-[10px] font-mono text-[var(--color-primary)] truncate">
                      @{currentUser.username}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (onRequestSignOut) {
                      onRequestSignOut();
                    } else {
                      logout();
                    }
                  }}
                  className="p-1.5 rounded-lg text-[var(--color-on-surface-variant)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-container)]/30 transition-all shrink-0"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={onOpenAuthModal}
              className="w-full py-2 px-3 bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold rounded-2xl flex items-center justify-center gap-1.5 hover:opacity-95 transition-all shadow-2xs"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Sign In / Set Password</span>
            </button>
          )}
        </div>

        {/* Footer Plant Badge */}
        <div className="p-3 border-t border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)]/60">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[var(--color-success)] animate-pulse"></div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[var(--color-on-surface)] truncate">
                Local Database Active
              </p>
              <p className="text-[10px] text-[var(--color-on-surface-variant)] truncate">
                GSTIN: {settings.gstin}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
