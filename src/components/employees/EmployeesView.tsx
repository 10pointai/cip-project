import React, { useState, useMemo } from 'react';
import {
  Contact,
  Users,
  Calendar,
  Clock,
  CreditCard,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit,
  Check,
  X,
  FileText,
  TrendingUp,
  AlertCircle,
  Coins,
  ArrowUpRight,
  ArrowDownLeft,
  CalendarDays,
  Printer,
  ChevronRight,
  CheckCircle,
  PiggyBank,
  Sliders,
  DollarSign,
} from 'lucide-react';
import { useDatabase } from '../../hooks/useDatabase';
import { Employee, EmployeeAttendance, EmployeeLeave, EmployeePayment } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { AttendanceInOutView } from './AttendanceInOutView';

export function EmployeesView() {
  const {
    employees,
    attendance,
    leaves,
    employeePayments,
    settings,
    db,
  } = useDatabase();

  const currencySymbol = settings?.currency?.symbol || '₹';

  // State Management
  const [activeTab, setActiveTab] = useState<'directory' | 'attendance' | 'leaves' | 'payroll'>('directory');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Modals
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

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
  const [formEmpStatus, setFormEmpStatus] = useState<'active' | 'inactive'>('active');

  // Form States - Leave Request
  const [formLvEmpId, setFormLvEmpId] = useState('');
  const [formLvType, setFormLvType] = useState<'casual' | 'sick' | 'earned' | 'maternity' | 'unpaid'>('casual');
  const [formLvStartDate, setFormLvStartDate] = useState('');
  const [formLvEndDate, setFormLvEndDate] = useState('');
  const [formLvReason, setFormLvReason] = useState('');

  // Form States - Payment/Advance
  const [formPayEmpId, setFormPayEmpId] = useState('');
  const [formPayDate, setFormPayDate] = useState('');
  const [formPayType, setFormPayType] = useState<'salary' | 'advance' | 'bonus' | 'reimbursement'>('advance');
  const [formPayAmount, setFormPayAmount] = useState('');
  const [formPayMode, setFormPayMode] = useState<'bank_transfer' | 'cash' | 'upi' | 'cheque'>('upi');
  const [formPayRefNo, setFormPayRefNo] = useState('');
  const [formPayMonthYear, setFormPayMonthYear] = useState('');
  const [formPayNotes, setFormPayNotes] = useState('');

  // Attendance Tracker state
  const [attendanceDate, setAttendanceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [tempAttendance, setTempAttendance] = useState<{ [employeeId: string]: 'present' | 'absent' | 'half_day' | 'leave' | 'late' }>({});
  const [isAttendanceDirty, setIsAttendanceDirty] = useState(false);

  // Payroll Calculator State
  const [selectedPayslipEmpId, setSelectedPayslipEmpId] = useState<string>('');
  const [payslipMonth, setPayslipMonth] = useState<string>(() => {
    const d = new Date();
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  });
  const [isPayslipPreviewOpen, setIsPayslipPreviewOpen] = useState(false);

  React.useEffect(() => {
    const handleHeaderAction = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail === 'add-employee') {
        openEmployeeModal(null);
      } else if (customEvent.detail === 'record-employee-payment') {
        setFormPayEmpId('');
        setFormPayDate(new Date().toISOString().split('T')[0]);
        setFormPayType('advance');
        setFormPayAmount('');
        setFormPayMode('upi');
        setFormPayRefNo('');
        setFormPayMonthYear('');
        setFormPayNotes('');
        setIsPaymentModalOpen(true);
      } else if (customEvent.detail === 'apply-employee-leave') {
        setFormLvEmpId('');
        setFormLvType('casual');
        setFormLvStartDate(new Date().toISOString().split('T')[0]);
        setFormLvEndDate(new Date().toISOString().split('T')[0]);
        setFormLvReason('');
        setIsLeaveModalOpen(true);
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
      setFormEmpStatus(emp.status);
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
      setFormEmpStatus('active');
    }
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
    };

    if (editingEmployee) {
      db.updateEmployee(editingEmployee.id, data);
    } else {
      db.addEmployee(data);
    }
    setIsEmployeeModalOpen(false);
  };

  const handleDeleteEmployee = (id: string) => {
    if (confirm('Are you sure you want to remove this employee? This will delete their master record, but their historical transactions will remain.')) {
      db.deleteEmployee(id);
    }
  };

  // Load attendance logs for selected date
  React.useEffect(() => {
    const existingForDay = attendance.filter((a) => a.date === attendanceDate);
    const initialMap: typeof tempAttendance = {};
    employees.forEach((emp) => {
      const match = existingForDay.find((a) => a.employeeId === emp.id);
      initialMap[emp.id] = match ? match.status : 'present'; // Default to present if unmarked
    });
    setTempAttendance(initialMap);
    setIsAttendanceDirty(false);
  }, [attendanceDate, attendance, employees]);

  const handleMarkAttendance = (empId: string, status: typeof tempAttendance[string]) => {
    setTempAttendance((prev) => ({
      ...prev,
      [empId]: status,
    }));
    setIsAttendanceDirty(true);
  };

  const handleSaveAttendanceSheet = () => {
    const records = Object.entries(tempAttendance).map(([empId, status]) => {
      const emp = employees.find((e) => e.id === empId);
      return {
        employeeId: empId,
        employeeName: emp?.name || 'Unknown',
        date: attendanceDate,
        status: status as 'present' | 'absent' | 'half_day' | 'leave' | 'late',
      };
    });
    db.bulkAddAttendance(records);
    setIsAttendanceDirty(false);
    alert(`Attendance logged successfully for ${attendanceDate}`);
  };

  // Leaves
  const handleSaveLeave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formLvEmpId || !formLvStartDate || !formLvEndDate || !formLvReason) {
      alert('Please fill out all leave fields.');
      return;
    }

    const start = new Date(formLvStartDate);
    const end = new Date(formLvEndDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const emp = employees.find((em) => em.id === formLvEmpId);

    db.addLeave({
      employeeId: formLvEmpId,
      employeeName: emp?.name || 'Unknown',
      leaveType: formLvType,
      startDate: formLvStartDate,
      endDate: formLvEndDate,
      totalDays,
      reason: formLvReason,
      status: 'pending',
    });

    setIsLeaveModalOpen(false);
    setFormLvEmpId('');
    setFormLvReason('');
  };

  const handleUpdateLeaveStatus = (leaveId: string, status: 'approved' | 'rejected') => {
    db.updateLeave(leaveId, { status });
  };

  const handleDeleteLeave = (id: string) => {
    if (confirm('Are you sure you want to delete this leave request?')) {
      db.deleteLeave(id);
    }
  };

  // Payments
  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPayEmpId || !formPayDate || !formPayAmount) {
      alert('Please fill out all payment fields.');
      return;
    }

    const emp = employees.find((em) => em.id === formPayEmpId);

    db.addEmployeePayment({
      employeeId: formPayEmpId,
      employeeName: emp?.name || 'Unknown',
      date: formPayDate,
      type: formPayType,
      amount: Number(formPayAmount) || 0,
      paymentMode: formPayMode,
      referenceNo: formPayRefNo || undefined,
      notes: formPayNotes || undefined,
      monthYear: formPayType === 'salary' ? formPayMonthYear : undefined,
    });

    setIsPaymentModalOpen(false);
    setFormPayEmpId('');
    setFormPayAmount('');
    setFormPayRefNo('');
    setFormPayNotes('');
  };

  const handleDeletePayment = (id: string) => {
    if (confirm('Are you sure you want to cancel/delete this payment record?')) {
      db.deleteEmployeePayment(id);
    }
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

  // Attendance metrics for selected date
  const attendanceStats = useMemo(() => {
    const records = attendance.filter((a) => a.date === attendanceDate);
    const present = records.filter((r) => r.status === 'present').length;
    const absent = records.filter((r) => r.status === 'absent').length;
    const halfDay = records.filter((r) => r.status === 'half_day').length;
    const leave = records.filter((r) => r.status === 'leave').length;
    const late = records.filter((r) => r.status === 'late').length;

    return {
      logged: records.length,
      present: present + late,
      absent,
      halfDay,
      leave,
      late,
    };
  }, [attendance, attendanceDate]);

  // Overall statistics
  const hrMetrics = useMemo(() => {
    const active = employees.filter((e) => e.status === 'active').length;
    const driversCount = employees.filter((e) => e.role === 'driver').length;

    // Financial summaries (Month to date - August 2026 as current context)
    const currentMonthYear = 'August 2026';
    const totalAdvances = employeePayments
      .filter((p) => p.type === 'advance' && p.date.startsWith('2026-08'))
      .reduce((sum, p) => sum + p.amount, 0);

    const totalSalaryPaid = employeePayments
      .filter((p) => p.type === 'salary' && p.date.startsWith('2026-08'))
      .reduce((sum, p) => sum + p.amount, 0);

    return {
      active,
      driversCount,
      totalAdvances,
      totalSalaryPaid,
    };
  }, [employees, employeePayments]);

  // Dynamic Payslip Calculator for Selected Employee and Month
  const calculatedPayslip = useMemo(() => {
    if (!selectedPayslipEmpId) return null;
    const emp = employees.find((e) => e.id === selectedPayslipEmpId);
    if (!emp) return null;

    // Resolve month bounds to filter attendance & payments
    // Assumes simple matching e.g. "August 2026" translates to "2026-08" prefix
    const monthPrefix = payslipMonth === 'August 2026' ? '2026-08' :
      payslipMonth === 'July 2026' ? '2026-07' :
      payslipMonth === 'September 2026' ? '2026-09' : '2026-08';

    // 1. Calculate Attendance
    const empAtt = attendance.filter((a) => a.employeeId === emp.id && a.date.startsWith(monthPrefix));
    const daysPresent = empAtt.filter((a) => a.status === 'present' || a.status === 'late').length;
    const daysHalf = empAtt.filter((a) => a.status === 'half_day').length;
    const daysAbsent = empAtt.filter((a) => a.status === 'absent').length;

    // Simple payroll base calculation
    let earnedBase = emp.salaryBase;
    if (emp.salaryType === 'daily') {
      const activeDays = daysPresent + (daysHalf * 0.5);
      earnedBase = emp.salaryBase * activeDays;
    } else {
      // Monthly, apply deductions for absence
      const daysInMonth = 30; // standard approximation
      const unexcusedAbsence = daysAbsent;
      if (unexcusedAbsence > 0) {
        earnedBase = emp.salaryBase - (emp.salaryBase / daysInMonth) * unexcusedAbsence;
      }
    }

    // 2. Advances Taken (Deductions)
    const empAdvances = employeePayments.filter(
      (p) => p.employeeId === emp.id && p.type === 'advance' && p.date.startsWith(monthPrefix)
    );
    const totalAdvancesTaken = empAdvances.reduce((sum, p) => sum + p.amount, 0);

    // 3. Bonuses Awarded
    const empBonuses = employeePayments.filter(
      (p) => p.employeeId === emp.id && p.type === 'bonus' && p.date.startsWith(monthPrefix)
    );
    const totalBonusesAwarded = empBonuses.reduce((sum, p) => sum + p.amount, 0);

    const netPayable = earnedBase + totalBonusesAwarded - totalAdvancesTaken;

    return {
      employee: emp,
      month: payslipMonth,
      attendance: {
        totalDaysLogged: empAtt.length,
        daysPresent,
        daysHalf,
        daysAbsent,
      },
      earnings: {
        base: emp.salaryBase,
        earnedBase: Math.max(0, Math.round(earnedBase)),
        bonuses: totalBonusesAwarded,
      },
      deductions: {
        advances: totalAdvancesTaken,
      },
      netPayable: Math.max(0, Math.round(netPayable)),
    };
  }, [selectedPayslipEmpId, payslipMonth, employees, attendance, employeePayments]);

  const handleRecordCalculatedSalaryPayout = () => {
    if (!calculatedPayslip) return;
    const { employee, netPayable, month } = calculatedPayslip;

    db.addEmployeePayment({
      employeeId: employee.id,
      employeeName: employee.name,
      date: new Date().toISOString().split('T')[0],
      type: 'salary',
      amount: netPayable,
      paymentMode: 'bank_transfer',
      notes: `Auto-calculated payout for ${month}`,
      monthYear: month,
    });

    setIsPayslipPreviewOpen(false);
    alert(`Successfully recorded Salary Payout of ${formatCurrency(netPayable, currencySymbol)} to ${employee.name} for ${month}!`);
  };

  return (
    <div className="space-y-6" id="employee-management-container">
      {/* Dynamic Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] flex items-center gap-4 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--color-on-surface-variant)]">Active Staff</p>
            <p className="text-xl font-black text-[var(--color-on-surface)]">{hrMetrics.active} / {employees.length}</p>
          </div>
        </div>

        <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] flex items-center gap-4 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-success-container)] text-[var(--color-on-success-container)] flex items-center justify-center">
            <Contact className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--color-on-surface-variant)]">Registered Drivers</p>
            <p className="text-xl font-black text-[var(--color-on-surface)]">{hrMetrics.driversCount}</p>
          </div>
        </div>

        <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] flex items-center gap-4 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-error-container)] text-[var(--color-on-error-container)] flex items-center justify-center">
            <ArrowUpRight className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--color-on-surface-variant)]">MTD Active Advances</p>
            <p className="text-xl font-black text-[var(--color-on-surface)]">{formatCurrency(hrMetrics.totalAdvances, currencySymbol)}</p>
          </div>
        </div>

        <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] flex items-center gap-4 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] flex items-center justify-center">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--color-on-surface-variant)]">MTD Salaries Payout</p>
            <p className="text-xl font-black text-[var(--color-on-surface)]">{formatCurrency(hrMetrics.totalSalaryPaid, currencySymbol)}</p>
          </div>
        </div>
      </div>

      {/* Primary Tab Navigation */}
      <div className="border-b border-[var(--color-outline-variant)] flex flex-wrap gap-2">
        {(['directory', 'attendance', 'leaves', 'payroll'] as const).map((tab) => {
          const isActive = activeTab === tab;
          const labels = {
            directory: 'Staff Directory',
            attendance: 'Attendance Sheet',
            leaves: 'Leave Requests',
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
                          <p className="font-bold text-[var(--color-on-surface)]">{emp.name}</p>
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
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => openEmployeeModal(emp)}
                              className="p-1.5 text-[var(--color-primary)] hover:bg-[var(--color-primary-container)]/30 rounded-lg transition"
                              title="Edit Employee details"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedPayslipEmpId(emp.id);
                                setIsPayslipPreviewOpen(true);
                              }}
                              className="p-1.5 text-[var(--color-success)] hover:bg-[var(--color-success-container)]/30 rounded-lg transition"
                              title="Calculate monthly pay & generate Payslip"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteEmployee(emp.id)}
                              className="p-1.5 text-[var(--color-error)] hover:bg-[var(--color-error-container)]/30 rounded-lg transition"
                              title="Delete Employee"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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
          employees={employees.filter((e) => e.status === 'active')}
          attendance={attendance}
          onSaveDailyAttendance={(records) => {
            db.bulkAddAttendance(records);
            alert('Daily In & Out attendance sheet updated and saved successfully.');
          }}
          onRecordPunch={(empId, type, date, time, source, note) => {
            db.recordPunch(empId, type, date, time, source, note);
          }}
          onUpdateAttendanceRecord={(id, updates) => {
            db.updateAttendance(id, updates);
          }}
        />
      )}

      {/* Tab: Leaves */}
      {activeTab === 'leaves' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)]">
            <p className="text-xs font-bold text-[var(--color-on-surface-variant)]">Request & Approve Leave Logs</p>
            <button
              onClick={() => setIsLeaveModalOpen(true)}
              className="flex items-center gap-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold text-xs px-4 py-2 rounded-full hover:opacity-90 transition"
            >
              <Plus className="w-4 h-4" /> Request Leave
            </button>
          </div>

          <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[var(--color-surface-container)] border-b border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] text-[11px] font-bold uppercase tracking-wider">
                    <th className="p-4">Employee</th>
                    <th className="p-4">Leave Period</th>
                    <th className="p-4">Total Days</th>
                    <th className="p-4">Reason</th>
                    <th className="p-4">Created Date</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-outline-variant)]/60 text-xs">
                  {leaves.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-[var(--color-on-surface-variant)] font-semibold">
                        No leave records recorded yet.
                      </td>
                    </tr>
                  ) : (
                    leaves.map((lv) => (
                      <tr key={lv.id} className="hover:bg-[var(--color-surface-container-low)]/50 transition">
                        <td className="p-4 font-bold text-[var(--color-on-surface)]">{lv.employeeName}</td>
                        <td className="p-4 font-medium text-[var(--color-on-surface-variant)]">
                          {lv.startDate} <span className="text-[var(--color-outline)] font-bold mx-1">to</span> {lv.endDate}
                        </td>
                        <td className="p-4 font-bold text-[var(--color-on-surface)]">{lv.totalDays} Days</td>
                        <td className="p-4 text-[var(--color-on-surface-variant)] max-w-xs truncate" title={lv.reason}>{lv.reason}</td>
                        <td className="p-4 text-[var(--color-outline)]">{new Date(lv.createdAt).toLocaleDateString()}</td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold capitalize ${
                            lv.status === 'approved'
                              ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]'
                              : lv.status === 'rejected'
                              ? 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]'
                              : 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              lv.status === 'approved'
                                ? 'bg-[var(--color-success)]'
                                : lv.status === 'rejected'
                                ? 'bg-[var(--color-error)]'
                                : 'bg-[var(--color-warning)]'
                            }`} />
                            {lv.status}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            {lv.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleUpdateLeaveStatus(lv.id, 'approved')}
                                  className="p-1 px-2.5 bg-[var(--color-success-container)] text-[var(--color-on-success-container)] hover:opacity-90 font-bold text-[10px] rounded-full transition"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleUpdateLeaveStatus(lv.id, 'rejected')}
                                  className="p-1 px-2.5 bg-[var(--color-error-container)] text-[var(--color-on-error-container)] hover:opacity-90 font-bold text-[10px] rounded-full transition"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => handleDeleteLeave(lv.id)}
                              className="p-1.5 text-[var(--color-error)] hover:bg-[var(--color-error-container)]/30 rounded-lg transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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

      {/* Tab: Payroll */}
      {activeTab === 'payroll' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)]">
            <p className="text-xs font-bold text-[var(--color-on-surface-variant)]">Salary Disbursements, Festival Bonuses & Personal Advances</p>
            <div className="flex gap-2 w-full sm:w-auto">
              <button
                onClick={() => setIsPaymentModalOpen(true)}
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
                    <th className="p-4">Payment Mode</th>
                    <th className="p-4">Ref No / Month</th>
                    <th className="p-4">Notes</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-outline-variant)]/60 text-xs">
                  {employeePayments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-[var(--color-on-surface-variant)] font-semibold">
                        No payments logged.
                      </td>
                    </tr>
                  ) : (
                    employeePayments.map((p) => (
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
                        <td className="p-4 capitalize font-semibold text-[var(--color-on-surface-variant)]">{p.paymentMode.replace('_', ' ')}</td>
                        <td className="p-4 font-semibold text-[var(--color-on-surface-variant)]">
                          {p.monthYear && <p className="text-[10px] text-[var(--color-primary)] bg-[var(--color-primary-container)] px-2 py-0.5 rounded-full inline-block">{p.monthYear}</p>}
                          <p className="text-[10px] text-[var(--color-outline)] mt-0.5">{p.referenceNo || 'No Ref No'}</p>
                        </td>
                        <td className="p-4 text-[var(--color-outline)] max-w-xs truncate" title={p.notes}>{p.notes || '-'}</td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleDeletePayment(p.id)}
                            className="p-1.5 text-[var(--color-error)] hover:bg-[var(--color-error-container)]/30 rounded-lg transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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

      {/* MODAL: Employee Form */}
      {isEmployeeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/40 backdrop-blur-xs">
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-outline-variant)] shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-[var(--color-outline-variant)] flex justify-between items-center bg-[var(--color-surface-container)]">
              <h3 className="text-sm font-black text-[var(--color-on-surface)] flex items-center gap-2">
                <Contact className="w-5 h-5 text-[var(--color-primary)]" />
                {editingEmployee ? 'Edit Employee Master Card' : 'Register New Personnel Profile'}
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
                  <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Status Designation *</label>
                  <select
                    value={formEmpStatus}
                    onChange={(e) => setFormEmpStatus(e.target.value as any)}
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden font-bold"
                  >
                    <option value="active">Active On Duty</option>
                    <option value="inactive">Suspended / Decommissioned</option>
                  </select>
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
                  <label className="block text-[10px] font-black text-[var(--color-on-surface-variant)] mb-1">IFSC Code Verification</label>
                  <input
                    type="text"
                    value={formEmpBankIFSC}
                    onChange={(e) => setFormEmpBankIFSC(e.target.value.toUpperCase())}
                    placeholder="e.g. SBIN0001042"
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] rounded-lg border border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] outline-hidden font-medium uppercase"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[10px] font-black text-[var(--color-on-surface-variant)] mb-1">Bank Account Number</label>
                  <input
                    type="text"
                    value={formEmpBankAccount}
                    onChange={(e) => setFormEmpBankAccount(e.target.value)}
                    placeholder="e.g. 109284210294"
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] rounded-lg border border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] outline-hidden font-medium"
                  />
                </div>
              </div>

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

      {/* MODAL: Leave Form */}
      {isLeaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/40 backdrop-blur-xs">
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-outline-variant)] shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-[var(--color-outline-variant)] flex justify-between items-center bg-[var(--color-surface-container)]">
              <h3 className="text-sm font-black text-[var(--color-on-surface)] flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[var(--color-primary)]" /> Log Leave Dispatch Request
              </h3>
              <button onClick={() => setIsLeaveModalOpen(false)} className="text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] p-1.5 rounded-full hover:bg-[var(--color-surface-container-high)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLeave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Select Personnel *</label>
                <select
                  required
                  value={formLvEmpId}
                  onChange={(e) => setFormLvEmpId(e.target.value)}
                  className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden font-semibold"
                >
                  <option value="">-- Choose Employee --</option>
                  {employees.filter(e => e.status === 'active').map((e) => (
                    <option key={e.id} value={e.id}>{e.name} ({e.role})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Leave Type *</label>
                <select
                  value={formLvType}
                  onChange={(e) => setFormLvType(e.target.value as any)}
                  className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden font-bold"
                >
                  <option value="casual">Casual Leave (CL)</option>
                  <option value="sick">Medical / Sick Leave (SL)</option>
                  <option value="earned">Earned / Privilege Leave (EL)</option>
                  <option value="maternity">Maternity/Paternity Leave</option>
                  <option value="unpaid">Unpaid Leave (LWP)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">From Date *</label>
                  <input
                    type="date"
                    required
                    value={formLvStartDate}
                    onChange={(e) => setFormLvStartDate(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">To Date *</label>
                  <input
                    type="date"
                    required
                    value={formLvEndDate}
                    onChange={(e) => setFormLvEndDate(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Reason for Absence *</label>
                <textarea
                  required
                  rows={3}
                  value={formLvReason}
                  onChange={(e) => setFormLvReason(e.target.value)}
                  placeholder="e.g. Attending to family health emergency at home village"
                  className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden font-medium"
                />
              </div>

              <div className="pt-4 border-t border-[var(--color-outline-variant)] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsLeaveModalOpen(false)}
                  className="px-4 py-2 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] font-bold text-xs rounded-full hover:bg-[var(--color-surface-container-highest)] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold text-xs rounded-full hover:opacity-90 transition shadow-xs"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Payment Form */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/40 backdrop-blur-xs">
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-outline-variant)] shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-[var(--color-outline-variant)] flex justify-between items-center bg-[var(--color-surface-container)]">
              <h3 className="text-sm font-black text-[var(--color-on-surface)] flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[var(--color-success)]" /> Disburse Funds / record Payout
              </h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] p-1.5 rounded-full hover:bg-[var(--color-surface-container-high)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Select Employee *</label>
                <select
                  required
                  value={formPayEmpId}
                  onChange={(e) => setFormPayEmpId(e.target.value)}
                  className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden font-semibold"
                >
                  <option value="">-- Choose Employee --</option>
                  {employees.filter(e => e.status === 'active').map((e) => (
                    <option key={e.id} value={e.id}>{e.name} ({e.role})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Transaction Type *</label>
                  <select
                    value={formPayType}
                    onChange={(e) => setFormPayType(e.target.value as any)}
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden font-bold"
                  >
                    <option value="advance">Advance Taken</option>
                    <option value="salary">Salary Paid Out</option>
                    <option value="bonus">Festival / Duty Bonus</option>
                    <option value="reimbursement">Reimbursement (Fuel/Food)</option>
                  </select>
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

              <div className="grid grid-cols-2 gap-4">
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

                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Payment Mode *</label>
                  <select
                    value={formPayMode}
                    onChange={(e) => setFormPayMode(e.target.value as any)}
                    className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden font-semibold"
                  >
                    <option value="upi">UPI (GPay / PhonePe)</option>
                    <option value="bank_transfer">Direct Bank NEFT/RTGS</option>
                    <option value="cash">Petty Cash Handout</option>
                    <option value="cheque">Bank Account Cheque</option>
                  </select>
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
                    <option value="July 2026">July 2026</option>
                    <option value="August 2026">August 2026</option>
                    <option value="September 2026">September 2026</option>
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
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] font-bold text-xs rounded-full hover:bg-[var(--color-surface-container-highest)] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold text-xs rounded-full hover:opacity-90 transition shadow-xs"
                >
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL / BOTTOM SHEET: Dynamic Monthly Payslip Calculator & Slip Generator */}
      {isPayslipPreviewOpen && calculatedPayslip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/40 backdrop-blur-xs">
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-outline-variant)] shadow-2xl w-full max-w-2xl overflow-hidden max-h-[95vh] flex flex-col">
            <div className="p-5 border-b border-[var(--color-outline-variant)] flex justify-between items-center bg-[var(--color-surface-container)]">
              <h3 className="text-sm font-black text-[var(--color-on-surface)] flex items-center gap-2">
                <Printer className="w-5 h-5 text-[var(--color-success)]" />
                Interactive Payslip Slip & Balance Sheet
              </h3>
              <button onClick={() => setIsPayslipPreviewOpen(false)} className="text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] p-1.5 rounded-full hover:bg-[var(--color-surface-container-high)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Print Slip Container */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-[var(--color-surface)]" id="payslip-print-view">
              <div className="bg-[var(--color-surface-container)] p-3 rounded-xl flex justify-between items-center border border-[var(--color-outline-variant)]">
                <div className="flex gap-2 items-center">
                  <span className="text-xs font-bold text-[var(--color-on-surface-variant)]">Salary Month:</span>
                  <select
                    value={payslipMonth}
                    onChange={(e) => setPayslipMonth(e.target.value)}
                    className="bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] text-xs font-black px-2 py-1 rounded-md border border-[var(--color-outline-variant)] outline-hidden cursor-pointer"
                  >
                    <option value="July 2026">July 2026</option>
                    <option value="August 2026">August 2026</option>
                    <option value="September 2026">September 2026</option>
                  </select>
                </div>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] px-3 py-1.5 rounded-full text-[10px] font-black transition"
                >
                  <Printer className="w-3.5 h-3.5" /> PRINT SLIP
                </button>
              </div>

              {/* Standard PaySlip Template styling */}
              <div className="p-6 bg-[var(--color-surface-container-lowest)] border-2 border-dashed border-[var(--color-outline-variant)] rounded-2xl space-y-6">
                <div className="flex justify-between items-start border-b border-[var(--color-outline-variant)] pb-4">
                  <div>
                    <h2 className="text-base font-black text-[var(--color-on-surface)]">{settings?.companyName || 'Apex Asphalt Works'}</h2>
                    <p className="text-[10px] font-medium text-[var(--color-on-surface-variant)] mt-0.5">{settings?.tradeName || 'Aggregate and Bitumen Mixing Plant'}</p>
                    <p className="text-[10px] text-[var(--color-outline)]">GSTIN: {settings?.gstin || '27AAACA9876C1ZA'}</p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-3 py-1 bg-[var(--color-success-container)] text-[var(--color-on-success-container)] font-bold text-xs uppercase tracking-wider rounded-md">
                      PAYSLIP SLIP
                    </span>
                    <p className="text-[10px] font-black text-[var(--color-on-surface-variant)] mt-1.5">{calculatedPayslip.month}</p>
                  </div>
                </div>

                {/* Employee Info Header */}
                <div className="grid grid-cols-2 gap-4 text-[11px] font-medium border-b border-[var(--color-outline-variant)] pb-4">
                  <div className="space-y-1">
                    <p><span className="font-bold text-[var(--color-outline)]">Employee ID:</span> {calculatedPayslip.employee.id}</p>
                    <p><span className="font-bold text-[var(--color-outline)]">Employee Name:</span> <span className="font-bold text-[var(--color-on-surface)] text-xs">{calculatedPayslip.employee.name}</span></p>
                    <p><span className="font-bold text-[var(--color-outline)]">Role Designation:</span> <span className="capitalize font-bold text-[var(--color-primary)]">{calculatedPayslip.employee.role}</span></p>
                    <p><span className="font-bold text-[var(--color-outline)]">Active Phone:</span> {calculatedPayslip.employee.phone}</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p><span className="font-bold text-[var(--color-outline)]">Bank A/C No:</span> {calculatedPayslip.employee.bankAccountNo || 'Not Provided'}</p>
                    <p><span className="font-bold text-[var(--color-outline)]">IFSC Code:</span> {calculatedPayslip.employee.bankIFSC || '-'}</p>
                    <p><span className="font-bold text-[var(--color-outline)]">Deployment Date:</span> {calculatedPayslip.employee.joiningDate}</p>
                    {calculatedPayslip.employee.licenseNo && (
                      <p><span className="font-bold text-[var(--color-outline)]">HEV License No:</span> {calculatedPayslip.employee.licenseNo}</p>
                    )}
                  </div>
                </div>

                {/* Duty / Attendance Overview */}
                <div className="bg-[var(--color-surface-container)] p-3 rounded-xl border border-[var(--color-outline-variant)] grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase">Days Present</p>
                    <p className="font-black text-[var(--color-success)] text-sm mt-0.5">{calculatedPayslip.attendance.daysPresent}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase">Days Half</p>
                    <p className="font-black text-[var(--color-warning)] text-sm mt-0.5">{calculatedPayslip.attendance.daysHalf}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase">Days Absent</p>
                    <p className="font-black text-[var(--color-error)] text-sm mt-0.5">{calculatedPayslip.attendance.daysAbsent}</p>
                  </div>
                </div>

                {/* Earnings & Deductions Table */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-medium">
                  {/* Earnings column */}
                  <div className="border border-[var(--color-outline-variant)] rounded-xl overflow-hidden">
                    <div className="bg-[var(--color-success-container)]/30 p-2.5 border-b border-[var(--color-outline-variant)]">
                      <p className="font-black text-[var(--color-success)] uppercase tracking-wider text-[10px]">Earnings (Additions)</p>
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-[var(--color-outline)]">Base Salary Rate:</span>
                        <span>{formatCurrency(calculatedPayslip.earnings.base, currencySymbol)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-[var(--color-on-surface)] border-b border-[var(--color-outline-variant)]/60 pb-1.5">
                        <span>Earned Payout:</span>
                        <span>{formatCurrency(calculatedPayslip.earnings.earnedBase, currencySymbol)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--color-outline)]">Bonuses / Perks:</span>
                        <span className="text-[var(--color-success)] font-semibold">+{formatCurrency(calculatedPayslip.earnings.bonuses, currencySymbol)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-[var(--color-success)] border-t border-[var(--color-outline-variant)]/60 pt-1.5">
                        <span>Gross Earnings:</span>
                        <span>
                          {formatCurrency(
                            calculatedPayslip.earnings.earnedBase +
                            calculatedPayslip.earnings.bonuses,
                            currencySymbol
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Deductions column */}
                  <div className="border border-[var(--color-outline-variant)] rounded-xl overflow-hidden">
                    <div className="bg-[var(--color-error-container)]/30 p-2.5 border-b border-[var(--color-outline-variant)]">
                      <p className="font-black text-[var(--color-error)] uppercase tracking-wider text-[10px]">Deductions & Advances</p>
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-[var(--color-outline)]">Active Advances Taken:</span>
                        <span className="text-[var(--color-error)] font-semibold">-{formatCurrency(calculatedPayslip.deductions.advances, currencySymbol)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--color-outline)]">Tax Ded. / PF / ESIC:</span>
                        <span>{formatCurrency(0, currencySymbol)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-[var(--color-error)] border-t border-[var(--color-outline-variant)]/60 pt-6">
                        <span>Total Deductions:</span>
                        <span>{formatCurrency(calculatedPayslip.deductions.advances, currencySymbol)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* NET PAYABLE ROW */}
                <div className="bg-[var(--color-primary-container)]/20 p-4 rounded-xl border border-[var(--color-primary)]/30 flex justify-between items-center text-xs">
                  <div>
                    <h4 className="text-sm font-black text-[var(--color-primary)] uppercase">NET MONTHLY DISBURSEMENT</h4>
                    <p className="text-[10px] text-[var(--color-on-surface-variant)] font-medium mt-0.5">Calculated Net = (Earned Base + Bonus) - Advances</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black text-[var(--color-primary)] tracking-tight">
                      {formatCurrency(calculatedPayslip.netPayable, currencySymbol)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action row to disburse right now */}
              <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-outline-variant)]">
                <button
                  type="button"
                  onClick={() => setIsPayslipPreviewOpen(false)}
                  className="px-4 py-2 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] font-bold text-xs rounded-full hover:bg-[var(--color-surface-container-highest)] transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRecordCalculatedSalaryPayout}
                  className="px-5 py-2.5 bg-[var(--color-success)] text-[var(--color-on-success)] font-bold text-xs rounded-full hover:opacity-90 transition shadow-xs flex items-center gap-1.5"
                >
                  <Coins className="w-4 h-4" /> DISBURSE SALARY & LOG TRANSACTION
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
