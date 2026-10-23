import { Router, Request, Response } from 'express';
import { serverDb } from '../db';
import { authenticateToken, requireEitherPermission, requirePermission } from '../middleware/auth';
import {
  fetchVehiclesDirect,
  createVehicleDirect,
  fetchDriversDirect,
  createDriverDirect,
  fetchTripSlipsDirect,
  createTripSlipDirect,
  fetchTyresDirect,
  createTyreDirect,
} from '../mysql/operationsService';

export const logisticsRouter = Router();

logisticsRouter.use(authenticateToken);

// --- VEHICLES ---
logisticsRouter.get('/vehicles', async (req, res) => {
  try {
    const data = await fetchVehiclesDirect();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
logisticsRouter.post('/vehicles', requirePermission('manage_fleet'), async (req, res) => {
  try {
    const data = await createVehicleDirect(req.body);
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
logisticsRouter.put('/vehicles/:id', requirePermission('manage_fleet'), (req, res) => res.json({ success: true, data: serverDb.updateVehicle(req.params.id, req.body) }));
logisticsRouter.delete('/vehicles/:id', requirePermission('manage_fleet'), (req, res) => res.json({ success: serverDb.deleteVehicle(req.params.id) }));

// --- DRIVERS ---
logisticsRouter.get('/drivers', async (req, res) => {
  try {
    const data = await fetchDriversDirect();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
logisticsRouter.post('/drivers', requirePermission('manage_fleet'), async (req, res) => {
  try {
    const data = await createDriverDirect(req.body);
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
logisticsRouter.put('/drivers/:id', requirePermission('manage_fleet'), (req, res) => res.json({ success: true, data: serverDb.updateDriver(req.params.id, req.body) }));
logisticsRouter.delete('/drivers/:id', requirePermission('manage_fleet'), (req, res) => res.json({ success: serverDb.deleteDriver(req.params.id) }));

// --- TRIP SLIPS ---
logisticsRouter.get('/trip-slips', async (req, res) => {
  try {
    const data = await fetchTripSlipsDirect();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
logisticsRouter.post('/trip-slips', requireEitherPermission('dispatch_trips', 'manage_fleet'), async (req, res) => {
  try {
    const data = await createTripSlipDirect(req.body);
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
logisticsRouter.put('/trip-slips/:id', requireEitherPermission('dispatch_trips', 'manage_fleet'), (req, res) => res.json({ success: true, data: serverDb.updateTripSlip(req.params.id, req.body) }));
logisticsRouter.delete('/trip-slips/:id', requireEitherPermission('dispatch_trips', 'manage_fleet'), (req, res) => res.json({ success: serverDb.deleteTripSlip(req.params.id) }));

// --- TYRES (Tyre Management is its own feature — manage_tyres) ---
logisticsRouter.get('/tyres', async (req, res) => {
  try {
    const data = await fetchTyresDirect();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
logisticsRouter.post('/tyres', requirePermission('manage_tyres'), async (req, res) => {
  try {
    const data = await createTyreDirect(req.body);
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
logisticsRouter.put('/tyres/:id', requirePermission('manage_tyres'), (req, res) => res.json({ success: true, data: serverDb.updateTyre(req.params.id, req.body) }));
logisticsRouter.delete('/tyres/:id', requirePermission('manage_tyres'), (req, res) => res.json({ success: serverDb.deleteTyre(req.params.id) }));

// --- VEHICLE EMI ENTRIES (auto cron rows + operator-recorded payments) ---
// Every create/edit/delete rebalances the linked cash/bank account (the
// entry list is the balance truth — see recalculateAccountBalance stream 6).
// The READ is auth-only (like GET /logistics/vehicles) — the header EMI bell
// and dashboard widget consume it for any signed-in operator.
logisticsRouter.get('/emi-entries', async (req, res) => {
  try {
    const data = serverDb.getVehicleEmiEntries(req.query.vehicleId ? String(req.query.vehicleId) : undefined);
    res.json({ success: true, count: data.length, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
logisticsRouter.post('/emi-entries', requirePermission('manage_fleet'), async (req, res) => {
  try {
    const data = serverDb.addVehicleEmiEntry(req.body);
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
logisticsRouter.put('/emi-entries/:id', requirePermission('manage_fleet'), async (req, res) => {
  try {
    const data = serverDb.updateVehicleEmiEntry(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
logisticsRouter.delete('/emi-entries/:id', requirePermission('manage_fleet'), async (req, res) => {
  try {
    res.json({ success: serverDb.deleteVehicleEmiEntry(req.params.id) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
