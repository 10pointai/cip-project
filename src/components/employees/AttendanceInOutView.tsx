import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  Search,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Users,
  Timer,
  Loader2,
} from 'lucide-react';
import { Employee, EmployeeAttendance } from '../../types';
import { api } from '../../services/api';
import { calculateWorkingHours } from '../../utils/attendanceUtils';
import { EmployeeMonthlyTimesheetModal } from './EmployeeMonthlyTimesheetModal';

interface AttendanceInOutViewProps {
  employees: Employee[];
  /** Resolves once the sheet's posts are confirmed by the server */
  onSaveDailyAttendance: (records: Omit<EmployeeAttendance, 'id'>[]) => void | Promise<void>;
}

/**
 * Attendance Sheet — ONE simple daily marking surface (no sub-tabs, no kiosk,
 * no bulk punches). STATUS is the primary entity: the employer marks each
 * employee Present / Late / Early Exit / Absent directly via the dropdown,
 * and that choice is final — the In Time / Out Time columns are OPTIONAL
 * informational entries and never change or re-derive the status. Marking
 * Absent clears any times entered for that row. Clicking an employee's name
 * opens his Monthly Timesheet.
 */
export function AttendanceInOutView({
  employees,
  onSaveDailyAttendance,
}: AttendanceInOutViewProps) {
  const today = React.useMemo(() => new Date().toISOString().split('T')[0], []);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Editable sheet temp state: employeeId -> row state
  interface DailyRowState {
    checkInTime: string;
    checkOutTime: string;
    status: EmployeeAttendance['status'];
    notes: string;
    /** set from first edit until the save lands — protects the row from re-syncs */
    dirty: boolean;
  }

  const [dailySheetState, setDailySheetState] = useState<{ [empId: string]: DailyRowState }>({});
  const [isSheetDirty, setIsSheetDirty] = useState(false);

  // Timesheet modal (clicking the employee's name)
  const [timesheetEmpId, setTimesheetEmpId] = useState<string | null>(null);

  // The SELECTED DAY's records — fetched fresh from the server for each date
  // (/api/employees/attendance?date=…); no whole-table fetch happens anywhere.
  const [dayRecords, setDayRecords] = useState<EmployeeAttendance[]>([]);
  const [isLoadingDay, setIsLoadingDay] = useState(false);
  const dayFetchToken = React.useRef(0);
  const loadDay = React.useCallback((date: string) => {
    const token = ++dayFetchToken.current;
    setIsLoadingDay(true);
    api
      .getAttendance({ date })
      .then((res) => {
        // stale-response guard — only the latest date's response lands
        if (token === dayFetchToken.current && res.success) setDayRecords(res.data || []);
      })
      .catch(() => setDayRecords([]))
      .finally(() => {
        if (token === dayFetchToken.current) setIsLoadingDay(false);
      });
  }, []);

  useEffect(() => {
    loadDay(selectedDate);
  }, [selectedDate, loadDay]);

  // Rebuild the sheet when the date / fetched records / roster change —
  // EXCEPT rows with unsaved edits: a background re-fetch of the same date,
  // or the roster re-rendering (new prop reference), must never wipe the
  // times the employer is typing. Dirty flags clear when a save lands.
  useEffect(() => {
    setDailySheetState((prev) => {
      const newMap: { [empId: string]: DailyRowState } = {};

      employees.forEach((emp) => {
        const unsaved = dirtyRowsRef.current.has(emp.id);
        if (unsaved && prev[emp.id]) {
          newMap[emp.id] = prev[emp.id];
          return;
        }
        const match = dayRecords.find((a) => a.employeeId === emp.id);
        if (match) {
          newMap[emp.id] = {
            checkInTime: match.checkInTime || '',
            checkOutTime: match.checkOutTime || '',
            status: match.status,
            notes: match.notes || '',
            dirty: false,
          };
        } else {
          newMap[emp.id] = {
            checkInTime: '',
            checkOutTime: '',
            status: 'present',
            notes: '',
            dirty: false,
          };
        }
      });

      return newMap;
    });
    setIsSheetDirty(false);
  }, [selectedDate, dayRecords, employees]);

  const dirtyRowsRef = React.useRef<Set<string>>(new Set());

  const markRowDirty = (empId: string) => {
    dirtyRowsRef.current.add(empId);
    setIsSheetDirty(true);
  };

  // Time change — purely informational. The status stays exactly as the
  // employer set it in the dropdown; times only feed the Net Hours display
  // and the saved record.
  const handleRowTimeChange = (empId: string, field: 'checkInTime' | 'checkOutTime', value: string) => {
    markRowDirty(empId);
    setDailySheetState((prev) => {
      const current = prev[empId] || { checkInTime: '', checkOutTime: '', status: 'present' as const, notes: '', dirty: false };
      return { ...prev, [empId]: { ...current, [field]: value } };
    });
  };

  // Status override via the dropdown — the primary attendance decision.
  // Marking Absent clears any In/Out times entered for that row.
  const handleRowStatusChange = (empId: string, status: EmployeeAttendance['status']) => {
    markRowDirty(empId);
    setDailySheetState((prev) => ({
      ...prev,
      [empId]: {
        ...(prev[empId] || { checkInTime: '', checkOutTime: '', notes: '', dirty: false }),
        status,
        ...(status === 'absent' ? { checkInTime: '', checkOutTime: '' } : {}),
      },
    }));
  };

  const handleRowNotesChange = (empId: string, notes: string) => {
    markRowDirty(empId);
    setDailySheetState((prev) => ({
      ...prev,
      [empId]: { ...(prev[empId] || { checkInTime: '', checkOutTime: '', status: 'present' as const, dirty: false }), notes },
    }));
  };

  // Save the whole daily sheet (upserts per employee+date server-side), then —
  // ONLY after the posts are confirmed by the server — unmark the dirty rows
  // and re-fetch this date's fresh records. Until then the dirty protection
  // stays on: an early/stale re-fetch must never wipe what the employer typed.
  const [isSavingSheet, setIsSavingSheet] = useState(false);
  const handleSaveSheet = async () => {
    if (isSavingSheet) return;
    setIsSavingSheet(true);
    try {
      const recordsToSave: Omit<EmployeeAttendance, 'id'>[] = [];

      employees.forEach((emp) => {
        const row = dailySheetState[emp.id];
        if (!row) return;

        const existingRecord = dayRecords.find((a) => a.employeeId === emp.id && a.date === selectedDate);
        const hrs = calculateWorkingHours(row.checkInTime, row.checkOutTime);

        recordsToSave.push({
          employeeId: emp.id,
          employeeName: emp.name,
          date: selectedDate,
          status: row.status,
          checkInTime: row.checkInTime || undefined,
          checkOutTime: row.checkOutTime || undefined,
          totalHoursWorked: hrs.totalDecimalHours,
          shiftName: existingRecord?.shiftName,
          punchLogs: existingRecord?.punchLogs,
          notes: row.notes || undefined,
        });
      });

      await onSaveDailyAttendance(recordsToSave);
      // Server confirmed — release the dirty protection and refresh
      dirtyRowsRef.current = new Set();
      setIsSheetDirty(false);
      loadDay(selectedDate);
    } finally {
      setIsSavingSheet(false);
    }
  };

  const changeDateByDays = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    const next = d.toISOString().split('T')[0];
    // Past dates are markable history; the future is not
    setSelectedDate(next > today ? today : next);
  };

  const filteredEmployees = useMemo(() => {
    if (!searchQuery.trim()) return employees;
    const q = searchQuery.toLowerCase();
    return employees.filter(
      (emp) =>
        emp.name.toLowerCase().includes(q) ||
        emp.phone.toLowerCase().includes(q) ||
        emp.role.toLowerCase().includes(q)
    );
  }, [employees, searchQuery]);

  const timesheetEmp = employees.find((e) => e.id === timesheetEmpId) || null;

  return (
    <div id="attendance-in-out-container" className="space-y-5">
      {/* Date + search + save bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between p-3 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)]">
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => changeDateByDays(-1)}
            className="p-2 rounded-xl hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] transition"
            title="Previous Day"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[var(--color-primary)]" />
            <input
              type="date"
              value={selectedDate}
              max={today}
              onChange={(e) => {
                const picked = e.target.value;
                if (!picked) return;
                setSelectedDate(picked > today ? today : picked);
              }}
              className="bg-transparent text-sm font-bold text-[var(--color-on-surface)] outline-hidden cursor-pointer"
            />
            {/* Today badge — shown only when actually viewing today's sheet */}
            {selectedDate === today && (
              <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] rounded-full">
                Today
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => changeDateByDays(1)}
            disabled={selectedDate >= today}
            className="p-2 rounded-xl hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            title="Next Day"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {isLoadingDay && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-primary)]" />
          )}
        </div>

        <div className="flex flex-1 items-center gap-2 max-w-sm">
          <Search className="w-4 h-4 text-[var(--color-on-surface-variant)] shrink-0" />
          <input
            type="text"
            placeholder="Search employee by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-xs text-[var(--color-on-surface)] outline-hidden placeholder:text-[var(--color-on-surface-variant)]"
          />
        </div>

        {/* Save is ALWAYS available — Present is the default status, so the
            employer may land on a date and save the all-Present sheet as-is
            (In/Out times being optional only reinforces that flow) */}
        <button
          type="button"
          onClick={handleSaveSheet}
          disabled={isSavingSheet}
          className={`flex items-center justify-center gap-1.5 px-4 py-2 font-bold text-xs rounded-xl shadow-xs transition ${
            isSheetDirty
              ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] animate-pulse'
              : 'bg-[var(--color-primary)]/80 text-[var(--color-on-primary)] hover:opacity-90'
          } disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          {isSavingSheet ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" />
              {isSheetDirty ? 'Save Attendance *' : 'Save Attendance'}
            </>
          )}
        </button>
      </div>

      {/* Daily in/out marking table */}
      <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] text-[11px] font-bold uppercase tracking-wider border-b border-[var(--color-outline-variant)]">
                <th className="py-3 px-4 min-w-[200px]">Employee</th>
                <th className="py-3 px-4 min-w-[140px]">Status</th>
                <th className="py-3 px-4 min-w-[140px]">In Time</th>
                <th className="py-3 px-4 min-w-[140px]">Out Time</th>
                <th className="py-3 px-4 min-w-[120px]">Net Hours</th>
                <th className="py-3 px-4 min-w-[160px]">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-outline-variant)]/40 text-xs">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[var(--color-on-surface-variant)]">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="font-bold">No employees matched your search</p>
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => {
                  const row = dailySheetState[emp.id] || {
                    checkInTime: '',
                    checkOutTime: '',
                    status: 'present' as const,
                    notes: '',
                    dirty: false,
                  };

                  const hoursCalc = calculateWorkingHours(row.checkInTime, row.checkOutTime);
                  const isClockedIn = Boolean(row.checkInTime && !row.checkOutTime);

                  return (
                    <tr key={emp.id} className="hover:bg-[var(--color-surface-container)]/60 transition">
                      {/* Employee — click the name for the monthly timesheet */}
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
                            {isClockedIn && (
                              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--color-success)] border-2 border-[var(--color-surface-container-lowest)]" />
                            )}
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={() => setTimesheetEmpId(emp.id)}
                              className="font-bold text-[var(--color-on-surface)] hover:text-[var(--color-primary)] hover:underline transition-colors text-left"
                              title="Open monthly timesheet"
                            >
                              {emp.name}
                            </button>
                            <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                              {emp.role}
                              {emp.defaultInTime ? ` • Shift ${emp.defaultInTime}–${emp.defaultOutTime}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Status — the primary attendance decision, set directly by the employer */}
                      <td className="py-3 px-4">
                        <select
                          value={row.status}
                          onChange={(e) => handleRowStatusChange(emp.id, e.target.value as EmployeeAttendance['status'])}
                          className={`text-[11px] font-bold px-2 py-1 rounded-xl border outline-hidden capitalize ${
                            row.status === 'present'
                              ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)] border-[var(--color-success)]/30'
                              : row.status === 'late'
                              ? 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)] border-[var(--color-warning)]/30'
                              : row.status === 'early_exit'
                              ? 'bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)] border-[var(--color-secondary)]/30'
                              : row.status === 'half_day'
                              ? 'bg-[var(--color-tertiary-container)] text-[var(--color-on-tertiary-container)] border-[var(--color-tertiary)]/30'
                              : row.status === 'holiday'
                              ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] border-[var(--color-primary)]/30'
                              : 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)] border-[var(--color-error)]/30'
                          }`}
                        >
                          <option value="present">Present</option>
                          <option value="late">Late</option>
                          <option value="early_exit">Early Exit</option>
                          <option value="half_day">Half Day</option>
                          <option value="holiday">Holiday</option>
                          <option value="absent">Absent</option>
                        </select>
                      </td>

                      {/* In Time — optional, informational */}
                      <td className="py-3 px-4">
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
                      </td>

                      {/* Out Time — optional, informational */}
                      <td className="py-3 px-4">
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
                      </td>

                      {/* Net Hours */}
                      <td className="py-3 px-4">
                        {row.checkInTime && row.checkOutTime ? (
                          <div className="flex items-center gap-1 font-bold text-[var(--color-on-surface)]">
                            <Timer className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                            {hoursCalc.formatted}
                          </div>
                        ) : (
                          <span className="text-[var(--color-on-surface-variant)]">—</span>
                        )}
                      </td>

                      {/* Remarks */}
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          value={row.notes}
                          onChange={(e) => handleRowNotesChange(emp.id, e.target.value)}
                          placeholder="Notes..."
                          className="w-full bg-[var(--color-surface-container)] text-[11px] text-[var(--color-on-surface)] px-2 py-1 rounded-lg border border-[var(--color-outline-variant)] outline-hidden placeholder:text-[var(--color-on-surface-variant)]"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-[var(--color-on-surface-variant)] px-1">
        Status is the primary attendance entry — mark it directly and it never changes on its own. In/Out times are optional: they only feed the Net Hours display and stay on the record for reference.
      </p>

      {/* Monthly timesheet of the clicked employee */}
      <EmployeeMonthlyTimesheetModal
        isOpen={timesheetEmpId !== null}
        onClose={() => setTimesheetEmpId(null)}
        employee={timesheetEmp}
        initialMonth={selectedDate.substring(0, 7)}
      />
    </div>
  );
}