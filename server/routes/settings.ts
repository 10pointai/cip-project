import { Router, Request, Response } from 'express';
import { serverDb } from '../db';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { fetchSettingsDirect, updateSettingsDirect } from '../mysql/personnelService';

export const settingsRouter = Router();

settingsRouter.use(authenticateToken);

// GET /api/settings
settingsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const settings = await fetchSettingsDirect();
    res.json({ success: true, data: settings });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/settings
settingsRouter.put('/', requirePermission('manage_settings'), async (req: Request, res: Response) => {
  try {
    const updated = await updateSettingsDirect(req.body);
    res.json({ success: true, message: 'Settings updated successfully', data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
