import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ScanBarcode,
  Pencil,
  Plus,
  Search,
  X,
  Archive,
  Wrench,
  Undo2,
  Warehouse,
  Truck,
  History,
  ExternalLink,
  MoreVertical,
} from 'lucide-react';
import {
  Item,
  ItemCategory,
  ItemLocation,
  InventoryUnit,
  InventoryUnitStatus,
  InventoryUnitEvent,
  Party,
  Vehicle,
  CompanySettings,
  TYRE_POSITIONS,
  TYRE_POSITION_LABELS,
  isTyreItemName,
} from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';
import UnitRegisterModal from './UnitRegisterModal';

const STATUS_CHIPS: Record<InventoryUnitStatus, { label: string; cls: string }> = {
  in_stock: { label: 'In Spare', cls: 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]' },
  deployed: { label: 'In Use', cls: 'bg-[var(--color-primary-container)] text-[var(--color-primary)]' },
  maintenance: { label: 'Maintenance', cls: 'bg-orange-100 text-orange-700' },
  sold: { label: 'Sold', cls: 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]' },
  scrapped: { label: 'Scrapped', cls: 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]' },
};

const EVENT_LABELS: Record<string, { label: string; icon: any }> = {
  entered: { label: 'Registered', icon: Plus },
  deployed: { label: 'Deployed', icon: Truck },
  returned: { label: 'Returned', icon: Undo2 },
  maintenance: { label: 'Sent for Maintenance', icon: Wrench },
  restored: { label: 'Restored', icon: Undo2 },
  scrapped: { label: 'Scrapped', icon: Archive },
  unscrapped: { label: 'Unscrapped', icon: Undo2 },
  sold: { label: 'Sold', icon: ExternalLink },
};

interface AssetItemProfilePageProps {
  item: Item;
  categories: ItemCategory[];
  inventoryUnits: InventoryUnit[];
  parties: Party[];
  vehicles: Vehicle[];
  locations: ItemLocation[];
  settings: CompanySettings;
  onBack: () => void;
  onEdit: (item: Item) => void;
}

/** The ADD/EDIT UNIT modal was extracted into `UnitRegisterModal` (2026-11-19)
 *  so the Tyre Management register opens the exact same form; this page only
 *  tracks open state + the unit being edited. */

export const AssetItemProfilePage: React.FC<AssetItemProfilePageProps> = ({
  item,
  categories,
  inventoryUnits,
  parties,
  vehicles,
  locations,
  settings,
  onBack,
  onEdit,
}) => {
  const currencySymbol = settings.currencySymbol || '₹';
  const units = useMemo(() => inventoryUnits.filter((u) => u.itemId === item.id), [inventoryUnits, item.id]);
  // TYRE-SCOPED REGISTER UI (user directive 2026-11-20): Status + Location /
  // Vehicle columns and the Mark Scrap row action render ONLY for tyre items
  // — every other serialised item's register drops them.
  const isTyre = isTyreItemName(item.name);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<InventoryUnitStatus | 'all'>('all');
  // ADD/EDIT UNIT modal (shared UnitRegisterModal) — open flag + edit target
  const [unitFormOpen, setUnitFormOpen] = useState(false);
  const [unitFormExisting, setUnitFormExisting] = useState<InventoryUnit | null>(null);
  const [deployForm, setDeployForm] = useState<{ unitId: string; vehicleId: string; position: string; odometer: string; notes: string } | null>(null);
  const [returnForm, setReturnForm] = useState<{ unitId: string; locationId: string; condition: string; odometer: string; notes: string } | null>(null);
  const [viewingUnit, setViewingUnit] = useState<InventoryUnit | null>(null);
  const [unitEvents, setUnitEvents] = useState<InventoryUnitEvent[] | null>(null);
  // DYNAMIC ATTRIBUTES: the item's declared per-unit key list + its editor
  const attrDefs = useMemo(() => (Array.isArray(item.attributes) ? item.attributes : []), [item.attributes]);

  const counts = useMemo(() => ({
    all: units.length,
    in_stock: units.filter((u) => u.status === 'in_stock').length,
    deployed: units.filter((u) => u.status === 'deployed').length,
    maintenance: units.filter((u) => u.status === 'maintenance').length,
    sold: units.filter((u) => u.status === 'sold').length,
    scrapped: units.filter((u) => u.status === 'scrapped').length,
  }), [units]);

  const registerValue = units
    .filter((u) => u.status === 'in_stock' || u.status === 'deployed' || u.status === 'maintenance')
    .reduce((sum, u) => sum + (Number(u.purchaseCost) || 0), 0);

  const filteredUnits = useMemo(() => units
    .filter((u) => {
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const hay = [
          u.serialNumber, u.vehicleNo, u.supplierName, u.locationName, u.notes,
          // attribute values are searchable too (brand, size, volts...)
          ...Object.entries(u.attributes || {}).map(([k, v]) => `${k} ${v}`),
        ]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => `${b.createdAt || ''}${b.id}`.localeCompare(`${a.createdAt || ''}${a.id}`)), [units, searchQuery, statusFilter]);

  const partyName = (id?: string) => parties.find((p) => p.id === id)?.name || '—';
  const vehicleNo = (id?: string) => vehicles.find((v) => v.id === id)?.vehicleNo;

  const openUnitDetail = async (unit: InventoryUnit) => {
    setViewingUnit(unit);
    setUnitEvents(null);
    try {
      setUnitEvents(await localDb.fetchUnitEvents(unit.id));
    } catch (err) {
      setUnitEvents([]);
    }
  };

  /** Opens the shared add/edit unit modal (UnitRegisterModal) with the
   *  unit's stored facts prefilled when editing. */
  const openUnitForm = (existing?: InventoryUnit) => {
    setUnitFormExisting(existing || null);
    setUnitFormOpen(true);
  };

  // SCRAP / UN-SCRAP (2026-11-17) — the register carries the same lifecycle
  // actions as the Tyre view, same UX rules: plain confirm to scrap (no
  // reason prompt), immediate unscrap (no confirmation).
  const handleScrapUnit = (u: InventoryUnit) => {
    if (confirm(`Mark serial ${u.serialNumber} as scrapped? It returns to usable stock when unscrapped later.`)) {
      localDb.scrapInventoryUnit(u.id, { notes: 'Scrapped from the unit register' });
    }
  };
  const handleUnscrapUnit = (u: InventoryUnit) => {
    localDb.unscrapInventoryUnit(u.id, { notes: 'Unscrapped from the unit register' });
  };

  // ⋮ row-action popover (same portal pattern as the orders list, 2026-11-16):
  // edit details + assign-to-vehicle ride the menu; return/restore stay inline.
  const [unitMenuFor, setUnitMenuFor] = useState<string | null>(null);
  const [unitMenuPos, setUnitMenuPos] = useState<{ top: number; right: number; flip: boolean } | null>(null);
  const unitMenuBtnRef = React.useRef<HTMLDivElement | null>(null);
  const unitMenuRef = React.useRef<HTMLDivElement | null>(null);
  const closeUnitMenu = () => {
    setUnitMenuFor(null);
    setUnitMenuPos(null);
  };
  React.useEffect(() => {
    if (!unitMenuFor) return;
    const onClickOut = (e: MouseEvent) => {
      const t = e.target as Node;
      if (unitMenuBtnRef.current && !unitMenuBtnRef.current.contains(t) &&
          unitMenuRef.current && !unitMenuRef.current.contains(t)) {
        closeUnitMenu();
      }
    };
    const onMove = () => closeUnitMenu();
    document.addEventListener('mousedown', onClickOut);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', onClickOut);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [unitMenuFor]);

  const handleDeploy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deployForm) return;
    localDb.deployInventoryUnit(deployForm.unitId, {
      vehicleId: deployForm.vehicleId,
      position: deployForm.position || undefined,
      odometer: deployForm.odometer === '' ? undefined : Number(deployForm.odometer),
      notes: deployForm.notes || undefined,
    });
    setDeployForm(null);
  };

  const handleReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnForm) return;
    const payload = {
      locationId: returnForm.locationId || undefined,
      condition: returnForm.condition || undefined,
      odometer: returnForm.odometer === '' ? undefined : Number(returnForm.odometer),
      notes: returnForm.notes || undefined,
    };
    // The shared modal covers BOTH exits: deployed → return, maintenance → restore.
    const movingUnit = units.find((u) => u.id === returnForm.unitId);
    if (movingUnit?.status === 'maintenance') {
      localDb.restoreInventoryUnit(returnForm.unitId, payload);
    } else {
      localDb.returnInventoryUnit(returnForm.unitId, payload);
    }
    setReturnForm(null);
  };

  const fmtDate = (d?: string) => d || '—';
  const fmtCost = (c?: number) => (c !== undefined && c !== null ? `${currencySymbol}${Number(c).toLocaleString('en-IN')}` : '—');

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--color-outline-variant)] pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2.5 rounded-full hover:bg-[var(--color-surface-container)] transition-colors"
            title="Back to the register list"
          >
            <ArrowLeft className="w-4.5 h-4.5" />
          </button>
          <div className="w-11 h-11 rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-primary)] flex items-center justify-center">
            <ScanBarcode className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-extrabold text-[var(--color-on-surface)]">{item.name}</h2>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)]">
                Trackable
              </span>
              {!item.isActive && (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-[var(--color-error-container)] text-[var(--color-on-error-container)]">Inactive</span>
              )}
            </div>
            <p className="text-[11px] text-[var(--color-on-surface-variant)] font-mono mt-0.5">
              {item.code} · {categories.find((c) => c.id === item.categoryId)?.name || '—'} · {item.unit}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="p-2 rounded-full hover:bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)]"
            title="Edit item master"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => openUnitForm()}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-bold shadow-xs hover:opacity-95"
          >
            <Plus className="w-4 h-4" /> Add Item
          </button>
        </div>
      </div>

      {/* KPI cards — 2026-11-16: only the LIVE register states (no sold /
          maintenance / scrapped cards; the units reach those states through
          their own flows) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {([
          ['All Units', counts.all, ScanBarcode],
          ['In Spare', counts.in_stock, Warehouse],
          ['In Use', counts.deployed, Truck],
        ] as Array<[string, number, any]>).map(([label, value, Icon]) => (
          <div key={label} className="p-3.5 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">{label}</span>
              <Icon className="w-3.5 h-3.5 text-[var(--color-outline)]" />
            </div>
            <p className="text-xl font-black text-[var(--color-on-surface)] mt-1.5">{value}</p>
          </div>
        ))}
      </div>
      

      {/* Register */}
      <div className="bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl overflow-clip shadow-xs">
        <div className="p-3 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]/60 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-outline)]" />
            <input
              type="text"
              placeholder="Search by serial, vehicle, supplier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[var(--color-surface-container)] text-xs font-semibold text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)] rounded-full focus:outline-none focus:bg-[var(--color-surface)] focus:border-[var(--color-primary)] transition-all"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as InventoryUnitStatus | 'all')}
            className="w-full sm:w-44 px-3.5 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-semibold text-[var(--color-on-surface)] focus:outline-none"
          >
            <option value="all">All statuses ({counts.all})</option>
            <option value="in_stock">In Spare ({counts.in_stock})</option>
            <option value="deployed">In Use ({counts.deployed})</option>
            <option value="maintenance">Maintenance ({counts.maintenance})</option>
            <option value="sold">Sold ({counts.sold})</option>
            <option value="scrapped">Scrapped ({counts.scrapped})</option>
          </select>
        </div>

        <div>
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-16 z-20">
              <tr className="border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Serial Number</th>
                {isTyre && <th className="py-3 px-3">Status</th>}
                {isTyre && <th className="py-3 px-3">Location / Vehicle</th>}
                <th className="py-3 px-3">Supplier</th>
                <th className="py-3 px-3">Purchase</th>
                <th className="py-3 px-3">Cost</th>
                {/* DONE-BY AUDIT (2026-11-21): acting user resolved from the users master */}
                <th className="py-3 px-3">Added By</th>
                <th className="py-3 px-3">Updated By</th>
                {/* DYNAMIC ATTRIBUTE COLUMNS (2026-11-16): the item's declared
                    keys render as columns next to the fixed facts */}
                {(attrDefs.map((def) => (
                  <th key={def.key} className="py-3 px-3" title={def.required ? `${def.label} (required)` : def.label}>
                    {def.label}{def.required && <span className="text-[var(--color-error)]">*</span>}
                  </th>
                )))}
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-outline-variant)]/60">
              {filteredUnits.length === 0 ? (
                <tr>
                  <td colSpan={(isTyre ? 7 : 5) + attrDefs.length + 2} className="py-12 text-center text-[var(--color-on-surface-variant)]">
                    {/* +2 = the DONE-BY AUDIT columns (2026-11-21) */}
                    <ScanBarcode className="w-8 h-8 mx-auto text-[var(--color-outline-variant)] mb-2" />
                    <p className="text-xs font-bold">{units.length === 0 ? 'No units registered yet' : 'No units match the filters'}</p>
                    <p className="text-[10px] mt-0.5">
                      {units.length === 0 ? 'Add the first unit (serial number) with the Add Item action — or capture serials on the next goods receipt.' : 'Try widening the search.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredUnits.map((u) => {
                  const chip = STATUS_CHIPS[u.status];
                  return (
                    <tr key={u.id} className="hover:bg-[var(--color-surface-container-high)]/40 transition-colors text-xs group">
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => openUnitDetail(u)}
                          className="font-bold text-[var(--color-primary)] hover:underline text-left font-mono"
                          title="Open unit timeline"
                        >
                          {u.serialNumber}
                        </button>
                        {u.notes && <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5 truncate max-w-[240px]">{u.notes}</p>}
                      </td>
                      {isTyre && (
                        <td className="py-3 px-3">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${chip.cls}`}>
                            {chip.label}
                          </span>
                        </td>
                      )}
                      {isTyre && (
                        <td className="py-3 px-3">
                          {u.status === 'deployed' ? (
                            <span className="font-semibold text-[var(--color-on-surface)]">
                              {u.vehicleNo || 'Vehicle'}{u.position ? ` · ${u.position}` : ''}
                            </span>
                          ) : (
                            <span className="font-semibold text-[var(--color-on-surface-variant)]">{u.locationName || '—'}</span>
                          )}
                        </td>
                      )}
                      <td className="py-3 px-3 text-[var(--color-on-surface)] font-semibold">{u.supplierName || partyName(u.supplierId) || '—'}</td>
                      <td className="py-3 px-3 text-[var(--color-on-surface-variant)]">{fmtDate(u.purchaseDate)}</td>
                      <td className="py-3 px-3 font-bold text-[var(--color-on-surface)]">{fmtCost(u.purchaseCost)}</td>
                      {/* DONE-BY AUDIT (2026-11-21) */}
                      <td className="py-3 px-3 text-[11px] font-medium text-[var(--color-on-surface)]">
                        {u.createdByName || <span className="italic text-[var(--color-outline)]">Unknown</span>}
                      </td>
                      <td className="py-3 px-3 text-[11px] font-medium text-[var(--color-on-surface)]">
                        {u.updatedByName || <span className="italic text-[var(--color-outline)]">—</span>}
                      </td>
                      {(attrDefs.map((def) => {
                        const raw = u.attributes?.[def.key];
                        const display = raw === undefined || raw === '' ? '—'
                          : def.type === 'number'
                            ? `${raw}`
                            : def.type === 'date'
                              ? fmtDate(String(raw))
                              : String(raw);
                        return (
                          <td key={def.key} className="py-3 px-3 text-[var(--color-on-surface-variant)]">{display}</td>
                        );
                      }))}
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* 2026-11-16: EVERY action rides the ⋮ popover (assign
                              vehicle / return to spare / restore from
                              maintenance / edit details) — the same portal
                              pattern as the orders row menus. */}
                          {(u.status === 'in_stock' || u.status === 'deployed' || u.status === 'maintenance' || u.status === 'scrapped') && (
                            <div className="relative" ref={unitMenuBtnRef}>
                              <button
                                type="button"
                                title="More Actions"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (unitMenuFor === u.id) {
                                    closeUnitMenu();
                                    return;
                                  }
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  const flip = rect.bottom + 160 > window.innerHeight;
                                  setUnitMenuPos({
                                    top: flip ? rect.top : rect.bottom,
                                    right: window.innerWidth - rect.right,
                                    flip,
                                  });
                                  setUnitMenuFor(u.id);
                                }}
                                className={`p-1.5 rounded-full transition-colors ${
                                  unitMenuFor === u.id
                                    ? 'text-[var(--color-on-surface)] bg-[var(--color-surface-container-highest)]'
                                    : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)]'
                                }`}
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== ADD / EDIT UNIT MODAL — shared UnitRegisterModal (2026-11-19);
           the same form serves the Tyre Management register entry point ===== */}
      {unitFormOpen && (
        <UnitRegisterModal
          items={[item]}
          parties={parties}
          locations={locations}
          currencySymbol={currencySymbol}
          existing={unitFormExisting}
          onClose={() => setUnitFormOpen(false)}
        />
      )}

      {/* ===== DEPLOY MODAL ===== */}

      {/* ===== DEPLOY MODAL ===== */}
      {deployForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-xs">
          <form onSubmit={handleDeploy} className="bg-[var(--color-surface-container-lowest)] w-full max-w-lg rounded-3xl shadow-2xl border border-[var(--color-outline-variant)]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]">
              <h3 className="text-sm font-bold text-[var(--color-on-surface)] flex items-center gap-2"><Truck className="w-4 h-4 text-[var(--color-primary)]" /> Deploy Unit {units.find((u) => u.id === deployForm.unitId)?.serialNumber}</h3>
              <button type="button" onClick={() => setDeployForm(null)} className="p-2 text-[var(--color-outline)] rounded-full hover:bg-[var(--color-surface-container-high)]"><X className="w-4.5 h-4.5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Fleet Vehicle *</label>
                <select
                  required
                  value={deployForm.vehicleId}
                  onChange={(e) => setDeployForm({ ...deployForm, vehicleId: e.target.value })}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none"
                >
                  <option value="">-- Choose vehicle --</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>{v.vehicleNo}{v.type ? ` · ${v.type}` : ''}</option>
                  ))}
                </select>
              </div>
              {/* TYRE AWARENESS (2026-11-17): a tyre unit's deploy MUST pick one
                  of the 12 dumper positions; any other unit carries no position. */}
              {isTyreItemName(item.name) ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Wheel Position *</label>
                    <select
                      required
                      value={deployForm.position}
                      onChange={(e) => setDeployForm({ ...deployForm, position: e.target.value })}
                      className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none"
                    >
                      <option value="">-- Wheel position --</option>
                      {TYRE_POSITIONS.map((p) => (
                        <option key={p} value={p}>{TYRE_POSITION_LABELS[p]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Odometer at Fitment (km)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 148230"
                      value={deployForm.odometer}
                      onChange={(e) => setDeployForm({ ...deployForm, odometer: e.target.value })}
                      className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold text-[var(--color-on-surface)] focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Odometer at Fitment (km)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 148230"
                    value={deployForm.odometer}
                    onChange={(e) => setDeployForm({ ...deployForm, odometer: e.target.value })}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold text-[var(--color-on-surface)] focus:outline-none"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Notes</label>
                <input
                  type="text"
                  value={deployForm.notes}
                  onChange={(e) => setDeployForm({ ...deployForm, notes: e.target.value })}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] flex justify-end gap-3">
              <button type="button" onClick={() => setDeployForm(null)} className="px-5 py-2 border border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] rounded-full text-xs font-semibold hover:bg-[var(--color-surface-container)]">Cancel</button>
              <button type="submit" className="px-6 py-2.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-bold hover:opacity-95">Deploy Unit</button>
            </div>
          </form>
        </div>
      )}

      {/* ===== RETURN / RESTORE MODAL ===== */}
      {returnForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-xs">
          <form onSubmit={handleReturn} className="bg-[var(--color-surface-container-lowest)] w-full max-w-lg rounded-3xl shadow-2xl border border-[var(--color-outline-variant)]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]">
              <h3 className="text-sm font-bold text-[var(--color-on-surface)] flex items-center gap-2"><Undo2 className="w-4 h-4 text-[var(--color-primary)]" /> {returnForm.notes?.includes('maintenance') ? 'Restore' : 'Return'} Unit {units.find((u) => u.id === returnForm.unitId)?.serialNumber}</h3>
              <button type="button" onClick={() => setReturnForm(null)} className="p-2 text-[var(--color-outline)] rounded-full hover:bg-[var(--color-surface-container-high)]"><X className="w-4.5 h-4.5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Storage Location</label>
                  <select
                    value={returnForm.locationId}
                    onChange={(e) => setReturnForm({ ...returnForm, locationId: e.target.value })}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none"
                  >
                    <option value="">— Keep current —</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Condition on Return</label>
                  <select
                    value={returnForm.condition}
                    onChange={(e) => setReturnForm({ ...returnForm, condition: e.target.value })}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none"
                  >
                    <option value="">— Unknown —</option>
                    <option value="excellent">Excellent</option>
                    <option value="good">Good</option>
                    <option value="worn">Worn</option>
                    <option value="damaged">Damaged</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Odometer at Removal (km)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="leave empty to skip"
                  value={returnForm.odometer}
                  onChange={(e) => setReturnForm({ ...returnForm, odometer: e.target.value })}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold text-[var(--color-on-surface)] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Notes</label>
                <input
                  type="text"
                  value={returnForm.notes}
                  onChange={(e) => setReturnForm({ ...returnForm, notes: e.target.value })}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] flex justify-end gap-3">
              <button type="button" onClick={() => setReturnForm(null)} className="px-5 py-2 border border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] rounded-full text-xs font-semibold hover:bg-[var(--color-surface-container)]">Cancel</button>
              <button type="submit" className="px-6 py-2.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-bold hover:opacity-95">Confirm</button>
            </div>
          </form>
        </div>
      )}

      {/* Row action popover — PORTAL: fixed on the page so the register table
          container (overflow containers) can never clip it */}
      {unitMenuFor && unitMenuPos && createPortal(
        <div
          ref={unitMenuRef}
          style={{
            position: 'fixed',
            top: unitMenuPos.flip ? unitMenuPos.top - 4 : unitMenuPos.top + 4,
            right: Math.max(8, unitMenuPos.right + 8),
            transform: unitMenuPos.flip ? 'translateY(-100%)' : 'none',
          }}
          className="z-[60] w-56 max-w-[calc(100vw-16px)] rounded-2xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] shadow-2xl overflow-hidden text-left"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="px-3 pt-2.5 pb-1.5 text-[9px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
            Actions — {units.find((u) => u.id === unitMenuFor)?.serialNumber || ''}
          </p>
          {(() => {
            const target = units.find((u) => u.id === unitMenuFor);
            if (!target) return null;
            return (
              <div className="pb-1.5">
                {/* ASSIGN TO VEHICLE — TYRES ONLY (user directive 2026-11-19):
                    no other serialised inventory gets a vehicle-assignment
                    action in the register. */}
                {target.status === 'in_stock' && isTyreItemName(item.name) && (
                  <button
                    type="button"
                    onClick={() => {
                      closeUnitMenu();
                      setDeployForm({ unitId: target.id, vehicleId: target.vehicleId || '', position: target.position || '', odometer: target.fitOdometer ? String(target.fitOdometer) : '', notes: '' });
                    }}
                    className="w-full px-3 py-2 flex items-center gap-2.5 text-xs font-semibold text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] transition-colors"
                  >
                    <Truck className="w-4 h-4 text-[var(--color-primary)] shrink-0" /> Assign to Vehicle
                  </button>
                )}
                {target.status === 'deployed' && (
                  <button
                    type="button"
                    onClick={() => {
                      closeUnitMenu();
                      setReturnForm({ unitId: target.id, locationId: target.locationId || '', condition: target.condition || '', odometer: '', notes: '' });
                    }}
                    className="w-full px-3 py-2 flex items-center gap-2.5 text-xs font-semibold text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] transition-colors"
                  >
                    <Undo2 className="w-4 h-4 text-[var(--color-primary)] shrink-0" /> Return to Spare
                  </button>
                )}
                {target.status === 'maintenance' && (
                  <button
                    type="button"
                    onClick={() => {
                      closeUnitMenu();
                      setReturnForm({ unitId: target.id, locationId: target.locationId || '', condition: target.condition || '', odometer: '', notes: 'Returned from maintenance' });
                    }}
                    className="w-full px-3 py-2 flex items-center gap-2.5 text-xs font-semibold text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] transition-colors"
                  >
                    <Undo2 className="w-4 h-4 text-[var(--color-on-surface-variant)] shrink-0" /> Restore from Maintenance
                  </button>
                )}
                {/* MARK SCRAP — TYRES ONLY (user directive 2026-11-20): the
                    scrap/unscrap life-cycle is a tyre-register action; other
                    serialised items keep fit/edit only. */}
                {target.status === 'in_stock' && isTyre && (
                  <button
                    type="button"
                    onClick={() => { closeUnitMenu(); handleScrapUnit(target); }}
                    className="w-full px-3 py-2 flex items-center gap-2.5 text-xs font-semibold text-[var(--color-on-surface)] hover:bg-[var(--color-error-container)]/40 transition-colors"
                  >
                    <Archive className="w-4 h-4 text-[var(--color-error)] shrink-0" /> Mark Scrap
                  </button>
                )}
                {target.status === 'scrapped' && (
                  <button
                    type="button"
                    onClick={() => { closeUnitMenu(); handleUnscrapUnit(target); }}
                    className="w-full px-3 py-2 flex items-center gap-2.5 text-xs font-semibold text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] transition-colors"
                  >
                    <Undo2 className="w-4 h-4 text-[var(--color-success)] shrink-0" /> Mark Unscrap
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    closeUnitMenu();
                    openUnitForm(target);
                  }}
                  className="w-full px-3 py-2 flex items-center gap-2.5 text-xs font-semibold text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] transition-colors"
                >
                  <Pencil className="w-4 h-4 text-[var(--color-on-surface-variant)] shrink-0" /> Edit Details
                </button>
              </div>
            );
          })()}
        </div>,
        document.body
      )}

      {/* ===== UNIT TIMELINE MODAL ===== */}
      {viewingUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-xs">
          <div className="bg-[var(--color-surface-container-lowest)] w-full max-w-2xl rounded-3xl shadow-2xl border border-[var(--color-outline-variant)] flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]">
              <div>
                <h3 className="text-sm font-bold text-[var(--color-on-surface)] font-mono">{viewingUnit.serialNumber}</h3>
                <p className="text-[10px] text-[var(--color-on-surface-variant)]">{item.name} · {viewingUnit.supplierName || 'supplier not recorded'}</p>
              </div>
              <button type="button" onClick={() => { setViewingUnit(null); setUnitEvents(null); }} className="p-2 text-[var(--color-outline)] rounded-full hover:bg-[var(--color-surface-container-high)]"><X className="w-4.5 h-4.5" /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-[var(--color-surface-container)] rounded-xl border border-[var(--color-outline-variant)]">
                  <p className="text-[9px] font-bold text-[var(--color-on-surface-variant)] uppercase mb-0.5">Status</p>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${STATUS_CHIPS[viewingUnit.status].cls}`}>{STATUS_CHIPS[viewingUnit.status].label}</span>
                </div>
                <div className="p-3 bg-[var(--color-surface-container)] rounded-xl border border-[var(--color-outline-variant)]">
                  <p className="text-[9px] font-bold text-[var(--color-on-surface-variant)] uppercase mb-0.5">Cost</p>
                  <p className="text-xs font-bold text-[var(--color-on-surface)]">{fmtCost(viewingUnit.purchaseCost)}</p>
                </div>
                {/* DYNAMIC ATTRIBUTES: the item's declared keys (2026-11-16) */}
                {attrDefs.slice(0, 2).map((def) => (
                  <div key={def.key} className="p-3 bg-[var(--color-surface-container)] rounded-xl border border-[var(--color-outline-variant)]">
                    <p className="text-[9px] font-bold text-[var(--color-on-surface-variant)] uppercase mb-0.5">{def.label}</p>
                    <p className="text-xs font-bold text-[var(--color-on-surface)] capitalize">
                      {viewingUnit.attributes?.[def.key] !== undefined && viewingUnit.attributes?.[def.key] !== ''
                        ? (def.type === 'date' ? fmtDate(String(viewingUnit.attributes![def.key])) : String(viewingUnit.attributes![def.key]))
                        : '—'}
                    </p>
                  </div>
                ))}
              </div>
              {attrDefs.length > 2 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {attrDefs.slice(2).map((def) => (
                    <div key={def.key} className="p-3 bg-[var(--color-surface-container)] rounded-xl border border-[var(--color-outline-variant)]">
                      <p className="text-[9px] font-bold text-[var(--color-on-surface-variant)] uppercase mb-0.5">{def.label}</p>
                      <p className="text-xs font-bold text-[var(--color-on-surface)] capitalize">
                        {viewingUnit.attributes?.[def.key] !== undefined && viewingUnit.attributes?.[def.key] !== ''
                          ? (def.type === 'date' ? fmtDate(String(viewingUnit.attributes![def.key])) : String(viewingUnit.attributes![def.key]))
                          : '—'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {viewingUnit.notes && (
                <p className="text-xs text-[var(--color-on-surface-variant)] bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-xl px-3 py-2.5">{viewingUnit.notes}</p>
              )}
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-on-surface-variant)] flex items-center gap-1.5 mb-3">
                  <History className="w-3.5 h-3.5" /> Lifecycle Timeline
                </h4>
                {unitEvents === null ? (
                  <p className="text-xs text-[var(--color-outline)] py-4 text-center">Loading history…</p>
                ) : unitEvents.length === 0 ? (
                  <p className="text-xs text-[var(--color-outline)] py-4 text-center">No lifecycle events recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {unitEvents.map((ev) => {
                      const meta = EVENT_LABELS[ev.type] || { label: ev.type, icon: History };
                      const EventIcon = meta.icon;
                      const vehicle = ev.vehicleId ? vehicleNo(ev.vehicleId) : undefined;
                      const location = ev.locationId ? locations.find((l) => l.id === ev.locationId)?.name : undefined;
                      return (
                        <div key={ev.id} className="flex items-start gap-3 p-2.5 hover:bg-[var(--color-surface-container)] rounded-xl text-xs">
                          <div className="w-7 h-7 rounded-lg bg-[var(--color-primary-container)] text-[var(--color-primary)] flex items-center justify-center shrink-0">
                            <EventIcon className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-[var(--color-on-surface)]">{meta.label}</p>
                            <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5 break-words">{ev.notes || '—'}</p>
                            <p className="text-[10px] text-[var(--color-outline)] mt-0.5 flex flex-wrap gap-2">
                              <span className="font-semibold">{ev.date ? new Date(ev.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</span>
                              {vehicle && <span>· {vehicle}</span>}
                              {ev.position && <span>· {ev.position}</span>}
                              {ev.odometer !== undefined && <span>· {Number(ev.odometer).toLocaleString('en-IN')} km</span>}
                              {location && <span>· {location}</span>}
                              {/* DONE-BY AUDIT (2026-11-21): who performed the movement */}
                              {ev.createdByName && <span>· by <strong className="text-[var(--color-tertiary)]">{ev.createdByName}</strong></span>}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] flex justify-end">
              <button type="button" onClick={() => { setViewingUnit(null); setUnitEvents(null); }} className="px-6 py-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold rounded-full hover:opacity-95">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
