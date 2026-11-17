import { Router, Request, Response } from 'express';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import {
  fetchInventoryUnitsDirect,
  fetchInventoryUnitEventsDirect,
  createInventoryUnitDirect,
  createInventoryUnitsBulkDirect,
  updateInventoryUnitDirect,
  deployInventoryUnitDirect,
  returnInventoryUnitDirect,
  maintainInventoryUnitDirect,
  restoreInventoryUnitDirect,
  scrapInventoryUnitDirect,
  unscrapInventoryUnitDirect,
  deleteInventoryUnitDirect,
  markUnitsSoldDirect,
} from '../mysql/operationsService';

export const inventoryUnitsRouter = Router();

inventoryUnitsRouter.use(authenticateToken);

const PERM = 'manage_inventory';

// Business-rule errors (validation / lifecycle guards) are 400; everything
// else is a 500.
const bizStatus = (msg: string) =>
  /required|not found|already|cannot|does not|no lifecycle|only in-stock|not deployed|not in maintenance|is not a trackable|no longer exists|pick it from/i.test(msg || '') ? 400 : 500;

// GET /api/inventory-units?itemId=... — the unit register (optionally scoped
// to one asset item's register)
inventoryUnitsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const itemId = (req.query.itemId as string) || undefined;
    const units = await fetchInventoryUnitsDirect(itemId);
    res.json({ success: true, count: units.length, data: units });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/inventory-units/events[?unitId=...] — the lifecycle log
inventoryUnitsRouter.get('/events', async (req: Request, res: Response) => {
  try {
    const unitId = (req.query.unitId as string) || undefined;
    const events = await fetchInventoryUnitEventsDirect(unitId);
    res.json({ success: true, count: events.length, data: events });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/inventory-units — register ONE unit (manual entry / GRN capture)
inventoryUnitsRouter.post('/', requirePermission(PERM), async (req: Request, res: Response) => {
  try {
    if (!req.body.itemId || !String(req.body.serialNumber || '').trim()) {
      return res.status(400).json({ success: false, error: 'itemId and serialNumber are required' });
    }
    const unit = await createInventoryUnitDirect(req.body);
    res.status(201).json({ success: true, message: 'Unit registered', data: unit });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});

// POST /api/inventory-units/bulk — register N units at once (GRN / backfill)
inventoryUnitsRouter.post('/bulk', requirePermission(PERM), async (req: Request, res: Response) => {
  try {
    if (!Array.isArray(req.body.units) || req.body.units.length === 0) {
      return res.status(400).json({ success: false, error: 'units[] is required — at least one entry' });
    }
    const units = await createInventoryUnitsBulkDirect(req.body.units);
    res.status(201).json({ success: true, message: `${units.length} units registered`, data: units });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});

// PUT /api/inventory-units/:id — edit procurement/condition facts
// (lifecycle fields are rejected by the server — use the moves below)
inventoryUnitsRouter.put('/:id', requirePermission(PERM), async (req: Request, res: Response) => {
  try {
    const unit = await updateInventoryUnitDirect(req.params.id, req.body);
    res.json({ success: true, message: 'Unit updated', data: unit });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});

// POST /api/inventory-units/:id/deploy — fit onto a fleet vehicle
inventoryUnitsRouter.post('/:id/deploy', requirePermission(PERM), async (req: Request, res: Response) => {
  try {
    const unit = await deployInventoryUnitDirect(req.params.id, req.body);
    res.json({ success: true, message: 'Unit deployed', data: unit });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});

// POST /api/inventory-units/:id/return — remove from vehicle back to stock
inventoryUnitsRouter.post('/:id/return', requirePermission(PERM), async (req: Request, res: Response) => {
  try {
    const unit = await returnInventoryUnitDirect(req.params.id, req.body);
    res.json({ success: true, message: 'Unit returned to stock', data: unit });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});

// POST /api/inventory-units/:id/maintenance — send for upkeep (retread etc.)
inventoryUnitsRouter.post('/:id/maintenance', requirePermission(PERM), async (req: Request, res: Response) => {
  try {
    const unit = await maintainInventoryUnitDirect(req.params.id, req.body);
    res.json({ success: true, message: 'Unit sent for maintenance', data: unit });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});

// POST /api/inventory-units/:id/restore — bring a unit back from maintenance
inventoryUnitsRouter.post('/:id/restore', requirePermission(PERM), async (req: Request, res: Response) => {
  try {
    const unit = await restoreInventoryUnitDirect(req.params.id, req.body);
    res.json({ success: true, message: 'Unit restored', data: unit });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});

// POST /api/inventory-units/:id/scrap — retire the unit
inventoryUnitsRouter.post('/:id/scrap', requirePermission(PERM), async (req: Request, res: Response) => {
  try {
    const unit = await scrapInventoryUnitDirect(req.params.id, req.body);
    res.json({ success: true, message: 'Unit scrapped', data: unit });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});

// POST /api/inventory-units/:id/unscrap — bring a scrapped unit back to
// spare stock (2026-11-17; a SOLD unit has no way back)
inventoryUnitsRouter.post('/:id/unscrap', requirePermission(PERM), async (req: Request, res: Response) => {
  try {
    const unit = await unscrapInventoryUnitDirect(req.params.id, req.body);
    res.json({ success: true, message: 'Unit unscrapped', data: unit });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});

// DELETE /api/inventory-units/:id — remove an in-stock unit with no history
inventoryUnitsRouter.delete('/:id', requirePermission(PERM), async (req: Request, res: Response) => {
  try {
    await deleteInventoryUnitDirect(req.params.id);
    res.json({ success: true, message: 'Unit removed' });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});

// POST /api/inventory-units/link-sale — sale-ladder hook: mark units sold
// against one sale (called by the sales flow when the dispatch/invoice lands)
inventoryUnitsRouter.post('/link-sale', requirePermission('manage_sales'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { unitIds, saleId, notes } = req.body;
    if (!Array.isArray(unitIds) || unitIds.length === 0 || !saleId) {
      return res.status(400).json({ success: false, error: 'unitIds[] and saleId are required' });
    }
    const units = await markUnitsSoldDirect(unitIds, saleId, notes);
    res.json({ success: true, message: `${units.length} unit(s) marked sold`, data: units });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});
