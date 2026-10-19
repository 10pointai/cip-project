import { Router, Response } from 'express';
import { serverDb } from '../db';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

export const countsRouter = Router();
export const legacyOrdersRouter = Router();



// GET /api/counts — lightweight sidebar-badge counts so the app shell can show
// live totals WITHOUT loading any per-feature collection. Reads the working
// copy (serverDb), so it serves correctly in the MySQL mode and the
// sandbox-only dev mode alike. Array lengths only — additive; /api/health's
// getStats() shape is untouched.
countsRouter.get('/', authenticateToken, (_req: AuthenticatedRequest, res: Response) => {
  try {
    const counts = serverDb.getStats().counts;
    res.json({
      success: true,
      data: {
        parties: counts.parties,
        items: counts.items,
        sales: counts.sales,
        purchases: counts.purchases,
        orders: counts.orders,
        accounts: serverDb.getAccounts().length,
        employees: counts.employees,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/orders — READ-ONLY exposure of the retired legacy `orders` rows.
// Legacy rows still augment the sidebar Sales/Purchases badges and the Cash &
// Bank ledger under per-feature loading (they no longer ride the full
// snapshot on the client). The legacy table is retired for writes; this
// endpoint never mutates.
legacyOrdersRouter.get('/', authenticateToken, (_req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = serverDb.getOrders();
    res.json({ success: true, count: rows.length, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});