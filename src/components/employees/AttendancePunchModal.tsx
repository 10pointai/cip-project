import React, { useState } from 'react';
import {
  X,
  Clock,
  LogIn,
  LogOut,
  Calendar,
  User,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  History,
  FileText,
} from 'lucide-react';
import { Employee, EmployeeAttendance, AttendancePunchLog } from '../../types';
import {
  calculateWorkingHours,
  formatTime12h,
  getCurrentTimeHHMM,
  deriveAttendanceStatus,
} from '../../utils/attendanceUtils';

interface AttendancePunchModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
  attendanceRecord?: EmployeeAttendance | null;
  date: string;
  onSaveRecord: (updatedRecord: EmployeeAttendance) => void;
}

export function AttendancePunchModal({
  isOpen,
  onClose,
  employee,
  attendanceRecord,
  date,
  onSaveRecord,
}: AttendancePunchModalProps) {
  if (!isOpen || !employee) return null;

  const [checkInTime, setCheckInTime] = useState<string>(attendanceRecord?.checkInTime || '08:30');
  const [checkOutTime, setCheckOutTime] = useState<string>(attendanceRecord?.checkOutTime || '');
  const [status, setStatus] = useState<EmployeeAttendance['status']>(attendanceRecord?.status || 'present');
  const [shiftName, setShiftName] = useState<string>(
    attendanceRecord?.shiftName || 'General Plant Shift (08:30 - 17:30)'
  );
  const [notes, setNotes] = useState<string>(attendanceRecord?.notes || '');
  const [punchLogs, setPunchLogs] = useState<AttendancePunchLog[]>(
    attendanceRecord?.punchLogs || [
      ...(attendanceRecord?.checkInTime
        ? [{ id: 'p-in', type: 'IN' as const, time: attendanceRecord.checkInTime, source: 'manual' as const }]
        : []),
      ...(attendanceRecord?.checkOutTime
        ? [{ id: 'p-out', type: 'OUT' as const, time: attendanceRecord.checkOutTime, source: 'manual' as const }]
        : []),
    ]
  );

  // New punch input state
  const [newPunchType, setNewPunchType] = useState<'IN' | 'OUT'>('IN');
  const [newPunchTime, setNewPunchTime] = useState<string>(getCurrentTimeHHMM());
  const [newPunchSource, setNewPunchSource] = useState<'manual' | 'kiosk' | 'web' | 'biometric'>('manual');
  const [newPunchNote, setNewPunchNote] = useState<string>('');

  const hoursResult = calculateWorkingHours(checkInTime, checkOutTime);

  const handleAddPunch = () => {
    if (!newPunchTime) return;

    const newLog: AttendancePunchLog = {
      id: `p-${Date.now()}`,
      type: newPunchType,
      time: newPunchTime,
      source: newPunchSource,
      note: newPunchNote || undefined,
    };

    const updatedLogs = [...punchLogs, newLog].sort((a, b) => a.time.localeCompare(b.time));
    setPunchLogs(updatedLogs);

    // Update overall in/out times if appropriate
    if (newPunchType === 'IN' && (!checkInTime || newPunchTime < checkInTime)) {
      setCheckInTime(newPunchTime);
    }
    if (newPunchType === 'OUT' && (!checkOutTime || newPunchTime > checkOutTime)) {
      setCheckOutTime(newPunchTime);
    }

    // Auto-update status
    const autoStatus = deriveAttendanceStatus(
      checkInTime || (newPunchType === 'IN' ? newPunchTime : undefined),
      checkOutTime || (newPunchType === 'OUT' ? newPunchTime : undefined)
    );
    if (status !== 'leave') {
      setStatus(autoStatus);
    }

    setNewPunchNote('');
    setNewPunchTime(getCurrentTimeHHMM());
  };

  const handleDeletePunch = (punchId: string) => {
    const updated = punchLogs.filter((p) => p.id !== punchId);
    setPunchLogs(updated);

    // Recalculate first in and last out
    const ins = updated.filter((p) => p.type === 'IN').map((p) => p.time);
    const outs = updated.filter((p) => p.type === 'OUT').map((p) => p.time);

    const firstIn = ins.length > 0 ? ins.sort()[0] : '';
    const lastOut = outs.length > 0 ? outs.sort()[outs.length - 1] : '';

    setCheckInTime(firstIn);
    setCheckOutTime(lastOut);
  };

  const handleSave = () => {
    const hrs = calculateWorkingHours(checkInTime, checkOutTime);

    const updated: EmployeeAttendance = {
      id: attendanceRecord?.id || `att-${Date.now()}`,
      employeeId: employee.id,
      employeeName: employee.name,
      date,
      status,
      checkInTime: checkInTime || undefined,
      checkOutTime: checkOutTime || undefined,
      totalHoursWorked: hrs.totalDecimalHours,
      shiftName,
      punchLogs,
      notes: notes || undefined,
      updatedAt: new Date().toISOString(),
    };

    onSaveRecord(updated);
    onClose();
  };

  return (
    <div
      id="attendance-punch-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
    >
      <div
        id="attendance-punch-modal"
        className="w-full max-w-2xl bg-[var(--color-surface-container-lowest)] rounded-3xl border border-[var(--color-outline-variant)] shadow-2xl overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[var(--color-surface-container)] border-b border-[var(--color-outline-variant)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] flex items-center justify-center font-black">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--color-on-surface)]">
                In & Out Punch Details
              </h2>
              <p className="text-xs text-[var(--color-on-surface-variant)] flex items-center gap-2 mt-0.5">
                <span className="font-bold text-[var(--color-primary)]">{employee.name}</span>
                <span>•</span>
                <span className="capitalize">{employee.role}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-[var(--color-outline)]" />
                  {date}
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] rounded-full transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Quick Metrics & Duration Banner */}
          <div className="grid grid-cols-3 gap-3 p-4 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)]">
            <div className="p-3 bg-[var(--color-surface-container-lowest)] rounded-xl border border-[var(--color-outline-variant)]/40">
              <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                First In Time
              </p>
              <p className="text-base font-black text-[var(--color-success)] mt-1 flex items-center gap-1.5">
                <LogIn className="w-4 h-4 text-[var(--color-success)]" />
                {checkInTime ? formatTime12h(checkInTime) : 'Not Clocked In'}
              </p>
            </div>

            <div className="p-3 bg-[var(--color-surface-container-lowest)] rounded-xl border border-[var(--color-outline-variant)]/40">
              <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                Last Out Time
              </p>
              <p className="text-base font-black text-[var(--color-warning)] mt-1 flex items-center gap-1.5">
                <LogOut className="w-4 h-4 text-[var(--color-warning)]" />
                {checkOutTime ? formatTime12h(checkOutTime) : 'Currently In'}
              </p>
            </div>

            <div className="p-3 bg-[var(--color-surface-container-lowest)] rounded-xl border border-[var(--color-outline-variant)]/40">
              <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                Total Hours
              </p>
              <p className="text-base font-black text-[var(--color-on-surface)] mt-1">
                {hoursResult.formatted}
              </p>
            </div>
          </div>

          {/* Direct In / Out Time Editors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[var(--color-on-surface)] mb-1.5">
                Check In Time (First In)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={checkInTime}
                  onChange={(e) => setCheckInTime(e.target.value)}
                  className="w-full bg-[var(--color-surface-container)] text-[var(--color-on-surface)] text-sm font-bold px-3 py-2 rounded-xl border border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setCheckInTime(getCurrentTimeHHMM())}
                  className="px-3 py-2 bg-[var(--color-surface-container-high)] hover:bg-[var(--color-surface-container-highest)] text-xs font-bold text-[var(--color-primary)] rounded-xl border border-[var(--color-outline-variant)] transition whitespace-nowrap"
                  title="Set to Current Time"
                >
                  Now
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--color-on-surface)] mb-1.5">
                Check Out Time (Last Out)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={checkOutTime}
                  onChange={(e) => setCheckOutTime(e.target.value)}
                  className="w-full bg-[var(--color-surface-container)] text-[var(--color-on-surface)] text-sm font-bold px-3 py-2 rounded-xl border border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setCheckOutTime(getCurrentTimeHHMM())}
                  className="px-3 py-2 bg-[var(--color-surface-container-high)] hover:bg-[var(--color-surface-container-highest)] text-xs font-bold text-[var(--color-warning)] rounded-xl border border-[var(--color-outline-variant)] transition whitespace-nowrap"
                  title="Set to Current Time"
                >
                  Now
                </button>
              </div>
            </div>
          </div>

          {/* Status & Shift Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[var(--color-on-surface)] mb-1.5">
                Attendance Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full bg-[var(--color-surface-container)] text-[var(--color-on-surface)] text-xs font-bold px-3 py-2.5 rounded-xl border border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] outline-hidden"
              >
                <option value="present">Present (Full Day)</option>
                <option value="late">Late Arrival</option>
                <option value="half_day">Half Day</option>
                <option value="absent">Absent</option>
                <option value="leave">On Leave</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--color-on-surface)] mb-1.5">
                Assigned Shift Schedule
              </label>
              <select
                value={shiftName}
                onChange={(e) => setShiftName(e.target.value)}
                className="w-full bg-[var(--color-surface-container)] text-[var(--color-on-surface)] text-xs font-bold px-3 py-2.5 rounded-xl border border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] outline-hidden"
              >
                <option value="General Plant Shift (08:30 - 17:30)">General Plant Shift (08:30 - 17:30)</option>
                <option value="Plant In-Charge Shift (08:00 - 17:00)">Plant In-Charge Shift (08:00 - 17:00)</option>
                <option value="Night Laying & Batching Shift (20:00 - 05:00)">Night Laying & Batching Shift (20:00 - 05:00)</option>
                <option value="Management Shift (09:00 - 18:00)">Management Shift (09:00 - 18:00)</option>
              </select>
            </div>
          </div>

          {/* Punch Timestamp History / Log */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[var(--color-on-surface)] flex items-center gap-1.5 uppercase tracking-wider">
                <History className="w-4 h-4 text-[var(--color-primary)]" />
                Time Card Punches & Biometric Log
              </h3>
              <span className="text-[11px] font-bold text-[var(--color-on-surface-variant)]">
                {punchLogs.length} punch event(s) recorded
              </span>
            </div>

            {/* Existing Punches List */}
            <div className="bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)] divide-y divide-[var(--color-outline-variant)]/60 overflow-hidden">
              {punchLogs.length === 0 ? (
                <div className="p-4 text-center text-xs text-[var(--color-on-surface-variant)] font-semibold">
                  No individual punch logs recorded. Use the form below to record timestamped IN or OUT events.
                </div>
              ) : (
                punchLogs.map((p, idx) => (
                  <div key={p.id || idx} className="p-3 flex items-center justify-between hover:bg-[var(--color-surface-container-high)]/40 transition">
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-7 h-7 rounded-xl flex items-center justify-center text-[10px] font-black ${
                          p.type === 'IN'
                            ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]'
                            : 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]'
                        }`}
                      >
                        {p.type}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[var(--color-on-surface)]">
                            {formatTime12h(p.time)}
                          </span>
                          <span className="text-[10px] font-semibold text-[var(--color-on-surface-variant)] bg-[var(--color-surface-container-lowest)] px-2 py-0.5 rounded-full border border-[var(--color-outline-variant)] capitalize">
                            {p.source || 'manual'}
                          </span>
                        </div>
                        {p.note && (
                          <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                            {p.note}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeletePunch(p.id)}
                      className="p-1.5 text-[var(--color-error)] hover:bg-[var(--color-error-container)]/30 rounded-lg transition"
                      title="Delete punch entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add New Punch Row */}
            <div className="p-3 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)] space-y-3">
              <p className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                + Add Timestamp Punch
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <select
                    value={newPunchType}
                    onChange={(e) => setNewPunchType(e.target.value as any)}
                    className="w-full bg-[var(--color-surface-container-lowest)] text-xs font-bold px-2.5 py-2 rounded-xl border border-[var(--color-outline-variant)] text-[var(--color-on-surface)]"
                  >
                    <option value="IN">PUNCH IN</option>
                    <option value="OUT">PUNCH OUT</option>
                  </select>
                </div>
                <div>
                  <input
                    type="time"
                    value={newPunchTime}
                    onChange={(e) => setNewPunchTime(e.target.value)}
                    className="w-full bg-[var(--color-surface-container-lowest)] text-xs font-bold px-2.5 py-2 rounded-xl border border-[var(--color-outline-variant)] text-[var(--color-on-surface)]"
                  />
                </div>
                <div>
                  <select
                    value={newPunchSource}
                    onChange={(e) => setNewPunchSource(e.target.value as any)}
                    className="w-full bg-[var(--color-surface-container-lowest)] text-xs font-bold px-2.5 py-2 rounded-xl border border-[var(--color-outline-variant)] text-[var(--color-on-surface)]"
                  >
                    <option value="manual">Manual Entry</option>
                    <option value="kiosk">Gate Terminal</option>
                    <option value="web">Web Portal</option>
                    <option value="biometric">Biometric Sync</option>
                  </select>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={handleAddPunch}
                    className="w-full bg-[var(--color-primary)] text-[var(--color-on-primary)] hover:opacity-90 font-bold text-xs py-2 rounded-xl transition flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Log Punch
                  </button>
                </div>
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Optional punch note (e.g. Lunch break, Site dispatch, Client meeting)..."
                  value={newPunchNote}
                  onChange={(e) => setNewPunchNote(e.target.value)}
                  className="w-full bg-[var(--color-surface-container-lowest)] text-xs px-3 py-1.5 rounded-xl border border-[var(--color-outline-variant)] text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)]"
                />
              </div>
            </div>
          </div>

          {/* Notes / Remarks */}
          <div>
            <label className="block text-xs font-bold text-[var(--color-on-surface)] mb-1.5">
              Daily Attendance Notes & Remarks
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Driver mobilized on NH-48 chainage trip; extended night batching..."
              className="w-full bg-[var(--color-surface-container)] text-[var(--color-on-surface)] text-xs px-3 py-2 rounded-xl border border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] outline-hidden resize-none"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-[var(--color-surface-container)] border-t border-[var(--color-outline-variant)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)] rounded-full transition"
          >
            Cancel
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold text-xs rounded-full hover:opacity-90 transition shadow-xs"
            >
              <CheckCircle2 className="w-4 h-4" /> Save Attendance & Punches
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
