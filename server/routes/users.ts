import { Router, Response } from 'express';
import { serverDb } from '../db';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { UserRole, UserPermissions } from '../../src/types';
import { DEFAULT_USER_PERMISSIONS } from '../seedData';

export const usersRouter = Router();

// Protect all user management endpoints
usersRouter.use(authenticateToken);
usersRouter.use(requirePermission('manage_users'));

// GET /api/users - List all users
usersRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.query.fresh === 'true' || req.query.refresh === 'true') {
      await serverDb.initFromMysql();
    }
    const users = serverDb.getUsers(false);
    res.json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/users/generate-username - Preview a unique username before saving
usersRouter.get('/preview-username', (req: AuthenticatedRequest, res: Response) => {
  try {
    const fullName = (req.query.fullName as string) || 'Admin User';
    const role = (req.query.role as string) || 'admin';
    const suggestedUsername = serverDb.generateUniqueUsername(fullName, role);
    const suggestedActivationCode = serverDb.generateActivationCode();

    res.json({
      success: true,
      suggestedUsername,
      suggestedActivationCode,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/users - Create and provision a new admin/user
usersRouter.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { fullName, email, phone, role, permissions, notes, customUsername } = req.body;

    if (!fullName || !email) {
      return res.status(400).json({ success: false, error: 'Full name and email address are required.' });
    }

    // Check if email or custom username is already used
    const existingUsers = serverDb.getUsers(false);
    const emailExists = existingUsers.some((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (emailExists) {
      return res.status(400).json({ success: false, error: 'A user with this email address already exists.' });
    }

    if (customUsername) {
      const usernameExists = existingUsers.some((u) => u.username.toLowerCase() === customUsername.trim().toLowerCase());
      if (usernameExists) {
        return res.status(400).json({ success: false, error: 'The requested username is already taken.' });
      }
    }

    const newUser = await serverDb.createUserAsync({
      fullName,
      email,
      phone,
      role: role || 'admin',
      permissions: permissions || DEFAULT_USER_PERMISSIONS,
      notes,
      customUsername,
    });

    res.status(201).json({
      success: true,
      data: newUser,
      message: `User created successfully! Share unique username "${newUser.username}" with the user for first-time password setup.`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/users/:id - Update user role, permissions, or profile
usersRouter.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { fullName, email, phone, role, permissions, notes, status } = req.body;

    const existing = serverDb.getUserById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    // Email uniqueness pre-check (email is UNIQUE in MySQL): without this the
    // duplicate surfaces only on the cloud as a raw ER_DUP_ENTRY driver error,
    // and not at all in the in-memory sandbox.
    if (email !== undefined) {
      const emailTaken = serverDb
        .getUsers()
        .some((u) => u.id !== id && u.email.toLowerCase() === String(email).trim().toLowerCase());
      if (emailTaken) {
        return res.status(400).json({ success: false, error: 'A user with this email address already exists.' });
      }
    }

    const updated = await serverDb.updateUserAsync(id, {
      fullName: fullName !== undefined ? fullName : existing.fullName,
      email: email !== undefined ? email : existing.email,
      phone: phone !== undefined ? phone : existing.phone,
      role: role !== undefined ? role : existing.role,
      permissions: permissions !== undefined ? permissions : existing.permissions,
      notes: notes !== undefined ? notes : existing.notes,
      status: status !== undefined ? status : existing.status,
    });

    res.json({
      success: true,
      data: updated,
      message: 'User details updated successfully.',
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// PATCH /api/users/:id/reset-invite - Regenerate unique setup code & invite
usersRouter.patch('/:id/reset-invite', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = serverDb.getUserById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const newActivationCode = serverDb.generateActivationCode();
    const updated = await serverDb.updateUserAsync(id, {
      activationCode: newActivationCode,
      status: 'pending_setup',
      passwordHash: undefined,
    });

    res.json({
      success: true,
      data: updated,
      message: `Setup invite regenerated for ${existing.username}. New activation code: ${newActivationCode}`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/users/:id/status - Toggle account status (active / suspended)
usersRouter.patch('/:id/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'suspended', 'pending_setup'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status value.' });
    }

    if (req.user?.id === id && status === 'suspended') {
      return res.status(400).json({ success: false, error: 'You cannot suspend your own account.' });
    }

    // (last-active-super-admin lockout guard for suspend/pending_setup lives
    // centrally in serverDb.updateUser)

    // STATE MACHINE: an account may not be forced active while it still has no
    // password — that state only arises when the user has completed First-Time
    // Setup themselves. Activating manually creates an account that cannot
    // authenticate (login correctly blocks it with a needsSetup error).
    if (status === 'active') {
      const target = serverDb.getUserById(id, true);
      if (target && target.status === 'pending_setup' && !target.passwordHash) {
        const codeHint = target.activationCode
          ? ` Share their username (${target.username}) and activation code (${target.activationCode}) — completion of setup activates the account.`
          : ' Use Reset Invite to re-issue an activation code and have them complete First-Time Setup.';
        return res.status(400).json({
          success: false,
          error: `${target.username} has no password set yet, so it cannot be activated from here.${codeHint}`,
        });
      }
    }

    const updated = await serverDb.updateUserAsync(id, { status });
    res.json({
      success: true,
      data: updated,
      message: `Account status updated to ${status}.`,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// DELETE /api/users/:id - Remove user account
usersRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (req.user?.id === id) {
      return res.status(400).json({ success: false, error: 'You cannot delete your own logged-in account.' });
    }

    const success = await serverDb.deleteUserAsync(id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'User not found or could not be deleted.' });
    }

    res.json({
      success: true,
      message: 'User account removed successfully.',
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});
