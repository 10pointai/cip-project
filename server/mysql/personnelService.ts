import { executeMysqlQuery, executeMysqlOne } from './queryClient';
import { isMysqlConfigured } from './connection';
import {
  Employee,
  EmployeeAttendance,
  EmployeeLeave,
  EmployeePayment,
  EmployeeLedgerTransaction,
  CompanySettings,
  EvidenceFolder,
  EvidenceFile,
} from '../../src/types';
import { serverDb } from '../db';

function parseJsonField<T>(field: any, fallback: T): T {
  if (!field) return fallback;
  if (typeof field === 'object') return field;
  try {
    return JSON.parse(field);
  } catch {
    return fallback;
  }
}

function parseNum(val: any, fallback = 0): number {
  if (val === null || val === undefined) return fallback;
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
}

// ==========================================
// EMPLOYEES & HR
// ==========================================

export async function fetchEmployeesDirect(): Promise<Employee[]> {
  if (!isMysqlConfigured()) {
    return serverDb.getEmployees();
  }
  const rows = await executeMysqlQuery('SELECT * FROM employees ORDER BY name ASC');
  return rows.map((emp: any) => ({
    id: emp.id,
    name: emp.name,
    role: (emp.designation || emp.role || 'operator') as any,
    phone: emp.phone,
    email: emp.email || undefined,
    aadhaarNo: emp.aadhar_number || emp.aadhaarNo || undefined,
    panNo: emp.pan_number || emp.panNo || undefined,
    joiningDate: emp.date_of_joining || emp.joiningDate || '2026-01-01',
    // base_salary is THE store for the payout (both types); daily_wage_rate
    // falls back for legacy rows whose amount was split into it
    salaryBase: parseNum(emp.base_salary) || parseNum(emp.daily_wage_rate) || parseNum(emp.salaryBase),
    salaryType: (emp.salary_type || emp.salaryType || 'monthly') as any,
    status: (emp.status || 'active') as any,
    licenseNo: emp.license_number || emp.licenseNo || undefined,
    bankAccountNo: (emp.bank_details ? (parseJsonField<any>(emp.bank_details, {})?.accountNumber) : undefined) || emp.bankAccountNo || undefined,
    bankIFSC: (emp.bank_details ? (parseJsonField<any>(emp.bank_details, {})?.ifscCode) : undefined) || emp.bankIFSC || undefined,
    upiAddress: emp.upi_address || undefined,
    nameOnAccount: emp.name_on_account || undefined,
    defaultInTime: emp.default_in_time || undefined,
    defaultOutTime: emp.default_out_time || undefined,
    openingBalance: parseNum(emp.opening_balance),
    createdAt: emp.created_at || new Date().toISOString(),
  }));
}

export async function fetchAttendanceDirect(filters?: {
  /** single exact day (YYYY-MM-DD) — the daily sheet fetches only its date */
  date?: string;
  /** one employee's records (combined with from/to for the monthly register) */
  employeeId?: string;
  /** inclusive range lower bound (YYYY-MM-DD) */
  from?: string;
  /** inclusive range upper bound (YYYY-MM-DD) */
  to?: string;
}): Promise<EmployeeAttendance[]> {
  const where: string[] = [];
  const params: string[] = [];
  if (filters?.date) {
    where.push('date = ?');
    params.push(filters.date);
  }
  if (filters?.employeeId) {
    where.push('employee_id = ?');
    params.push(filters.employeeId);
  }
  if (filters?.from) {
    where.push('date >= ?');
    params.push(filters.from);
  }
  if (filters?.to) {
    where.push('date <= ?');
    params.push(filters.to);
  }

  if (!isMysqlConfigured()) {
    let rows = serverDb.getAttendance();
    if (filters?.date) rows = rows.filter((a) => a.date === filters.date);
    if (filters?.employeeId) rows = rows.filter((a) => a.employeeId === filters.employeeId);
    if (filters?.from) rows = rows.filter((a) => a.date >= (filters.from as string));
    if (filters?.to) rows = rows.filter((a) => a.date <= (filters.to as string));
    return rows;
  }
  // employee_name is resolved live from the employees table (NOT stored on
  // attendance rows — see the dropped-column note in migrations.ts)
  const sql = `SELECT a.*, e.name AS employee_name FROM attendance a LEFT JOIN employees e ON e.id = a.employee_id${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY a.date DESC, a.created_at DESC`;
  const rows = await executeMysqlQuery(sql, params);
  return rows.map((att: any) => ({
    id: att.id,
    employeeId: att.employee_id,
    employeeName: att.employee_name || '',
    date: att.date,
    status: att.status,
    // EmployeeAttendance field names — the sheet/timesheet read these
    checkInTime: att.in_time || undefined,
    checkOutTime: att.out_time || undefined,
    totalHoursWorked: parseNum(att.work_hours),
    overtimeHours: parseNum(att.overtime_hours),
    notes: att.notes || undefined,
    createdAt: att.created_at,
    updatedAt: att.updated_at,
  }));
}

export async function fetchLeavesDirect(): Promise<EmployeeLeave[]> {
  if (!isMysqlConfigured()) {
    return serverDb.getLeaves();
  }
  const rows = await executeMysqlQuery('SELECT * FROM leaves ORDER BY start_date DESC');
  return rows.map((lv: any) => ({
    id: lv.id,
    employeeId: lv.employee_id,
    employeeName: lv.employee_name,
    leaveType: lv.leave_type,
    startDate: lv.start_date,
    endDate: lv.end_date,
    totalDays: parseNum(lv.total_days, 1),
    reason: lv.reason || undefined,
    status: lv.status || 'approved',
    createdAt: lv.created_at,
  }));
}

export async function fetchEmployeePaymentsDirect(): Promise<EmployeePayment[]> {
  if (!isMysqlConfigured()) {
    return serverDb.getEmployeePayments();
  }
  const rows = await executeMysqlQuery(
    `SELECT ep.*, e.name AS employee_name, a.name AS account_name
     FROM employee_payments ep
     LEFT JOIN employees e ON e.id = ep.employee_id
     LEFT JOIN cash_bank_accounts a ON a.id = ep.account_id
     ORDER BY ep.created_at DESC, ep.date DESC`
  );
  return rows.map((ep: any) => ({
    id: ep.id,
    employeeId: ep.employee_id,
    employeeName: ep.employee_name,
    date: ep.date,
    type: ep.type,
    amount: parseNum(ep.amount),
    paymentMode: ep.payment_mode,
    accountId: ep.account_id || undefined,
    accountName: ep.account_name || undefined,
    referenceNo: ep.reference_no || undefined,
    notes: ep.notes || undefined,
    monthYear: ep.month_year || undefined,
    createdAt: ep.created_at,
  }));
}

// ==========================================
// SETTINGS
// ==========================================

export async function fetchSettingsDirect(): Promise<CompanySettings> {
  if (!isMysqlConfigured()) {
    return serverDb.getSettings();
  }
  const s = await executeMysqlOne('SELECT * FROM company_settings LIMIT 1');
  if (!s) return serverDb.getSettings();

  const current = serverDb.getSettings();
  return {
    ...current,
    companyName: s.company_name || current.companyName,
    tagline: s.tagline || current.tagline,
    tradeName: s.trade_name || current.tradeName,
    gstin: s.gstin || current.gstin,
    pan: s.pan || current.pan,
    cin: s.cin || current.cin || undefined,
    email: s.email || current.email,
    phone: s.phone || current.phone,
    website: s.website || current.website,
    registeredAddress: {
      street: s.address_street || current.registeredAddress.street,
      city: s.address_city || current.registeredAddress.city,
      state: s.address_state || current.registeredAddress.state,
      stateCode: s.address_state_code || current.registeredAddress.stateCode,
      pincode: s.address_pincode || current.registeredAddress.pincode,
    },
    invoiceNotes: s.invoice_notes || current.invoiceNotes,
  };
}

export async function updateSettingsDirect(settingsData: Partial<CompanySettings>): Promise<CompanySettings> {
  const updated = serverDb.updateSettings(settingsData);
  if (!isMysqlConfigured()) {
    return updated;
  }

  await executeMysqlQuery(
    `REPLACE INTO company_settings (
      id, company_name, tagline, trade_name, gstin, pan, cin, email, phone, website,
      address_street, address_city, address_state, address_state_code, address_pincode,
      invoice_notes, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'default_settings',
      updated.companyName,
      updated.tagline || null,
      updated.tradeName || null,
      updated.gstin || null,
      updated.pan || null,
      updated.cin || null,
      updated.email || null,
      updated.phone || null,
      updated.website || null,
      updated.registeredAddress?.street || null,
      updated.registeredAddress?.city || null,
      updated.registeredAddress?.state || null,
      updated.registeredAddress?.stateCode || null,
      updated.registeredAddress?.pincode || null,
      updated.invoiceNotes || null,
      new Date().toISOString(),
    ]
  );

  return updated;
}

// ==========================================
// EVIDENCE & CLOUD DOCUMENTS
// ==========================================

export async function fetchEvidenceFoldersDirect(): Promise<EvidenceFolder[]> {
  if (!isMysqlConfigured()) {
    return [];
  }
  const rows = await executeMysqlQuery('SELECT * FROM evidence_folders ORDER BY name ASC');
  return rows.map((f: any) => ({
    id: f.id,
    name: f.name,
    entityType: f.entity_type,
    entityId: f.entity_id || undefined,
    entityName: f.entity_name || undefined,
    parentId: f.parent_id || undefined,
    isSystemGenerated: Boolean(f.is_system_generated),
    color: f.color || undefined,
    description: f.description || undefined,
    createdAt: f.created_at,
    updatedAt: f.updated_at,
  }));
}

export async function fetchEvidenceFilesDirect(): Promise<EvidenceFile[]> {
  if (!isMysqlConfigured()) {
    return [];
  }
  const rows = await executeMysqlQuery('SELECT * FROM evidence_files ORDER BY created_at DESC');
  return rows.map((f: any) => ({
    id: f.id,
    folderId: f.folder_id,
    name: f.name,
    size: f.size,
    type: f.type,
    gcsUri: f.gcs_uri || undefined,
    publicUrl: f.public_url || undefined,
    dataUrl: f.data_url || undefined,
    entityType: f.entity_type,
    entityId: f.entity_id || undefined,
    entityName: f.entity_name || undefined,
    linkedEntryType: f.linked_entry_type || undefined,
    linkedEntryId: f.linked_entry_id || undefined,
    uploadedBy: f.uploaded_by || undefined,
    description: f.description || undefined,
    tags: parseJsonField(f.tags, []),
    createdAt: f.created_at,
  }));
}

// ==========================================
// DIRECT MUTATIONS FOR PERSONNEL & HR
// ==========================================

export async function createEmployeeDirect(empData: any): Promise<Employee> {
  const emp = serverDb.createEmployee(empData);
  if (!isMysqlConfigured()) return emp;

  // Full REPLACE (mirrors liveSyncEmployee): employees.department and
  // employees.employee_code are NOT NULL — the plain INSERT this used to be
  // could never satisfy them once MySQL was on; REPLACE keeps id/code unique.
  await executeMysqlQuery(
    `REPLACE INTO employees (
      id, employee_code, name, designation, department, phone, email,
      aadhar_number, pan_number, date_of_joining, base_salary, salary_type,
      status, license_number, bank_details, upi_address, name_on_account,
      default_in_time, default_out_time, opening_balance, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      emp.id,
      emp.id,
      emp.name,
      emp.role,
      emp.role === 'driver' ? 'Logistics' : 'Operations',
      emp.phone,
      emp.email || null,
      emp.aadhaarNo || null,
      emp.panNo || null,
      emp.joiningDate || '2026-01-01',
      emp.salaryBase || 0,
      emp.salaryType || 'monthly',
      emp.status || 'active',
      emp.licenseNo || null,
      JSON.stringify({ accountNumber: emp.bankAccountNo || '', ifscCode: emp.bankIFSC || '' }),
      emp.upiAddress || null,
      emp.nameOnAccount || null,
      emp.defaultInTime || null,
      emp.defaultOutTime || null,
      emp.openingBalance || 0,
      emp.createdAt || new Date().toISOString(),
    ]
  );
  return emp;
}

export async function updateEmployeeDirect(id: string, updates: any): Promise<Employee | null> {
  const emp = serverDb.updateEmployee(id, updates);
  if (!emp || !isMysqlConfigured()) return emp;

  await executeMysqlQuery(
    `UPDATE employees SET
      name = COALESCE(?, name),
      designation = COALESCE(?, designation),
      phone = COALESCE(?, phone),
      email = COALESCE(?, email),
      aadhar_number = COALESCE(?, aadhar_number),
      pan_number = COALESCE(?, pan_number),
      date_of_joining = COALESCE(?, date_of_joining),
      status = COALESCE(?, status),
      base_salary = COALESCE(?, base_salary),
      salary_type = COALESCE(?, salary_type),
      license_number = COALESCE(?, license_number),
      bank_details = COALESCE(?, bank_details),
      upi_address = COALESCE(?, upi_address),
      name_on_account = COALESCE(?, name_on_account),
      default_in_time = COALESCE(?, default_in_time),
      default_out_time = COALESCE(?, default_out_time),
      opening_balance = COALESCE(?, opening_balance)
    WHERE id = ?`,
    [
      updates.name || null,
      updates.role || null,
      updates.phone || null,
      updates.email || null,
      updates.aadhaarNo || null,
      updates.panNo || null,
      updates.joiningDate || null,
      updates.status || null,
      updates.salaryBase !== undefined ? updates.salaryBase : null,
      updates.salaryType || null,
      updates.licenseNo || null,
      updates.bankAccountNo !== undefined || updates.bankIFSC !== undefined
        ? JSON.stringify({ accountNumber: updates.bankAccountNo || '', ifscCode: updates.bankIFSC || '' })
        : null,
      updates.upiAddress || null,
      updates.nameOnAccount || null,
      updates.defaultInTime || null,
      updates.defaultOutTime || null,
      updates.openingBalance !== undefined ? updates.openingBalance : null,
      id,
    ]
  );
  return emp;
}

export async function deleteEmployeeDirect(id: string): Promise<boolean> {
  const deleted = serverDb.deleteEmployee(id);
  if (!isMysqlConfigured()) return deleted;
  await executeMysqlQuery('DELETE FROM employees WHERE id = ?', [id]);
  return true;
}

// Self-heal: an OLD live attendance table still carries `employee_name`
// (NOT NULL, no default) — the current write paths don't send it, so every
// insert fails. Checked PROACTIVELY (once) at the first attendance write:
// the stale column is dropped; if the drop is blocked, it is made nullable
// as a fallback so inserts always succeed.
let attendanceSchemaChecked = false;
async function ensureAttendanceSchemaHealthy(): Promise<void> {
  if (attendanceSchemaChecked) return;
  attendanceSchemaChecked = true;
  try {
    const cols = await executeMysqlQuery('SHOW COLUMNS FROM attendance');
    const names = (cols || []).map((c: any) => c.Field || c.field || c.name);
    if (names.includes('employee_name')) {
      try {
        await executeMysqlQuery('ALTER TABLE attendance DROP COLUMN employee_name');
        console.log('[MySQL Heal] Dropped stale attendance.employee_name column (JOIN-based display now).');
      } catch (dropErr: any) {
        console.warn('[MySQL Heal] DROP failed, making employee_name nullable instead:', dropErr.message);
        await executeMysqlQuery(
          "ALTER TABLE attendance MODIFY COLUMN employee_name VARCHAR(255) NULL DEFAULT NULL"
        );
        console.log('[MySQL Heal] attendance.employee_name is now nullable — writes succeed.');
      }
    }
  } catch (err: any) {
    console.warn('[MySQL Heal] attendance schema check skipped:', err.message);
  }
}

function isStaleNameColumnError(err: any): boolean {
  return String(err?.message || '').includes("employee_name") &&
    String(err?.message || '').includes("doesn't have a default value");
}

export async function updateAttendanceDirect(attData: any): Promise<EmployeeAttendance> {
  const att = serverDb.recordAttendance(attData);
  if (!isMysqlConfigured()) return att;

  // Proactive schema heal BEFORE the first write of this server process
  await ensureAttendanceSchemaHealthy();

  try {
    await persistAttendanceRow(att);
  } catch (err: any) {
    if (isStaleNameColumnError(err)) {
      // Reactive safety net (e.g. the process started before the live check)
      attendanceSchemaChecked = false;
      await ensureAttendanceSchemaHealthy();
      await persistAttendanceRow(att);
    } else {
      throw err;
    }
  }
  return att;
}

/** MySQL upsert per (employee_id, date) — update existing, else idempotent insert. */
async function persistAttendanceRow(att: EmployeeAttendance): Promise<void> {
  // Correct TABLE (`attendance` — the old code wrote `employee_attendance`,
  // which does not exist, so every attendance POST failed with MySQL on) and
  // CORRECT columns (`in_time/out_time/work_hours` per the schema). UPSERT per
  // (employee_id, date): update the existing row when there is one.
  const existing = await executeMysqlOne(
    'SELECT id FROM attendance WHERE employee_id = ? AND date = ?',
    [att.employeeId, att.date]
  );

  if (existing) {
    await executeMysqlQuery(
      `UPDATE attendance SET
        status = ?, in_time = ?, out_time = ?, work_hours = ?, overtime_hours = ?,
        notes = ?, updated_at = ?
      WHERE id = ?`,
      [
        att.status,
        att.checkInTime || null,
        att.checkOutTime || null,
        att.totalHoursWorked || 0,
        0,
        att.notes || null,
        new Date().toISOString(),
        existing.id,
      ]
    );
  } else {
    // Idempotent insert: the fire-and-forget liveSyncAttendance runs the same
    // row in parallel (same minted id) — ON DUPLICATE KEY makes whichever
    // lands second merge (not collide on attendance.PRIMARY)
    await executeMysqlQuery(
      `INSERT INTO attendance (
        id, employee_id, date, status, in_time, out_time,
        work_hours, overtime_hours, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        status=VALUES(status),
        in_time=VALUES(in_time), out_time=VALUES(out_time),
        work_hours=VALUES(work_hours), overtime_hours=VALUES(overtime_hours),
        notes=VALUES(notes), updated_at=VALUES(updated_at)`,
      [
        att.id,
        att.employeeId,
        att.date,
        att.status,
        att.checkInTime || null,
        att.checkOutTime || null,
        att.totalHoursWorked || 0,
        0,
        att.notes || null,
        att.createdAt || new Date().toISOString(),
        new Date().toISOString(),
      ]
    );
  }
}

export async function createLeaveDirect(leaveData: any): Promise<EmployeeLeave> {
  const leave = serverDb.createLeave(leaveData);
  if (!isMysqlConfigured()) return leave;

  await executeMysqlQuery(
    `INSERT INTO employee_leaves (
      id, employee_id, employee_name, leave_type, from_date, to_date,
      total_days, reason, status, approved_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      status=VALUES(status)`,
    [
      leave.id,
      leave.employeeId,
      leave.employeeName,
      leave.leaveType,
      leave.startDate,
      leave.endDate,
      leave.totalDays || 1,
      leave.reason,
      leave.status || 'pending',
      null,
      leave.createdAt || new Date().toISOString(),
    ]
  );
  return leave;
}

export async function createEmployeePaymentDirect(payData: any): Promise<EmployeePayment> {
  // Mode of payment is an explicit employer choice; the account type only
  // supplies a fallback when none arrives. The account balance is
  // reconciled inside serverDb.
  const ALLOWED_MODES = ['bank_transfer', 'cash', 'upi', 'cheque'];
  const account = payData.accountId ? serverDb.getAccountById(String(payData.accountId)) : undefined;
  let mode = String(payData.paymentMode || '');
  if (!ALLOWED_MODES.includes(mode)) {
    mode = account ? (account.type === 'cash' ? 'cash' : 'bank_transfer') : 'bank_transfer';
  }
  const payment = serverDb.createEmployeePayment({
    ...payData,
    paymentMode: mode,
  });
  if (!isMysqlConfigured()) return payment;

  // Idempotent insert: liveSyncEmployeePayment writes the same minted id in
  // parallel — ON DUPLICATE KEY merges instead of colliding on the PK.
  // employee_name is never written (JOIN-based display, FK-only rows)
  await executeMysqlQuery(
    `INSERT INTO employee_payments (
      id, employee_id, date, type, amount, payment_mode,
      account_id, reference_no, notes, month_year, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      amount=VALUES(amount), payment_mode=VALUES(payment_mode),
      account_id=VALUES(account_id), reference_no=VALUES(reference_no),
      notes=VALUES(notes), month_year=VALUES(month_year)`,
    [
      payment.id,
      payment.employeeId,
      payment.date,
      payment.type,
      payment.amount,
      payment.paymentMode,
      payment.accountId || null,
      payment.referenceNo || null,
      payment.notes || null,
      payment.monthYear || null,
      payment.createdAt || new Date().toISOString(),
    ]
  );
  return payment;
}

/** Removes a payroll payment row + the account ledger/balance reconciles in serverDb. */
export async function deleteEmployeePaymentDirect(id: string): Promise<boolean> {
  const deleted = serverDb.deleteEmployeePayment(id);
  if (!isMysqlConfigured()) return deleted;
  await executeMysqlQuery('DELETE FROM employee_payments WHERE id = ?', [id]);
  return true;
}

/** Edits a recorded payroll payment; serverDb re-reconciles both ledgers. */
export async function updateEmployeePaymentDirect(id: string, updates: any): Promise<EmployeePayment> {
  const payment = serverDb.updateEmployeePayment(id, updates);
  if (!isMysqlConfigured()) return payment;

  await executeMysqlQuery(
    `UPDATE employee_payments SET
      employee_id = ?,
      date = ?,
      type = ?,
      amount = ?,
      payment_mode = ?,
      account_id = COALESCE(?, account_id),
      reference_no = ?,
      notes = ?,
      month_year = ?
    WHERE id = ?`,
    [
      payment.employeeId,
      payment.date,
      payment.type,
      payment.amount,
      payment.paymentMode,
      payment.accountId || null,
      payment.referenceNo || null,
      payment.notes || null,
      payment.monthYear || null,
      payment.id,
    ]
  );
  return payment;
}

// ==========================================
// EMPLOYEE LEDGER (virtual accounts)
// ==========================================

export async function fetchEmployeeLedgerTransactionsDirect(filters?: {
  /** one employee's rows (the ledger screen fetches per employee) */
  employeeId?: string;
}): Promise<EmployeeLedgerTransaction[]> {
  if (!isMysqlConfigured()) {
    let rows = serverDb.getEmployeeLedgerTransactions();
    if (filters?.employeeId) rows = rows.filter((t) => t.employeeId === filters.employeeId);
    return rows;
  }
  const rows = await executeMysqlQuery(
    `SELECT t.*, e.name AS employee_name, a.name AS account_name
     FROM employee_ledger_transactions t
     LEFT JOIN employees e ON e.id = t.employee_id
     LEFT JOIN cash_bank_accounts a ON a.id = t.account_id
     ${filters?.employeeId ? 'WHERE t.employee_id = ?' : ''}
     ORDER BY t.created_at DESC, t.date DESC`,
    filters?.employeeId ? [filters.employeeId] : []
  );
  return rows.map((t: any) => ({
    id: t.id,
    employeeId: t.employee_id,
    employeeName: t.employee_name,
    date: t.date,
    type: t.type,
    amount: parseNum(t.amount),
    reason: t.reason || '',
    accountId: t.account_id || undefined,
    accountName: t.account_name || undefined,
    direction: t.direction || undefined,
    intent: t.intent || undefined,
    source: t.source || 'manual',
    notes: t.notes || undefined,
    createdAt: t.created_at,
  }));
}

/**
 * Records a manual employer transaction (add / reduce / direct). serverDb
 * validates + reconciles the linked Cash/Bank account; a lock here also
 * stops the employer from hand-posting engine-owned wage accruals.
 */
export async function createEmployeeLedgerTransactionDirect(data: any): Promise<EmployeeLedgerTransaction> {
  if (data.type === 'wage_accrual') {
    throw new Error('Wage accruals are generated automatically; record a salary settlement as a Reduce balance instead.');
  }
  const txn = serverDb.createEmployeeLedgerTransaction(data);
  if (!isMysqlConfigured()) return txn;

  // Idempotent insert — liveSyncEmployeeLedgerTransaction writes the same id
  // in parallel; ON DUPLICATE KEY merges instead of colliding on the PK.
  // Names never persist (FK-only rows, Golden Rule §2).
  await executeMysqlQuery(
    `INSERT INTO employee_ledger_transactions (
      id, employee_id, date, type, amount, reason, account_id, direction, intent, source, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      date=VALUES(date), type=VALUES(type), amount=VALUES(amount), reason=VALUES(reason),
      account_id=VALUES(account_id), direction=VALUES(direction), intent=VALUES(intent),
      source=VALUES(source), notes=VALUES(notes)`,
    [
      txn.id,
      txn.employeeId,
      txn.date,
      txn.type,
      txn.amount,
      txn.reason,
      txn.accountId || null,
      (txn as any).direction || null,
      (txn as any).intent || null,
      txn.source || 'manual',
      txn.notes || null,
      txn.createdAt || new Date().toISOString(),
    ]
  );
  return txn;
}

export async function updateEmployeeLedgerTransactionDirect(id: string, updates: any): Promise<EmployeeLedgerTransaction> {
  const txn = serverDb.updateEmployeeLedgerTransaction(id, updates);
  if (!isMysqlConfigured()) return txn;

  await executeMysqlQuery(
    `UPDATE employee_ledger_transactions SET
      date = ?,
      amount = ?,
      reason = ?,
      account_id = ?,
      direction = ?,
      notes = ?
    WHERE id = ?`,
    [
      txn.date,
      txn.amount,
      txn.reason,
      txn.accountId || null,
      txn.direction || null,
      txn.notes || null,
      txn.id,
    ]
  );
  return txn;
}

export async function deleteEmployeeLedgerTransactionDirect(id: string): Promise<boolean> {
  const deleted = serverDb.deleteEmployeeLedgerTransaction(id);
  if (!isMysqlConfigured()) return deleted;
  await executeMysqlQuery('DELETE FROM employee_ledger_transactions WHERE id = ?', [id]);
  return true;
}
