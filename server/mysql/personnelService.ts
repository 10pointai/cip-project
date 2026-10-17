import { executeMysqlQuery, executeMysqlOne } from './queryClient';
import { isMysqlConfigured } from './connection';
import {
  Employee,
  EmployeeAttendance,
  EmployeeLeave,
  EmployeePayment,
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
    salaryBase: parseNum(emp.base_salary || emp.salaryBase),
    salaryType: (emp.salary_type || emp.salaryType || 'monthly') as any,
    status: (emp.status || 'active') as any,
    licenseNo: emp.license_number || emp.licenseNo || undefined,
    bankAccountNo: (emp.bank_details ? (parseJsonField<any>(emp.bank_details, {})?.accountNumber) : undefined) || emp.bankAccountNo || undefined,
    bankIFSC: (emp.bank_details ? (parseJsonField<any>(emp.bank_details, {})?.ifscCode) : undefined) || emp.bankIFSC || undefined,
    createdAt: emp.created_at || new Date().toISOString(),
  }));
}

export async function fetchAttendanceDirect(): Promise<EmployeeAttendance[]> {
  if (!isMysqlConfigured()) {
    return serverDb.getAttendance();
  }
  const rows = await executeMysqlQuery('SELECT * FROM attendance ORDER BY date DESC, created_at DESC');
  return rows.map((att: any) => ({
    id: att.id,
    employeeId: att.employee_id,
    employeeName: att.employee_name,
    date: att.date,
    status: att.status,
    inTime: att.in_time || undefined,
    outTime: att.out_time || undefined,
    workHours: parseNum(att.work_hours),
    overtimeHours: parseNum(att.overtime_hours),
    punchLogs: parseJsonField(att.punch_logs, []),
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
  const rows = await executeMysqlQuery('SELECT * FROM employee_payments ORDER BY date DESC, created_at DESC');
  return rows.map((ep: any) => ({
    id: ep.id,
    employeeId: ep.employee_id,
    employeeName: ep.employee_name,
    date: ep.date,
    type: ep.type,
    amount: parseNum(ep.amount),
    paymentMode: ep.payment_mode,
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

  await executeMysqlQuery(
    `INSERT INTO employees (
      id, name, designation, phone, email, aadhar_number, pan_number,
      date_of_joining, base_salary, salary_type, status, license_number,
      bank_details, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name=VALUES(name), designation=VALUES(designation), phone=VALUES(phone),
      email=VALUES(email), aadhar_number=VALUES(aadhar_number), pan_number=VALUES(pan_number),
      date_of_joining=VALUES(date_of_joining), base_salary=VALUES(base_salary),
      salary_type=VALUES(salary_type), status=VALUES(status), license_number=VALUES(license_number),
      bank_details=VALUES(bank_details)`,
    [
      emp.id,
      emp.name,
      emp.role,
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
      status = COALESCE(?, status),
      base_salary = COALESCE(?, base_salary),
      salary_type = COALESCE(?, salary_type)
    WHERE id = ?`,
    [
      updates.name || null,
      updates.role || null,
      updates.phone || null,
      updates.email || null,
      updates.status || null,
      updates.salaryBase !== undefined ? updates.salaryBase : null,
      updates.salaryType || null,
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

export async function updateAttendanceDirect(attData: any): Promise<EmployeeAttendance> {
  const att = serverDb.recordAttendance(attData);
  if (!isMysqlConfigured()) return att;

  await executeMysqlQuery(
    `INSERT INTO employee_attendance (
      id, employee_id, employee_name, date, status, check_in_time,
      check_out_time, working_hours, overtime_hours, punch_logs, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      status=VALUES(status), check_in_time=VALUES(check_in_time),
      check_out_time=VALUES(check_out_time), working_hours=VALUES(working_hours),
      overtime_hours=VALUES(overtime_hours), punch_logs=VALUES(punch_logs), notes=VALUES(notes)`,
    [
      att.id,
      att.employeeId,
      att.employeeName,
      att.date,
      att.status,
      att.checkInTime || null,
      att.checkOutTime || null,
      att.totalHoursWorked || 0,
      0,
      JSON.stringify(att.punchLogs || []),
      att.notes || null,
    ]
  );
  return att;
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
  const payment = serverDb.createEmployeePayment(payData);
  if (!isMysqlConfigured()) return payment;

  await executeMysqlQuery(
    `INSERT INTO employee_payments (
      id, employee_id, employee_name, date, type, amount, payment_mode,
      reference_no, notes, month_year, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      amount=VALUES(amount), payment_mode=VALUES(payment_mode), reference_no=VALUES(reference_no)`,
    [
      payment.id,
      payment.employeeId,
      payment.employeeName,
      payment.date,
      payment.type,
      payment.amount,
      payment.paymentMode,
      payment.referenceNo || null,
      payment.notes || null,
      payment.monthYear || null,
      new Date().toISOString(),
    ]
  );
  return payment;
}
