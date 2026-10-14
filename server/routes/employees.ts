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
employeesRouter.delete('/staff/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const success = await deleteEmployeeDirect(req.params.id);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- ATTENDANCE ---
employeesRouter.get('/attendance', async (req, res) => {
  try {
    const data = await fetchAttendanceDirect();
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
