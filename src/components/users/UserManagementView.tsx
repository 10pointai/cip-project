import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Users,
  Shield,
  ShieldCheck,
  ShieldAlert,
  UserPlus,
  Search,
  Filter,
  Copy,
  Check,
  RefreshCw,
  MoreVertical,
  Edit2,
  Trash2,
  UserX,
  UserCheck,
  Lock,
  KeyRound,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Send,
  ExternalLink,
  Mail,
  Phone,
  Sparkles,
  Layers,
  ChevronDown,
  Info,
} from 'lucide-react';
import { AppUser, UserRole, UserStatus, UserPermissions } from '../../types';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../common/Toast';
import { formatDate } from '../../utils/formatters';

const ALL_PERMISSION_KEYS: Array<{ key: keyof UserPermissions; label: string; category: string; description: string }> = [
  { key: 'view_dashboard', label: 'View Dashboard', category: 'General', description: 'Access main KPI overview and metrics' },
  { key: 'view_financial_metrics', label: 'View Financial Metrics', category: 'Finance', description: 'Inspect receivables, payables, and net balances' },
  { key: 'manage_parties', label: 'Manage Parties', category: 'Finance', description: 'Create and edit customers, vendors, and transporters' },
  { key: 'record_payments', label: 'Record Payments', category: 'Finance', description: 'Record payment-in and payment-out vouchers' },
  { key: 'manage_cash_bank', label: 'Cash & Bank Accounts', category: 'Finance', description: 'Manage accounts, internal transfers, and adjustments' },
  { key: 'manage_inventory', label: 'Inventory & Stock', category: 'Plant', description: 'Manage items, categories, stock, and locations' },
  { key: 'manage_production', label: 'Plant Production', category: 'Plant', description: 'Log asphalt batches, recipes, and bitumen tests' },
  { key: 'manage_sales', label: 'Sales Orders', category: 'Commercial', description: 'Create and dispatch customer sale orders' },
  { key: 'manage_purchases', label: 'Purchase Orders', category: 'Commercial', description: 'Create and receive raw material purchase bills' },
  { key: 'manage_fleet', label: 'Fleet & Vehicles', category: 'Logistics', description: 'Manage tippers, tankers, maintenance, and tyres' },
  { key: 'manage_emi', label: 'Vehicle EMI Schedules', category: 'Logistics', description: 'Record EMI repayments and loan schedules' },
  { key: 'dispatch_trips', label: 'Dispatch & Trip Slips', category: 'Logistics', description: 'Issue delivery challans and driver trip slips' },
  { key: 'manage_employees', label: 'Employee Staff & HR', category: 'Personnel', description: 'Maintain employee profiles, biometric logs, and leaves' },
  { key: 'process_payroll', label: 'Payroll & Salaries', category: 'Personnel', description: 'Calculate wages, advance disbursements, and payslips' },
  { key: 'manage_evidence', label: 'Document & Evidence Vault', category: 'Documents', description: 'Upload and organize audit slips and compliance files' },
  { key: 'manage_users', label: 'User & Access Control', category: 'Administration', description: 'Create and provision user accounts and permissions' },
  { key: 'manage_settings', label: 'Company Settings', category: 'Administration', description: 'Edit plant address, GSTIN, and company preferences' },
];

const PRESETS: Record<string, { label: string; permissions: Partial<UserPermissions> }> = {
  full_admin: {
    label: 'Super Admin / Full Access',
    // manage_users is NOT preset-grantable — the Super Admin role bypasses the
    // permission matrix server-side, so this preset stays for admins only.
    permissions: ALL_PERMISSION_KEYS.reduce(
      (acc, p) => ({ ...acc, [p.key]: p.key !== 'manage_users' }),
      {} as UserPermissions
    ),
  },
  finance_billing: {
    label: 'Finance & Billing Admin',
    permissions: {
      view_dashboard: true,
      view_financial_metrics: true,
      manage_parties: true,
      record_payments: true,
      manage_cash_bank: true,
      manage_sales: true,
      manage_purchases: true,
      manage_evidence: true,
      manage_users: false,
      manage_settings: false,
    },
  },
  plant_production: {
    label: 'Plant Operations Manager',
    permissions: {
      view_dashboard: true,
      manage_inventory: true,
      manage_production: true,
      manage_sales: true,
      manage_fleet: true,
      dispatch_trips: true,
      manage_evidence: true,
      view_financial_metrics: false,
      manage_users: false,
    },
  },
  fleet_logistics: {
    label: 'Fleet & Logistics Dispatcher',
    permissions: {
      view_dashboard: true,
      manage_fleet: true,
      dispatch_trips: true,
      manage_emi: true,
      manage_evidence: true,
      view_financial_metrics: false,
      manage_users: false,
    },
  },
};

export function UserManagementView() {
  const { currentUser, hasPermission } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [newlyCreatedUser, setNewlyCreatedUser] = useState<AppUser | null>(null);
  const [userToDelete, setUserToDelete] = useState<AppUser | null>(null);

  // Row-action kebab popover (same portal pattern as the sales/purchase list)
  const [userMenuFor, setUserMenuFor] = useState<string | null>(null);
  const [userMenuPos, setUserMenuPos] = useState<{ top: number; right: number; flip: boolean } | null>(null);
  const userActionRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [userToSuspend, setUserToSuspend] = useState<AppUser | null>(null);

  // Form state
  const [formData, setFormData] = useState<{
    fullName: string;
    email: string;
    phone: string;
    role: UserRole;
    customUsername: string;
    suggestedUsername: string;
    suggestedCode: string;
    permissions: UserPermissions;
    notes: string;
  }>({
    fullName: '',
    email: '',
    phone: '',
    role: 'admin',
    customUsername: '',
    suggestedUsername: '',
    suggestedCode: '',
    permissions: { ...PRESETS.full_admin.permissions } as UserPermissions,
    notes: '',
  });

  const canManageUsers = hasPermission('manage_users');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date>(new Date());

  const fetchUsers = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await api.getUsers(true);
      if (res.success) {
        setUsers(res.data);
        setLastSyncedAt(new Date());
      }
    } catch (err: any) {
      console.error('Failed to fetch users:', err);
      if (!silent) {
        showToast(err.message || 'Failed to load user directory.', 'error');
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!canManageUsers) return;

    // Refresh every time the user visits this feature
    fetchUsers(false);

    // Refresh when user returns to window/tab
    const handleFocus = () => {
      fetchUsers(true);
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [canManageUsers]);

  // Update suggested username when typing full name or role
  useEffect(() => {
    if (formData.fullName.trim().length >= 2) {
      const timer = setTimeout(async () => {
        try {
          const res = await api.previewUsername(formData.fullName, formData.role);
          if (res.success) {
            setFormData((prev) => ({
              ...prev,
              suggestedUsername: res.suggestedUsername,
              suggestedCode: res.suggestedActivationCode,
            }));
          }
        } catch {
          // fallback preview
          const clean = formData.fullName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
          setFormData((prev) => ({
            ...prev,
            suggestedUsername: `${clean}.adm${Math.floor(1000 + Math.random() * 9000)}`,
          }));
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [formData.fullName, formData.role]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showToast('Copied to clipboard!', 'info');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName.trim() || !formData.email.trim()) {
      showToast('Please enter full name and email.', 'error');
      return;
    }

    try {
      const res = await api.createUser({
        fullName: formData.fullName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        role: formData.role,
        // USER & ACCESS CONTROL LOCK: manage_users is never grantable from this
        // UI (Super Admin only) — belt-and-braces before the server's own strip.
        permissions: { ...formData.permissions, manage_users: false },
        notes: formData.notes.trim(),
        // HONEST PREVIEW: whatever the identifier card is showing right now
        // (custom-typed name, or the last server suggestion) is what we ask the
        // server to provision — the previewed username is then what actually
        // gets created, not a fresh random one. Uniqueness is still enforced
        // server-side (400 on collision); server falls back to its own
        // generation when empty.
        customUsername: formData.customUsername.trim() || formData.suggestedUsername.trim() || undefined,
      });

      if (res.success) {
        setNewlyCreatedUser(res.data);
        setIsCreateModalOpen(false);
        fetchUsers();
        showToast(`User created! Unique username: ${res.data.username}`, 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to create user.', 'error');
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      // SUPER ADMIN PROFILE LOCK: an existing Super Admin's role and permission
      // matrix are server-managed (tech team provisions Super Admins from the
      // backend); this form edits their profile details only.
      const isSuperAdminTarget = editingUser.role === 'super_admin';
      const res = await api.updateUser(editingUser.id, {
        fullName: formData.fullName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        ...(isSuperAdminTarget
          ? {}
          : {
              role: formData.role,
              // USER & ACCESS CONTROL LOCK: never grantable from this UI
              permissions: { ...formData.permissions, manage_users: false },
            }),
        notes: formData.notes.trim(),
      });

      if (res.success) {
        setIsEditModalOpen(false);
        setEditingUser(null);
        fetchUsers();
        showToast('User permissions and profile updated!', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to update user.', 'error');
    }
  };

  const handleToggleStatus = async (user: AppUser) => {
    const nextStatus: UserStatus = user.status === 'active' ? 'suspended' : 'active';
    try {
      const res = await api.updateUserStatus(user.id, nextStatus);
      if (res.success) {
        showToast(`User ${user.username} marked as ${nextStatus}.`, 'info');
        fetchUsers();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to update status.', 'error');
    }
  };

  const handleResetInvite = async (user: AppUser) => {
    try {
      const res = await api.resetUserInvite(user.id);
      if (res.success) {
        setNewlyCreatedUser(res.data);
        showToast(`Setup invite regenerated for ${user.username}.`, 'success');
        fetchUsers();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to regenerate invite.', 'error');
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      const res = await api.deleteUser(userToDelete.id);
      if (res.success) {
        showToast(`User ${userToDelete.username} deleted.`, 'info');
        setUserToDelete(null);
        fetchUsers();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to delete user.', 'error');
    }
  };

  const openCreateDialog = () => {
    setFormData({
      fullName: '',
      email: '',
      phone: '',
      role: 'admin',
      customUsername: '',
      suggestedUsername: 'user.adm' + Math.floor(1000 + Math.random() * 9000),
      suggestedCode: 'ACT-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      permissions: { ...PRESETS.full_admin.permissions } as UserPermissions,
      notes: '',
    });
    setIsCreateModalOpen(true);
  };

  // Kebab popover — closes on outside click, scroll or resize (portal-safe)
  const closeUserMenu = () => {
    setUserMenuFor(null);
    setUserMenuPos(null);
  };

  useEffect(() => {
    if (!userMenuFor) return;
    const handleClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        userActionRef.current && !userActionRef.current.contains(t) &&
        userMenuRef.current && !userMenuRef.current.contains(t)
      ) {
        closeUserMenu();
      }
    };
    const handleMove = () => closeUserMenu();
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleMove, true);
    window.addEventListener('resize', handleMove);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleMove, true);
      window.removeEventListener('resize', handleMove);
    };
  }, [userMenuFor]);

  const openEditDialog = (user: AppUser) => {
    setEditingUser(user);
    setFormData({
      fullName: user.fullName,
      email: user.email,
      phone: user.phone || '',
      role: user.role,
      customUsername: user.username,
      suggestedUsername: user.username,
      suggestedCode: user.activationCode || '',
      permissions: { ...user.permissions },
      notes: user.notes || '',
    });
    setIsEditModalOpen(true);
  };

  // Filter users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.phone && u.phone.includes(searchQuery));
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  // Access check guard
  if (!canManageUsers) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center">
        <div className="p-8 rounded-3xl bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] shadow-sm">
          <div className="w-14 h-14 rounded-full bg-[var(--color-error-container)] text-[var(--color-error)] mx-auto flex items-center justify-center mb-4">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-[var(--color-on-surface)] mb-2">
            Access Restricted: User Management
          </h2>
          <p className="text-xs text-[var(--color-on-surface-variant)] max-w-md mx-auto mb-6">
            You are currently signed in as <span className="font-bold text-[var(--color-on-surface)]">{currentUser?.fullName}</span> (@{currentUser?.username}) with role <span className="uppercase font-mono text-[var(--color-primary)] font-semibold">{currentUser?.role}</span>.
            Full access to user provisioning, role assignments, and permission matrices is restricted to Super Administrators and authorized Security Admins.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-surface-container-high)] text-xs text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)]">
            <Lock className="w-3.5 h-3.5" />
            <span>Missing Permission: <code className="font-mono text-[var(--color-primary)]">manage_users</code></span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-[var(--color-surface-container-low)] border border-[var(--color-outline-variant)]">
          <p className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
            Total Users
          </p>
          <p className="text-2xl font-black text-[var(--color-on-surface)]">
            {users.length}
          </p>
          <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">
            Registered directory profiles
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--color-surface-container-low)] border border-[var(--color-outline-variant)]">
          <p className="text-[11px] font-bold text-[var(--color-success)] uppercase tracking-wider mb-1">
            Active Accounts
          </p>
          <p className="text-2xl font-black text-[var(--color-on-surface)]">
            {users.filter((u) => u.status === 'active').length}
          </p>
          <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">
            Can authenticate & sign in
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--color-surface-container-low)] border border-[var(--color-outline-variant)]">
          <p className="text-[11px] font-bold text-[var(--color-warning)] uppercase tracking-wider mb-1">
            Pending Setup
          </p>
          <p className="text-2xl font-black text-[var(--color-warning)]">
            {users.filter((u) => u.status === 'pending_setup').length}
          </p>
          <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">
            Awaiting first-time password
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--color-surface-container-low)] border border-[var(--color-outline-variant)]">
          <p className="text-[11px] font-bold text-[var(--color-primary)] uppercase tracking-wider mb-1">
            Super Admins
          </p>
          <p className="text-2xl font-black text-[var(--color-primary)]">
            {users.filter((u) => u.role === 'super_admin').length}
          </p>
          <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">
            Unrestricted root privileges
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[var(--color-surface-container)] p-3 rounded-2xl border border-[var(--color-outline-variant)]">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-on-surface-variant)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, @username, email..."
            className="w-full pl-10 pr-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-xl text-xs text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-xl text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] font-medium"
          >
            <option value="all">All Roles</option>
            <option value="super_admin">Super Admins</option>
            <option value="admin">Admins</option>
            <option value="manager">Managers</option>
            <option value="operator">Operators</option>
          </select>

          {/* Add New User */}
         

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-xl text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] font-medium"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="pending_setup">Pending Setup</option>
            <option value="suspended">Suspended</option>
          </select>

           {canManageUsers && (
            <button
              type="button"
              onClick={openCreateDialog}
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-xl text-xs font-bold shadow-xs hover:opacity-90 transition-opacity"
              title="Create a new user"
            >
              <UserPlus className="w-4 h-4" />
              Add New User
            </button>
          )}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-[var(--color-surface-container-lowest)] rounded-3xl border border-[var(--color-outline-variant)] overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]/80 text-[var(--color-on-surface-variant)] uppercase font-bold text-[10px] tracking-wider">
                <th className="py-3.5 px-4">User Details</th>
                <th className="py-3.5 px-4">Unique Username</th>
                <th className="py-3.5 px-4">Role & Status</th>
                <th className="py-3.5 px-4">Permissions Active</th>
                <th className="py-3.5 px-4">Last Activity</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-outline-variant)]">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[var(--color-on-surface-variant)]">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[var(--color-primary)]" />
                    <span>Loading users directory...</span>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[var(--color-on-surface-variant)]">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="font-semibold">No users matching search filters</p>
                    <p className="text-[11px] mt-1">Try adjusting the role or status filter above.</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const activePermCount = Object.values(user.permissions || {}).filter(Boolean).length;
                  const isCurrentSessionUser = currentUser?.id === user.id;

                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-[var(--color-surface-container-low)] transition-colors group"
                    >
                      {/* Identity */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold text-xs uppercase shadow-2xs shrink-0 ${
                            user.role === 'super_admin'
                              ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                              : 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'
                          }`}>
                            {user.fullName.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="font-bold text-[var(--color-on-surface)] truncate">
                                {user.fullName}
                              </p>
                              {isCurrentSessionUser && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-[var(--color-on-surface-variant)] truncate">
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {user.email}
                              </span>
                              {user.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3 h-3" />
                                  {user.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Unique Generated Username */}
                      <td className="py-3.5 px-4">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[var(--color-surface-container-high)] border border-[var(--color-outline-variant)]">
                          <span className="font-mono text-xs font-bold text-[var(--color-primary)]">
                            @{user.username}
                          </span>
                          <button
                            onClick={() => copyToClipboard(user.username, `user-${user.id}`)}
                            className="p-1 text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] rounded transition-all"
                            title="Copy username"
                          >
                            {copiedId === `user-${user.id}` ? (
                              <Check className="w-3 h-3 text-[var(--color-success)]" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                        {user.status === 'pending_setup' && user.activationCode && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-[var(--color-warning)] font-mono font-semibold">
                            <span>Code: {user.activationCode}</span>
                          </div>
                        )}
                      </td>

                      {/* Role & Status */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                              user.role === 'super_admin'
                                ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                                : user.role === 'admin'
                                ? 'bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)]'
                                : 'bg-[var(--color-surface-container-highest)] text-[var(--color-on-surface)]'
                            }`}>
                              <Shield className="w-2.5 h-2.5" />
                              {user.role.replace('_', ' ')}
                            </span>
                          </div>
                          <div>
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${
                              user.status === 'active'
                                ? 'text-[var(--color-success)]'
                                : user.status === 'pending_setup'
                                ? 'text-[var(--color-warning)]'
                                : 'text-[var(--color-error)]'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                user.status === 'active'
                                  ? 'bg-[var(--color-success)]'
                                  : user.status === 'pending_setup'
                                  ? 'bg-[var(--color-warning)] animate-pulse'
                                  : 'bg-[var(--color-error)]'
                              }`} />
                              {user.status === 'active'
                                ? 'Active'
                                : user.status === 'pending_setup'
                                ? 'Pending Setup'
                                : 'Suspended'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Permissions Breakdown */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <div className="w-full bg-[var(--color-surface-container-high)] rounded-full h-2 max-w-[80px] overflow-hidden">
                            <div
                              className="bg-[var(--color-primary)] h-2 rounded-full"
                              style={{ width: `${(activePermCount / ALL_PERMISSION_KEYS.length) * 100}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-bold text-[var(--color-on-surface)]">
                            {user.role === 'super_admin'
                              ? `All (${ALL_PERMISSION_KEYS.length})`
                              : `${activePermCount}/${ALL_PERMISSION_KEYS.length}`}
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">
                          {user.role === 'super_admin' ? 'Full unrestricted root' : 'Granular module access'}
                        </p>
                      </td>

                      {/* Activity */}
                      <td className="py-3.5 px-4 text-[11px] text-[var(--color-on-surface-variant)]">
                        {user.lastLoginAt ? (
                          <div>
                            <p className="font-semibold text-[var(--color-on-surface)]">
                              {formatDate(user.lastLoginAt, 'short')}
                            </p>
                            <p className="text-[10px] opacity-75">
                              {new Date(user.lastLoginAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        ) : (
                          <span className="italic text-[var(--color-on-surface-variant)]/60">Never signed in</span>
                        )}
                      </td>

                      {/* Actions — ⋮ opens a portal popover (fixed above the page) */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {user.status === 'pending_setup' && (
                            <button
                              onClick={() => handleResetInvite(user)}
                              className="p-1.5 rounded-lg text-[var(--color-warning)] hover:bg-[var(--color-warning-container)]/30 transition-all"
                              title="Resend / View Setup Code"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <div className="relative" ref={userActionRef}>
                            <button
                              type="button"
                              title="More Actions"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (userMenuFor === user.id) {
                                  closeUserMenu();
                                  return;
                                }
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                // flip above the button when nothing fits underneath
                                const flip = rect.bottom + 130 > window.innerHeight;
                                setUserMenuPos({
                                  top: flip ? rect.top : rect.bottom,
                                  right: window.innerWidth - rect.right,
                                  flip,
                                });
                                setUserMenuFor(user.id);
                              }}
                              className={`p-1.5 rounded-full transition-colors ${
                                userMenuFor === user.id
                                  ? 'text-[var(--color-on-surface)] bg-[var(--color-surface-container-highest)]'
                                  : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)]'
                              }`}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row action popover — PORTAL: fixed on the page so the list container
          (overflow-x-auto / overflow-hidden) can never clip it (same pattern
          as the sales/purchase lists) */}
      {userMenuFor && userMenuPos && createPortal(
        <div
          ref={userMenuRef}
          style={{
            position: 'fixed',
            top: userMenuPos.flip ? userMenuPos.top - 4 : userMenuPos.top + 4,
            right: Math.max(8, userMenuPos.right + 8),
            transform: userMenuPos.flip ? 'translateY(-100%)' : 'none',
          }}
          className="z-[60] w-56 max-w-[calc(100vw-16px)] rounded-2xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] shadow-2xl overflow-hidden text-left"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="px-3 pt-2.5 pb-1.5 text-[9px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
            Actions — {users.find((u) => u.id === userMenuFor)?.username || ''}
          </p>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const target = users.find((u) => u.id === userMenuFor);
              if (!target) return;
              closeUserMenu();
              openEditDialog(target);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-bold text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)] transition-colors border-t border-[var(--color-outline-variant)]/50"
          >
            <Edit2 className="w-3.5 h-3.5 text-[var(--color-primary)]" />
            Edit User
          </button>

          {(() => {
            const target = users.find((u) => u.id === userMenuFor);
            if (!target || target.id === currentUser?.id) return null;
            const suspending = target.status === 'active';
            return (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  closeUserMenu();
                  if (suspending) {
                    setUserToSuspend(target);
                  } else {
                    handleToggleStatus(target);
                  }
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-bold hover:bg-[var(--color-surface-container)] transition-colors border-t border-[var(--color-outline-variant)]/50 ${
                  suspending
                    ? 'text-[var(--color-error)]'
                    : 'text-[var(--color-success)]'
                }`}
              >
                {suspending ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                {suspending ? 'Suspend User' : 'Activate User'}
              </button>
            );
          })()}
        </div>,
        document.body
      )}

      {/* SUSPEND CONFIRMATION MODAL */}
      {userToSuspend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-sm animate-in fade-in">
          <div
            className="w-full max-w-sm bg-[var(--color-surface)] text-[var(--color-on-surface)] rounded-3xl border border-[var(--color-outline-variant)] shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-[var(--color-error-container)] text-[var(--color-error)] mx-auto flex items-center justify-center mb-3">
                <UserX className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-[var(--color-on-surface)]">
                Suspend User Account?
              </h3>
              <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">
                @{userToSuspend.username} ({userToSuspend.fullName}) will immediately lose access
                and be unable to sign in until re-activated.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setUserToSuspend(null)}
                className="flex-1 py-2 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] font-semibold text-xs rounded-full"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = userToSuspend;
                  setUserToSuspend(null);
                  handleToggleStatus(target);
                }}
                className="flex-1 py-2 bg-[var(--color-error)] text-[var(--color-on-error)] font-bold text-xs rounded-full hover:opacity-90"
              >
                Suspend User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE USER MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-sm animate-in fade-in">
          <div
            className="w-full max-w-2xl bg-[var(--color-surface)] text-[var(--color-on-surface)] rounded-3xl border border-[var(--color-outline-variant)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] flex items-center justify-center shadow-xs">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-[var(--color-on-surface)]">
                    Provision New User
                  </h3>
                  <p className="text-xs text-[var(--color-on-surface-variant)]">
                    System will generate a unique username for their first-time password setup.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateUser} className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Profile Details */}
              <div className="space-y-4">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--color-primary)]">
                  1. Contact & Identity
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[var(--color-on-surface)] mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      placeholder="e.g. Anand Kulkarni"
                      className="w-full px-3.5 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-xl text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[var(--color-on-surface)] mb-1">
                      Official Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="anand@apexinfra.in"
                      className="w-full px-3.5 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-xl text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[var(--color-on-surface)] mb-1">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+91 98220 00000"
                      className="w-full px-3.5 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-xl text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[var(--color-on-surface)] mb-1">
                      System Role
                    </label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                      className="w-full px-3.5 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-xl text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] font-semibold"
                    >
                      <option value="admin">Admin (Operations / Finance)</option>
                      <option value="manager">Manager (Plant / Logistics)</option>
                      <option value="operator">Operator (Field / Weighbridge)</option>
                      {/* NO super_admin option (user rule): Super Administrators are
                          provisioned only by the tech team from the backend. */}
                    </select>
                  </div>
                </div>
              </div>

              {/* Unique Username Preview Card */}
              <div className="p-4 rounded-2xl bg-[var(--color-surface-container-high)] border border-[var(--color-outline-variant)]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
                    <span className="text-xs font-extrabold text-[var(--color-on-surface)]">
                      System-Generated Unique Username
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-[var(--color-primary)] bg-[var(--color-primary-container)] px-2 py-0.5 rounded-full">
                    Auto-Generated
                  </span>
                </div>
                <p className="text-[11px] text-[var(--color-on-surface-variant)] mb-3">
                  This unique username will be shared with the user. They will use this exact identifier to set their password for the first time.
                </p>

                <div className="flex items-center gap-2 bg-[var(--color-surface-container-lowest)] p-2.5 rounded-xl border border-[var(--color-outline-variant)]">
                  <span className="font-mono text-xs font-bold text-[var(--color-primary)]">@</span>
                  <input
                    type="text"
                    value={formData.customUsername || formData.suggestedUsername}
                    onChange={(e) => setFormData({ ...formData, customUsername: e.target.value })}
                    placeholder="unique.username"
                    className="w-full bg-transparent font-mono text-xs font-bold text-[var(--color-on-surface)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const clean = (formData.fullName || 'user').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
                      const rand = Math.floor(1000 + Math.random() * 9000);
                      setFormData({ ...formData, customUsername: '', suggestedUsername: `${clean}.adm${rand}` });
                    }}
                    className="p-1 hover:bg-[var(--color-surface-container)] rounded text-[var(--color-on-surface-variant)]"
                    title="Generate another"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Permissions Presets & Matrix */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--color-primary)]">
                    2. Feature Permissions Matrix
                  </h4>

                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto p-1">
                  {ALL_PERMISSION_KEYS.map((perm) => {
                    // USER & ACCESS CONTROL LOCK (user rule): manage_users cannot be
                    // granted to anyone except Super Admins — always unchecked and
                    // disabled in this matrix; the Super Admin role bypasses the
                    // matrix entirely server-side.
                    const isAdminLocked = perm.key === 'manage_users';
                    const isChecked = isAdminLocked ? false : !!formData.permissions[perm.key];
                    return (
                      <label
                        key={perm.key}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-[var(--color-primary-container)]/30 border-[var(--color-primary)]/40 text-[var(--color-on-surface)]'
                            : 'bg-[var(--color-surface-container-low)] border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] opacity-70'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isAdminLocked}
                          onChange={(e) => {
                            if (isAdminLocked) return;
                            setFormData({
                              ...formData,
                              permissions: {
                                ...formData.permissions,
                                [perm.key]: e.target.checked,
                              },
                            });
                          }}
                          className="mt-0.5 rounded text-[var(--color-primary)] focus:ring-[var(--color-primary)] disabled:opacity-60"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold leading-tight">{perm.label} {isAdminLocked && <span className="text-[9px] font-mono text-[var(--color-error)]">SUPER&nbsp;ADMIN&nbsp;ONLY</span>}</p>
                          <p className="text-[10px] opacity-80 leading-tight mt-0.5">{isAdminLocked ? 'Managed by the tech team — cannot be granted from here' : perm.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
             

              {/* Modal Footer */}
              <div className="pt-4 border-t border-[var(--color-outline-variant)] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-full text-xs font-semibold hover:bg-[var(--color-surface-container-highest)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-bold hover:opacity-95 shadow-xs"
                >
                  Provision User & Generate Username
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER MODAL */}
      {isEditModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-sm animate-in fade-in">
          <div
            className="w-full max-w-2xl bg-[var(--color-surface)] text-[var(--color-on-surface)] rounded-3xl border border-[var(--color-outline-variant)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-[var(--color-secondary)] text-[var(--color-on-secondary)] flex items-center justify-center shadow-xs">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-[var(--color-on-surface)]">
                    Edit User: @{editingUser.username}
                  </h3>
                  <p className="text-xs text-[var(--color-on-surface-variant)]">
                    Modify profile details, role, and granular permission switches.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleUpdateUser} className="p-6 overflow-y-auto space-y-6 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface)] mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className="w-full px-3.5 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-xl text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface)] mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3.5 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-xl text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface)] mb-1">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3.5 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-xl text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface)] mb-1">
                    System Role
                  </label>
                  <select
                    value={formData.role}
                    disabled={editingUser?.role === 'super_admin'}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className={`w-full px-3.5 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-xl text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] font-semibold ${editingUser?.role === 'super_admin' ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {/* NO super_admin option (user rule): Super Administrators are
                        provisioned only by the tech team from the backend. Existing
                        Super Admins are shown locked and cannot be demoted here. */}
                    {editingUser?.role === 'super_admin' && (
                      <option value="super_admin" disabled>Super Admin (lock managed by the tech team)</option>
                    )}
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="operator">Operator</option>
                  </select>
                </div>
              </div>

              {/* Permissions Matrix */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--color-primary)]">
                    Assigned Feature Permissions
                  </h4>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setFormData({
                        ...formData,
                        // manage_users stays forced-false — it is not grantable here
                        permissions: ALL_PERMISSION_KEYS.reduce((acc, p) => ({ ...acc, [p.key]: p.key !== 'manage_users' }), {} as UserPermissions),
                      })}
                      className="text-[10px] text-[var(--color-primary)] hover:underline font-bold"
                    >
                      Select All
                    </button>
                    <span className="text-[10px] text-[var(--color-outline)]">•</span>
                    <button
                      type="button"
                      onClick={() => setFormData({
                        ...formData,
                        // clear-all is total (manage_users is anyway never grantable)
                        permissions: ALL_PERMISSION_KEYS.reduce((acc, p) => ({ ...acc, [p.key]: false }), {} as UserPermissions),
                      })}
                      className="text-[10px] text-[var(--color-on-surface-variant)] hover:underline font-bold"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto p-1">
                  {ALL_PERMISSION_KEYS.map((perm) => {
                    // USER & ACCESS CONTROL LOCK (user rule): manage_users cannot be
                    // granted here to anyone except the Super Admin themselves —
                    // shown checked-and-disabled only when editing a Super Admin.
                    const isAdminLocked = perm.key === 'manage_users' && editingUser?.role !== 'super_admin';
                    const isChecked = isAdminLocked
                      ? false
                      : perm.key === 'manage_users'
                      ? true
                      : !!formData.permissions[perm.key];
                    return (
                      <label
                        key={perm.key}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-[var(--color-primary-container)]/30 border-[var(--color-primary)]/40 text-[var(--color-on-surface)]'
                            : 'bg-[var(--color-surface-container-low)] border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] opacity-70'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={perm.key === 'manage_users'}
                          onChange={(e) => {
                            if (perm.key === 'manage_users') return;
                            setFormData({
                              ...formData,
                              permissions: {
                                ...formData.permissions,
                                [perm.key]: e.target.checked,
                              },
                            });
                          }}
                          className="mt-0.5 rounded text-[var(--color-primary)] focus:ring-[var(--color-primary)] disabled:opacity-60"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold leading-tight">{perm.label} {perm.key === 'manage_users' && <span className="text-[9px] font-mono text-[var(--color-error)]">SUPER&nbsp;ADMIN&nbsp;ONLY</span>}</p>
                          <p className="text-[10px] opacity-80 leading-tight mt-0.5">{perm.key === 'manage_users' ? 'Locked to the Super Admin role — not editable here' : perm.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Notes removed from the edit modal (user rule) — formData.notes
                  still carries the stored notes back unchanged on save, so
                  existing notes are preserved, just not editable here. */}

              {/* Modal Footer */}
              <div className="pt-4 border-t border-[var(--color-outline-variant)] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-full text-xs font-semibold hover:bg-[var(--color-surface-container-highest)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-bold hover:opacity-95 shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW USER INVITE SHARE CARD MODAL */}
      {newlyCreatedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-sm animate-in fade-in">
          <div
            className="w-full max-w-md bg-[var(--color-surface)] text-[var(--color-on-surface)] rounded-3xl border border-[var(--color-outline-variant)] shadow-2xl p-6 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-[var(--color-success-container)] text-[var(--color-success)] mx-auto flex items-center justify-center mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-[var(--color-on-surface)]">
                User Provisioned Successfully!
              </h3>
              <p className="text-xs text-[var(--color-on-surface-variant)]">
                Share these setup credentials with <span className="font-bold text-[var(--color-on-surface)]">{newlyCreatedUser.fullName}</span> to enable first-time password creation.
              </p>
            </div>

            {/* Credential summary box */}
            <div className="p-4 rounded-2xl bg-[var(--color-surface-container-high)] border border-[var(--color-outline-variant)] space-y-3 mb-4">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--color-on-surface-variant)]">
                  Unique System Username
                </span>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="font-mono text-sm font-black text-[var(--color-primary)]">
                    {newlyCreatedUser.username}
                  </span>
                  <button
                    onClick={() => copyToClipboard(newlyCreatedUser.username, 'new-user-copy')}
                    className="text-xs text-[var(--color-primary)] font-bold flex items-center gap-1 hover:underline"
                  >
                    {copiedId === 'new-user-copy' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    Copy
                  </button>
                </div>
              </div>

              {newlyCreatedUser.activationCode && (
                <div className="pt-2 border-t border-[var(--color-outline-variant)]">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--color-on-surface-variant)]">
                    One-Time Activation Code
                  </span>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="font-mono text-sm font-bold text-[var(--color-warning)]">
                      {newlyCreatedUser.activationCode}
                    </span>
                    <button
                      onClick={() => copyToClipboard(newlyCreatedUser.activationCode!, 'new-code-copy')}
                      className="text-xs text-[var(--color-primary)] font-bold flex items-center gap-1 hover:underline"
                    >
                      {copiedId === 'new-code-copy' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      Copy
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-[var(--color-outline-variant)] text-[11px] text-[var(--color-on-surface-variant)]">
                <p className="font-semibold text-[var(--color-on-surface)]">First-Time Setup Instructions:</p>
                <ol className="list-decimal list-inside space-y-0.5 mt-1">
                  <li>Click <strong>Sign In</strong> in the top header</li>
                  <li>Switch to the <strong>First-Time Setup</strong> tab</li>
                  <li>Enter username <code className="font-mono font-bold text-[var(--color-primary)]">{newlyCreatedUser.username}</code></li>
                  <li>Enter the one-time activation code shown above ({newlyCreatedUser.activationCode})</li>
                  <li>Choose and confirm your private password</li>
                </ol>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const inviteText = `Apex Operations Account Provisioned:\nName: ${newlyCreatedUser.fullName}\nUnique Username: ${newlyCreatedUser.username}\nActivation Code: ${newlyCreatedUser.activationCode || 'N/A'}\nInstructions: Go to First-Time Setup on the login screen and enter your unique username to set your password.`;
                  copyToClipboard(inviteText, 'full-invite-copy');
                }}
                className="flex-1 py-2.5 bg-[var(--color-secondary-container)] hover:bg-[var(--color-secondary-container)]/80 text-[var(--color-on-secondary-container)] font-bold text-xs rounded-2xl transition-all flex items-center justify-center gap-1.5"
              >
                {copiedId === 'full-invite-copy' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Copy Full Invite</span>
              </button>

              <button
                type="button"
                onClick={() => setNewlyCreatedUser(null)}
                className="flex-1 py-2.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold text-xs rounded-2xl hover:opacity-95 transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-sm animate-in fade-in">
          <div
            className="w-full max-w-sm bg-[var(--color-surface)] text-[var(--color-on-surface)] rounded-3xl border border-[var(--color-outline-variant)] shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-[var(--color-error-container)] text-[var(--color-error)] mx-auto flex items-center justify-center mb-3">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-[var(--color-on-surface)]">
                Delete User Account?
              </h3>
              <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">
                Are you sure you want to permanently delete <span className="font-bold text-[var(--color-on-surface)]">@{userToDelete.username}</span> ({userToDelete.fullName})? This action cannot be undone.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="flex-1 py-2 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] font-semibold text-xs rounded-full"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                className="flex-1 py-2 bg-[var(--color-error)] text-[var(--color-on-error)] font-bold text-xs rounded-full hover:opacity-90"
              >
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
