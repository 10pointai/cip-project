import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  LogIn,
  LogOut,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Zap,
  Users,
  Building,
  FileSpreadsheet,
  Download,
  Printer,
  History,
  Info,
  Timer,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  HelpCircle,
  RefreshCw,
} from 'lucide-react';
import { Employee, EmployeeAttendance } from '../../types';
import {
  calculateWorkingHours,
  deriveAttendanceStatus,
  getCurrentTimeHHMM,
  formatTime12h,
} from '../../utils/attendanceUtils';
import { AttendancePunchModal } from './AttendancePunchModal';

interface AttendanceInOutViewProps {
  employees: Employee[];
  attendance: EmployeeAttendance[];
  onSaveDailyAttendance: (records: Omit<EmployeeAttendance, 'id'>[]) => void;
  onRecordPunch: (
    employeeId: string,
    punchType: 'IN' | 'OUT',
    date?: string,
    time?: string,
    source?: 'manual' | 'kiosk' | 'web' | 'biometric',
    note?: string
  ) => void;
  onUpdateAttendanceRecord: (id: string, updates: Partial<EmployeeAttendance>) => void;
}

type AttendanceSubTab = 'daily_sheet' | 'gate_kiosk' | 'monthly_register';

export function AttendanceInOutView({
  employees,
  attendance,
  onSaveDailyAttendance,
  onRecordPunch,
  onUpdateAttendanceRecord,
}: AttendanceInOutViewProps) {
  const [subTab, setSubTab] = useState<AttendanceSubTab>('daily_sheet');
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Live clock state for Kiosk
  const [currentTime, setCurrentTime] = useState<string>(() => new Date().toLocaleTimeString());
  const [currentDateFormatted, setCurrentDateFormatted] = useState<string>(() =>
    new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
      setCurrentDateFormatted(
        new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Modal State
  const [selectedEmpForModal, setSelectedEmpForModal] = useState<Employee | null>(null);
  const [isPunchModalOpen, setIsPunchModalOpen] = useState(false);

  // Editable Daily Sheet Temp State: map employeeId -> row state
  interface DailyRowState {
    checkInTime: string;
    checkOutTime: string;
    status: EmployeeAttendance['status'];
    notes: string;
    isDirty: boolean;
  }

  const [dailySheetState, setDailySheetState] = useState<{ [empId: string]: DailyRowState }>({});
  const [isSheetDirty, setIsSheetDirty] = useState(false);

  // Sync dailySheetState when selectedDate, attendance, or employees change
  useEffect(() => {
    const dayRecords = attendance.filter((a) => a.date === selectedDate);
    const newMap: { [empId: string]: DailyRowState } = {};

    employees.forEach((emp) => {
      const match = dayRecords.find((a) => a.employeeId === emp.id);
      if (match) {
        newMap[emp.id] = {
          checkInTime: match.checkInTime || '',
          checkOutTime: match.checkOutTime || '',
          status: match.status,
          notes: match.notes || '',
          isDirty: false,
        };
      } else {
        newMap[emp.id] = {
          checkInTime: '',
          checkOutTime: '',
          status: 'present',
          notes: '',
          isDirty: false,
        };
      }
    });

    setDailySheetState(newMap);
    setIsSheetDirty(false);
  }, [selectedDate, attendance, employees]);

  // Handle change in a row's In/Out time
  const handleRowTimeChange = (empId: string, field: 'checkInTime' | 'checkOutTime', value: string) => {
    setDailySheetState((prev) => {
      const current = prev[empId] || { checkInTime: '', checkOutTime: '', status: 'present', notes: '', isDirty: false };
      const next = { ...current, [field]: value, isDirty: true };

      // Auto-update status if not manually set to leave
      if (next.status !== 'leave') {
        const autoStatus = deriveAttendanceStatus(
          field === 'checkInTime' ? value : next.checkInTime,
          field === 'checkOutTime' ? value : next.checkOutTime
        );
        next.status = autoStatus;
      }

      return {
        ...prev,
        [empId]: next,
      };
    });
    setIsSheetDirty(true);
  };

  // Handle change in a row's status
  const handleRowStatusChange = (empId: string, status: EmployeeAttendance['status']) => {
    setDailySheetState((prev) => {
      const current = prev[empId] || { checkInTime: '', checkOutTime: '', status: 'present', notes: '', isDirty: false };
      return {
        ...prev,
        [empId]: {
          ...current,
          status,
          isDirty: true,
        },
      };
    });
    setIsSheetDirty(true);
  };

  // Handle change in notes
  const handleRowNotesChange = (empId: string, notes: string) => {
    setDailySheetState((prev) => {
      const current = prev[empId] || { checkInTime: '', checkOutTime: '', status: 'present', notes: '', isDirty: false };
      return {
        ...prev,
        [empId]: {
          ...current,
          notes,
          isDirty: true,
        },
      };
    });
    setIsSheetDirty(true);
  };

  // Quick punch now for single employee
  const handleQuickPunchNow = (empId: string, type: 'IN' | 'OUT') => {
    const timeNow = getCurrentTimeHHMM();
    handleRowTimeChange(empId, type === 'IN' ? 'checkInTime' : 'checkOutTime', timeNow);
    onRecordPunch(empId, type, selectedDate, timeNow, 'web', `Quick web punch ${type}`);
  };

  // Save full daily sheet
  const handleSaveSheet = () => {
    const recordsToSave: Omit<EmployeeAttendance, 'id'>[] = [];

    employees.forEach((emp) => {
      const row = dailySheetState[emp.id];
      if (!row) return;

      const existingRecord = attendance.find((a) => a.employeeId === emp.id && a.date === selectedDate);
      const hrs = calculateWorkingHours(row.checkInTime, row.checkOutTime);

      recordsToSave.push({
        employeeId: emp.id,
        employeeName: emp.name,
        date: selectedDate,
        status: row.status,
        checkInTime: row.checkInTime || undefined,
        checkOutTime: row.checkOutTime || undefined,
        totalHoursWorked: hrs.totalDecimalHours,
        shiftName: existingRecord?.shiftName || 'General Plant Shift (08:30 - 17:30)',
        punchLogs: existingRecord?.punchLogs || [
          ...(row.checkInTime ? [{ id: `p-in-${Date.now()}`, type: 'IN' as const, time: row.checkInTime, source: 'manual' as const }] : []),
          ...(row.checkOutTime ? [{ id: `p-out-${Date.now()}`, type: 'OUT' as const, time: row.checkOutTime, source: 'manual' as const }] : []),
        ],
        notes: row.notes || undefined,
      });
    });

    onSaveDailyAttendance(recordsToSave);
    setIsSheetDirty(false);
  };

  // Batch action: Autofill standard shift (08:30 - 17:30) for all unmarked
  const handleAutofillStandardShift = () => {
    const nextMap = { ...dailySheetState };
    employees.forEach((emp) => {
      const current = nextMap[emp.id] || { checkInTime: '', checkOutTime: '', status: 'present', notes: '', isDirty: false };
      if (!current.checkInTime && !current.checkOutTime && current.status !== 'leave' && current.status !== 'absent') {
        nextMap[emp.id] = {
          ...current,
          checkInTime: '08:30',
          checkOutTime: '17:30',
          status: 'present',
          isDirty: true,
        };
      }
    });
    setDailySheetState(nextMap);
    setIsSheetDirty(true);
  };

  // Batch action: Set all In-Time to current time
  const handlePunchInAllActive = () => {
    const timeNow = getCurrentTimeHHMM();
    const nextMap = { ...dailySheetState };
    employees.forEach((emp) => {
      const current = nextMap[emp.id] || { checkInTime: '', checkOutTime: '', status: 'present', notes: '', isDirty: false };
      if (!current.checkInTime && current.status !== 'leave' && current.status !== 'absent') {
        nextMap[emp.id] = {
          ...current,
          checkInTime: timeNow,
          status: deriveAttendanceStatus(timeNow, current.checkOutTime),
          isDirty: true,
        };
        onRecordPunch(emp.id, 'IN', selectedDate, timeNow, 'web', 'Bulk Punch In');
      }
    });
    setDailySheetState(nextMap);
    setIsSheetDirty(true);
  };

  // Batch action: Set all Out-Time to current time
  const handlePunchOutAllActive = () => {
    const timeNow = getCurrentTimeHHMM();
    const nextMap = { ...dailySheetState };
    employees.forEach((emp) => {
      const current = nextMap[emp.id] || { checkInTime: '', checkOutTime: '', status: 'present', notes: '', isDirty: false };
      if (current.checkInTime && !current.checkOutTime) {
        nextMap[emp.id] = {
          ...current,
          checkOutTime: timeNow,
          status: deriveAttendanceStatus(current.checkInTime, timeNow),
          isDirty: true,
        };
        onRecordPunch(emp.id, 'OUT', selectedDate, timeNow, 'web', 'Bulk Punch Out');
      }
    });
    setDailySheetState(nextMap);
    setIsSheetDirty(true);
  };

  // Navigation for date
  const changeDateByDays = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchesSearch =
        emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.role.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesRole = roleFilter === 'all' || emp.role === roleFilter;

      const row = dailySheetState[emp.id];
      let matchesStatus = true;
      if (statusFilter === 'clocked_in') {
        matchesStatus = Boolean(row?.checkInTime && !row?.checkOutTime);
      } else if (statusFilter === 'clocked_out') {
        matchesStatus = Boolean(row?.checkInTime && row?.checkOutTime);
      } else if (statusFilter !== 'all') {
        matchesStatus = row?.status === statusFilter;
      }

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [employees, searchQuery, roleFilter, statusFilter, dailySheetState]);

  // Selected date KPI metrics
  const dailyKpis = useMemo(() => {
    let totalEmployees = employees.length;
    let clockedInCount = 0;
    let completedShiftCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let leaveCount = 0;
    let totalLoggedHours = 0;

    employees.forEach((emp) => {
      const row = dailySheetState[emp.id];
      if (!row) return;

      if (row.checkInTime && !row.checkOutTime) {
        clockedInCount++;
      }
      if (row.checkInTime && row.checkOutTime) {
        completedShiftCount++;
      }
      if (row.status === 'late') {
        lateCount++;
      }
      if (row.status === 'absent') {
        absentCount++;
      }
      if (row.status === 'leave') {
        leaveCount++;
      }

      if (row.checkInTime && row.checkOutTime) {
        const hrs = calculateWorkingHours(row.checkInTime, row.checkOutTime);
        totalLoggedHours += hrs.totalDecimalHours;
      }
    });

    return {
      totalEmployees,
      clockedInCount,
      completedShiftCount,
      lateCount,
      absentCount,
      leaveCount,
      totalLoggedHours: Number(totalLoggedHours.toFixed(1)),
    };
  }, [employees, dailySheetState]);

  // Monthly Timesheet Register View State
  const [selectedMonth, setSelectedMonth] = useState<string>(() => selectedDate.substring(0, 7)); // "YYYY-MM"
  const [selectedRegisterEmpId, setSelectedRegisterEmpId] = useState<string>(() => employees[0]?.id || '');

  const selectedRegisterEmp = employees.find((e) => e.id === selectedRegisterEmpId) || employees[0];

  // Calculate monthly stats for selected register employee
  const monthlyRecordsForEmp = useMemo(() => {
    if (!selectedRegisterEmp) return [];
    return attendance
      .filter((a) => a.employeeId === selectedRegisterEmp.id && a.date.startsWith(selectedMonth))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [attendance, selectedRegisterEmp, selectedMonth]);

  const monthlyEmpStats = useMemo(() => {
    let daysPresent = 0;
    let daysHalf = 0;
    let daysLate = 0;
    let daysLeave = 0;
    let daysAbsent = 0;
    let totalHours = 0;

    monthlyRecordsForEmp.forEach((rec) => {
      if (rec.status === 'present') daysPresent++;
      else if (rec.status === 'half_day') daysHalf++;
      else if (rec.status === 'late') daysLate++;
      else if (rec.status === 'leave') daysLeave++;
      else if (rec.status === 'absent') daysAbsent++;

      const hrs = calculateWorkingHours(rec.checkInTime, rec.checkOutTime);
      totalHours += hrs.totalDecimalHours;
    });

    return {
      totalLoggedDays: monthlyRecordsForEmp.length,
      daysPresent,
      daysHalf,
      daysLate,
      daysLeave,
      daysAbsent,
      totalHours: Number(totalHours.toFixed(1)),
    };
  }, [monthlyRecordsForEmp]);

  return (
    <div id="attendance-in-out-container" className="space-y-6">
      {/* Top Header & Sub-Navigation Mode Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 sm:p-5 bg-[var(--color-surface-container)] rounded-3xl border border-[var(--color-outline-variant)]">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--color-on-surface)]">
                In / Out Time-Based Attendance System
              </h2>
              <p className="text-xs text-[var(--color-on-surface-variant)]">
                Track exact punch-in, punch-out, shift hours, overtime & biometric logs
              </p>
            </div>
          </div>
        </div>

        {/* Sub-tab pills */}
        <div className="flex items-center p-1 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] self-start lg:self-auto overflow-x-auto">
          <button
            type="button"
            onClick={() => setSubTab('daily_sheet')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              subTab === 'daily_sheet'
                ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-xs'
                : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Daily In/Out Sheet
          </button>
          <button
            type="button"
            onClick={() => setSubTab('gate_kiosk')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              subTab === 'gate_kiosk'
                ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-xs'
                : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)]'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            Live Gate Punch Station
          </button>
          <button
            type="button"
            onClick={() => setSubTab('monthly_register')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              subTab === 'monthly_register'
                ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-xs'
                : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)]'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Monthly Timesheet Register
          </button>
        </div>
      </div>

      {/* =========================================================================
          MODE 1: DAILY IN/OUT SHEET
         ========================================================================= */}
      {subTab === 'daily_sheet' && (
        <div className="space-y-6">
          {/* Date Selector & KPI Header Bar */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* Date Navigator */}
            <div className="md:col-span-5 flex items-center gap-2 bg-[var(--color-surface-container)] p-2 rounded-2xl border border-[var(--color-outline-variant)]">
              <button
                type="button"
                onClick={() => changeDateByDays(-1)}
                className="p-2 rounded-xl hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] transition"
                title="Previous Day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 flex items-center justify-center gap-2">
                <Calendar className="w-4 h-4 text-[var(--color-primary)]" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-sm font-bold text-[var(--color-on-surface)] outline-hidden cursor-pointer"
                />
              </div>
              <button
                type="button"
                onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                className="px-2.5 py-1 text-xs font-bold bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] rounded-lg hover:opacity-90 transition"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => changeDateByDays(1)}
                className="p-2 rounded-xl hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] transition"
                title="Next Day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Bulk Action Buttons */}
            <div className="md:col-span-7 flex items-center justify-start md:justify-end gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleAutofillStandardShift}
                className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)] text-xs font-bold rounded-xl transition"
                title="Auto-fill 08:30 to 17:30 for all unmarked"
              >
                <Zap className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                Autofill 8.5h Shift
              </button>
              <button
                type="button"
                onClick={handlePunchInAllActive}
                className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-success-container)] hover:opacity-90 text-[var(--color-on-success-container)] text-xs font-bold rounded-xl transition"
                title="Punch In all pending staff with current time"
              >
                <LogIn className="w-3.5 h-3.5" />
                Punch In All Pending
              </button>
              <button
                type="button"
                onClick={handlePunchOutAllActive}
                className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-warning-container)] hover:opacity-90 text-[var(--color-on-warning-container)] text-xs font-bold rounded-xl transition"
                title="Punch Out all active clocked in staff"
              >
                <LogOut className="w-3.5 h-3.5" />
                Punch Out All Active
              </button>
              <button
                type="button"
                onClick={handleSaveSheet}
                className={`flex items-center gap-1.5 px-4 py-2 font-bold text-xs rounded-xl shadow-xs transition ${
                  isSheetDirty
                    ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] animate-pulse'
                    : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)]'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {isSheetDirty ? 'Save Daily Sheet *' : 'Sheet Saved'}
              </button>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="p-3.5 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)]">
              <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                Total Workforce
              </p>
              <p className="text-xl font-black text-[var(--color-on-surface)] mt-1">
                {dailyKpis.totalEmployees}
              </p>
              <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">Assigned staff</p>
            </div>

            <div className="p-3.5 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)]">
              <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                Currently On-Duty
              </p>
              <p className="text-xl font-black text-[var(--color-success)] mt-1 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-success)] animate-ping" />
                {dailyKpis.clockedInCount}
              </p>
              <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">Clocked in right now</p>
            </div>

            <div className="p-3.5 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)]">
              <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                Shift Completed
              </p>
              <p className="text-xl font-black text-[var(--color-primary)] mt-1">
                {dailyKpis.completedShiftCount}
              </p>
              <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">Punched Out</p>
            </div>

            <div className="p-3.5 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)]">
              <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                Late Arrivals
              </p>
              <p className="text-xl font-black text-[var(--color-warning)] mt-1">
                {dailyKpis.lateCount}
              </p>
              <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">&gt; 15 min grace</p>
            </div>

            <div className="p-3.5 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)]">
              <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                Logged Hours
              </p>
              <p className="text-xl font-black text-[var(--color-on-surface)] mt-1">
                {dailyKpis.totalLoggedHours} <span className="text-xs font-normal">hrs</span>
              </p>
              <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">Cumulative time</p>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between p-3 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)]">
            <div className="flex items-center gap-2 w-full sm:w-80 bg-[var(--color-surface-container)] px-3 py-2 rounded-xl border border-[var(--color-outline-variant)]">
              <Search className="w-4 h-4 text-[var(--color-on-surface-variant)]" />
              <input
                type="text"
                placeholder="Search employee by name, role or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs text-[var(--color-on-surface)] outline-hidden placeholder:text-[var(--color-outline)]"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-[var(--color-on-surface-variant)]" />
                <span className="text-[11px] font-bold text-[var(--color-on-surface-variant)]">Role:</span>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="bg-[var(--color-surface-container)] text-xs font-semibold text-[var(--color-on-surface)] px-2.5 py-1.5 rounded-xl border border-[var(--color-outline-variant)] outline-hidden"
                >
                  <option value="all">All Roles</option>
                  <option value="driver">Drivers</option>
                  <option value="supervisor">Supervisors</option>
                  <option value="operator">Plant Operators</option>
                  <option value="manager">Managers</option>
                  <option value="helper">Helpers</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 ml-2">
                <span className="text-[11px] font-bold text-[var(--color-on-surface-variant)]">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-[var(--color-surface-container)] text-xs font-semibold text-[var(--color-on-surface)] px-2.5 py-1.5 rounded-xl border border-[var(--color-outline-variant)] outline-hidden"
                >
                  <option value="all">All Statuses</option>
                  <option value="clocked_in">Currently Clocked In</option>
                  <option value="clocked_out">Clocked Out (Done)</option>
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="half_day">Half Day</option>
                  <option value="leave">On Leave</option>
                  <option value="absent">Absent</option>
                </select>
              </div>
            </div>
          </div>

          {/* In/Out Daily Attendance Table */}
          <div className="bg-[var(--color-surface-container-lowest)] rounded-3xl border border-[var(--color-outline-variant)] overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] text-[11px] font-bold uppercase tracking-wider border-b border-[var(--color-outline-variant)]">
                    <th className="py-3 px-4 min-w-[180px]">Employee</th>
                    <th className="py-3 px-4 min-w-[160px]">Check-In Time</th>
                    <th className="py-3 px-4 min-w-[160px]">Check-Out Time</th>
                    <th className="py-3 px-4 min-w-[130px]">Net Hours</th>
                    <th className="py-3 px-4 min-w-[130px]">Status</th>
                    <th className="py-3 px-4 min-w-[120px]">Remarks</th>
                    <th className="py-3 px-4 min-w-[110px] text-right">Punch Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-outline-variant)]/40 text-xs">
                  {filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-[var(--color-on-surface-variant)]">
                        <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="font-bold">No employees matched your filter criteria</p>
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map((emp) => {
                      const row = dailySheetState[emp.id] || {
                        checkInTime: '',
                        checkOutTime: '',
                        status: 'present',
                        notes: '',
                        isDirty: false,
                      };

                      const existingRecord = attendance.find(
                        (a) => a.employeeId === emp.id && a.date === selectedDate
                      );

                      const hoursCalc = calculateWorkingHours(row.checkInTime, row.checkOutTime);
                      const isCurrentlyClockedIn = Boolean(row.checkInTime && !row.checkOutTime);

                      return (
                        <tr
                          key={emp.id}
                          className="hover:bg-[var(--color-surface-container)]/60 transition group"
                        >
                          {/* Employee Info */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <div className="w-8 h-8 rounded-full bg-[var(--color-surface-container-high)] text-[var(--color-primary)] font-black flex items-center justify-center text-xs border border-[var(--color-outline-variant)]">
                                  {emp.name
                                    .split(' ')
                                    .map((n) => n[0])
                                    .join('')
                                    .substring(0, 2)
                                    .toUpperCase()}
                                </div>
                                {isCurrentlyClockedIn && (
                                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--color-success)] border-2 border-[var(--color-surface-container-lowest)]" />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <p className="font-bold text-[var(--color-on-surface)]">{emp.name}</p>
                                  <span className="text-[10px] font-semibold text-[var(--color-on-surface-variant)] bg-[var(--color-surface-container)] px-1.5 py-0.5 rounded-md capitalize border border-[var(--color-outline-variant)]/50">
                                    {emp.role}
                                  </span>
                                </div>
                                <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                                  {emp.phone}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Check-In Time Input & Quick Now Button */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="time"
                                value={row.checkInTime}
                                onChange={(e) => handleRowTimeChange(emp.id, 'checkInTime', e.target.value)}
                                className={`w-28 text-xs font-bold px-2 py-1.5 rounded-xl border outline-hidden transition ${
                                  row.checkInTime
                                    ? 'bg-[var(--color-surface-container)] border-[var(--color-outline-variant)] text-[var(--color-on-surface)]'
                                    : 'bg-[var(--color-surface-container-lowest)] border-dashed border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)]'
                                }`}
                              />
                              <button
                                type="button"
                                onClick={() => handleQuickPunchNow(emp.id, 'IN')}
                                className="px-2 py-1.5 text-[10px] font-black bg-[var(--color-success-container)] hover:opacity-90 text-[var(--color-on-success-container)] rounded-lg transition"
                                title="Punch In Right Now"
                              >
                                IN
                              </button>
                            </div>
                          </td>

                          {/* Check-Out Time Input & Quick Now Button */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="time"
                                value={row.checkOutTime}
                                onChange={(e) => handleRowTimeChange(emp.id, 'checkOutTime', e.target.value)}
                                className={`w-28 text-xs font-bold px-2 py-1.5 rounded-xl border outline-hidden transition ${
                                  row.checkOutTime
                                    ? 'bg-[var(--color-surface-container)] border-[var(--color-outline-variant)] text-[var(--color-on-surface)]'
                                    : 'bg-[var(--color-surface-container-lowest)] border-dashed border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)]'
                                }`}
                              />
                              <button
                                type="button"
                                onClick={() => handleQuickPunchNow(emp.id, 'OUT')}
                                className="px-2 py-1.5 text-[10px] font-black bg-[var(--color-warning-container)] hover:opacity-90 text-[var(--color-on-warning-container)] rounded-lg transition"
                                title="Punch Out Right Now"
                              >
                                OUT
                              </button>
                            </div>
                          </td>

                          {/* Net Hours Worked */}
                          <td className="py-3 px-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 font-bold text-[var(--color-on-surface)]">
                                <Timer className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                                {hoursCalc.formatted}
                              </div>
                              {/* Visual shift progress mini bar */}
                              <div className="w-20 h-1.5 bg-[var(--color-surface-container-highest)] rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    hoursCalc.totalDecimalHours >= 8
                                      ? 'bg-[var(--color-success)]'
                                      : hoursCalc.totalDecimalHours >= 4
                                      ? 'bg-[var(--color-primary)]'
                                      : 'bg-[var(--color-warning)]'
                                  }`}
                                  style={{
                                    width: `${Math.min(100, (hoursCalc.totalDecimalHours / 8) * 100)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </td>

                          {/* Status Badge & Selector */}
                          <td className="py-3 px-4">
                            <select
                              value={row.status}
                              onChange={(e) => handleRowStatusChange(emp.id, e.target.value as any)}
                              className={`text-[11px] font-bold px-2 py-1 rounded-xl border outline-hidden capitalize ${
                                row.status === 'present'
                                  ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)] border-[var(--color-success)]/30'
                                  : row.status === 'late'
                                  ? 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)] border-[var(--color-warning)]/30'
                                  : row.status === 'half_day'
                                  ? 'bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)] border-[var(--color-secondary)]/30'
                                  : row.status === 'leave'
                                  ? 'bg-[var(--color-surface-container-high)] text-[var(--color-primary)] border-[var(--color-primary)]/30'
                                  : 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)] border-[var(--color-error)]/30'
                              }`}
                            >
                              <option value="present">Present</option>
                              <option value="late">Late</option>
                              <option value="half_day">Half Day</option>
                              <option value="leave">Leave</option>
                              <option value="absent">Absent</option>
                            </select>
                          </td>

                          {/* Remarks */}
                          <td className="py-3 px-4">
                            <input
                              type="text"
                              value={row.notes}
                              onChange={(e) => handleRowNotesChange(emp.id, e.target.value)}
                              placeholder="Notes..."
                              className="w-full bg-[var(--color-surface-container)] text-[11px] text-[var(--color-on-surface)] px-2 py-1 rounded-lg border border-[var(--color-outline-variant)] outline-hidden placeholder:text-[var(--color-outline)]"
                            />
                          </td>

                          {/* Punch Action / History */}
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedEmpForModal(emp);
                                setIsPunchModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-[var(--color-primary)] bg-[var(--color-primary-container)] hover:opacity-90 rounded-xl transition"
                              title="View and edit punch logs"
                            >
                              <History className="w-3.5 h-3.5" />
                              Punches
                              {existingRecord?.punchLogs && existingRecord.punchLogs.length > 0 && (
                                <span className="w-4 h-4 rounded-full bg-[var(--color-primary)] text-[var(--color-on-primary)] text-[9px] font-black flex items-center justify-center ml-0.5">
                                  {existingRecord.punchLogs.length}
                                </span>
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODE 2: LIVE PLANT GATE PUNCH STATION (KIOSK)
         ========================================================================= */}
      {subTab === 'gate_kiosk' && (
        <div className="space-y-6">
          {/* Live Clock Terminal Banner */}
          <div className="p-6 bg-[var(--color-surface-container)] rounded-3xl border border-[var(--color-outline-variant)] shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-1 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2">
                <span className="w-3 h-3 rounded-full bg-[var(--color-success)] animate-ping" />
                <span className="text-xs font-black text-[var(--color-success)] uppercase tracking-wider">
                  Gate Biometric & Punch Terminal Online
                </span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-[var(--color-on-surface)] tracking-tight">
                {currentTime}
              </h2>
              <p className="text-xs font-bold text-[var(--color-on-surface-variant)]">
                {currentDateFormatted} • Plant Gate #1
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-3 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] text-center">
                <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase">Currently Inside</p>
                <p className="text-xl font-black text-[var(--color-success)] mt-0.5">
                  {dailyKpis.clockedInCount}
                </p>
              </div>
              <div className="p-3 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] text-center">
                <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase">Shift Out</p>
                <p className="text-xl font-black text-[var(--color-on-surface)] mt-0.5">
                  {dailyKpis.completedShiftCount}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Search for Employee Cards */}
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2 bg-[var(--color-surface-container-lowest)] px-4 py-2.5 rounded-2xl border border-[var(--color-outline-variant)]">
              <Search className="w-4 h-4 text-[var(--color-on-surface-variant)]" />
              <input
                type="text"
                placeholder="Search employee for 1-click Punch In / Punch Out..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-sm text-[var(--color-on-surface)] outline-hidden"
              />
            </div>
          </div>

          {/* Grid of 1-Click Punch Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEmployees.map((emp) => {
              const row = dailySheetState[emp.id] || {
                checkInTime: '',
                checkOutTime: '',
                status: 'present',
                notes: '',
                isDirty: false,
              };
              const isClockedIn = Boolean(row.checkInTime && !row.checkOutTime);
              const isCompleted = Boolean(row.checkInTime && row.checkOutTime);
              const hoursCalc = calculateWorkingHours(row.checkInTime, row.checkOutTime);

              return (
                <div
                  key={emp.id}
                  className={`p-4 rounded-3xl border transition flex flex-col justify-between space-y-4 ${
                    isClockedIn
                      ? 'bg-[var(--color-surface-container-lowest)] border-[var(--color-success)]/40 shadow-xs'
                      : isCompleted
                      ? 'bg-[var(--color-surface-container)] border-[var(--color-outline-variant)]'
                      : 'bg-[var(--color-surface-container-lowest)] border-[var(--color-outline-variant)]'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-[var(--color-surface-container-high)] text-[var(--color-primary)] font-black flex items-center justify-center text-sm border border-[var(--color-outline-variant)]">
                        {emp.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .substring(0, 2)
                          .toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-[var(--color-on-surface)]">{emp.name}</h3>
                        <p className="text-xs text-[var(--color-on-surface-variant)] capitalize">
                          {emp.role} • {emp.phone}
                        </p>
                      </div>
                    </div>
                    {isClockedIn ? (
                      <span className="text-[10px] font-black text-[var(--color-success)] bg-[var(--color-success-container)] px-2 py-0.5 rounded-full flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
                        ON DUTY
                      </span>
                    ) : isCompleted ? (
                      <span className="text-[10px] font-bold text-[var(--color-on-surface-variant)] bg-[var(--color-surface-container-high)] px-2 py-0.5 rounded-full">
                        COMPLETED
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-[var(--color-on-surface-variant)] bg-[var(--color-surface-container-high)] px-2 py-0.5 rounded-full">
                        NOT IN
                      </span>
                    )}
                  </div>

                  {/* Punch Stats Info */}
                  <div className="grid grid-cols-2 gap-2 p-2.5 bg-[var(--color-surface-container)] rounded-2xl text-[11px]">
                    <div>
                      <p className="text-[10px] text-[var(--color-on-surface-variant)] font-bold">IN TIME</p>
                      <p className="font-black text-[var(--color-on-surface)]">
                        {row.checkInTime ? formatTime12h(row.checkInTime) : '--:--'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--color-on-surface-variant)] font-bold">OUT TIME</p>
                      <p className="font-black text-[var(--color-on-surface)]">
                        {row.checkOutTime ? formatTime12h(row.checkOutTime) : isClockedIn ? 'Working...' : '--:--'}
                      </p>
                    </div>
                  </div>

                  {/* 1-Click Large Action Button */}
                  <div className="flex gap-2">
                    {!isClockedIn ? (
                      <button
                        type="button"
                        onClick={() => handleQuickPunchNow(emp.id, 'IN')}
                        className="w-full py-2.5 bg-[var(--color-success)] text-[var(--color-on-success)] hover:opacity-90 font-bold text-xs rounded-2xl transition flex items-center justify-center gap-1.5 shadow-xs"
                      >
                        <LogIn className="w-4 h-4" />
                        PUNCH IN NOW ({getCurrentTimeHHMM()})
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleQuickPunchNow(emp.id, 'OUT')}
                        className="w-full py-2.5 bg-[var(--color-warning)] text-[var(--color-on-warning)] hover:opacity-90 font-bold text-xs rounded-2xl transition flex items-center justify-center gap-1.5 shadow-xs"
                      >
                        <LogOut className="w-4 h-4" />
                        PUNCH OUT NOW ({getCurrentTimeHHMM()})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEmpForModal(emp);
                        setIsPunchModalOpen(true);
                      }}
                      className="p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-highest)] rounded-2xl transition"
                      title="View time card details"
                    >
                      <History className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODE 3: MONTHLY IN/OUT TIMESHEET REGISTER
         ========================================================================= */}
      {subTab === 'monthly_register' && (
        <div className="space-y-6">
          {/* Month & Employee Selector Header */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-[var(--color-surface-container)] rounded-3xl border border-[var(--color-outline-variant)]">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div>
                <label className="block text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                  Select Month
                </label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-[var(--color-surface-container-lowest)] text-xs font-bold text-[var(--color-on-surface)] px-3 py-2 rounded-xl border border-[var(--color-outline-variant)] outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                  Select Employee
                </label>
                <select
                  value={selectedRegisterEmpId}
                  onChange={(e) => setSelectedRegisterEmpId(e.target.value)}
                  className="bg-[var(--color-surface-container-lowest)] text-xs font-bold text-[var(--color-on-surface)] px-3 py-2 rounded-xl border border-[var(--color-outline-variant)] outline-hidden"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.role})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)] text-xs font-bold rounded-xl transition"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Timesheet
              </button>
            </div>
          </div>

          {/* Monthly KPI Overview for Employee */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="p-3 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)]">
              <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase">Present Days</p>
              <p className="text-xl font-black text-[var(--color-success)] mt-1">
                {monthlyEmpStats.daysPresent}
              </p>
            </div>

            <div className="p-3 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)]">
              <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase">Late Arrivals</p>
              <p className="text-xl font-black text-[var(--color-warning)] mt-1">
                {monthlyEmpStats.daysLate}
              </p>
            </div>

            <div className="p-3 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)]">
              <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase">Half Days</p>
              <p className="text-xl font-black text-[var(--color-secondary)] mt-1">
                {monthlyEmpStats.daysHalf}
              </p>
            </div>

            <div className="p-3 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)]">
              <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase">Leaves Taken</p>
              <p className="text-xl font-black text-[var(--color-primary)] mt-1">
                {monthlyEmpStats.daysLeave}
              </p>
            </div>

            <div className="p-3 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)]">
              <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase">Total Hours</p>
              <p className="text-xl font-black text-[var(--color-on-surface)] mt-1">
                {monthlyEmpStats.totalHours} <span className="text-xs font-normal">hrs</span>
              </p>
            </div>
          </div>

          {/* Calendar Day-by-Day Table */}
          <div className="bg-[var(--color-surface-container-lowest)] rounded-3xl border border-[var(--color-outline-variant)] overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] text-[11px] font-bold uppercase tracking-wider border-b border-[var(--color-outline-variant)]">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Shift Schedule</th>
                    <th className="py-3 px-4">First In</th>
                    <th className="py-3 px-4">Last Out</th>
                    <th className="py-3 px-4">Hours Worked</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Notes & Punch Events</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-outline-variant)]/40 text-xs">
                  {monthlyRecordsForEmp.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-[var(--color-on-surface-variant)]">
                        <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="font-bold">No attendance records found for {selectedMonth}</p>
                      </td>
                    </tr>
                  ) : (
                    monthlyRecordsForEmp.map((rec) => {
                      const hours = calculateWorkingHours(rec.checkInTime, rec.checkOutTime);

                      return (
                        <tr key={rec.id} className="hover:bg-[var(--color-surface-container)]/50 transition">
                          <td className="py-3 px-4 font-bold text-[var(--color-on-surface)]">
                            {rec.date}
                          </td>
                          <td className="py-3 px-4 text-[var(--color-on-surface-variant)]">
                            {rec.shiftName || 'General Plant Shift'}
                          </td>
                          <td className="py-3 px-4 font-bold text-[var(--color-success)]">
                            {rec.checkInTime ? formatTime12h(rec.checkInTime) : '--:--'}
                          </td>
                          <td className="py-3 px-4 font-bold text-[var(--color-warning)]">
                            {rec.checkOutTime ? formatTime12h(rec.checkOutTime) : '--:--'}
                          </td>
                          <td className="py-3 px-4 font-bold text-[var(--color-on-surface)]">
                            {hours.formatted}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                                rec.status === 'present'
                                  ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]'
                                  : rec.status === 'late'
                                  ? 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]'
                                  : rec.status === 'half_day'
                                  ? 'bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)]'
                                  : rec.status === 'leave'
                                  ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'
                                  : 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]'
                              }`}
                            >
                              {rec.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[var(--color-on-surface-variant)]">
                            {rec.notes || (rec.punchLogs?.length ? `${rec.punchLogs.length} punch log(s)` : '-')}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Punch Modal for single employee */}
      {selectedEmpForModal && (
        <AttendancePunchModal
          isOpen={isPunchModalOpen}
          onClose={() => {
            setIsPunchModalOpen(false);
            setSelectedEmpForModal(null);
          }}
          employee={selectedEmpForModal}
          attendanceRecord={attendance.find(
            (a) => a.employeeId === selectedEmpForModal.id && a.date === selectedDate
          )}
          date={selectedDate}
          onSaveRecord={(updatedRec) => {
            onUpdateAttendanceRecord(updatedRec.id, updatedRec);
            setIsPunchModalOpen(false);
            setSelectedEmpForModal(null);
          }}
        />
      )}
    </div>
  );
}
