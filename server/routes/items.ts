import { Router, Request, Response } from 'express';
import { serverDb } from '../db';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { writeItemStockAdjustmentACID } from '../mysql/azureTransactions';
import {
  fetchItemsDirect,
  fetchItemByIdDirect,
  createItemDirect,
  updateItemDirect,
  deleteItemDirect,
  fetchCategoriesDirect,
  fetchUnitsDirect,
  fetchLocationsDirect,
  fetchStockAdjustmentsDirect,
} from '../mysql/operationsService';

export const itemsRouter = Router();

itemsRouter.use(authenticateToken);

// GET /api/items
itemsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { categoryId, type, q } = req.query;
    const items = await fetchItemsDirect({
      categoryId: typeof categoryId === 'string' ? categoryId : undefined,
      type: typeof type === 'string' ? type : undefined,
      query: typeof q === 'string' ? q : undefined,
    });
    res.json({ success: true, count: items.length, data: items });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/items/:id
itemsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const item = await fetchItemByIdDirect(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    res.json({ success: true, data: item });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/items
itemsRouter.post('/', requirePermission('manage_inventory'), async (req: Request, res: Response) => {
  try {
    const itemData = req.body;
    if (!itemData.name || !itemData.code || !itemData.unit) {
      return res.status(400).json({ success: false, error: 'Name, Code, and Unit are required' });
    }
    const newItem = await createItemDirect(itemData);
    res.status(201).json({ success: true, message: 'Item created successfully', data: newItem });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/items/:id
itemsRouter.put('/:id', requirePermission('manage_inventory'), async (req: Request, res: Response) => {
  try {
    const updated = await updateItemDirect(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    res.json({ success: true, message: 'Item updated successfully', data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/items/:id
itemsRouter.delete('/:id', requirePermission('manage_inventory'), async (req: Request, res: Response) => {
  try {
    const success = await deleteItemDirect(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    res.json({ success: true, message: 'Item deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/items/:id/adjust-stock - ACID Stock Adjustment with Row Locking
itemsRouter.post('/:id/adjust-stock', requirePermission('manage_inventory'), async (req: Request, res: Response) => {
  try {
    const { delta, logType, referenceNumber, notes } = req.body;
    if (delta === undefined || !logType) {
      return res.status(400).json({ success: false, error: 'delta and logType are required' });
    }
    const result = await writeItemStockAdjustmentACID(req.params.id, Number(delta), logType, referenceNumber, notes);
    res.json({
      success: true,
      message: result.message,
      executedOnAzure: result.executedOnAzure,
      data: result.data,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- SUB-RESOURCES: CATEGORIES, UNITS, LOCATIONS ---
export const categoriesRouter = Router();
categoriesRouter.use(authenticateToken);
categoriesRouter.get('/', async (req, res) => {
  try {
    const data = await fetchCategoriesDirect();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
categoriesRouter.post('/', requirePermission('manage_inventory'), (req, res) => {
  try {
    res.status(201).json({ success: true, data: serverDb.createCategory(req.body) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
categoriesRouter.put('/:id', requirePermission('manage_inventory'), (req, res) => {
  try {
    res.json({ success: true, data: serverDb.updateCategory(req.params.id, req.body) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
categoriesRouter.delete('/:id', requirePermission('manage_inventory'), (req, res) => {
  try {
    res.json({ success: serverDb.deleteCategory(req.params.id) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export const unitsRouter = Router();
unitsRouter.use(authenticateToken);
unitsRouter.get('/', async (req, res) => {
  try {
    const data = await fetchUnitsDirect();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
unitsRouter.post('/', requirePermission('manage_inventory'), (req, res) => {
  try {
    res.status(201).json({ success: true, data: serverDb.createUnit(req.body) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
unitsRouter.put('/:id', requirePermission('manage_inventory'), (req, res) => {
  try {
    res.json({ success: true, data: serverDb.updateUnit(req.params.id, req.body) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
unitsRouter.delete('/:id', requirePermission('manage_inventory'), (req, res) => {
  try {
    res.json({ success: serverDb.deleteUnit(req.params.id) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export const locationsRouter = Router();
locationsRouter.use(authenticateToken);
locationsRouter.get('/', async (req, res) => {
  try {
    const data = await fetchLocationsDirect();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
locationsRouter.post('/', requirePermission('manage_inventory'), (req, res) => {
  try {
    res.status(201).json({ success: true, data: serverDb.createLocation(req.body) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
locationsRouter.put('/:id', requirePermission('manage_inventory'), (req, res) => {
  try {
    res.json({ success: true, data: serverDb.updateLocation(req.params.id, req.body) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
locationsRouter.delete('/:id', requirePermission('manage_inventory'), (req, res) => {
  try {
    res.json({ success: serverDb.deleteLocation(req.params.id) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export const stockAdjustmentsRouter = Router();
stockAdjustmentsRouter.use(authenticateToken);
stockAdjustmentsRouter.get('/', async (req, res) => {
  try {
    const data = await fetchStockAdjustmentsDirect();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
stockAdjustmentsRouter.post('/', requirePermission('manage_inventory'), async (req, res) => {
  try {
    const adj = serverDb.createStockAdjustment(req.body);
    // Include the freshly-stocked item so the client gets an authoritative snapshot
    const item = serverDb.getItemById(adj.itemId) || null;
    res.status(201).json({ success: true, data: adj, item });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
stockAdjustmentsRouter.delete('/:id', requirePermission('manage_inventory'), async (req, res) => {
  try {
    const adj = serverDb.getStockAdjustments().find((a) => a.id === req.params.id);
    const success = serverDb.deleteStockAdjustment(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Stock adjustment not found' });
    }
    // Return the reverted item so the client updates stock immediately
    const item = adj ? serverDb.getItemById(adj.itemId) || null : null;
    res.json({ success: true, message: `Stock adjustment deleted and stock reverted`, item });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
