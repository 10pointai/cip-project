import { Router, Request, Response } from 'express';
import { serverDb } from '../db';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { writeProductionBatchACID } from '../mysql/azureTransactions';
import {
  fetchBatchesDirect,
  fetchBatchMixesDirect,
  fetchBatchMixByIdDirect,
  createBatchMixDirect,
  updateBatchMixDirect,
  deleteBatchMixDirect,
} from '../mysql/operationsService';

export const productionRouter = Router();

productionRouter.use(authenticateToken);

// GET /api/batches
productionRouter.get('/', async (req: Request, res: Response) => {
  try {
    const batches = await fetchBatchesDirect();
    res.json({ success: true, count: batches.length, data: batches });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/batches — recipe-driven: one POST posts ONE recorded run of a
// batch mix. The run is LOCKED to the recipe (2026-11-12, client directive):
// the caller supplies the mix + produced quantity (+ date/supervisor/notes);
// the server resolves every ingredient quantity and posts the FIFO ledger
// movements (inputs out at blended cost, output lot valued at exactly what
// the run consumed).
productionRouter.post('/', requirePermission('manage_production'), async (req: Request, res: Response) => {
  try {
    const { batchMixId, targetQuantity } = req.body;
    if (!batchMixId) {
      return res.status(400).json({ success: false, error: 'batchMixId is required — pick the recipe this run is producing.' });
    }
    const qty = Number(targetQuantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ success: false, error: 'targetQuantity (produced quantity) is required and must be positive' });
    }
    const result = await writeProductionBatchACID(req.body);
    res.status(201).json({
      success: true,
      message: result.message,
      executedOnAzure: result.executedOnAzure,
      data: result.data,
    });
  } catch (error: any) {
    // Recipe business-rule errors (mix not found / inactive / non-positive
    // quantities / failed consumption) are 400; everything else is a 500.
    const bizMsg = /not found|inactive|positive|cannot consume|consume|no longer exists|check the mix/i.test(error.message || '');
    res.status(bizMsg ? 400 : 500).json({ success: false, error: error.message });
  }
});

// DELETE /api/batches/:id
productionRouter.delete('/:id', requirePermission('manage_production'), (req: Request, res: Response) => {
  try {
    const success = serverDb.deleteProductionBatch(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Batch not found' });
    }
    res.json({ success: true, message: 'Production batch deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// BATCH MIXES (RECIPES) — mounted at /api/batch-mixes
// A mix is the recipe master: an output item + ingredient rows, each sized by
// absolute quantity (with a batch yield) OR a percentage of the produced
// output. Production runs reference a mix and are locked to its math.
// ============================================================================
export const batchMixesRouter = Router();

batchMixesRouter.use(authenticateToken);

// GET /api/batch-mixes
batchMixesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const mixes = await fetchBatchMixesDirect();
    res.json({ success: true, count: mixes.length, data: mixes });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/batch-mixes/next-number — server-minted mix number for the form
// prefill (registered BEFORE /:id so the path segment is not swallowed)
batchMixesRouter.get('/next-number', async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: { nextMixNumber: serverDb.peekNextBatchMixNumber() } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/batch-mixes/:id
batchMixesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const mix = await fetchBatchMixByIdDirect(req.params.id);
    if (!mix) {
      return res.status(404).json({ success: false, error: 'Batch mix not found' });
    }
    res.json({ success: true, data: mix });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/batch-mixes
batchMixesRouter.post('/', requirePermission('manage_production'), async (req: Request, res: Response) => {
  try {
    const mix = createBatchMixDirect(req.body);
    res.status(201).json({ success: true, message: 'Batch mix created successfully', data: mix });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// PUT /api/batch-mixes/:id
batchMixesRouter.put('/:id', requirePermission('manage_production'), async (req: Request, res: Response) => {
  try {
    const mix = updateBatchMixDirect(req.params.id, req.body);
    if (!mix) {
      return res.status(404).json({ success: false, error: 'Batch mix not found' });
    }
    res.json({ success: true, message: 'Batch mix updated successfully', data: mix });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// DELETE /api/batch-mixes/:id — refused while recorded runs reference the mix
batchMixesRouter.delete('/:id', requirePermission('manage_production'), async (req: Request, res: Response) => {
  try {
    const success = deleteBatchMixDirect(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Batch mix not found' });
    }
    res.json({ success: true, message: 'Batch mix deleted' });
  } catch (error: any) {
    const bizMsg = /cannot be deleted|used by/i.test(error.message || '');
    res.status(bizMsg ? 400 : 500).json({ success: false, error: error.message });
  }
});
