/**
 * Attendance & Working Hours Utility Functions
 * Supports In/Out timestamp parsing, duration computation, overtime estimation,
 * and automated status derivation.
 */

export interface TimeDurationResult {
  hours: number;
  minutes: number;
  totalDecimalHours: number;
  formatted: string;
}

/**
 * Parses time string (HH:mm or HH:mm:ss) into total minutes from midnight
 */
export function timeStringToMinutes(timeStr?: string): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Calculates net working hours between In-Time and Out-Time
 * Handles normal shifts and night shifts (crossing midnight)
 */
export function calculateWorkingHours(
  checkInTime?: string,
  checkOutTime?: string,
  breakMinutes: number = 0
): TimeDurationResult {
  const inMin = timeStringToMinutes(checkInTime);
  const outMin = timeStringToMinutes(checkOutTime);

  if (inMin === null || outMin === null) {
    return {
      hours: 0,
      minutes: 0,
      totalDecimalHours: 0,
      formatted: '0h 00m',
    };
  }

  let diffMinutes = outMin - inMin;
  if (diffMinutes < 0) {
    // Crosses midnight, e.g. 20:00 to 05:00
    diffMinutes += 24 * 60;
  }

  // Deduct break time if worked more than break threshold
  const netMinutes = Math.max(0, diffMinutes - (diffMinutes > 240 ? breakMinutes : 0));
  const hours = Math.floor(netMinutes / 60);
  const minutes = netMinutes % 60;
  const totalDecimalHours = Number((netMinutes / 60).toFixed(2));

  return {
    hours,
    minutes,
    totalDecimalHours,
    formatted: `${hours}h ${minutes.toString().padStart(2, '0')}m`,
  };
}

/**
 * Derives attendance status automatically based on in/out times and shift configuration
 */
export function deriveAttendanceStatus(
  checkInTime?: string,
  checkOutTime?: string,
  standardShiftStart: string = '09:00',
  graceMinutes: number = 15,
  standardShiftHours: number = 8
): 'present' | 'absent' | 'half_day' | 'late' {
  if (!checkInTime && !checkOutTime) {
    return 'absent';
  }

  if (checkInTime && !checkOutTime) {
    // Currently clocked in
    const inMin = timeStringToMinutes(checkInTime);
    const shiftStartMin = timeStringToMinutes(standardShiftStart);
    if (inMin !== null && shiftStartMin !== null && inMin > shiftStartMin + graceMinutes) {
      return 'late';
    }
    return 'present';
  }

  const { totalDecimalHours } = calculateWorkingHours(checkInTime, checkOutTime);

  // If worked less than half a shift (e.g. < 4.0 hours)
  if (totalDecimalHours < 4.0) {
    return 'half_day';
  }

  // If worked between 4.0 and 6.5 hours
  if (totalDecimalHours < 6.5) {
    return 'half_day';
  }

  // Check if late on arrival
  const inMin = timeStringToMinutes(checkInTime);
  const shiftStartMin = timeStringToMinutes(standardShiftStart);
  if (inMin !== null && shiftStartMin !== null && inMin > shiftStartMin + graceMinutes) {
    return 'late';
  }

  return 'present';
}

/**
 * Gets the current time in HH:mm format
 */
export function getCurrentTimeHHMM(): string {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Formats time from 24h (HH:mm) to 12h display with AM/PM
 */
export function formatTime12h(timeStr?: string): string {
  if (!timeStr) return '--:--';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  let h = parseInt(parts[0], 10);
  const m = parts[1].padStart(2, '0');
  if (isNaN(h)) return timeStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  h = h ? h : 12; // 0 becomes 12
  return `${h.toString().padStart(2, '0')}:${m} ${ampm}`;
}
