import { Router, Response } from 'express';
import { serverDb } from '../db';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { UserRole, UserPermissions } from '../../src/types';
import { DEFAULT_USER_PERMISSIONS } from '../seedData';

export const usersRouter = Router();

// Sanitize the inventory-location sub-permission (2026-10-30) — coerced to a
// deduped string[]; any non-array payload is DROPPED so a malformed request
// can never persist junk (and dropping reverts to "full access", never to a
// broken scope).
function sanitizeInventoryLocationIds(permissions: unknown): string[] | undefined {
  const raw = (permissions as any)?.inventory_location_ids;
  if (!Array.isArray(raw)) return undefined;
  return Array.from(new Set(raw.filter((v): v is string => typeof v === 'string' && v.length > 0)));
}

// Protect all user management endpoints
usersRouter.use(authenticateToken);
usersRouter.use(requirePermission('manage_users'));

// GET /api/users - List all users (status 'deleted' rows are tombstones on
// disk only — they never surface in the management list)
usersRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.query.fresh === 'true' || req.query.refresh === 'true') {
      await serverDb.initFromMysql();
    }
    const users = serverDb.getUsers(false).filter((u) => u.status !== 'deleted');
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

    // ROLE GATE (user rule): Super Administrators are provisioned ONLY by the
    // tech team from the backend — no route minting, ever.
    if (role === 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Super Administrators can only be provisioned by the tech team from the backend.',
      });
    }

    // PERMISSION GATE (user rule): User & Access Control belongs to the Super
    // Admin role alone — it bypasses the permission matrix server-side anyway,
    // so a matrix entry carrying manage_users is always stripped here.
    const requestedPermissions = {
      ...(permissions || DEFAULT_USER_PERMISSIONS),
      manage_users: false as boolean,
    };
    const sanitizedLocationIds = sanitizeInventoryLocationIds(permissions);
    if (sanitizedLocationIds) {
      requestedPermissions.inventory_location_ids = sanitizedLocationIds;
    }

    const newUser = await serverDb.createUserAsync({
      fullName,
      email,
      phone,
      role: role || 'admin',
      permissions: requestedPermissions,
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

    // ROLE GATE (user rule): no API caller — even a manage_users admin — may
    // promote anyone to Super Administrator; that grant is backend-only.
    if (role === 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Super Administrators can only be provisioned by the tech team from the backend.',
      });
    }

    // PERMISSION GATE (user rule): manage_users is un-grantable via the matrix;
    // for the existing Super Admin's own record the matrix is server-managed and
    // an incoming payload is ignored wholesale (role bypass makes it moot).
    const safePermissions =
      existing.role === 'super_admin'
        ? existing.permissions
        : permissions !== undefined
        ? { ...permissions, manage_users: false as boolean }
        : existing.permissions;
    // Sub-permission hygiene: normalize (or drop, reverting to full access) the
    // location ids on an incoming matrix update; an omitted array keeps the
    // previously stored assignment.
    if (existing.role !== 'super_admin' && permissions !== undefined && safePermissions !== existing.permissions) {
      const sanitizedLocationIds = sanitizeInventoryLocationIds(permissions);
      (safePermissions as any).inventory_location_ids =
        sanitizedLocationIds ?? existing.permissions?.inventory_location_ids;
    }

    const updated = await serverDb.updateUserAsync(id, {
      fullName: fullName !== undefined ? fullName : existing.fullName,
      email: email !== undefined ? email : existing.email,
      phone: phone !== undefined ? phone : existing.phone,
      role: role !== undefined ? role : existing.role,
      permissions: safePermissions,
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
