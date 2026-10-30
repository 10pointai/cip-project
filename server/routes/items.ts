import { Router, Request, Response } from 'express';
import { serverDb } from '../db';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import {
  resolveInventoryScope,
  filterItemsForScope,
  filterLocationsForScope,
  filterStockAdjustmentsForScope,
  assertLocationsInScope,
  assertScopeCanAdjustAggregate,
  ScopeError,
} from '../services/locationScope';
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

// GET /api/items — items are scoped to the caller's assigned inventory
// locations (user rule 2026-10-30): items living only in unassigned
// locations are hidden, and item aggregates recompute from allowed rows so
// all client-side stats inherit the scope.
itemsRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { categoryId, type, q } = req.query;
    const scope = resolveInventoryScope(req.user);
    const items = filterItemsForScope(
      await fetchItemsDirect({
        categoryId: typeof categoryId === 'string' ? categoryId : undefined,
        type: typeof type === 'string' ? type : undefined,
        query: typeof q === 'string' ? q : undefined,
      }),
      scope
    );
    res.json({ success: true, count: items.length, data: items });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/items/:id
itemsRouter.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const scope = resolveInventoryScope(req.user);
    const fetched = await fetchItemByIdDirect(req.params.id);
    const items = filterItemsForScope(fetched ? [fetched] : [], scope);
    if (!items[0]) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    res.json({ success: true, data: items[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/items
itemsRouter.post('/', requirePermission('manage_inventory'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const itemData = req.body;
    if (!itemData.name || !itemData.code || !itemData.unit) {
      return res.status(400).json({ success: false, error: 'Name, Code, and Unit are required' });
    }
    // WRITE SCOPE (user rule 2026-10-30): a restricted user may attach their
    // item ONLY to assigned locations.
    const scope = resolveInventoryScope(req.user);
    try {
      assertLocationsInScope(
        scope,
        (itemData.locations || []).map((l: any) => l.locationId),
        'Cannot create item'
      );
    } catch (err: any) {
      if (err instanceof ScopeError) return res.status(403).json({ success: false, error: err.message });
      throw err;
    }
    const newItem = await createItemDirect(itemData);
    res.status(201).json({ success: true, message: 'Item created successfully', data: newItem });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/items/:id
itemsRouter.put('/:id', requirePermission('manage_inventory'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const scope = resolveInventoryScope(req.user);
    // Editing an item whose mapping holds unassigned locations would silently
    // DELETE those rows (updateItemDirect re-syncs the mapping wholesale) —
    // forbid the whole edit for restricted users instead of letting scope
    // outside their remit be mutated.
    if (scope.restricted) {
      const existing = await fetchItemByIdDirect(req.params.id);
      const existingLocIds = (existing?.locations || []).map((l: any) => l.locationId);
      const outOfScope = existingLocIds.filter((id: string) => !id || !scope.allowed.has(id));
      if (outOfScope.length > 0) {
        return res.status(403).json({
          success: false,
          error:
            'Cannot edit this item: it carries stock in locations outside your assigned inventory locations. Contact a Super Administrator.',
        });
      }
    }
    try {
      assertLocationsInScope(
        scope,
        ((req.body.locations || []) as any[]).map((l) => l.locationId),
        'Cannot update item'
      );
    } catch (err: any) {
      if (err instanceof ScopeError) return res.status(403).json({ success: false, error: err.message });
      throw err;
    }
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
itemsRouter.post('/:id/adjust-stock', requirePermission('manage_inventory'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    // The ACID endpoint mutates the AGGREGATE without touching a mapping row —
    // for a location-restricted user that aggregate is a mix of allowed and
    // unallowed stock, so the flow is forbidden to them (they use the
    // per-location /api/stock-adjustments entry, which validates locationId).
    try {
      assertScopeCanAdjustAggregate(resolveInventoryScope(req.user), 'Cannot adjust stock');
    } catch (err: any) {
      if (err instanceof ScopeError) return res.status(403).json({ success: false, error: err.message });
      throw err;
    }
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
locationsRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // READ SCOPE (user rule 2026-10-30): restricted users never see location
    // names outside their assignment (also keeps name leakage out of
    // dropdowns in item forms / adjustment flows).
    const scope = resolveInventoryScope(req.user);
    const data = filterLocationsForScope(await fetchLocationsDirect(), scope);
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
// Restricted users may not edit/delete location masters outside their scope —
// an edit of an unassigned location is as much a breach as reading its data.
locationsRouter.put('/:id', requirePermission('manage_inventory'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const scope = resolveInventoryScope(req.user);
    if (scope.restricted && !scope.allowed.has(req.params.id)) {
      return res.status(403).json({ success: false, error: 'Cannot modify a location outside your assigned inventory locations.' });
    }
    res.json({ success: true, data: serverDb.updateLocation(req.params.id, req.body) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
locationsRouter.delete('/:id', requirePermission('manage_inventory'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const scope = resolveInventoryScope(req.user);
    if (scope.restricted && !scope.allowed.has(req.params.id)) {
      return res.status(403).json({ success: false, error: 'Cannot delete a location outside your assigned inventory locations.' });
    }
    res.json({ success: serverDb.deleteLocation(req.params.id) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export const stockAdjustmentsRouter = Router();
stockAdjustmentsRouter.use(authenticateToken);
stockAdjustmentsRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = filterStockAdjustmentsForScope(await fetchStockAdjustmentsDirect(), resolveInventoryScope(req.user));
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
stockAdjustmentsRouter.post('/', requirePermission('manage_inventory'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    // WRITE SCOPE (user rule 2026-10-30): per-location adjustments may only
    // target assigned locations.
    try {
      assertLocationsInScope(resolveInventoryScope(req.user), [req.body?.locationId], 'Cannot record stock adjustment');
    } catch (err: any) {
      if (err instanceof ScopeError) return res.status(403).json({ success: false, error: err.message });
      throw err;
    }
    const adj = serverDb.createStockAdjustment(req.body);
    // Include the freshly-stocked item so the client gets an authoritative snapshot
    const item = serverDb.getItemById(adj.itemId) || null;
    res.status(201).json({ success: true, data: adj, item });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
stockAdjustmentsRouter.delete('/:id', requirePermission('manage_inventory'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adj = serverDb.getStockAdjustments().find((a) => a.id === req.params.id);
    // WRITE SCOPE (user rule 2026-10-30): no deleting adjustments that revert
    // stock in an unassigned location.
    try {
      assertLocationsInScope(resolveInventoryScope(req.user), [adj?.locationId], 'Cannot delete stock adjustment');
    } catch (err: any) {
      if (err instanceof ScopeError) return res.status(403).json({ success: false, error: err.message });
      throw err;
    }
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
