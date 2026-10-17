import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { serverDb } from '../db';
import { generateToken, authenticateToken, AuthenticatedRequest } from '../middleware/auth';

export const authRouter = Router();

// POST /api/auth/login - Authenticate with unique username and password
authRouter.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required.' });
    }

    const user = serverDb.getUserByUsername(username, true);

    if (!user) {
      console.warn(`[Auth] Login attempt failed: User "${username}" not found.`);
      return res.status(401).json({ success: false, error: 'Invalid username or password.' });
    }

    const isSuperAdmin = user.role === 'super_admin' || user.username.toLowerCase() === 'admin';

    // Auto-heal super_admin: Super Administrator should NEVER be locked out
    if (isSuperAdmin) {
      if (user.status !== 'active') {
        user.status = 'active';
        serverDb.updateUser(user.id, { status: 'active' });
        console.log(`[Auth] Auto-activated Super Admin "${user.username}".`);
      }
      if (!user.passwordHash) {
        user.passwordHash = bcrypt.hashSync('Admin@123', 10);
        serverDb.updateUser(user.id, { passwordHash: user.passwordHash });
        console.log(`[Auth] Auto-restored passwordHash for Super Admin "${user.username}".`);
      }
    }

    // Check account status
    if (user.status === 'pending_setup') {
      console.warn(`[Auth] Login 403: User "${user.username}" is pending setup.`);
      return res.status(403).json({
        success: false,
        needsSetup: true,
        username: user.username,
        error: 'Your account is pending first-time setup. Please configure your password using your unique username.',
      });
    }

    if (user.status === 'suspended') {
      console.warn(`[Auth] Login 403: User "${user.username}" is suspended.`);
      return res.status(403).json({
        success: false,
        error: 'Your account has been suspended. Please contact your system administrator.',
      });
    }

    if (!user.passwordHash) {
      // Auto-heal fallback for active accounts attempting default admin password
      if (password === 'Admin@123' && isSuperAdmin) {
        user.passwordHash = bcrypt.hashSync('Admin@123', 10);
        serverDb.updateUser(user.id, { passwordHash: user.passwordHash });
        console.log(`[Auth] Auto-healed missing passwordHash for Super Admin "${user.username}".`);
      } else {
        console.warn(`[Auth] Login 403: User "${user.username}" has no passwordHash set.`);
        return res.status(403).json({
          success: false,
          needsSetup: true,
          username: user.username,
          error: 'No password set for this account. Please use the First-Time Setup option.',
        });
      }
    }

    let passwordMatches = false;
    try {
      passwordMatches = bcrypt.compareSync(password, user.passwordHash);
    } catch (bcryptErr) {
      console.error(`[Auth] Password comparison error for "${user.username}":`, bcryptErr);
      passwordMatches = false;
    }

    if (!passwordMatches) {
      console.warn(`[Auth] Login 401: Invalid password for "${user.username}".`);
      return res.status(401).json({ success: false, error: 'Invalid username or password.' });
    }

    // Update last login in local memory and Azure MySQL
    await serverDb.updateUserAsync(user.id, { lastLoginAt: new Date().toISOString() });

    const safeUser = serverDb.getUserById(user.id);
    if (!safeUser) {
      return res.status(500).json({ success: false, error: 'Failed to retrieve user profile.' });
    }

    const token = generateToken(safeUser);

    res.json({
      success: true,
      token,
      user: safeUser,
      message: `Welcome back, ${safeUser.fullName}!`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/auth/verify-setup - Verify unique username for first-time password setup
authRouter.post('/verify-setup', (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ success: false, error: 'Unique username is required.' });
    }

    const user = serverDb.getUserByUsername(username, false);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: `Username "${username}" not found. Please contact the administrator who provisioned your account.`,
      });
    }

    const sensitiveUser = serverDb.getUserByUsername(username, true);

    if (user.status === 'active' && sensitiveUser?.passwordHash) {
      return res.status(400).json({
        success: false,
        alreadyActive: true,
        error: `Account "${username}" is already active with a configured password. Please sign in directly with your password.`,
      });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({
        success: false,
        error: `Account "${username}" has been suspended. Please contact your system administrator.`,
      });
    }

    // Activation codes are COMPULSORY for all new sign-ups (user directive) —
    // an account with no code on file cannot self-serve setup; the admin must
    // re-issue one via Reset Invite.
    if (!user.activationCode) {
      return res.status(400).json({
        success: false,
        eligible: false,
        error: `No activation code is on file for "${username}". Ask your administrator to use the Reset Invite option to re-issue one.`,
      });
    }

    res.json({
      success: true,
      eligible: true,
      requiresActivationCode: true,
      user: {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/auth/setup-password - First-time password creation using unique username
authRouter.post('/setup-password', async (req, res) => {
  try {
    const { username, password, activationCode } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and new password are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters long.' });
    }

    const user = serverDb.getUserByUsername(username, true);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: `Username "${username}" not found.`,
      });
    }

    if (user.status === 'active') {
      return res.status(400).json({
        success: false,
        error: 'This account is already active. Please log in directly with your password.',
      });
    }

    // ACTIVATION CODE IS COMPULSORY (user directive): sign-ups are gated by the
    // one-time code issued with the username — it is the proof-of-invite tying
    // setup to the account holder the admin provisioned. No code sent is a hard
    // reject; the old "no stored code" back-compat path is likewise closed — a
    // pending account without a code on file gets one only via admin Reset Invite.
    if (!activationCode || !activationCode.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Activation code required. Ask your administrator for the one-time code issued with your account.',
      });
    }
    if (!user.activationCode) {
      return res.status(400).json({
        success: false,
        error: `No activation code is on file for "${username}". Ask your administrator to use the Reset Invite option to re-issue one.`,
      });
    }
    if (user.activationCode.toUpperCase() !== activationCode.trim().toUpperCase()) {
      return res.status(400).json({ success: false, error: 'Invalid activation code provided.' });
    }

    // Hash password and activate user. activationCode is consumed ONE-TIME
    // (undefined clears it) — a used code must never re-activate the account.
    const passwordHash = bcrypt.hashSync(password, 10);
    const updated = await serverDb.updateUserAsync(user.id, {
      passwordHash,
      status: 'active',
      activationCode: undefined,
      lastLoginAt: new Date().toISOString(),
    });

    if (!updated) {
      return res.status(500).json({ success: false, error: 'Failed to complete account activation.' });
    }

    const token = generateToken(updated);

    res.json({
      success: true,
      token,
      user: updated,
      message: `Account activated successfully! Welcome to the system, ${updated.fullName}.`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/auth/me - Retrieve currently authenticated user profile
authRouter.get('/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    user: req.user,
  });
});

// POST /api/auth/change-password - Change password for authenticated session
authRouter.post('/change-password', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user!.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current password and new password are required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters long.' });
    }

    const user = serverDb.getUserById(userId, true);
    if (!user || !user.passwordHash) {
      return res.status(404).json({ success: false, error: 'User account not found.' });
    }

    const matches = bcrypt.compareSync(currentPassword, user.passwordHash);
    if (!matches) {
      return res.status(400).json({ success: false, error: 'Current password does not match.' });
    }

    const passwordHash = bcrypt.hashSync(newPassword, 10);
    // Awaited so a MySQL write failure fails the request instead of silently
    // diverging between the sandbox and the cloud (sandbox-only mutation class).
    await serverDb.updateUserAsync(userId, { passwordHash });

    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
