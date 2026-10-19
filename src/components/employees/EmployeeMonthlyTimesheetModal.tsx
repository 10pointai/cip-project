import React, { useState, useEffect, useMemo } from 'react';
import { X, Calendar, Printer, Loader2, Timer } from 'lucide-react';
import { Employee, EmployeeAttendance } from '../../types';
import { api } from '../../services/api';
import { calculateWorkingHours, formatTime12h } from '../../utils/attendanceUtils';

interface EmployeeMonthlyTimesheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** the employee whose register is opened (clicked in the daily sheet) */
  employee: Employee | null;
  /** pre-select the month from the date the daily sheet was on (YYYY-MM) */
  initialMonth?: string;
}

/** Last day (padded) of a 'YYYY-MM' month */
function lastDayOf(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return '31';
  return String(new Date(y, m, 0).getDate()).padStart(2, '0');
}

/**
 * Monthly Timesheet — one employee's day-by-day register for a chosen month.
 * Opened by clicking the employee's name in the Daily In/Out Sheet (it IS the
 * former "Monthly Timesheet Register" mode, now presented as a modal). Fetches
 * that employee's records for the selected month ONLY — date-scoped reads.
 */
export function EmployeeMonthlyTimesheetModal({
  isOpen,
  onClose,
  employee,
  initialMonth,
}: EmployeeMonthlyTimesheetModalProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>(
    initialMonth || new Date().toISOString().split('T')[0].substring(0, 7)
  );
  const [records, setRecords] = useState<EmployeeAttendance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fetchToken = React.useRef(0);

  // Follow the sheet's selected date on open
  useEffect(() => {
    if (isOpen && initialMonth) setSelectedMonth(initialMonth);
  }, [isOpen, initialMonth]);

  // Fresh, date-scoped fetch: this employee's records for this month only
  useEffect(() => {
    if (!isOpen || !employee) return;
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
  }, [isOpen, employee?.id, selectedMonth]);

  const monthlyStats = useMemo(() => {
    let daysPresent = 0;
    let daysLate = 0;
    let daysEarlyExit = 0;
    let daysAbsent = 0;
    let totalHours = 0;

    records.forEach((rec) => {
      if (rec.status === 'present') daysPresent++;
      else if (rec.status === 'late') daysLate++;
      else if (rec.status === 'early_exit') daysEarlyExit++;
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
      daysAbsent,
      totalHours: Number(totalHours.toFixed(1)),
    };
  }, [records]);

  if (!isOpen || !employee) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/40 backdrop-blur-xs">
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-outline-variant)] shadow-2xl w-full max-w-5xl overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-[var(--color-outline-variant)] flex justify-between items-center bg-[var(--color-surface-container)]">
          <div>
            <h3 className="text-sm font-black text-[var(--color-on-surface)] flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[var(--color-primary)]" />
              {employee.name} — Monthly Timesheet
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-bold bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] px-2 py-0.5 rounded-full capitalize">
                {employee.role}
              </span>
              {employee.defaultInTime && (
                <span className="text-[10px] font-semibold text-[var(--color-on-surface-variant)]">
                  Shift: {employee.defaultInTime} → {employee.defaultOutTime}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-[var(--color-surface-container-lowest)] text-xs font-bold text-[var(--color-on-surface)] px-3 py-2 rounded-xl border border-[var(--color-outline-variant)] outline-hidden"
            />
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)] text-xs font-bold rounded-xl transition"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
            <button
              onClick={onClose}
              className="text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] p-1.5 rounded-full hover:bg-[var(--color-surface-container-high)]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Month stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 px-5 py-4 border-b border-[var(--color-outline-variant)]">
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
            <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase">Total Hours</p>
            <p className="text-lg font-black text-[var(--color-on-surface)]">
              {monthlyStats.totalHours} <span className="text-xs font-normal">hrs</span>
            </p>
          </div>
        </div>

        {/* Day-by-day register */}
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0">
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
                              : 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]'
                          }`}
                        >
                          {rec.status === 'early_exit' ? 'early exit' : rec.status}
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