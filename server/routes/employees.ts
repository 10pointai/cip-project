import { Router, Request, Response } from 'express';
import { serverDb } from '../db';
import { authenticateToken, requireEitherPermission, requirePermission } from '../middleware/auth';
import {
  fetchEmployeesDirect,
  createEmployeeDirect,
  updateEmployeeDirect,
  deleteEmployeeDirect,
  fetchAttendanceDirect,
  updateAttendanceDirect,
  fetchLeavesDirect,
  createLeaveDirect,
  fetchEmployeePaymentsDirect,
  createEmployeePaymentDirect,
  deleteEmployeePaymentDirect,
  updateEmployeePaymentDirect,
  fetchEmployeeLedgerTransactionsDirect,
  createEmployeeLedgerTransactionDirect,
  updateEmployeeLedgerTransactionDirect,
  deleteEmployeeLedgerTransactionDirect,
} from '../mysql/personnelService';

export const employeesRouter = Router();

employeesRouter.use(authenticateToken);

// --- EMPLOYEES ---
employeesRouter.get('/staff', async (req, res) => {
  try {
    const data = await fetchEmployeesDirect();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
employeesRouter.post('/staff', requirePermission('manage_employees'), async (req, res) => {
  try {
    const data = await createEmployeeDirect(req.body);
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
employeesRouter.put('/staff/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const data = await updateEmployeeDirect(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Driver ↔ vehicle assignment from the employee's profile — the FK lives on
// the vehicle (currentDriverId), so this is a vehicle-side write surfaced on
// the driver; either permission holder may manage it. Body:
// { vehicleId } claim for the driver (reassigns from a previous holder) ·
// { releaseVehicleId } free one vehicle the driver holds.
employeesRouter.put('/staff/:id/assigned-vehicle', requireEitherPermission('manage_employees', 'manage_fleet'), (req, res) => {
  try {
    const opts = {
      vehicleId: typeof req.body?.vehicleId === 'string' ? req.body.vehicleId : undefined,
      releaseVehicleId: typeof req.body?.releaseVehicleId === 'string' ? req.body.releaseVehicleId : undefined,
    };
    if (!opts.vehicleId && !opts.releaseVehicleId) {
      return res.status(400).json({ success: false, error: 'Provide vehicleId or releaseVehicleId.' });
    }
    const touched = serverDb.assignEmployeeVehicle(req.params.id, opts);
    return res.json({ success: true, data: touched });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});
employeesRouter.delete('/staff/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const success = await deleteEmployeeDirect(req.params.id);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- ATTENDANCE ---
// Date-scoped reads: the daily sheet requests only its selected date, the
// monthly register one employee's month — never the whole table at once.
employeesRouter.get('/attendance', async (req, res) => {
  try {
    const data = await fetchAttendanceDirect({
      date: typeof req.query.date === 'string' ? req.query.date : undefined,
      employeeId: typeof req.query.employeeId === 'string' ? req.query.employeeId : undefined,
      from: typeof req.query.from === 'string' ? req.query.from : undefined,
      to: typeof req.query.to === 'string' ? req.query.to : undefined,
    });
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
employeesRouter.post('/attendance', requirePermission('manage_employees'), async (req, res) => {
  try {
    const data = await updateAttendanceDirect(req.body);
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- LEAVES ---
employeesRouter.get('/leaves', async (req, res) => {
  try {
    const data = await fetchLeavesDirect();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
employeesRouter.post('/leaves', requirePermission('manage_employees'), async (req, res) => {
  try {
    const data = await createLeaveDirect(req.body);
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- PAYMENTS ---
employeesRouter.get('/payments', async (req, res) => {
  try {
    const data = await fetchEmployeePaymentsDirect();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
employeesRouter.post('/payments', requireEitherPermission('process_payroll', 'manage_employees'), async (req, res) => {
  try {
    const data = await createEmployeePaymentDirect(req.body);
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
// Deleting a recorded payout reverses it out of the linked account's ledger
employeesRouter.delete('/payments/:id', requireEitherPermission('process_payroll', 'manage_employees'), async (req, res) => {
  try {
    const success = await deleteEmployeePaymentDirect(req.params.id);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
// Editing a recorded payout (amount/account moves re-reconcile both ledgers)
employeesRouter.put('/payments/:id', requireEitherPermission('process_payroll', 'manage_employees'), async (req, res) => {
  try {
    const data = await updateEmployeePaymentDirect(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- EMPLOYEE LEDGER (virtual account per employee) ---
// Every read first runs the wage-accrual engine so the running balance and
// the rows always reflect attendance up to now (idempotent, deterministic ids).
employeesRouter.get('/ledger', async (req, res) => {
  try {
    await serverDb.ensureWageAccruals();
    const data = await fetchEmployeeLedgerTransactionsDirect({
      employeeId: typeof req.query.employeeId === 'string' ? req.query.employeeId : undefined,
    });
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
employeesRouter.post('/ledger', requireEitherPermission('process_payroll', 'manage_employees'), async (req, res) => {
  try {
    const data = await createEmployeeLedgerTransactionDirect(req.body);
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});
employeesRouter.put('/ledger/:id', requireEitherPermission('process_payroll', 'manage_employees'), async (req, res) => {
  try {
    const data = await updateEmployeeLedgerTransactionDirect(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});
employeesRouter.delete('/ledger/:id', requireEitherPermission('process_payroll', 'manage_employees'), async (req, res) => {
  try {
    const success = await deleteEmployeeLedgerTransactionDirect(req.params.id);
    res.json({ success });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});
