import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Printer, Timer, X } from 'lucide-react';
import { Employee, EmployeeAttendance } from '../../types';
import { api } from '../../services/api';
import { calculateWorkingHours, formatTime12h } from '../../utils/attendanceUtils';

/** Last day (padded) of a 'YYYY-MM' month */
function lastDayOf(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return '31';
  return String(new Date(y, m, 0).getDate()).padStart(2, '0');
}

interface EmployeeMonthlyTimesheetViewProps {
  /** the employee whose register is shown */
  employee: Employee;
  /** pre-select the month from the sheet's date (YYYY-MM) */
  initialMonth?: string;
}

/**
 * Monthly Timesheet register — one employee's day-by-day table for a chosen
 * month (stats, month picker, print). The PRESENTATIONAL core rendered by
 * BOTH the standalone modal AND the Employee Details page's Attendance tab;
 * it fetches date-scoped data for the selected employee + month only.
 */
export function EmployeeMonthlyTimesheetView({
  employee,
  initialMonth,
}: EmployeeMonthlyTimesheetViewProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>(
    initialMonth || new Date().toISOString().split('T')[0].substring(0, 7)
  );
  const [records, setRecords] = useState<EmployeeAttendance[]>([]);
  const fetchToken = React.useRef(0);

  // Follow the sheet's selected month on mount/prop change
  useEffect(() => {
    if (initialMonth) setSelectedMonth(initialMonth);
  }, [initialMonth]);

  const [isLoading, setIsLoading] = useState(false);

  // Fresh, date-scoped fetch: this employee's records for this month only
  useEffect(() => {
    if (!employee?.id) return;
    const token = ++fetchToken.current;
    setIsLoading(true);
    api
      .getAttendance({
        employeeId: employee.id,
        from: `${selectedMonth}-01`,
        to: `${selectedMonth}-${lastDayOf(selectedMonth)}`,
      })
      .then((res) => {
        if (token === fetchToken.current && res.success) {
          setRecords((res.data || []).sort((a, b) => a.date.localeCompare(b.date)));
        }
      })
      .catch(() => {
        if (token === fetchToken.current) setRecords([]);
      })
      .finally(() => {
        if (token === fetchToken.current) setIsLoading(false);
      });
  }, [employee?.id, selectedMonth]);

  const monthlyStats = useMemo(() => {
    let daysPresent = 0;
    let daysLate = 0;
    let daysEarlyExit = 0;
    let daysHalf = 0;
    let daysHoliday = 0;
    let daysAbsent = 0;
    let totalHours = 0;

    records.forEach((rec) => {
      if (rec.status === 'present') daysPresent++;
      else if (rec.status === 'late') daysLate++;
      else if (rec.status === 'early_exit') daysEarlyExit++;
      else if (rec.status === 'half_day') daysHalf++;
      else if (rec.status === 'holiday') daysHoliday++;
      else if (rec.status === 'absent') daysAbsent++;
      if (rec.checkInTime && rec.checkOutTime) {
        totalHours += calculateWorkingHours(rec.checkInTime, rec.checkOutTime).totalDecimalHours;
      }
    });

    return {
      logged: records.length,
      daysPresent,
      daysLate,
      daysEarlyExit,
      daysHalf,
      daysHoliday,
      daysAbsent,
      totalHours: Number(totalHours.toFixed(1)),
    };
  }, [records]);

  return (
    <div className="space-y-4" id="employee-monthly-timesheet">
      {/* Month + actions bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)] p-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[var(--color-primary)]" />
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-[var(--color-surface-container-lowest)] text-xs font-bold text-[var(--color-on-surface)] px-3 py-2 rounded-xl border border-[var(--color-outline-variant)] outline-hidden"
          />
          {employee.defaultInTime && (
            <span className="text-[10px] font-semibold text-[var(--color-on-surface-variant)]">
              Shift: {employee.defaultInTime} → {employee.defaultOutTime}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)] text-xs font-bold rounded-xl transition"
        >
          <Printer className="w-3.5 h-3.5" />
          Print
        </button>
      </div>

      {/* Month stats */}
      <div className="grid grid-cols-2 sm:grid-cols-7 gap-3 px-5 py-4 rounded-2xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)]">
        <div>
          <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase">Days Logged</p>
          <p className="text-lg font-black text-[var(--color-on-surface)]">{monthlyStats.logged}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase">Present</p>
          <p className="text-lg font-black text-[var(--color-success)]">{monthlyStats.daysPresent}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase">Late</p>
          <p className="text-lg font-black text-[var(--color-warning)]">{monthlyStats.daysLate}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase">Early Exit</p>
          <p className="text-lg font-black text-[var(--color-warning)]">{monthlyStats.daysEarlyExit}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase">Half Day</p>
          <p className="text-lg font-black text-[var(--color-tertiary)]">{monthlyStats.daysHalf}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase">Holiday</p>
          <p className="text-lg font-black text-[var(--color-primary)]">{monthlyStats.daysHoliday}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase">Absent</p>
          <p className="text-lg font-black text-[var(--color-error)]">{monthlyStats.daysAbsent}</p>
        </div>
        <div className="sm:col-span-7">
          <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase">Total Hours</p>
          <p className="text-lg font-black text-[var(--color-on-surface)]">
            {monthlyStats.totalHours} <span className="text-xs font-normal">hrs</span>
          </p>
        </div>
      </div>

      {/* Day-by-day register */}
      <div className="rounded-2xl border border-[var(--color-outline-variant)] overflow-hidden bg-[var(--color-surface-container-lowest)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] text-[11px] font-bold uppercase tracking-wider border-b border-[var(--color-outline-variant)]">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">First In</th>
                <th className="py-3 px-4">Last Out</th>
                <th className="py-3 px-4">Hours Worked</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-outline-variant)]/40 text-xs">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[var(--color-on-surface-variant)]">
                    <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="font-bold">No attendance records found for {selectedMonth}</p>
                  </td>
                </tr>
              ) : (
                records.map((rec) => {
                  const hours = calculateWorkingHours(rec.checkInTime, rec.checkOutTime);
                  return (
                    <tr key={rec.id} className="hover:bg-[var(--color-surface-container)]/50 transition">
                      <td className="py-3 px-4 font-bold text-[var(--color-on-surface)]">{rec.date}</td>
                      <td className="py-3 px-4 font-bold text-[var(--color-success)]">
                        {rec.checkInTime ? formatTime12h(rec.checkInTime) : '--:--'}
                      </td>
                      <td className="py-3 px-4 font-bold text-[var(--color-warning)]">
                        {rec.checkOutTime ? formatTime12h(rec.checkOutTime) : '--:--'}
                      </td>
                      <td className="py-3 px-4 font-bold text-[var(--color-on-surface)] flex items-center gap-1">
                        <Timer className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                        {hours.formatted}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                            rec.status === 'present'
                              ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]'
                              : rec.status === 'late'
                              ? 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]'
                              : rec.status === 'early_exit'
                              ? 'bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)]'
                              : rec.status === 'half_day'
                              ? 'bg-[var(--color-tertiary-container)] text-[var(--color-on-tertiary-container)]'
                              : rec.status === 'holiday'
                              ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'
                              : 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]'
                          }`}
                        >
                          {rec.status === 'early_exit' ? 'early exit' : rec.status === 'half_day' ? 'half day' : rec.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[var(--color-on-surface-variant)]">{rec.notes || '-'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface EmployeeMonthlyTimesheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
  /** pre-select the month from the daily sheet's date (YYYY-MM) */
  initialMonth?: string;
}

/** Standalone modal wrapper around EmployeeMonthlyTimesheetView (used by the
 *  daily attendance sheet when the employer clicks an employee's name). */
export function EmployeeMonthlyTimesheetModal({
  isOpen,
  onClose,
  employee,
  initialMonth,
}: EmployeeMonthlyTimesheetModalProps) {
  if (!isOpen || !employee) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/40 backdrop-blur-xs">
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-outline-variant)] shadow-2xl w-full max-w-5xl overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-[var(--color-outline-variant)] flex justify-between items-center bg-[var(--color-surface-container)] shrink-0">
          <h3 className="text-sm font-black text-[var(--color-on-surface)] flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[var(--color-primary)]" />
            {employee.name} — Monthly Timesheet
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] p-1.5 rounded-full hover:bg-[var(--color-surface-container-high)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* scrollable body */}
        <div className="p-5 overflow-y-auto flex-1">
          <EmployeeMonthlyTimesheetView
            employee={employee}
            initialMonth={initialMonth}
          />
        </div>
      </div>
    </div>
  );
}