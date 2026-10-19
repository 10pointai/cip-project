import React from 'react';
import {
  X,
  Package,
  Wrench,
  Edit2,
  Trash2,
  Calendar,
  FileText,
  Warehouse,
  IndianRupee,
  Layers,
  Scale,
  Percent,
  CheckCircle2,
  ArrowUpRight,
  MapPin,
} from 'lucide-react';
import { Item, ItemCategory } from '../../types';
import { EntityDocumentsSection } from '../common/EntityDocumentsSection';

interface ItemDetailModalProps {
  item: Item;
  category?: ItemCategory;
  currencySymbol?: string;
  onClose: () => void;
  onEdit: (item: Item) => void;
  onDelete: (item: Item) => void;
}

export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({
  item,
  category,
  currencySymbol = '₹',
  onClose,
  onEdit,
  onDelete,
}) => {
  // Live FIFO valuation rate from the ledger; catalog chain as fallback
  // Item master's default cost rate (FIFO lots only drive the Stock Valuation card)
  const costPrice = item.openingStockPrice || item.purchasePrice || 0;
  const grossProfitPerUnit = costPrice > 0 ? item.salePrice - costPrice : 0;
  const grossProfitMarginPct =
    costPrice > 0 && item.salePrice > 0 ? (grossProfitPerUnit / item.salePrice) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[var(--color-surface-container-lowest)] w-full max-w-2xl rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-white shadow-xs"
              style={{ backgroundColor: category?.color || '#005ac1' }}
            >
              {item.type === 'product' ? <Package className="w-5 h-5" /> : <Wrench className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)]">
                  {item.code}
                </span>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white uppercase tracking-wider"
                  style={{ backgroundColor: category?.color || '#005ac1' }}
                >
                  {item.categoryName || category?.name || 'General'}
                </span>
                {!item.isActive ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--color-error-container)] text-[var(--color-error)]">
                    Inactive
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--color-success-container)] text-[var(--color-success)]">
                    Active
                  </span>
                )}
              </div>
              <h2 className="text-base sm:text-lg font-black text-[var(--color-on-surface)] mt-0.5">{item.name}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--color-outline)] hover:text-[var(--color-on-surface)] rounded-full hover:bg-[var(--color-surface-container-high)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Key Rates & Profit Margin Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)]">
              <p className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Selling Rate</p>
              <p className="text-base font-extrabold text-[var(--color-primary)] mt-1">
                {currencySymbol} {item.salePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-[var(--color-on-surface-variant)]">per {item.unit}</p>
            </div>

            <div className="p-3.5 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)]">
              <p className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Opening / Cost Rate</p>
              <p className="text-base font-extrabold text-[var(--color-on-surface)] mt-1">
                {costPrice > 0
                  ? `${currencySymbol} ${costPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                  : '—'}
              </p>
              <p className="text-[10px] text-[var(--color-on-surface-variant)]">per {item.unit}</p>
            </div>

            <div className="p-3.5 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)]">
              <p className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Unit Margin</p>
              <p
                className={`text-base font-extrabold mt-1 ${
                  grossProfitMarginPct >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'
                }`}
              >
                {costPrice > 0 ? `${grossProfitMarginPct.toFixed(1)}%` : '—'}
              </p>
              <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                {costPrice > 0
                  ? `${currencySymbol} ${grossProfitPerUnit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                  : 'Cost not configured'}
              </p>
            </div>

            <div className="p-3.5 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)]">
              <p className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">GST Tax Slab</p>
              <p className="text-base font-extrabold text-[var(--color-warning)] mt-1">
                {item.taxRateGst}%
              </p>
              <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                {item.hsnSacCode ? `${item.type === 'product' ? 'HSN' : 'SAC'}: ${item.hsnSacCode}` : 'Standard'}
              </p>
            </div>
          </div>

          {/* Opening Stock & Inventory Settings Display */}
          {item.type === 'product' && (
            <div className="p-4 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)] space-y-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-primary)] flex items-center justify-center font-bold shrink-0">
                    <Warehouse className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[var(--color-on-surface)]">Inventory & Total Stock</h4>
                    <p className="text-[11px] text-[var(--color-on-surface-variant)]">
                      Total Aggregate Stock: <strong className="text-[var(--color-on-surface)]">{(item.currentStock || 0).toLocaleString('en-IN')} {item.unit}</strong>
                    </p>
                  </div>
                </div>
                {item.openingStock !== undefined && item.openingStock > 0 && (
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase">Total Opening</span>
                    <p className="text-xs font-black text-[var(--color-primary)]">
                      {item.openingStock.toLocaleString('en-IN')} {item.unit}
                    </p>
                    {item.openingStockPrice && item.openingStockPrice > 0 && (
                      <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                        @ {currencySymbol} {item.openingStockPrice.toLocaleString('en-IN')}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Multi-Location Breakdown Cards */}
              {(() => {
                const rawDetailLocs = item.locations && item.locations.length > 0
                  ? item.locations
                  : (item.stockLocation
                      ? item.stockLocation.split(',').map((s, idx) => ({
                          locationName: s.trim(),
                          currentStock: idx === 0 ? Number(item.currentStock) || 0 : 0,
                          openingStock: idx === 0 ? Number(item.openingStock) || 0 : 0,
                        }))
                      : []);
                const seenDetailLocs = new Set<string>();
                const itemLocations = rawDetailLocs.filter((l) => {
                  const n = l.locationName?.trim();
                  if (!n || seenDetailLocs.has(n.toLowerCase())) return false;
                  seenDetailLocs.add(n.toLowerCase());
                  return true;
                });

                if (itemLocations.length === 0) return null;

                return (
                  <div className="pt-2 border-t border-[var(--color-outline-variant)] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                        Storage Locations Breakdown ({itemLocations.length})
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {itemLocations.map((loc, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 bg-[var(--color-surface-container-lowest)] rounded-xl border border-[var(--color-outline-variant)] flex items-center justify-between text-xs"
                        >
                          <div className="min-w-0 pr-2">
                            <p className="font-bold text-[var(--color-on-surface)] truncate">{loc.locationName}</p>
                            <div className="flex items-center gap-2 text-[10px] text-[var(--color-on-surface-variant)] flex-wrap">
                              {loc.openingStock !== undefined && loc.openingStock > 0 && (
                                <span>Opening: {Number(loc.openingStock).toLocaleString('en-IN')} {item.unit}</span>
                              )}
                              {loc.minStockLevel !== undefined && loc.minStockLevel > 0 && (
                                <span>Safety: {Number(loc.minStockLevel).toLocaleString('en-IN')} {item.unit}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-extrabold text-[var(--color-primary)] text-xs block">
                              {Number(loc.currentStock || 0).toLocaleString('en-IN')} {item.unit}
                            </span>
                            {item.currentStock && item.currentStock > 0 ? (
                              <span className="text-[9px] text-[var(--color-outline)] font-medium">
                                {Math.round(((loc.currentStock || 0) / item.currentStock) * 100)}% of total
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="pt-2 border-t border-[var(--color-outline-variant)] flex items-center gap-4 text-[11px] text-[var(--color-on-surface-variant)] flex-wrap">
                <span><strong className="text-[var(--color-on-surface)]">Min Alert Level:</strong> {item.minStockLevel || 0} {item.unit}</span>
                {item.maxCapacity ? (
                  <span><strong className="text-[var(--color-on-surface)]">Max Capacity:</strong> {item.maxCapacity} {item.unit}</span>
                ) : null}
                {item.openingStockDate && (
                  <span><strong className="text-[var(--color-on-surface)]">Audit Date:</strong> {new Date(item.openingStockDate).toLocaleDateString('en-IN')}</span>
                )}
              </div>
            </div>
          )}

          {/* Technical Specifications */}
          {item.technicalSpecs && (
            <div className="p-4 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)] space-y-1.5">
              <h4 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                Technical Specifications & Mix Compliance
              </h4>
              <p className="text-xs text-[var(--color-on-surface)] leading-relaxed whitespace-pre-line">
                {item.technicalSpecs}
              </p>
            </div>
          )}

          {/* Remarks & Handling Notes */}
          {item.remarks && (
            <div className="p-4 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)] space-y-1.5">
              <h4 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[var(--color-warning)]" />
                Remarks, Delivery & Operational Notes
              </h4>
              <p className="text-xs text-[var(--color-on-surface-variant)] leading-relaxed whitespace-pre-line">
                {item.remarks}
              </p>
            </div>
          )}

          {/* Stock Movements Ledger */}
          {item.type === 'product' && item.movements && item.movements.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Warehouse className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  Recent Material Movements
                </div>
                <span className="text-[10px] text-[var(--color-on-surface-variant)] font-normal lowercase bg-[var(--color-surface-container-high)] px-2 py-0.5 rounded-full">
                  latest first
                </span>
              </h4>
              <div className="rounded-2xl border border-[var(--color-outline-variant)] overflow-hidden bg-[var(--color-surface-container-lowest)]">
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--color-surface-container)] sticky top-0 border-b border-[var(--color-outline-variant)]">
                      <tr>
                        <th className="px-4 py-2 font-bold text-[var(--color-on-surface-variant)]">Date & Ref</th>
                        <th className="px-4 py-2 font-bold text-[var(--color-on-surface-variant)]">Type / Source</th>
                        <th className="px-4 py-2 font-bold text-[var(--color-on-surface-variant)] text-right">In / Out</th>
                        <th className="px-4 py-2 font-bold text-[var(--color-on-surface-variant)] text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-outline-variant)]">
                      {item.movements.map((mov) => {
                        const isAddition = mov.quantity > 0;
                        const isDeduction = mov.quantity < 0;
                        
                        return (
                          <tr key={mov.id} className="hover:bg-[var(--color-surface-container)]/60">
                            <td className="px-4 py-2.5">
                              <div className="font-medium text-[var(--color-on-surface)]">
                                {new Date(mov.date).toLocaleDateString('en-IN')}
                              </div>
                              {mov.referenceNumber && (
                                <div className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">
                                  Ref: {mov.referenceNumber}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="font-medium capitalize text-[var(--color-on-surface)]">
                                {mov.type.replace('_', ' ')}
                              </div>
                              {(mov.sourcePartyOrBatch || mov.notes) && (
                                <div className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5 max-w-[200px] truncate" title={mov.notes}>
                                  {mov.sourcePartyOrBatch || mov.notes}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right font-medium">
                              <span className={isAddition ? 'text-[var(--color-success)]' : isDeduction ? 'text-[var(--color-error)]' : 'text-[var(--color-on-surface-variant)]'}>
                                {isAddition ? '+' : ''}{mov.quantity.toLocaleString('en-IN')} {item.unit}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold text-[var(--color-on-surface)]">
                              {mov.balanceAfter.toLocaleString('en-IN')} {item.unit}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Meta dates */}
          <div className="flex items-center justify-between text-[11px] text-[var(--color-outline)] pt-2 border-t border-[var(--color-outline-variant)]">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Created: {new Date(item.createdAt).toLocaleDateString('en-IN')}
            </span>
            <span>
              Updated: {new Date(item.updatedAt).toLocaleDateString('en-IN')}
            </span>
          </div>

          {/* Documents (S3 upload feature) — uploads link to the item
              immediately, even while this modal is open */}
          <EntityDocumentsSection feature="item" entityId={item.id} />
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] flex items-center justify-end">
          

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)] font-medium text-xs rounded-full transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => onEdit(item)}
              className="flex items-center gap-1.5 px-5 py-2 bg-[var(--color-primary)] hover:opacity-95 text-[var(--color-on-primary)] font-medium text-xs rounded-full shadow-xs transition-all hover:scale-[1.01]"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Edit Item
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
