import { serverDb } from '../db';

/**
 * VEHICLE EMI AUTO-DEDUCTION SCHEDULER (client directive 2026-10-22):
 * a daily cron that reads the saved EMI configuration and posts the monthly
 * installment automatically — no user needs to be logged in.
 *
 * Every tick, for each financed vehicle with an amount, due day and linked
 * account:
 *   1. compute the due date for the current (and previous) month — the previous
 *      month covers a server-down day at the month boundary;
 *   2. skip if the loan is closed, the tenure is exhausted, or an entry for
 *      that month already exists (idempotent — running repeatedly never
 *      double-posts);
 *   3. post a `VehicleEmiEntry` (source 'auto') — serverDb.addVehicleEmiEntry
 *      debits the linked cash/bank account's balance through the standard
 *      balance streams and live-syncs the row to `vehicle_emi_entries`.
 *
 * Operators can edit or remove any posted entry from the Vehicle EMI ledger
 * (edit rebalances by delta). Months missed beyond the previous month are NOT
 * auto-backfilled by design — the operator records them manually through the
 * same ledger, staying in control of real bank debits.
 */

/** Today in the plant's timezone (IST) as YYYY-MM-DD. */
function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** YYYY-MM of a 'YYYY-MM-DD' string. */
function monthKeyOf(dateStr: string): string {
  return String(dateStr).slice(0, 7);
}

/** Clamp the due day to the month's last day (31st → 28th in February &c.). */
function dueDateFor(year: number, month0: number, dueDay: number): string {
  const lastDay = new Date(year, month0 + 1, 0).getDate();
  const day = Math.min(31, Math.max(1, dueDay || 1), lastDay);
  return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** How many months of the tenure are still unpaid: tenure − (opening paid + posted entries). */
function emisLeft(vehicle: ReturnType<typeof serverDb.getVehicles>[number], postedCount: number): number {
  const emi = vehicle.emiDetails;
  if (!emi) return 0;
  const tenure = Number(emi.totalTenureMonths) || 0;
  if (tenure <= 0) return Number.POSITIVE_INFINITY; // no tenure captured — deduct monthly until closed manually
  const opening = Number(emi.paidEmisCount) || 0;
  return Math.max(0, tenure - opening - postedCount);
}

export function runDailyEmiCheck(): { checked: number; posted: number } {
  const today = istToday();
  const now = new Date(`${today}T00:00:00Z`);
  const thisYear = now.getUTCFullYear();
  const thisMonth = now.getUTCMonth();

  let posted = 0;
  let checked = 0;

  for (const vehicle of serverDb.getVehicles()) {
    const emi = vehicle.emiDetails;
    if (!emi || !emi.hasEmi || emi.status === 'closed') continue;
    const amount = Number(emi.monthlyEmiAmount) || 0;
    const accountId = emi.emiAccountId;
    if (amount <= 0 || !accountId || !vehicle.id) continue;
    checked += 1;

    const entries = serverDb.getVehicleEmiEntries(vehicle.id);
    const remaining = emisLeft(vehicle, entries.length);

    // Current month + previous month, both idempotent per vehicle-month.
    for (let back = 0; back <= 1; back++) {
      const month0 = thisMonth - back;
      const y = thisYear + Math.floor(month0 / 12);
      const m = ((month0 % 12) + 12) % 12;
      const dueDate = dueDateFor(y, m, Number(emi.emiDueDay) || 10);
      if (dueDate > today) continue; // due date hasn't arrived yet this month
      if (entries.some((e) => monthKeyOf(e.date) === `${y}-${String(m + 1).padStart(2, '0')}`)) continue;
      if (remaining <= 0) continue; // tenure exhausted

      try {
        serverDb.addVehicleEmiEntry({
          vehicleId: vehicle.id,
          accountId,
          date: dueDate,
          amount,
          source: 'auto',
          notes: `Auto-deducted monthly EMI (loan ${emi.loanAccountNumber || emi.financierName || 'account'}).`,
        });
        posted += 1;
      } catch (e: any) {
        console.error(`[EMI Scheduler] Failed to post EMI for ${vehicle.vehicleNo}:`, e.message);
      }
    }
  }

  return { checked, posted };
}

/** Boot + hourly tick — each tick is idempotent per vehicle-month. */
export function startEmiScheduler(): void {
  // First run shortly after boot (MySQL hydration + migrations settle first).
  setTimeout(() => {
    try {
      const res = runDailyEmiCheck();
      if (res.checked > 0) {
        console.log(`[EMI Scheduler] Daily check: ${res.checked} active loan(s) scanned, ${res.posted} EMI entry(ies) posted.`);
      }
    } catch (e: any) {
      console.error('[EMI Scheduler] Daily check failed:', e.message);
    }
  }, 45_000);

  setInterval(() => {
    try {
      const res = runDailyEmiCheck();
      if (res.posted > 0) {
        console.log(`[EMI Scheduler] Posted ${res.posted} EMI entry(ies).`);
      }
    } catch (e: any) {
      console.error('[EMI Scheduler] Tick failed:', e.message);
    }
  }, 60 * 60 * 1000);
}