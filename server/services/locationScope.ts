/**
 * Inventory location scoping (2026-10-30) — sub-permission layer under the
 * manage_inventory feature gate.
 *
 * Storage: user.permissions.inventory_location_ids (string[] of item_locations
 * ids). ABSENT or EMPTY = FULL access (backwards compatible: existing users
 * carry no entry). super_admin is always unrestricted.
 *
 * Every inventory surface (items, locations master, stock adjustments) resolves
 * the caller's scope and filters server-side — the client never has to be
 * trusted, and location names outside a user's scope never leave the API.
 * Item aggregates (currentStock / value inputs / low-stock) are recomputed
 * from the ALLOWED mapping rows only, so client stats computed off this list
 * inherit the scope automatically (ItemsView catalog stats, dashboard cards).
 */
import type { AppUser } from '../../src/types';
import type { Item, ItemLocation, ItemStockAdjustment } from '../../src/types';

export interface InventoryScope {
  /** true = user has explicit location restrictions */
  restricted: boolean;
  /** allowed item_locations ids (meaningful only when restricted) */
  allowed: Set<string>;
}

/** null user (defensive) and super_admin are always unrestricted. */
export function resolveInventoryScope(user: AppUser | undefined | null): InventoryScope {
  if (!user || user.role === 'super_admin') {
    return { restricted: false, allowed: new Set() };
  }
  const ids = user.permissions?.inventory_location_ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return { restricted: false, allowed: new Set() };
  }
  return { restricted: true, allowed: new Set(ids.map(String)) };
}

/** Mapping rows without an id (legacy loc-less rows) are only ever visible to
 *  unrestricted users — never guess a scope from an unnamed location. */
function mappingAllowed(scope: InventoryScope, locationId?: string): boolean {
  if (!scope.restricted) return true;
  return !!locationId && scope.allowed.has(locationId);
}

/**
 * Hides items with no mapping in an allowed location and strips the
 * disallowed location rows, then recomputes all item-level aggregates from
 * the surviving rows (mirrors serverDb create/update aggregation semantics).
 */
export function filterItemsForScope(items: Item[], scope: InventoryScope): Item[] {
  if (!scope.restricted) return items;
  const out: Item[] = [];
  for (const item of items) {
    const locs = (item.locations || []).filter((l) => mappingAllowed(scope, l.locationId));
    // Item exists only outside the user's locations → hidden entirely.
    if (item.locations && item.locations.length > 0 && locs.length === 0) continue;
    if (locs.length === 0) {
      // No per-location mappings at all (raw material type without location
      // stock) — fall back to keeping the untouched master row.
      out.push(item);
      continue;
    }
    const scoped: Item = { ...item, locations: locs };
    scoped.currentStock = locs.reduce((sum, l) => sum + (Number(l.currentStock) || 0), 0);
    const openingDefined = locs.some((l) => l.openingStock !== undefined);
    if (openingDefined) {
      scoped.openingStock = locs.reduce((sum, l) => sum + (Number(l.openingStock) || 0), 0);
    }
    const minDefined = locs.some((l) => l.minStockLevel !== undefined);
    if (minDefined) {
      scoped.minStockLevel = locs.reduce((sum, l) => sum + (Number(l.minStockLevel) || 0), 0);
    }
    if (scoped.maxCapacity !== undefined) {
      const capacityDefined = locs.some((l) => l.maxCapacity !== undefined);
      if (capacityDefined) {
        scoped.maxCapacity = locs.reduce((sum, l) => sum + (Number(l.maxCapacity) || 0), 0);
      }
    }
    scoped.stockLocations = locs.map((l) => l.locationName).filter(Boolean) as string[];
    scoped.stockLocation = scoped.stockLocations.join(', ');
    out.push(scoped);
  }
  return out;
}

/** Adjustment rows for locations outside the user's scope are dropped; legacy
 *  rows with no locationId stay hidden from restricted users as well. */
export function filterStockAdjustmentsForScope<T extends Pick<ItemStockAdjustment, 'locationId'>>(
  adjustments: T[],
  scope: InventoryScope
): T[] {
  if (!scope.restricted) return adjustments;
  return adjustments.filter((a) => mappingAllowed(scope, a.locationId));
}

/** Location master list scoping: dropdowns and managers built off this read
 *  can only ever reference assigned locations. */
export function filterLocationsForScope(locations: ItemLocation[], scope: InventoryScope): ItemLocation[] {
  if (!scope.restricted) return locations;
  return locations.filter((l) => mappingAllowed(scope, l.id));
}

/** Throws a descriptive error when a restricted user submits a location the
 *  scope does not cover (item create/edit mapping lists, per-location
 *  adjustments). Unrestricted callers always pass. */
export function assertLocationsInScope(
  scope: InventoryScope,
  locationIds: (string | undefined | null)[],
  context: string
): void {
  if (!scope.restricted) return;
  for (const id of locationIds) {
    if (!id) {
      // A null/absent location in a submitted list is only meaningful for
      // unrestricted users.
      throw new ScopeError(
        `${context}: a location is required — your account is restricted to ${scope.allowed.size} assigned location(s). Contact a Super Administrator.`
      );
    }
    if (!scope.allowed.has(String(id))) {
      throw new ScopeError(
        `${context}: the location is outside your assigned inventory locations. Contact a Super Administrator.`
      );
    }
  }
}

/** Unrestricted users may run aggregate (no-location) adjustment flows;
 *  restricted users must always target an assigned location. */
export function assertScopeCanAdjustAggregate(scope: InventoryScope, context: string): void {
  if (!scope.restricted) return;
  throw new ScopeError(
    `${context}: your account is restricted to specific inventory locations, so only per-location adjustments are allowed. Contact a Super Administrator.`
  );
}

export class ScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScopeError';
  }
}