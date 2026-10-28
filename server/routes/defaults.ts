import { Router, Request, Response } from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { serverDb } from '../db';

export const defaultsRouter = Router();

defaultsRouter.use(authenticateToken);

// GET /api/app-defaults — every saved default (any signed-in user reads)
defaultsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const defaults = serverDb.getAppDefaults();
    res.json({ success: true, count: defaults.length, data: defaults });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/app-defaults/:key — upsert one default (Settings-editable;
// values ride as plain strings — callers parse per their semantics)
defaultsRouter.put('/:key', requirePermission('manage_settings'), async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const value = (req.body || {}).value;
    if (value === undefined || value === null) {
      return res.status(400).json({ success: false, error: 'value is required' });
    }
    const entry = serverDb.upsertAppDefault(key, String(value));
    res.json({ success: true, message: `Default ${key} saved`, data: entry });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});