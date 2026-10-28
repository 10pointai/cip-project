import { Router, Request, Response } from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth';
import {
  fetchSalesDirect,
  fetchSaleByIdDirect,
  createSaleDirect,
  updateSaleDirect,
  addSaleStageDirect,
  deleteSaleDirect,
  fetchNextRstDirect,
  fetchSaleInvoicesDirect,
  fetchSaleInvoiceByIdDirect,
  createSaleInvoiceDirect,
  deleteSaleInvoiceDirect,
} from '../mysql/operationsService';

export const salesRouter = Router();

salesRouter.use(authenticateToken);

// Stage-ladder business-rule errors (locked / invalid transition / cannot /
// missing settlement account for a "Settle Payment Now" save) are 400;
// everything else is a 500.
const bizStatus = (msg: string) =>
  /locked|cannot|cancelled|must be|must carry|payment flow|settlement account is required|disbursement|not found|different party|already part of|already in use|duplicate|select at least one/i.test(msg || '') ? 400 : 500;

// GET /api/sales
salesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const sales = await fetchSalesDirect();
    res.json({ success: true, count: sales.length, data: sales });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sales/next-rst — next RST serial (registered BEFORE /:id so the
// path segment is not swallowed by the id param)
salesRouter.get('/next-rst', async (req: Request, res: Response) => {
  try {
    const { nextRst } = await fetchNextRstDirect();
    res.json({ success: true, data: nextRst });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sales/:id
salesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const sale = await fetchSaleByIdDirect(req.params.id);
    if (!sale) {
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }
    res.json({ success: true, data: sale });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sales — create master + first stage
salesRouter.post('/', requirePermission('manage_sales'), async (req: Request, res: Response) => {
  try {
    const data = req.body;
    if (!data.partyId || !Array.isArray(data.items) || data.items.length === 0) {
      return res.status(400).json({ success: false, error: 'partyId and items are required' });
    }
    // A DIRECT invoice (2026-10-28, client wish) is allowed: a sale created
    // straight at the sales_invoice stage — no sales order behind it. What
    // stays impossible is ISSUING an invoice stage onto an EXISTING sale
    // (POST /:id/stages rejects it — those are consolidated via the Create
    // Invoice action instead).
    // Dispatch attachment: compulsory ONCE the sale reaches a money stage —
    // a quotation-stage creation ships no vehicle (the dispatch section is
    // hidden there; the vehicle attaches when it advances to a sales order).
    const firstStageType = data.stage?.stageType || 'sales_order';
    const isQuotationOnly = firstStageType === 'quotation';
    if (!isQuotationOnly && !data.vehicleId && !data.vehicleNo) {
      // Client directive: every dispatched sale carries a fleet vehicle
      // (vehicleId FK) or an OUTSOURCED one (typed vehicleNo)
      return res.status(400).json({ success: false, error: 'Attach a fleet vehicle or enter an outsourced vehicle number' });
    }
    if (data.stage?.updateInventory && !data.stage.stageNumber && !data.saleNumber) {
      return res.status(400).json({ success: false, error: 'stageNumber or saleNumber is required to update inventory' });
    }
    const sale = await createSaleDirect(data);
    res.status(201).json({ success: true, message: 'Sale created successfully', data: sale });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});

// PUT /api/sales/:id — master-level updates (items replacement included)
salesRouter.put('/:id', requirePermission('manage_sales'), async (req: Request, res: Response) => {
  try {
    const updated = await updateSaleDirect(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }
    res.json({ success: true, message: 'Sale updated successfully', data: updated });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});

// POST /api/sales/:id/stages — issue the next stage document per the sale ladder
salesRouter.post('/:id/stages', requirePermission('manage_sales'), async (req: Request, res: Response) => {
  try {
    const stageInput = req.body;
    if (!stageInput.stageType) {
      return res.status(400).json({ success: false, error: 'stageType is required' });
    }
    if (stageInput.stageType === 'sales_invoice') {
      // 2026-10-28: the invoice left the ladder — consolidate instead.
      return res.status(400).json({ success: false, error: 'A sale cannot issue a sales invoice directly — invoices are now consolidated from several sales orders via the Create Invoice action.' });
    }
    if (stageInput.updateInventory && !stageInput.stageNumber) {
      return res.status(400).json({ success: false, error: 'stageNumber is required to update inventory' });
    }
    const sale = await addSaleStageDirect(req.params.id, stageInput);
    if (!sale) {
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }
    res.status(201).json({ success: true, message: 'Sale stage saved successfully', data: sale });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});

// ============================================================================
// CONSOLIDATED SALES INVOICES — mounted at /api/sales-invoices
// (separate router: /api/sales/:id would otherwise swallow the path)
// One invoice entry for N selected sales orders of ONE party; member
// membership is sales_orders.is_invoiced.
// ============================================================================
export const saleInvoicesRouter = Router();

saleInvoicesRouter.use(authenticateToken);

const INV_PERMISSION = 'manage_sales';

// GET /api/sales-invoices
saleInvoicesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const invoices = await fetchSaleInvoicesDirect();
    res.json({ success: true, count: invoices.length, data: invoices });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sales-invoices/:id
saleInvoicesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const invoice = await fetchSaleInvoiceByIdDirect(req.params.id);
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    res.json({ success: true, data: invoice });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sales-invoices — fold N selected sales orders into one invoice
saleInvoicesRouter.post('/', requirePermission(INV_PERMISSION), async (req: Request, res: Response) => {
  try {
    const data = req.body;
    if (!data.partyId) {
      return res.status(400).json({ success: false, error: 'partyId is required' });
    }
    if (!Array.isArray(data.saleIds) || data.saleIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Select at least one sales order to invoice.' });
    }
    const invoice = await createSaleInvoiceDirect(data);
    res.status(201).json({ success: true, message: 'Invoice created successfully', data: invoice });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});

// DELETE /api/sales-invoices/:id — cancel: un-book vouchers + release members
saleInvoicesRouter.delete('/:id', requirePermission(INV_PERMISSION), async (req: Request, res: Response) => {
  try {
    const success = await deleteSaleInvoiceDirect(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    res.json({ success: true, message: 'Invoice cancelled; sales orders released' });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});

// DELETE /api/sales/:id
salesRouter.delete('/:id', requirePermission('manage_sales'), async (req: Request, res: Response) => {
  try {
    const success = await deleteSaleDirect(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }
    res.json({ success: true, message: 'Sale deleted successfully' });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});