import React, { useState, useMemo } from 'react';
import {
  Contact,
  Clock,
  Plus,
  Search,
  Filter,
  Edit,
  Check,
  X,
  TrendingUp,
  AlertCircle,
  CalendarDays,
  Printer,
  ChevronRight,
  CheckCircle,
  PiggyBank,
  Sliders,
  DollarSign,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useDatabase } from '../../hooks/useDatabase';
import { Employee, EmployeeAttendance } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { EmployeeLedgerView, employeeLedgerBalance } from './EmployeeLedgerView';
import { AttendanceInOutView } from './AttendanceInOutView';
import { EntityDocumentsSection, StagedDocument } from '../common/EntityDocumentsSection';
import { EmployeeDetailView } from './EmployeeDetailView';

interface EmployeesViewProps {
  /** Cross-feature open (e.g. from the Fleet Drivers tab) — pre-opens this
   *  employee's detail page once they exist in the loaded roster */
  focusEmployeeId?: string | null;
  /** Cleared once the focus is handled, so the same driver can re-open */
  onFocusHandled?: () => void;
  /** Provided ONLY when the profile was opened from ANOTHER feature (the
   *  Fleet Drivers tab): the detail page's Back returns there (logistics,
   *  drivers tab) instead of the roster. Omitted ⇒ default roster return. */
  onProfileBack?: () => void;
}

export function EmployeesView({ focusEmployeeId, onFocusHandled, onProfileBack }: EmployeesViewProps) {
  const {
    employees,
    employeeLedgerTransactions,
    employeePayments,
    settings,
    db,
  } = useDatabase();

  const currencySymbol = settings?.currency?.symbol || '₹';

  /** Employee-facing dates read dd-mm-yyyy */
  const formatDateDMY = (d?: string): string => {
    if (!d) return '';
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
  };

  /** One employee's current ledger balance (shared fold helper) */
  const empBalance = (id: string): number => {
    const emp = employees.find((e) => e.id === id);
    return emp ? employeeLedgerBalance(emp, employeeLedgerTransactions, employeePayments) : 0;
  };

  // State Management
  const [activeTab, setActiveTab] = useState<'directory' | 'attendance' | 'ledger'>('directory');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Modals
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  // When set, the DETAIL PAGE (like the party page) replaces the tab content
  const [detailEmployee, setDetailEmployee] = useState<Employee | null>(null);

  // Form States - Employee
  const [formEmpName, setFormEmpName] = useState('');
  const [formEmpRole, setFormEmpRole] = useState<'driver' | 'supervisor' | 'operator' | 'accountant' | 'manager' | 'helper' | 'other'>('driver');
  const [formEmpPhone, setFormEmpPhone] = useState('');
  const [formEmpEmail, setFormEmpEmail] = useState('');
  const [formEmpAadhaar, setFormEmpAadhaar] = useState('');
  const [formEmpPan, setFormEmpPan] = useState('');
  const [formEmpJoiningDate, setFormEmpJoiningDate] = useState('');
  const [formEmpSalaryBase, setFormEmpSalaryBase] = useState('');
  const [formEmpSalaryType, setFormEmpSalaryType] = useState<'monthly' | 'daily'>('monthly');
  const [formEmpBankAccount, setFormEmpBankAccount] = useState('');
  const [formEmpBankIFSC, setFormEmpBankIFSC] = useState('');
  const [formEmpUpi, setFormEmpUpi] = useState('');
  const [formEmpNameOnAccount, setFormEmpNameOnAccount] = useState('');
  const [formEmpStatus, setFormEmpStatus] = useState<'active' | 'inactive'>('active');
  const [formEmpInTime, setFormEmpInTime] = useState('');
  const [formEmpOutTime, setFormEmpOutTime] = useState('');
  // Ledger opening balance — CREATE mode only: a POSITIVE amount plus the
  // employer's sign choice (+ = company owes the employee, − = employee owes)
  const [formEmpOpeningAmount, setFormEmpOpeningAmount] = useState('');
  const [formEmpOpeningOwesEmp, setFormEmpOpeningOwesEmp] = useState(true);

  // Staged documents (create mode) — document ids ride the create payload and
  // the server links them once the employee id is minted (same as parties).
  const [stagedEmpDocs, setStagedEmpDocs] = useState<StagedDocument[]>([]);

  // Cross-feature focus — open the requested driver's profile page (the Fleet
  // Drivers tab lands here); handled once the roster carries the employee
  React.useEffect(() => {
    if (!focusEmployeeId) return;
    const emp = employees.find((e) => e.id === focusEmployeeId);
    if (emp) {
      setActiveTab('directory');
      setDetailEmployee(emp);
      onFocusHandled?.();
    }
  }, [focusEmployeeId, employees]);

  React.useEffect(() => {
    const handleHeaderAction = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail === 'add-employee') {
        openEmployeeModal(null);
      }
    };
    window.addEventListener('app-header-action', handleHeaderAction);
    return () => window.removeEventListener('app-header-action', handleHeaderAction);
  }, [employees.length]);

  // Initialize/Reset Employee Form
  const openEmployeeModal = (emp: Employee | null = null) => {
    if (emp) {
      setEditingEmployee(emp);
      setFormEmpName(emp.name);
      setFormEmpRole(emp.role);
      setFormEmpPhone(emp.phone);
      setFormEmpEmail(emp.email || '');
      setFormEmpAadhaar(emp.aadhaarNo || '');
      setFormEmpPan(emp.panNo || '');
      setFormEmpJoiningDate(emp.joiningDate);
      setFormEmpSalaryBase(String(emp.salaryBase));
      setFormEmpSalaryType(emp.salaryType);
      setFormEmpBankAccount(emp.bankAccountNo || '');
      setFormEmpBankIFSC(emp.bankIFSC || '');
      setFormEmpUpi(emp.upiAddress || '');
      setFormEmpNameOnAccount(emp.nameOnAccount || '');
      setFormEmpStatus(emp.status);
      setFormEmpInTime(emp.defaultInTime || '');
      setFormEmpOutTime(emp.defaultOutTime || '');
      setFormEmpOpeningAmount('');
    } else {
      setEditingEmployee(null);
      setFormEmpName('');
      setFormEmpRole('driver');
      setFormEmpPhone('');
      setFormEmpEmail('');
      setFormEmpAadhaar('');
      setFormEmpPan('');
      setFormEmpJoiningDate(new Date().toISOString().split('T')[0]);
      setFormEmpSalaryBase('');
      setFormEmpSalaryType('monthly');
      setFormEmpBankAccount('');
      setFormEmpBankIFSC('');
      setFormEmpUpi('');
      setFormEmpNameOnAccount('');
      setFormEmpStatus('active');
      setFormEmpInTime('');
      setFormEmpOutTime('');
      setFormEmpOpeningAmount('');
      setFormEmpOpeningOwesEmp(true);
    }
    setStagedEmpDocs([]);
    setIsEmployeeModalOpen(true);
  };

  const handleSaveEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmpName || !formEmpPhone || !formEmpSalaryBase) {
      alert('Name, Phone and Base Salary are required fields.');
      return;
    }

    const data: Omit<Employee, 'id' | 'createdAt'> = {
      name: formEmpName,
      role: formEmpRole,
      phone: formEmpPhone,
      email: formEmpEmail || undefined,
      aadhaarNo: formEmpAadhaar || undefined,
      panNo: formEmpPan || undefined,
      joiningDate: formEmpJoiningDate,
      salaryBase: Number(formEmpSalaryBase) || 0,
      salaryType: formEmpSalaryType,
      status: formEmpStatus,
      bankAccountNo: formEmpBankAccount || undefined,
      bankIFSC: formEmpBankIFSC || undefined,
      upiAddress: formEmpUpi || undefined,
      nameOnAccount: formEmpNameOnAccount || undefined,
      defaultInTime: formEmpInTime || undefined,
      defaultOutTime: formEmpOutTime || undefined,
      // Ledger opening balance (create mode) — amount is typed positive and
      // the sign toggle decides who it stands against
      ...(editingEmployee
        ? {}
        : {
            openingBalance:
              (Number(formEmpOpeningAmount) || 0) === 0
                ? 0
                : formEmpOpeningOwesEmp
                ? Number(formEmpOpeningAmount)
                : -Number(formEmpOpeningAmount),
          }),
      // Staged documents (new-employee flow) — the server links them in the
      // same create flow and moves each S3 object from Pending/ under
      // Employee/<server id>/
      ...(editingEmployee ? {} : stagedEmpDocs.length > 0 ? { documentIds: stagedEmpDocs.map((d) => d.id) } : {}),
    } as Omit<Employee, 'id' | 'createdAt'> & { documentIds?: string[] };

    if (editingEmployee) {
      db.updateEmployee(editingEmployee.id, data);
    } else {
      // The ledger opens on the master's openingBalance (folded in by the view)
      db.addEmployee(data);
    }
    setIsEmployeeModalOpen(false);
  };

  // Computed Values / Advanced Metrics
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.phone.includes(searchQuery) ||
        (emp.licenseNo && emp.licenseNo.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchRole = roleFilter === 'all' || emp.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [employees, searchQuery, roleFilter]);

  // Overall statistics
  const hrMetrics = useMemo(() => {
    const active = employees.filter((e) => e.status === 'active').length;
    const driversCount = employees.filter((e) => e.role === 'driver').length;

    return {
      active,
      driversCount,
    };
  }, [employees]);

  // Stable reference for the attendance sheet — an inline filter would hand
  // it a fresh array every render and re-trigger its row re-sync effect.
  const activeEmployees = useMemo(
    () => employees.filter((e) => e.status === 'active'),
    [employees]
  );

  return (
    <div className="space-y-6" id="employee-management-container">
      {/* Employee DETAIL PAGE — like the party detail page, it replaces the
          whole employees content while an employee is open */}
      {detailEmployee ? (
        <EmployeeDetailView
          employee={employees.find((e) => e.id === detailEmployee.id) || detailEmployee}
          employees={employees}
          currencySymbol={currencySymbol}
          onBack={() => {
            // Origin-aware: profiles opened from the Fleet Drivers tab return
            // THERE; roster-internal profiles fall back to the directory
            if (onProfileBack) return onProfileBack();
            setDetailEmployee(null);
          }}
          // The page STAYS open when editing — the form modal overlays it and
          // the roster refresh keeps the page on updated data after saving
          onEdit={(emp) => openEmployeeModal(emp)}
        />
      ) : (
      <>
      {/* Workforce info summary */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-1">
        <span className="text-xs text-[var(--color-on-surface-variant)]">
          Active Staff:{' '}
          <span className="font-bold text-[var(--color-on-surface)]">{hrMetrics.active} / {employees.length}</span>
        </span>
        <span className="text-xs text-[var(--color-on-surface-variant)]">
          Registered Drivers:{' '}
          <span className="font-bold text-[var(--color-on-surface)]">{hrMetrics.driversCount}</span>
        </span>
      </div>

      {/* Primary Tab Navigation */}
      <div className="border-b border-[var(--color-outline-variant)] flex flex-wrap gap-2">
        {(['directory', 'attendance', 'ledger'] as const).map((tab) => {
          const isActive = activeTab === tab;
          const labels = {
            directory: 'Staff Directory',
            attendance: 'Attendance Sheet',
            ledger: 'Payroll & Payments',
          };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 font-bold text-xs transition-all relative border-b-2 ${
                isActive
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
              }`}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {/* Tab: Directory */}
      {activeTab === 'directory' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)]">
            <div className="flex flex-wrap gap-3 items-center w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--color-on-surface-variant)]" />
                <input
                  type="text"
                  placeholder="Search name, phone, license..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] rounded-lg text-xs border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden"
                />
              </div>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] text-xs font-semibold px-3 py-1.5 rounded-lg border border-transparent focus:border-[var(--color-primary)] outline-hidden cursor-pointer"
              >
                <option value="all">All Roles</option>
                <option value="driver">Driver</option>
                <option value="supervisor">Supervisor</option>
                <option value="operator">Operator</option>
                <option value="accountant">Accountant</option>
                <option value="manager">Manager</option>
                <option value="helper">Helper</option>
                <option value="other">Other</option>
              </select>
            </div>

            <button
              onClick={() => openEmployeeModal(null)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold text-xs px-4 py-2 rounded-full hover:opacity-90 transition shadow-xs"
            >
              <Plus className="w-4 h-4" /> Add New Employee
            </button>
          </div>

          <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[var(--color-surface-container)] border-b border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] text-[11px] font-bold uppercase tracking-wider">
                    <th className="p-4">Name & Role</th>
                    <th className="p-4">Contact Info</th>
                    <th className="p-4">Joining Date</th>
                    <th className="p-4">Compensation</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Current Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-outline-variant)]/60 text-xs">
                  {filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-[var(--color-on-surface-variant)] font-semibold">
                        No employees found matching filters.
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-[var(--color-surface-container-low)]/50 transition-colors">
                        <td className="p-4">
                          <button
                            type="button"
                            onClick={() => setDetailEmployee(emp)}
                            className="text-left group/empname"
                            title="Open employee details"
                          >
                            <p className="font-bold text-[var(--color-on-surface)] group-hover/empname:text-[var(--color-primary)] transition-colors underline-offset-2 group-hover/empname:underline">
                              {emp.name}
                            </p>
                          </button>
                          <span className="inline-block mt-0.5 text-[10px] font-bold bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] px-2 py-0.5 rounded-full capitalize">
                            {emp.role}
                          </span>
                        </td>
                        <td className="p-4 font-medium text-[var(--color-on-surface-variant)]">
                          <p>{emp.phone}</p>
                          <p className="text-[10px] text-[var(--color-outline)]">{emp.email || 'No email'}</p>
                        </td>
                        <td className="p-4 font-medium text-center text-[var(--color-on-surface-variant)]">{formatDateDMY(emp.joiningDate)}</td>
                        <td className="p-4 font-semibold text-center text-[var(--color-on-surface)]">
                          {formatCurrency(emp.salaryBase, currencySymbol)}
                          <span className="text-[10px] font-normal text-[var(--color-on-surface-variant)] block capitalize">
                            {emp.salaryType}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold capitalize ${
                            emp.status === 'active' ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]' : 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${emp.status === 'active' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'}`} />
                            {emp.status}
                          </span>
                        </td>
                        <td className={`p-4 text-right font-black ${empBalance(emp.id) < 0 ? 'text-[var(--color-error)]' : 'text-[var(--color-success)]'}`}>
                          {formatCurrency(empBalance(emp.id), currencySymbol)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Attendance */}
      {activeTab === 'attendance' && (
        <AttendanceInOutView
          employees={activeEmployees}
          onSaveDailyAttendance={async (records) => {
            // Await the actual posts so the sheet re-fetches only CONFIRMED data
            await db.bulkAddAttendance(records);
            alert('Attendance sheet saved for the selected day.');
          }}
        />
      )}

      {/* Tab: Ledger — the employee is chosen inside the record modal; the
          table lists ALL employees' transactions with an optional single-
          employee filter (legacy payroll payouts appear inside each ledger) */}
      {activeTab === 'ledger' && (
        <EmployeeLedgerView employees={employees} />
      )}

      </>
      )}

      {/* MODAL: Employee Form — rendered over EITHER state (the detail page
          stays open underneath; the roster refresh re-hydrates it on save) */}
      {isEmployeeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/40 backdrop-blur-xs">
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-outline-variant)] shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-[var(--color-outline-variant)] flex justify-between items-center bg-[var(--color-surface-container)]">
              <h3 className="text-sm font-black text-[var(--color-on-surface)] flex items-center gap-2">
                <Contact className="w-5 h-5 text-[var(--color-primary)]" />
                {editingEmployee ? 'Edit Employee Master Card' : 'Register New Employee'}
              </h3>
              <button onClick={() => setIsEmployeeModalOpen(false)} className="text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] p-1.5 rounded-full hover:bg-[var(--color-surface-container-high)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Full Employee Name *</label>
                  <input
                    type="text"
                    required
                    value={formEmpName}
                    onChange={(e) => setFormEmpName(e.target.value)}
                    placeholder="e.g. Arjun Singh"
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Operational Role Designation *</label>
                  <select
                    value={formEmpRole}
                    onChange={(e) => setFormEmpRole(e.target.value as any)}
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden font-bold"
                  >
                    <option value="driver">Driver (Tipper/Tanker Operator)</option>
                    <option value="supervisor">Plant / Site Supervisor</option>
                    <option value="operator">Hot Mix Batch Plant Operator</option>
                    <option value="accountant">Accounts & Ledger Executive</option>
                    <option value="manager">Asphalt Production Manager</option>
                    <option value="helper">Pugmill / Lab Assistant</option>
                    <option value="other">Other Operations Personnel</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Active Phone Number *</label>
                  <input
                    type="tel"
                    required
                    value={formEmpPhone}
                    onChange={(e) => setFormEmpPhone(e.target.value)}
                    placeholder="e.g. +91 98765 43210"
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Email Address</label>
                  <input
                    type="email"
                    value={formEmpEmail}
                    onChange={(e) => setFormEmpEmail(e.target.value)}
                    placeholder="e.g. employee@company.com"
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Aadhaar Card (12 Digits ID)</label>
                  <input
                    type="text"
                    maxLength={12}
                    value={formEmpAadhaar}
                    onChange={(e) => setFormEmpAadhaar(e.target.value)}
                    placeholder="e.g. 5234 1928 3821"
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Income Tax PAN (10 Digits)</label>
                  <input
                    type="text"
                    maxLength={10}
                    value={formEmpPan}
                    onChange={(e) => setFormEmpPan(e.target.value.toUpperCase())}
                    placeholder="e.g. ABCDE1234F"
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden font-medium uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Joining / Deployment Date *</label>
                  <input
                    type="date"
                    required
                    value={formEmpJoiningDate}
                    onChange={(e) => setFormEmpJoiningDate(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Status *</label>
                  <select
                    value={formEmpStatus}
                    onChange={(e) => setFormEmpStatus(e.target.value as any)}
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden font-bold"
                  >
                    <option value="active">Active On Duty</option>
                    <option value="inactive">Suspended / Decommissioned</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">In Time</label>
                  <input
                    type="time"
                    value={formEmpInTime}
                    onChange={(e) => setFormEmpInTime(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Out Time</label>
                  <input
                    type="time"
                    value={formEmpOutTime}
                    onChange={(e) => setFormEmpOutTime(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden font-bold"
                  />
                </div>
              </div>

              {/* Driver DL input removed — license numbers are managed on the
                  employee's detail page instead of the create/edit form */}

              <div className="bg-[var(--color-success-container)]/20 p-4 rounded-xl border border-[var(--color-success)]/20 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-3">
                  <h4 className="text-xs font-bold text-[var(--color-success)] uppercase mb-1">Payout Structure & Bank Details</h4>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-[var(--color-on-surface-variant)] mb-1">Base Salary / Payout *</label>
                  <input
                    type="number"
                    required
                    value={formEmpSalaryBase}
                    onChange={(e) => setFormEmpSalaryBase(e.target.value)}
                    placeholder="e.g. 18000"
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] rounded-lg border border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] outline-hidden font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-[var(--color-on-surface-variant)] mb-1">Salary Type / Frequency *</label>
                  <select
                    value={formEmpSalaryType}
                    onChange={(e) => setFormEmpSalaryType(e.target.value as any)}
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] rounded-lg border border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] outline-hidden font-bold"
                  >
                    <option value="monthly">Monthly Fixed Payout</option>
                    <option value="daily">Daily Wage / Duty Rate</option>
                  </select>
                </div>

                {/* Ledger opening balance — CREATE mode: a positive amount plus
                    the employer's own sign, folded into the employee's ledger */}
                {!editingEmployee && (
                  <div className="sm:col-span-3">
                    <label className="block text-[10px] font-black text-[var(--color-on-surface-variant)] mb-1">Ledger Opening Balance</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formEmpOpeningAmount}
                        onChange={(e) => setFormEmpOpeningAmount(e.target.value)}
                        placeholder="e.g. 5000 (leave blank for 0)"
                        className="w-full text-xs p-2.5 bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] rounded-lg border border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] outline-hidden font-medium"
                      />
                      <div className="flex gap-2">
                        {[
                          { owesEmp: true, label: 'Company owes employee' },
                          { owesEmp: false, label: 'Employee owes company' },
                        ].map((opt) => (
                          <button
                            key={opt.label}
                            type="button"
                            disabled={(Number(formEmpOpeningAmount) || 0) === 0}
                            onClick={() => setFormEmpOpeningOwesEmp(opt.owesEmp)}
                            className={`flex-1 px-2 py-2 text-[10px] font-bold rounded-lg border transition disabled:opacity-40 ${
                              formEmpOpeningOwesEmp === opt.owesEmp
                                ? opt.owesEmp
                                  ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)] border-[var(--color-success)]/40'
                                  : 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)] border-[var(--color-error)]/40'
                                : 'bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface-variant)] border-[var(--color-outline-variant)]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-[9px] font-semibold text-[var(--color-on-surface-variant)] mt-1">
                      Always entered positive — the choice above decides the ledger's starting sign.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-black text-[var(--color-on-surface-variant)] mb-1">Bank Account Number</label>
                  <input
                    type="text"
                    value={formEmpBankAccount}
                    onChange={(e) => setFormEmpBankAccount(e.target.value)}
                    placeholder="e.g. 109284210294"
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] rounded-lg border border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] outline-hidden font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-[var(--color-on-surface-variant)] mb-1">Name on Account</label>
                  <input
                    type="text"
                    value={formEmpNameOnAccount}
                    onChange={(e) => setFormEmpNameOnAccount(e.target.value)}
                    placeholder="e.g. Arjun Singh — as printed on the passbook"
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] rounded-lg border border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] outline-hidden font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-[var(--color-on-surface-variant)] mb-1">IFSC Code Verification</label>
                  <input
                    type="text"
                    value={formEmpBankIFSC}
                    onChange={(e) => setFormEmpBankIFSC(e.target.value.toUpperCase())}
                    placeholder="e.g. SBIN0001042"
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] rounded-lg border border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] outline-hidden font-medium uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-[var(--color-on-surface-variant)] mb-1">UPI Address (VPA)</label>
                  <input
                    type="text"
                    value={formEmpUpi}
                    onChange={(e) => setFormEmpUpi(e.target.value.toLowerCase())}
                    placeholder="e.g. arjunsingh@okhdfcbank"
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] rounded-lg border border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] outline-hidden font-medium"
                  />
                </div>
              </div>

              {/* Documents (S3 upload feature) — same uploader as sale/purchase
                  documents; linked immediately in edit mode, staged under
                  Employee/<id>/ on the server once a new employee is created */}
              <EntityDocumentsSection
                feature="employee"
                entityId={editingEmployee?.id}
                staged={editingEmployee ? undefined : stagedEmpDocs}
                onStagedChange={editingEmployee ? undefined : setStagedEmpDocs}
              />

              <div className="pt-4 border-t border-[var(--color-outline-variant)] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEmployeeModalOpen(false)}
                  className="px-4 py-2 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] font-bold text-xs rounded-full hover:bg-[var(--color-surface-container-highest)] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold text-xs rounded-full hover:opacity-90 transition shadow-xs"
                >
                  {editingEmployee ? 'Apply Profile Updates' : 'Confirm & Register'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
