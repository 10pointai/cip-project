import React, { useState, useMemo } from 'react';
import {
  Contact,
  Clock,
  CreditCard,
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
  MoreVertical,
  PiggyBank,
  Sliders,
  DollarSign,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useDatabase } from '../../hooks/useDatabase';
import { api } from '../../services/api';
import { Employee, EmployeeAttendance, EmployeePayment } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { AttendanceInOutView } from './AttendanceInOutView';
import { EntityDocumentsSection, StagedDocument } from '../common/EntityDocumentsSection';
import { EmployeeDetailModal } from './EmployeeDetailModal';
import { SearchableSelect } from '../orders/SearchableSelect';

/** Last N months ("September 2026", "August 2026", …) for the salary-month picker */
function generatePaymentMonthOptions(count = 12): string[] {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${months[d.getMonth()]} ${d.getFullYear()}`);
  }
  return out;
}

export function EmployeesView() {
  const {
    employees,
    employeePayments,
    accounts,
    settings,
    db,
  } = useDatabase();

  const currencySymbol = settings?.currency?.symbol || '₹';

  // State Management
  const [activeTab, setActiveTab] = useState<'directory' | 'attendance' | 'payroll'>('directory');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Modals
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [detailEmployee, setDetailEmployee] = useState<Employee | null>(null);

  // Row action popover (⋮ — portal popover like the sales/purchases lists)
  const [rowActionMenuFor, setRowActionMenuFor] = useState<string | null>(null);
  const [rowActionMenuPos, setRowActionMenuPos] = useState<{ top: number; right: number; flip: boolean } | null>(null);
  const rowActionRef = React.useRef<HTMLDivElement | null>(null);
  const payRowActionRef = React.useRef<HTMLDivElement | null>(null);
  const rowMenuRef = React.useRef<HTMLDivElement | null>(null);

  // Payroll rows have their own ⋮ menu (actions: Edit Payment)
  const [payRowActionMenuFor, setPayRowActionMenuFor] = useState<string | null>(null);
  const [payRowActionMenuPos, setPayRowActionMenuPos] = useState<{ top: number; right: number; flip: boolean } | null>(null);

  const closeRowActionMenu = () => {
    setRowActionMenuFor(null);
    setRowActionMenuPos(null);
    setPayRowActionMenuFor(null);
    setPayRowActionMenuPos(null);
  };

  React.useEffect(() => {
    if (!rowActionMenuFor && !payRowActionMenuFor) return;
    const handleClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      const outsideDirectory = !rowActionRef.current || !rowActionRef.current.contains(t);
      const outsidePayroll = !payRowActionRef.current || !payRowActionRef.current.contains(t);
      const outsideMenu = !rowMenuRef.current || !rowMenuRef.current.contains(t);
      if (outsideDirectory && outsidePayroll && outsideMenu) {
        closeRowActionMenu();
      }
    };
    const handleMove = () => closeRowActionMenu();
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleMove, true);
    window.addEventListener('resize', handleMove);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleMove, true);
      window.removeEventListener('resize', handleMove);
    };
  }, [rowActionMenuFor, payRowActionMenuFor]);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  // Set = the modal edits an EXISTING payroll payment instead of recording one
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);

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
  const [formEmpLicenseNo, setFormEmpLicenseNo] = useState('');
  const [formEmpBankAccount, setFormEmpBankAccount] = useState('');
  const [formEmpBankIFSC, setFormEmpBankIFSC] = useState('');
  const [formEmpUpi, setFormEmpUpi] = useState('');
  const [formEmpNameOnAccount, setFormEmpNameOnAccount] = useState('');
  const [formEmpStatus, setFormEmpStatus] = useState<'active' | 'inactive'>('active');
  const [formEmpInTime, setFormEmpInTime] = useState('');
  const [formEmpOutTime, setFormEmpOutTime] = useState('');

  // Staged documents (create mode) — document ids ride the create payload and
  // the server links them once the employee id is minted (same as parties).
  const [stagedEmpDocs, setStagedEmpDocs] = useState<StagedDocument[]>([]);

  // Form States - Payment/Advance
  const [formPayEmpId, setFormPayEmpId] = useState('');
  const [formPayDate, setFormPayDate] = useState('');
  const [formPayType, setFormPayType] = useState<'salary' | 'advance' | 'bonus' | 'reimbursement'>('salary');
  const [formPayAmount, setFormPayAmount] = useState('');
  const [formPayAccountId, setFormPayAccountId] = useState('');
  const [formPayMode, setFormPayMode] = useState<EmployeePayment['paymentMode']>('bank_transfer');
  const [formPayRefNo, setFormPayRefNo] = useState('');
  const [formPayMonthYear, setFormPayMonthYear] = useState('');
  const [formPayNotes, setFormPayNotes] = useState('');

  // Payments list — latest RECORDED first (creation/registration order, the
  // effective date only breaks ties for legacy rows without createdAt)
  const sortedPayments = useMemo(
    () => [...employeePayments].sort((a, b) => {
      const ca = Date.parse(b.createdAt || '') || Date.parse(b.date || '') || 0;
      const cb = Date.parse(a.createdAt || '') || Date.parse(a.date || '') || 0;
      return ca - cb;
    }),
    [employeePayments]
  );

  /** Picking an account suggests a mode (bank → transfer, cash → cash); overridable */
  /** Picking an account suggests a mode (bank → transfer, cash → cash); overridable */
  const handlePayAccountChange = (accountId: string) => {
    setFormPayAccountId(accountId);
    const acc = accounts.find((a) => a.id === accountId);
    if (acc) setFormPayMode(acc.type === 'cash' ? 'cash' : 'bank_transfer');
  };

  React.useEffect(() => {
    const handleHeaderAction = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail === 'add-employee') {
        openEmployeeModal(null);
      } else if (customEvent.detail === 'record-employee-payment') {
        openRecordPaymentModal();
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
      setFormEmpLicenseNo(emp.licenseNo || '');
      setFormEmpBankAccount(emp.bankAccountNo || '');
      setFormEmpBankIFSC(emp.bankIFSC || '');
      setFormEmpUpi(emp.upiAddress || '');
      setFormEmpNameOnAccount(emp.nameOnAccount || '');
      setFormEmpStatus(emp.status);
      setFormEmpInTime(emp.defaultInTime || '');
      setFormEmpOutTime(emp.defaultOutTime || '');
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
      setFormEmpLicenseNo('');
      setFormEmpBankAccount('');
      setFormEmpBankIFSC('');
      setFormEmpUpi('');
      setFormEmpNameOnAccount('');
      setFormEmpStatus('active');
      setFormEmpInTime('');
      setFormEmpOutTime('');
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
      licenseNo: formEmpRole === 'driver' ? formEmpLicenseNo : undefined,
      bankAccountNo: formEmpBankAccount || undefined,
      bankIFSC: formEmpBankIFSC || undefined,
      upiAddress: formEmpUpi || undefined,
      nameOnAccount: formEmpNameOnAccount || undefined,
      defaultInTime: formEmpInTime || undefined,
      defaultOutTime: formEmpOutTime || undefined,
      // Staged documents (new-employee flow) — the server links them in the
      // same create flow and moves each S3 object from Pending/ under
      // Employee/<server id>/
      ...(editingEmployee ? {} : stagedEmpDocs.length > 0 ? { documentIds: stagedEmpDocs.map((d) => d.id) } : {}),
    } as Omit<Employee, 'id' | 'createdAt'> & { documentIds?: string[] };

    if (editingEmployee) {
      db.updateEmployee(editingEmployee.id, data);
    } else {
      db.addEmployee(data);
    }
    setIsEmployeeModalOpen(false);
  };

  // Payments
  const payloadAmount = Number(formPayAmount) || 0;

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPayEmpId || !formPayDate || !formPayAmount || !formPayAccountId) {
      alert('Employee, Date, Amount and Paying Account are required.');
      return;
    }
    const selectedAccount = accounts.find((a) => a.id === formPayAccountId);
    if (!selectedAccount) {
      alert('Please pick a valid Cash / Bank account.');
      return;
    }

    const emp = employees.find((em) => em.id === formPayEmpId);
    // Payment mode is an explicit, employer-chosen field (searchable select;
    // picking an account simply pre-suggests it)
    const payload = {
      employeeId: formPayEmpId,
      employeeName: emp?.name || 'Unknown',
      date: formPayDate,
      type: formPayType,
      amount: payloadAmount,
      paymentMode: formPayMode,
      accountId: formPayAccountId,
      referenceNo: formPayRefNo || undefined,
      notes: formPayNotes || undefined,
      monthYear: formPayType === 'salary' ? formPayMonthYear : undefined,
    };

    if (editingPaymentId) {
      db.updateEmployeePayment(editingPaymentId, payload);
    } else {
      db.addEmployeePayment(payload);
    }

    setIsPaymentModalOpen(false);
    setEditingPaymentId(null);
    setFormPayEmpId('');
    setFormPayAmount('');
    setFormPayAccountId('');
    setFormPayRefNo('');
    setFormPayNotes('');
  };

  /** Opens the payment modal prefilled for EDITING an existing record */
  const openEditPaymentModal = (pay: EmployeePayment) => {
    setEditingPaymentId(pay.id);
    setFormPayEmpId(pay.employeeId);
    setFormPayDate(pay.date);
    setFormPayType(pay.type);
    setFormPayAmount(String(pay.amount));
    setFormPayAccountId(pay.accountId || '');
    setFormPayMode(pay.paymentMode);
    setFormPayRefNo(pay.referenceNo || '');
    setFormPayMonthYear(pay.monthYear || '');
    setFormPayNotes(pay.notes || '');
    setIsPaymentModalOpen(true);
  };

  /** Opens the payment modal fresh for RECORDING a new payout */
  const openRecordPaymentModal = (presetEmployeeId?: string) => {
    setEditingPaymentId(null);
    setFormPayEmpId(presetEmployeeId || '');
    setFormPayDate(new Date().toISOString().split('T')[0]);
    setFormPayType('salary');
    setFormPayAmount('');
    setFormPayAccountId('');
    setFormPayMode('bank_transfer');
    setFormPayRefNo('');
    setFormPayMonthYear('');
    setFormPayNotes('');
    setIsPaymentModalOpen(true);
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
        {(['directory', 'attendance', 'payroll'] as const).map((tab) => {
          const isActive = activeTab === tab;
          const labels = {
            directory: 'Staff Directory',
            attendance: 'Attendance Sheet',
            payroll: 'Payroll & Payments',
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
                    <th className="p-4">Govt IDs / License</th>
                    <th className="p-4">Joining Date</th>
                    <th className="p-4">Compensation</th>
                    <th className="p-4">Bank Account</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-outline-variant)]/60 text-xs">
                  {filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-[var(--color-on-surface-variant)] font-semibold">
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
                        <td className="p-4 space-y-0.5">
                          {emp.aadhaarNo && <p className="text-[10px]"><span className="font-bold text-[var(--color-on-surface-variant)]">Aadhaar:</span> {emp.aadhaarNo}</p>}
                          {emp.panNo && <p className="text-[10px]"><span className="font-bold text-[var(--color-on-surface-variant)]">PAN:</span> {emp.panNo}</p>}
                          {emp.role === 'driver' && (
                            <p className="text-[10px] font-medium text-[var(--color-primary)]">
                              <span className="font-bold text-[var(--color-on-surface-variant)]">DL:</span> {emp.licenseNo || 'Pending'}
                            </p>
                          )}
                        </td>
                        <td className="p-4 font-medium text-[var(--color-on-surface-variant)]">{emp.joiningDate}</td>
                        <td className="p-4 font-semibold text-[var(--color-on-surface)]">
                          {formatCurrency(emp.salaryBase, currencySymbol)}
                          <span className="text-[10px] font-normal text-[var(--color-on-surface-variant)] block">
                            per {emp.salaryType}
                          </span>
                        </td>
                        <td className="p-4 text-[var(--color-on-surface)]">
                          {emp.bankAccountNo ? (
                            <div>
                              <p className="font-medium">{emp.bankAccountNo}</p>
                              <p className="text-[10px] text-[var(--color-on-surface-variant)] font-bold">IFSC: {emp.bankIFSC}</p>
                            </div>
                          ) : (
                            <span className="text-[var(--color-on-surface-variant)] italic text-[11px]">Not Provided</span>
                          )}
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold capitalize ${
                            emp.status === 'active' ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]' : 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${emp.status === 'active' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'}`} />
                            {emp.status}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end" >
                            <div className="relative" ref={rowActionRef}>
                              <button
                                type="button"
                                title="More Actions"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (rowActionMenuFor === emp.id) {
                                    closeRowActionMenu();
                                    return;
                                  }
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  // flip above the button when nothing fits underneath
                                  const flip = rect.bottom + 230 > window.innerHeight;
                                  setRowActionMenuPos({
                                    top: flip ? rect.top : rect.bottom,
                                    right: window.innerWidth - rect.right,
                                    flip,
                                  });
                                  setRowActionMenuFor(emp.id);
                                }}
                                className={`p-1.5 rounded-full transition-colors ${
                                  rowActionMenuFor === emp.id
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
          onSaveDailyAttendance={(records) => {
            db.bulkAddAttendance(records);
            alert('Attendance sheet saved for the selected day.');
          }}
        />
      )}

      {/* Tab: Payroll */}
      {activeTab === 'payroll' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)]">
            <p className="text-xs font-bold text-[var(--color-on-surface-variant)]">Salary Disbursements, Festival Bonuses & Personal Advances</p>
            <div className="flex gap-2 w-full sm:w-auto">
              <button
                onClick={() => openRecordPaymentModal()}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold text-xs px-4 py-2.5 rounded-full hover:opacity-90 transition shadow-xs"
              >
                <Plus className="w-4 h-4" /> Record Salary / Advance Payment
              </button>
            </div>
          </div>

          <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] overflow-hidden shadow-xs">
            <div className="p-4 bg-[var(--color-surface-container)] border-b border-[var(--color-outline-variant)]">
              <p className="text-[11px] font-black text-[var(--color-on-surface-variant)] uppercase tracking-wider">Compensation Log history</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[var(--color-surface-container-low)] border-b border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] text-[11px] font-bold uppercase tracking-wider">
                    <th className="p-4">Employee Name</th>
                    <th className="p-4">Disbursed Date</th>
                    <th className="p-4">Transaction Type</th>
                    <th className="p-4">Disbursed Amount</th>
                    <th className="p-4">Paid From (Account)</th>
                    <th className="p-4">Type / Mode</th>
                    <th className="p-4">Ref No / Month</th>
                    <th className="p-4">Notes</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-outline-variant)]/60 text-xs">
                  {sortedPayments.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-[var(--color-on-surface-variant)] font-semibold">
                        No payments logged.
                      </td>
                    </tr>
                  ) : (
                    sortedPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-[var(--color-surface-container-low)]/50 transition">
                        <td className="p-4 font-bold text-[var(--color-on-surface)]">{p.employeeName}</td>
                        <td className="p-4 font-medium text-[var(--color-on-surface-variant)]">{p.date}</td>
                        <td className="p-4 capitalize">
                          <span className={`inline-block px-2 py-0.5 font-bold text-[10px] rounded-full capitalize ${
                            p.type === 'salary'
                              ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]'
                              : p.type === 'advance'
                              ? 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]'
                              : p.type === 'bonus'
                              ? 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]'
                              : 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'
                          }`}>
                            {p.type}
                          </span>
                        </td>
                        <td className={`p-4 font-black ${p.type === 'advance' ? 'text-[var(--color-error)]' : 'text-[var(--color-success)]'}`}>
                          {p.type === 'advance' ? '-' : ''}{formatCurrency(p.amount, currencySymbol)}
                        </td>
                        <td className="p-4">
                          <span className="font-semibold text-[var(--color-on-surface)]">{p.accountName || '—'}</span>
                        </td>
                        <td className="p-4 capitalize font-semibold text-[var(--color-on-surface-variant)]">{p.paymentMode.replace('_', ' ')}</td>
                        <td className="p-4 font-semibold text-[var(--color-on-surface-variant)]">
                          {p.monthYear && <p className="text-[10px] text-[var(--color-primary)] bg-[var(--color-primary-container)] px-2 py-0.5 rounded-full inline-block">{p.monthYear}</p>}
                          <p className="text-[10px] text-[var(--color-outline)] mt-0.5">{p.referenceNo || 'No Ref No'}</p>
                        </td>
                        <td className="p-4 text-[var(--color-outline)] max-w-xs truncate" title={p.notes}>{p.notes || '-'}</td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end">
                            <div className="relative" ref={payRowActionRef}>
                              <button
                                type="button"
                                title="More Actions"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (payRowActionMenuFor === p.id) {
                                    closeRowActionMenu();
                                    return;
                                  }
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  const flip = rect.bottom + 90 > window.innerHeight;
                                  setPayRowActionMenuFor(p.id);
                                  setPayRowActionMenuPos({
                                    top: flip ? rect.top : rect.bottom,
                                    right: window.innerWidth - rect.right,
                                    flip,
                                  });
                                }}
                                className={`p-1.5 rounded-full transition-colors ${
                                  payRowActionMenuFor === p.id
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
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Row action popover — PORTAL: fixed on the page so the list container
          (overflow-x-auto / overflow-hidden) can never clip it */}
      {rowActionMenuFor && rowActionMenuPos && createPortal(
        <div
          ref={rowMenuRef}
          style={{
            position: 'fixed',
            top: rowActionMenuPos.flip ? rowActionMenuPos.top - 4 : rowActionMenuPos.top + 4,
            right: Math.max(8, rowActionMenuPos.right + 8),
            transform: rowActionMenuPos.flip ? 'translateY(-100%)' : 'none',
          }}
          className="z-[60] w-60 max-w-[calc(100vw-16px)] rounded-2xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] shadow-2xl overflow-hidden text-left"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="px-3 pt-2.5 pb-1.5 text-[9px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
            Actions — {employees.find((e) => e.id === rowActionMenuFor)?.name || ''}
          </p>
          {(() => {
            const target = employees.find((e) => e.id === rowActionMenuFor);
            if (!target) return null;
            return (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  closeRowActionMenu();
                  openEmployeeModal(target);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-bold text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)] transition-colors border-t border-[var(--color-outline-variant)]/50"
              >
                <Edit className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                Edit Employee
              </button>
            );
          })()}
        </div>,
        document.body
      )}

      {/* Payroll row action popover — PORTAL; single action: Edit Payment */}
      {payRowActionMenuFor && payRowActionMenuPos && createPortal(
        <div
          ref={rowMenuRef}
          style={{
            position: 'fixed',
            top: payRowActionMenuPos.flip ? payRowActionMenuPos.top - 4 : payRowActionMenuPos.top + 4,
            right: Math.max(8, payRowActionMenuPos.right + 8),
            transform: payRowActionMenuPos.flip ? 'translateY(-100%)' : 'none',
          }}
          className="z-[60] w-60 max-w-[calc(100vw-16px)] rounded-2xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] shadow-2xl overflow-hidden text-left"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="px-3 pt-2.5 pb-1.5 text-[9px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
            Actions — {employeePayments.find((p) => p.id === payRowActionMenuFor)?.employeeName || ''}
          </p>
          {(() => {
            const target = employeePayments.find((p) => p.id === payRowActionMenuFor);
            if (!target) return null;
            return (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  closeRowActionMenu();
                  openEditPaymentModal(target);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-bold text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)] transition-colors border-t border-[var(--color-outline-variant)]/50"
              >
                <Edit className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                Edit Payment
              </button>
            );
          })()}
        </div>,
        document.body
      )}

      {/* MODAL: Employee Details (click the employee name in the directory) */}
      <EmployeeDetailModal
        isOpen={detailEmployee !== null}
        onClose={() => setDetailEmployee(null)}
        employee={detailEmployee ? (employees.find((e) => e.id === detailEmployee.id) || detailEmployee) : null}
        payments={employeePayments}
        currencySymbol={currencySymbol}
        onEdit={(emp) => openEmployeeModal(emp)}
      />

      {/* MODAL: Employee Form */}
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

              {formEmpRole === 'driver' && (
                <div className="bg-[var(--color-primary-container)]/20 p-4 rounded-xl border border-[var(--color-primary)]/20">
                  <h4 className="text-xs font-bold text-[var(--color-primary)] uppercase mb-2">Driver Specific Verification</h4>
                  <div>
                    <label className="block text-[10px] font-black text-[var(--color-on-surface-variant)] mb-1">Heavy Commercial License No (DL) *</label>
                    <input
                      type="text"
                      required={formEmpRole === 'driver'}
                      value={formEmpLicenseNo}
                      onChange={(e) => setFormEmpLicenseNo(e.target.value)}
                      placeholder="e.g. MH-12-2015-0038491"
                      className="w-full text-xs p-2.5 bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] rounded-lg border border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] outline-hidden font-medium"
                    />
                  </div>
                </div>
              )}

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

      {/* MODAL: Payment Form (record / edit) */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/40 backdrop-blur-xs">
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-outline-variant)] shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-[var(--color-outline-variant)] flex justify-between items-center bg-[var(--color-surface-container)]">
              <h3 className="text-sm font-black text-[var(--color-on-surface)] flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[var(--color-success)]" /> {editingPaymentId ? 'Edit Payment Record' : 'Disburse Funds / Record Payout'}
              </h3>
              <button onClick={() => { setIsPaymentModalOpen(false); setEditingPaymentId(null); }} className="text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] p-1.5 rounded-full hover:bg-[var(--color-surface-container-high)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="p-6 space-y-4">
              {/* Searchable: Employee */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Select Employee *</label>
                <div className="w-full px-3 py-2 bg-[var(--color-surface-container-high)] rounded-lg border border-transparent focus-within:border-[var(--color-primary)] focus-within:bg-[var(--color-surface-container-lowest)]">
                  <SearchableSelect
                    value={formPayEmpId}
                    onChange={setFormPayEmpId}
                    placeholder="Type to search employees..."
                    options={activeEmployees.map((e) => ({
                      value: e.id,
                      label: e.name,
                      sub: `${e.role[0].toUpperCase() + e.role.slice(1)} • ${e.phone}`,
                    }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Searchable: Transaction Type (salary first) */}
                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Transaction Type *</label>
                  <div className="w-full px-3 py-2 bg-[var(--color-surface-container-high)] rounded-lg border border-transparent focus-within:border-[var(--color-primary)] focus-within:bg-[var(--color-surface-container-lowest)]">
                    <SearchableSelect
                      value={formPayType}
                      onChange={(v) => setFormPayType(v as EmployeePayment['type'])}
                      placeholder="Type to search..."
                      options={[
                        { value: 'salary', label: 'Salary Paid Out' },
                        { value: 'advance', label: 'Advance Taken' },
                        { value: 'bonus', label: 'Festival / Duty Bonus' },
                        { value: 'reimbursement', label: 'Reimbursement (Fuel/Food)' },
                      ]}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Disburse Date *</label>
                  <input
                    type="date"
                    required
                    value={formPayDate}
                    onChange={(e) => setFormPayDate(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Disbursed Amount *</label>
                <input
                  type="number"
                  required
                  value={formPayAmount}
                  onChange={(e) => setFormPayAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden font-bold"
                />
              </div>

              {/* Searchable: Paying Account + Mode of Payment */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Paying Account (Cash & Bank) *</label>
                  <div className="w-full px-3 py-2 bg-[var(--color-surface-container-high)] rounded-lg border border-transparent focus-within:border-[var(--color-primary)] focus-within:bg-[var(--color-surface-container-lowest)]">
                    <SearchableSelect
                      value={formPayAccountId}
                      onChange={handlePayAccountChange}
                      placeholder="Type to search accounts..."
                      options={accounts.filter((a) => a.isActive !== false).map((a) => ({
                        value: a.id,
                        label: a.name,
                        sub: `${a.type === 'cash' ? 'Cash' : 'Bank'} • ${formatCurrency(a.currentBalance || 0, currencySymbol)}`,
                      }))}
                    />
                  </div>
                  <p className="text-[10px] font-semibold text-[var(--color-on-surface-variant)] mt-1">
                    The amount leaves this account's ledger when recorded.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Mode of Payment *</label>
                  <div className="w-full px-3 py-2 bg-[var(--color-surface-container-high)] rounded-lg border border-transparent focus-within:border-[var(--color-primary)] focus-within:bg-[var(--color-surface-container-lowest)]">
                    <SearchableSelect
                      value={formPayMode}
                      onChange={(v) => setFormPayMode(v as EmployeePayment['paymentMode'])}
                      placeholder="Type to search..."
                      options={[
                        { value: 'upi', label: 'UPI (GPay / PhonePe)' },
                        { value: 'bank_transfer', label: 'Direct Bank NEFT/RTGS' },
                        { value: 'cash', label: 'Petty Cash Handout' },
                        { value: 'cheque', label: 'Bank Account Cheque' },
                      ]}
                    />
                  </div>
                </div>
              </div>

              {formPayType === 'salary' ? (
                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Salary Month & Year *</label>
                  <select
                    required={formPayType === 'salary'}
                    value={formPayMonthYear}
                    onChange={(e) => setFormPayMonthYear(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden font-bold"
                  >
                    <option value="">-- Select Month --</option>
                    {generatePaymentMonthOptions().map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div>
                <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Transaction Ref No (UTR / Cheque No)</label>
                <input
                  type="text"
                  value={formPayRefNo}
                  onChange={(e) => setFormPayRefNo(e.target.value)}
                  placeholder="e.g. NEFT-N20491823"
                  className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Voucher Description (Remarks)</label>
                <input
                  type="text"
                  value={formPayNotes}
                  onChange={(e) => setFormPayNotes(e.target.value)}
                  placeholder="e.g. Emergency advance for health requirements"
                  className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden font-medium"
                />
              </div>

              <div className="pt-4 border-t border-[var(--color-outline-variant)] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setIsPaymentModalOpen(false); setEditingPaymentId(null); }}
                  className="px-4 py-2 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] font-bold text-xs rounded-full hover:bg-[var(--color-surface-container-highest)] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold text-xs rounded-full hover:opacity-90 transition shadow-xs"
                >
                  {editingPaymentId ? 'Save Changes' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
