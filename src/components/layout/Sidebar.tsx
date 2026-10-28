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
  ChevronLeft,
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
  Disc,
  FolderOpen,
  LogOut,
  KeyRound,
  User,
} from 'lucide-react';
import { CompanySettings, UserPermissions } from '../../types';
import { useAuth } from '../../context/AuthContext';

/** Tracks the lg breakpoint (1024px) — collapse only ever applies on the
 *  desktop layout; the mobile drawer always renders expanded. */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = React.useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false
  );
  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

export type NavigationTab =
  | 'dashboard'
  | 'parties'
  | 'cash-bank'
  | 'items'
  | 'evidence'
  | 'settings'
  | 'logistics'
  | 'tyre-management'
  | 'sales'
  | 'purchases'
  | 'production'
  | 'employees'
  | 'users'
  | 'design-system';

interface SidebarProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  /** Desktop collapse: rail of icons with hover-name tooltips */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
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
  collapsed = false,
  onToggleCollapsed,
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
      // Count badges REMOVED (2026-10-28 user directive) — no numbers against
      // sidebar features; the counts machinery (props above) is kept for revert.
      badge: null,
      permissionCheck: (has) => has('manage_parties') || has('record_payments'),
    },
    {
      id: 'cash-bank',
      label: 'Cash & Bank',
      icon: Landmark,
      badge: null,
      permissionCheck: (has) => has('manage_cash_bank'),
    },
    {
      id: 'items',
      label: 'Inventory',
      icon: Boxes,
      badge: null,
      permissionCheck: (has) => has('manage_inventory'),
    },
    {
      id: 'sales',
      label: 'Sales',
      icon: ArrowUpRight,
      badge: null,
      permissionCheck: (has) => has('manage_sales'),
    },
    {
      id: 'purchases',
      label: 'Purchases',
      icon: ArrowDownLeft,
      badge: null,
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
      id: 'tyre-management',
      label: 'Tyre Management',
      icon: Disc,
      badge: null,
      permissionCheck: (has) => has('manage_tyres'),
    },
    {
      id: 'employees',
      label: 'Employees',
      icon: Contact,
      // Count badge removed (user directive — no numbers against features)
      badge: null,
      permissionCheck: (has) => has('manage_employees'),
    },
    // {
    //   id: 'evidence',
    //   label: 'Document Vault',
    //   icon: FolderOpen,
    //   badge: null,
    //   permissionCheck: (has) => has('manage_evidence'),
    // },
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
    // {
    //   id: 'design-system',
    //   label: 'Design Systems',
    //   icon: Sparkles,
    //   badge: 'M3',
    //   permissionCheck: (has) => has('manage_settings'),
    // },
  ];

  const primaryNavItems = allNavItems.filter((item) => {
    if (!currentUser) return false;
    if (currentUser.role === 'super_admin') return true;
    if (!item.permissionCheck) return true;
    return item.permissionCheck(hasPermission);
  });

  // Collapse only ever applies on the desktop layout — the mobile drawer
  // (hamburger overlay) always renders expanded.
  const isDesktop = useIsDesktop();
  const isRail = isDesktop && collapsed;

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
        className={`fixed top-0 bottom-0 left-0 z-40 ${isRail ? 'w-[76px]' : 'w-72'} bg-[var(--color-surface-container)] text-[var(--color-on-surface)] border-r border-[var(--color-outline-variant)] flex flex-col justify-between transition-all duration-300 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className={`${isRail ? 'px-2 py-4' : 'p-5'} border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)]/60`}>
          <div className={`flex ${isRail ? 'flex-col items-center gap-2.5' : 'items-center justify-between'}`}>
            <div className={`flex ${isRail ? 'justify-center' : 'items-center gap-3'} min-w-0`}>
              <div
                className="w-10 h-10 rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] flex items-center justify-center font-black shadow-md shadow-[var(--color-primary)]/20 shrink-0"
                title={isRail ? (settings.tradeName || settings.companyName) : undefined}
              >
                <HardHat className="w-5 h-5" />
              </div>
              {!isRail && (
                <div className="min-w-0">
                  <h1 className="text-sm font-bold text-[var(--color-on-surface)] tracking-tight truncate">
                    {settings.tradeName || settings.companyName}
                  </h1>
                  <p className="text-[11px] text-[var(--color-primary)] font-bold uppercase tracking-wider">
                    Operations Suite
                  </p>
                </div>
              )}
            </div>

            {/* Collapse / expand toggle (desktop only; collapsed = icon rail
                with hover-name tooltips) */}
            <button
              type="button"
              onClick={onToggleCollapsed}
              title={isRail ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={isRail ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden lg:flex p-1.5 rounded-full text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] transition-colors"
            >
              {isRail ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>

            {/* Mobile close button */}
            <button
              onClick={onCloseMobile}
              className={`lg:hidden p-1.5 text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] rounded-full hover:bg-[var(--color-surface-container-high)] ${isRail ? 'hidden' : ''}`}
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
            {!isRail && (
              <p className="px-4 text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-2">
                Core Operations
              </p>
            )}
            <div className={isRail ? 'space-y-2 flex flex-col items-center' : 'space-y-1'}>
              {primaryNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const hrefTitle = `${item.label}${item.badge !== null ? ` · ${item.badge}` : ''}`;

                if (isRail) {
                  // RAIL ITEM: icon only (name on hover via title tooltip)
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onSelectTab(item.id);
                        onCloseMobile();
                      }}
                      title={hrefTitle}
                      aria-label={item.label}
                      className={`group relative w-full flex items-center justify-center py-2.5 rounded-full transition-all ${
                        isActive
                          ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-xs'
                          : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)]'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {item.badge !== null && (
                        <span
                          className={`absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full ${
                            isActive ? 'bg-[var(--color-on-primary)]' : 'bg-[var(--color-primary)]'
                          }`}
                        />
                      )}
                    </button>
                  );
                }

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
        <div className={`${isRail ? 'px-2 py-3 flex flex-col items-center gap-2' : 'p-3'} border-t border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)]`}>
          {isRail ? (
            currentUser ? (
              <>
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs uppercase shrink-0 ${
                    currentUser.role === 'super_admin'
                      ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                      : 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'
                  }`}
                  title={`${currentUser.fullName} (@${currentUser.username})`}
                >
                  {currentUser.fullName.charAt(0)}
                </div>
                <button
                  onClick={() => {
                    if (onRequestSignOut) {
                      onRequestSignOut();
                    } else {
                      logout();
                    }
                  }}
                  className="p-1.5 rounded-lg text-[var(--color-on-surface-variant)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-container)]/30 transition-all"
                  title="Sign Out"
                  aria-label="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <button
                onClick={onOpenAuthModal}
                className="p-2 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] hover:opacity-95 transition-all shadow-2xs"
                title="Sign In / Set Password"
                aria-label="Sign In / Set Password"
              >
                <KeyRound className="w-3.5 h-3.5" />
              </button>
            )
          ) : currentUser ? (
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

      </aside>
    </>
  );
}
