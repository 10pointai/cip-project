import React, { useState, useMemo } from 'react';
import {
  Package,
  Wrench,
  Plus,
  Search,
  Layers,
  Scale,
  Warehouse,
  IndianRupee,
  Edit2,
  Trash2,
  Eye,
  FileSpreadsheet,
  Printer,
  ChevronRight,
  CheckCircle2,
  Info,
  LayoutGrid,
  List as ListIcon,
  ArrowUpDown,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  SlidersHorizontal,
  Calendar,
  Filter,
  FileText,
  AlertCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import {
  Item,
  ItemCategory,
  ItemUnit,
  ItemLocation,
  ItemType,
  CompanySettings,
  ItemStockAdjustment,
} from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';
import { ItemFormModal } from './ItemFormModal';
import { CategoryManagerModal } from './CategoryManagerModal';
import { UnitManagerModal } from './UnitManagerModal';
import { LocationManagerModal } from './LocationManagerModal';
import { ItemDetailModal } from './ItemDetailModal';
import { StockAdjustmentModal } from './StockAdjustmentModal';

interface ItemsViewProps {
  items: Item[];
  categories: ItemCategory[];
  units: ItemUnit[];
  locations: ItemLocation[];
  settings: CompanySettings;
  stockAdjustments?: ItemStockAdjustment[];
  onNavigateToInventory?: () => void;
  onRefresh?: () => void;
}

export const ItemsView: React.FC<ItemsViewProps> = ({
  items,
  categories,
  units,
  locations,
  settings,
  stockAdjustments: propAdjustments,
  onNavigateToInventory,
}) => {
  const currencySymbol = settings.currencySymbol || '₹';

  // Active top-level subtab: 'catalog' vs 'adjustments'
  const [activeSubTab, setActiveSubTab] = useState<'catalog' | 'adjustments'>('catalog');

  // Fallback to localDb if prop not passed
  const stockAdjustments = useMemo(() => {
    return propAdjustments || localDb.getStockAdjustments();
  }, [propAdjustments]);

  // Filters and search state for Catalog
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'product' | 'service'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'price_desc' | 'price_asc' | 'code' | 'stock_desc'>('recent');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Filters for Stock Adjustments Tab
  const [adjSearchQuery, setAdjSearchQuery] = useState('');
  const [adjTypeFilter, setAdjTypeFilter] = useState<'all' | 'increase' | 'decrease'>('all');
  const [adjItemFilter, setAdjItemFilter] = useState<string>('all');
  const [adjSortBy, setAdjSortBy] = useState<'recent' | 'oldest' | 'qty_desc' | 'val_desc'>('recent');

  // Modals state
  const [isItemFormOpen, setIsItemFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
  const [isUnitsOpen, setIsUnitsOpen] = useState(false);
  const [isLocationsOpen, setIsLocationsOpen] = useState(false);
  const [viewingItem, setViewingItem] = useState<Item | null>(null);
  const [isStockAdjustmentModalOpen, setIsStockAdjustmentModalOpen] = useState(false);
  const [adjustmentTargetItemId, setAdjustmentTargetItemId] = useState<string | undefined>(undefined);

  React.useEffect(() => {
    const handleHeaderAction = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail === 'add-item') {
        setEditingItem(null);
        setIsItemFormOpen(true);
      } else if (customEvent.detail === 'manage-categories') {
        setIsCategoriesOpen(true);
      } else if (customEvent.detail === 'manage-units') {
        setIsUnitsOpen(true);
      } else if (customEvent.detail === 'manage-locations') {
        setIsLocationsOpen(true);
      } else if (customEvent.detail === 'adjust-stock') {
        setAdjustmentTargetItemId(undefined);
        setIsStockAdjustmentModalOpen(true);
      }
    };
    window.addEventListener('app-header-action', handleHeaderAction);
    return () => window.removeEventListener('app-header-action', handleHeaderAction);
  }, []);

  // Quick stats calculations for Catalog
  const catalogStats = useMemo(() => {
    const products = items.filter((i) => i.type === 'product');
    const services = items.filter((i) => i.type === 'service');
    const totalInventoryValue = products.reduce((acc, itm) => {
      const rate = itm.openingStockPrice || itm.purchasePrice || itm.salePrice || 0;
      return acc + (itm.currentStock || 0) * rate;
    }, 0);

    return {
      totalItems: items.length,
      totalProducts: products.length,
      totalServices: services.length,
      categoriesCount: categories.length,
      unitsCount: units.length,
      totalInventoryValue,
    };
  }, [items, categories, units]);

  // Quick stats calculations for Stock Adjustments
  const adjustmentStats = useMemo(() => {
    const increases = stockAdjustments.filter((a) => a.type === 'increase');
    const decreases = stockAdjustments.filter((a) => a.type === 'decrease');

    const totalAddedQty = increases.reduce((sum, a) => sum + (a.quantity || 0), 0);
    const totalReducedQty = decreases.reduce((sum, a) => sum + (a.quantity || 0), 0);
    const totalAddedValue = increases.reduce((sum, a) => sum + (a.totalValue || (a.quantity * (a.rate || 0))), 0);
    const totalReducedValue = decreases.reduce((sum, a) => sum + (a.totalValue || (a.quantity * (a.rate || 0))), 0);
    const netValueImpact = totalAddedValue - totalReducedValue;

    return {
      totalCount: stockAdjustments.length,
      increaseCount: increases.length,
      decreaseCount: decreases.length,
      totalAddedQty,
      totalReducedQty,
      totalAddedValue,
      totalReducedValue,
      netValueImpact,
    };
  }, [stockAdjustments]);

  // Filtered & Sorted Catalog items
  const filteredItems = useMemo(() => {
    return items
      .filter((item) => {
        // Search filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = item.name.toLowerCase().includes(q);
          const matchCode = item.code.toLowerCase().includes(q);
          const matchHsn = item.hsnSacCode?.toLowerCase().includes(q) || false;
          const matchCat = item.categoryName?.toLowerCase().includes(q) || false;
          const matchSpecs = item.technicalSpecs?.toLowerCase().includes(q) || false;
          const matchRemarks = item.remarks?.toLowerCase().includes(q) || false;
          if (!matchName && !matchCode && !matchHsn && !matchCat && !matchSpecs && !matchRemarks) {
            return false;
          }
        }

        // Type filter
        if (typeFilter === 'product' && item.type !== 'product') return false;
        if (typeFilter === 'service' && item.type !== 'service') return false;

        // Category filter
        if (categoryFilter !== 'all' && item.categoryId !== categoryFilter) {
          return false;
        }

        // Location filter
        if (locationFilter !== 'all') {
          const matchLoc =
            item.locations?.some((l) => l.locationName.toLowerCase().trim() === locationFilter.toLowerCase().trim()) ||
            item.stockLocations?.some((l) => l.toLowerCase().trim() === locationFilter.toLowerCase().trim()) ||
            (item.stockLocation && item.stockLocation.toLowerCase().includes(locationFilter.toLowerCase().trim()));
          if (!matchLoc) return false;
        }

        // Status filter
        if (statusFilter === 'active' && !item.isActive) return false;
        if (statusFilter === 'inactive' && item.isActive) return false;

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') {
          return a.name.localeCompare(b.name);
        }
        if (sortBy === 'code') {
          return a.code.localeCompare(b.code);
        }
        if (sortBy === 'price_asc') {
          return a.salePrice - b.salePrice;
        }
        if (sortBy === 'price_desc') {
          return b.salePrice - a.salePrice;
        }
        if (sortBy === 'stock_desc') {
          return (b.currentStock || 0) - (a.currentStock || 0);
        }
        // Recent
        return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
      });
  }, [items, searchQuery, typeFilter, categoryFilter, locationFilter, statusFilter, sortBy]);

  // Filtered & Sorted Stock Adjustments
  const filteredAdjustments = useMemo(() => {
    return stockAdjustments
      .filter((adj) => {
        if (adjSearchQuery.trim()) {
          const q = adjSearchQuery.toLowerCase().trim();
          const matchName = adj.itemName?.toLowerCase().includes(q) || false;
          const matchCode = adj.itemCode?.toLowerCase().includes(q) || false;
          const matchNum = adj.adjustmentNumber?.toLowerCase().includes(q) || false;
          const matchReason = adj.reason?.toLowerCase().includes(q) || false;
          const matchRef = adj.referenceNumber?.toLowerCase().includes(q) || false;
          const matchNotes = adj.notes?.toLowerCase().includes(q) || false;
          const matchLoc = adj.location?.toLowerCase().includes(q) || false;
          if (!matchName && !matchCode && !matchNum && !matchReason && !matchRef && !matchNotes && !matchLoc) {
            return false;
          }
        }

        if (adjTypeFilter !== 'all' && adj.type !== adjTypeFilter) {
          return false;
        }

        if (adjItemFilter !== 'all' && adj.itemId !== adjItemFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (adjSortBy === 'oldest') {
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        }
        if (adjSortBy === 'qty_desc') {
          return (b.quantity || 0) - (a.quantity || 0);
        }
        if (adjSortBy === 'val_desc') {
          const valB = b.totalValue || (b.quantity * (b.rate || 0));
          const valA = a.totalValue || (a.quantity * (a.rate || 0));
          return valB - valA;
        }
        // Recent
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
  }, [stockAdjustments, adjSearchQuery, adjTypeFilter, adjItemFilter, adjSortBy]);

  // Handlers
  const handleOpenAdd = () => {
    setEditingItem(null);
    setIsItemFormOpen(true);
  };

  const handleEdit = (item: Item) => {
    setEditingItem(item);
    setIsItemFormOpen(true);
  };

  const handleDelete = (item: Item) => {
    if (
      window.confirm(
        `Are you sure you want to delete "${item.name}" (${item.code}) from your master catalog?`
      )
    ) {
      localDb.deleteItem(item.id);
      if (viewingItem?.id === item.id) {
        setViewingItem(null);
      }
    }
  };

  const handleOpenAdjustmentModal = (itemId?: string) => {
    setAdjustmentTargetItemId(itemId);
    setIsStockAdjustmentModalOpen(true);
  };

  const handleStockAdjustmentSubmit = (
    adjData: Omit<ItemStockAdjustment, 'id' | 'createdAt' | 'adjustmentNumber' | 'previousStock' | 'newStock' | 'totalValue'>
  ) => {
    localDb.createStockAdjustment(adjData);
    setIsStockAdjustmentModalOpen(false);
  };

  const handleDeleteAdjustment = (adj: ItemStockAdjustment) => {
    if (
      window.confirm(
        `Are you sure you want to delete and revert stock adjustment ${adj.adjustmentNumber || ''} for "${adj.itemName}"? This will undo the stock change.`
      )
    ) {
      localDb.deleteStockAdjustment(adj.id);
    }
  };

  const handleExportCSV = () => {
    if (activeSubTab === 'catalog') {
      const headers = [
        'Item Code',
        'Name',
        'Type',
        'Category',
        'Unit',
        'Opening Stock',
        'Opening Cost Price',
        'Current Stock',
        'HSN/SAC Code',
        'GST Slab Rate (%)',
        'Selling Price',
        'Technical Specs',
        'Remarks',
        'Status',
      ];

      const rows = filteredItems.map((i) => [
        `"${i.code}"`,
        `"${i.name.replace(/"/g, '""')}"`,
        `"${i.type}"`,
        `"${i.categoryName || 'General'}"`,
        `"${i.unit}"`,
        i.openingStock || 0,
        i.openingStockPrice || 0,
        i.currentStock || 0,
        `"${i.hsnSacCode || ''}"`,
        i.taxRateGst,
        i.salePrice,
        `"${(i.technicalSpecs || '').replace(/"/g, '""')}"`,
        `"${(i.remarks || '').replace(/"/g, '""')}"`,
        i.isActive ? 'Active' : 'Inactive',
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Master_Items_Catalog_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const headers = [
        'Adjustment Voucher #',
        'Date',
        'Item SKU',
        'Item Name',
        'Type',
        'Adjusted Quantity',
        'Unit',
        'Valuation Rate',
        'Total Adjustment Value',
        'Previous Stock',
        'New Stock',
        'Location',
        'Reason',
        'Reference Slip #',
        'Remarks',
      ];

      const rows = filteredAdjustments.map((a) => [
        `"${a.adjustmentNumber || ''}"`,
        `"${a.date}"`,
        `"${a.itemCode || ''}"`,
        `"${(a.itemName || '').replace(/"/g, '""')}"`,
        `"${a.type.toUpperCase()}"`,
        a.quantity || 0,
        `"${a.unit || ''}"`,
        a.rate || 0,
        a.totalValue || (a.quantity * (a.rate || 0)),
        a.previousStock || 0,
        a.newStock || 0,
        `"${(a.location || '').replace(/"/g, '""')}"`,
        `"${(a.reason || '').replace(/"/g, '""')}"`,
        `"${(a.referenceNumber || '').replace(/"/g, '""')}"`,
        `"${(a.notes || '').replace(/"/g, '""')}"`,
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Stock_Adjustments_Ledger_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header & Navigation Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--color-outline-variant)] pb-4">
        {/* Subtab Segmented Switcher */}
        <div className="flex items-center gap-2 bg-[var(--color-surface-container)] p-1 rounded-full border border-[var(--color-outline-variant)]">
          <button
            type="button"
            onClick={() => setActiveSubTab('catalog')}
            className={`flex items-center gap-2 px-5 py-2 rounded-full font-bold text-xs transition-all ${
              activeSubTab === 'catalog'
                ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-xs'
                : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Master Catalog</span>
            <span
              className={`px-2 py-0.2 rounded-full text-[10px] font-extrabold ${
                activeSubTab === 'catalog'
                  ? 'bg-white/20 text-white'
                  : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'
              }`}
            >
              {items.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('adjustments')}
            className={`flex items-center gap-2 px-5 py-2 rounded-full font-bold text-xs transition-all ${
              activeSubTab === 'adjustments'
                ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-xs'
                : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Stock Adjustments</span>
            <span
              className={`px-2 py-0.2 rounded-full text-[10px] font-extrabold ${
                activeSubTab === 'adjustments'
                  ? 'bg-white/20 text-white'
                  : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'
              }`}
            >
              {stockAdjustments.length}
            </span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {onNavigateToInventory && (
            <button
              type="button"
              onClick={onNavigateToInventory}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--color-primary-container)]/40 border border-[var(--color-primary-container)] hover:bg-[var(--color-primary-container)]/70 text-[var(--color-primary)] font-bold text-xs rounded-full shadow-xs transition-colors"
            >
              <Warehouse className="w-3.5 h-3.5" />
              <span>Stockyard View</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          )}

          {/* Quick Adjust Stock Button */}
          <button
            type="button"
            onClick={() => handleOpenAdjustmentModal()}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container)] text-[var(--color-on-surface)] font-bold text-xs rounded-full shadow-xs transition-colors hover:border-[var(--color-primary)]/50"
            title="Adjust Material Stock (Wastage / Audit / Correction)"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--color-primary)]" />
            <span>Adjust Stock</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCategoriesOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container)] text-[var(--color-on-surface)] font-semibold text-xs rounded-full shadow-xs transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-[var(--color-primary)]" />
            Categories ({categories.length})
          </button>

          <button
            type="button"
            onClick={() => setIsUnitsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container)] text-[var(--color-on-surface)] font-semibold text-xs rounded-full shadow-xs transition-colors"
          >
            <Scale className="w-3.5 h-3.5 text-[var(--color-success)]" />
            Units ({units.length})
          </button>

          <button
            type="button"
            onClick={() => setIsLocationsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container)] text-[var(--color-on-surface)] font-semibold text-xs rounded-full shadow-xs transition-colors"
          >
            <Warehouse className="w-3.5 h-3.5 text-[var(--color-error)]" />
            Locations ({locations.length})
          </button>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-[var(--color-primary)] hover:opacity-95 text-[var(--color-on-primary)] font-bold text-xs rounded-full shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            Add Master Item
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: MASTER ITEMS CATALOG                                              */}
      {/* ========================================================================= */}
      {activeSubTab === 'catalog' && (
        <div className="space-y-6">
          {/* KPI Overview Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Total Catalog Items */}
            <div className="p-4 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                  Master Catalog
                </span>
                <div className="w-8 h-8 rounded-xl bg-[var(--color-primary-container)] text-[var(--color-primary)] flex items-center justify-center font-bold">
                  <Package className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-[var(--color-on-surface)] mt-2">{catalogStats.totalItems}</p>
              <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                Active billable items & services
              </p>
            </div>

            {/* Products Card */}
            <div
              onClick={() => setTypeFilter(typeFilter === 'product' ? 'all' : 'product')}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                typeFilter === 'product'
                  ? 'bg-[var(--color-primary-container)]/30 border-[var(--color-primary)]'
                  : 'bg-[var(--color-surface-container-lowest)] border-[var(--color-outline-variant)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                  Physical Products
                </span>
                <div className="w-8 h-8 rounded-xl bg-[var(--color-surface-container-high)] text-[var(--color-primary)] flex items-center justify-center font-bold">
                  <Warehouse className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-[var(--color-on-surface)] mt-2">{catalogStats.totalProducts}</p>
              <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                Asphalt mixes, Bitumen, Aggregates
              </p>
            </div>

            {/* Services Card */}
            <div
              onClick={() => setTypeFilter(typeFilter === 'service' ? 'all' : 'service')}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                typeFilter === 'service'
                  ? 'bg-[var(--color-success-container)]/40 border-[var(--color-success)]'
                  : 'bg-[var(--color-surface-container-lowest)] border-[var(--color-outline-variant)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                  Equipment & Services
                </span>
                <div className="w-8 h-8 rounded-xl bg-[var(--color-success-container)] text-[var(--color-success)] flex items-center justify-center font-bold">
                  <Wrench className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-[var(--color-on-surface)] mt-2">{catalogStats.totalServices}</p>
              <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                Paver hire, haulage, core testing
              </p>
            </div>

            {/* Inventory Valuation */}
            <div className="p-4 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                  Stock Valuation
                </span>
                <div className="w-8 h-8 rounded-xl bg-[var(--color-surface-container)] text-[var(--color-primary)] flex items-center justify-center font-bold">
                  <IndianRupee className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-[var(--color-primary)] mt-2">
                {currencySymbol} {catalogStats.totalInventoryValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
              <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                Valued by opening / cost rate
              </p>
            </div>
          </div>

          {/* Filter and Search Bar */}
          <div className="p-4 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] shadow-xs space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Search Input */}
              <div className="relative flex-1 max-w-lg">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-outline)]" />
                <input
                  type="text"
                  placeholder="Search by product name, SKU code, HSN/SAC, specs, or remarks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-outline)] hover:text-[var(--color-on-surface)]"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Controls: Category, Sort & View toggle */}
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-3 py-1.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-semibold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                >
                  <option value="all">All Categories ({categories.length})</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                {/* Location Filter Dropdown */}
                <select
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="px-3 py-1.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-semibold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                >
                  <option value="all">All Locations ({locations.length})</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.name}>
                      {loc.name}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-1 bg-[var(--color-surface-container)] px-3 py-1.5 rounded-full border border-[var(--color-outline-variant)]">
                  <ArrowUpDown className="w-3 h-3 text-[var(--color-outline)]" />
                  <select
                    value={sortBy}
                    onChange={(e: any) => setSortBy(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-[var(--color-on-surface)] focus:outline-none"
                  >
                    <option value="recent">Recently Added</option>
                    <option value="name">Name (A-Z)</option>
                    <option value="code">SKU Code</option>
                    <option value="stock_desc">Highest Stock</option>
                    <option value="price_desc">Price: High to Low</option>
                    <option value="price_asc">Price: Low to High</option>
                  </select>
                </div>

                <div className="flex items-center bg-[var(--color-surface-container)] p-0.5 rounded-full border border-[var(--color-outline-variant)]">
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`p-1.5 rounded-full transition-colors ${
                      viewMode === 'table'
                        ? 'bg-[var(--color-surface-container-lowest)] text-[var(--color-primary)] shadow-xs'
                        : 'text-[var(--color-outline)] hover:text-[var(--color-on-surface)]'
                    }`}
                    title="Table View"
                  >
                    <ListIcon className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('cards')}
                    className={`p-1.5 rounded-full transition-colors ${
                      viewMode === 'cards'
                        ? 'bg-[var(--color-surface-container-lowest)] text-[var(--color-primary)] shadow-xs'
                        : 'text-[var(--color-outline)] hover:text-[var(--color-on-surface)]'
                    }`}
                    title="Cards View"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="p-2 text-[var(--color-on-surface-variant)] hover:text-[var(--color-primary)] hover:bg-[var(--color-surface-container)] rounded-full transition-colors border border-[var(--color-outline-variant)]"
                    title="Export Catalog CSV"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="p-2 text-[var(--color-on-surface-variant)] hover:text-[var(--color-primary)] hover:bg-[var(--color-surface-container)] rounded-full transition-colors border border-[var(--color-outline-variant)]"
                    title="Print Catalog"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Filter Pill Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                className={`px-3 py-1 rounded-full font-bold whitespace-nowrap transition-colors ${
                  typeFilter === 'all'
                    ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                    : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)]'
                }`}
              >
                All Items ({items.length})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('product')}
                className={`px-3 py-1 rounded-full font-bold whitespace-nowrap flex items-center gap-1 transition-colors ${
                  typeFilter === 'product'
                    ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                    : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)]'
                }`}
              >
                <Package className="w-3 h-3" />
                Products ({catalogStats.totalProducts})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('service')}
                className={`px-3 py-1 rounded-full font-bold whitespace-nowrap flex items-center gap-1 transition-colors ${
                  typeFilter === 'service'
                    ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                    : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)]'
                }`}
              >
                <Wrench className="w-3 h-3" />
                Services ({catalogStats.totalServices})
              </button>
            </div>
          </div>

          {/* Item List Rendering (Table vs Cards) */}
          {filteredItems.length === 0 ? (
            <div className="bg-[var(--color-surface-container-lowest)] rounded-[28px] border border-[var(--color-outline-variant)] p-12 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-[var(--color-surface-container)] text-[var(--color-outline)] flex items-center justify-center mx-auto">
                <Package className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[var(--color-on-surface)]">No matching items found</h3>
                <p className="text-xs text-[var(--color-on-surface-variant)] max-w-md mx-auto mt-1">
                  Try adjusting your search keywords, clearing filters, or adding a new asphalt mix, raw material, or contracted service.
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenAdd}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-[var(--color-primary)] hover:opacity-95 text-[var(--color-on-primary)] font-bold text-xs rounded-full shadow-xs transition-all"
              >
                <Plus className="w-4 h-4" />
                Add First Item
              </button>
            </div>
          ) : viewMode === 'table' ? (
            /* Tabular Layout */
            <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs min-w-[980px]">
                  <thead>
                    <tr className="border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3.5 px-4 min-w-[240px]">Item Details & SKU</th>
                      <th className="py-3.5 px-3">Type & Category</th>
                      <th className="py-3.5 px-3 text-right">Opening Stock</th>
                      <th className="py-3.5 px-3 text-right">Current Stock</th>
                      <th className="py-3.5 px-3">HSN / SAC</th>
                      <th className="py-3.5 px-3 text-right">Selling Rate</th>
                      <th className="py-3.5 px-3 text-right">Opening / Cost Rate</th>
                      <th className="py-3.5 px-3 text-center">GST Slab</th>
                      <th className="py-3.5 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-outline-variant)]">
                    {filteredItems.map((item) => {
                      const category = categories.find((c) => c.id === item.categoryId);
                      const costRate = item.openingStockPrice || item.purchasePrice || 0;
                      const rawLocs = item.type === 'product'
                        ? (item.locations && item.locations.length > 0
                            ? item.locations
                            : item.stockLocation
                              ? item.stockLocation.split(',').map((s, idx) => ({
                                  locationName: s.trim(),
                                  currentStock: idx === 0 ? Number(item.currentStock) || 0 : 0,
                                }))
                              : [])
                        : [];
                      const seenTableLocs = new Set<string>();
                      const itemLocs = rawLocs.filter((l) => {
                        const n = l.locationName?.trim();
                        if (!n || seenTableLocs.has(n.toLowerCase())) return false;
                        seenTableLocs.add(n.toLowerCase());
                        return true;
                      });

                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-[var(--color-surface-container)]/60 transition-colors group cursor-pointer"
                          onClick={() => setViewingItem(item)}
                        >
                          {/* Name & Code */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div
                                className="w-8 h-8 rounded-xl flex items-center justify-center font-bold shrink-0"
                                style={{
                                  backgroundColor: `${category?.color || '#005ac1'}15`,
                                  color: category?.color || '#005ac1',
                                }}
                              >
                                {item.type === 'product' ? (
                                  <Package className="w-4 h-4" />
                                ) : (
                                  <Wrench className="w-4 h-4" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-[var(--color-on-surface)] group-hover:text-[var(--color-primary)] transition-colors">
                                    {item.name}
                                  </span>
                                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]">
                                    {item.code}
                                  </span>
                                  {!item.isActive && (
                                    <span className="px-1.5 py-0.2 text-[9px] font-bold bg-[var(--color-error-container)] text-[var(--color-error)] rounded-full">
                                      Inactive
                                    </span>
                                  )}
                                </div>
                                {item.remarks && (
                                  <p className="text-[10px] text-[var(--color-outline)] truncate max-w-sm mt-0.5">
                                    {item.remarks}
                                  </p>
                                )}
                                {item.type === 'product' && itemLocs.length > 0 && (
                                  <div className="flex items-center gap-1 flex-wrap mt-1.5">
                                    {itemLocs.map((loc, lIdx) => (
                                      <span
                                        key={lIdx}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--color-surface-container)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)] shadow-2xs"
                                        title={`${loc.locationName}: ${(loc.currentStock || 0).toLocaleString('en-IN')} ${item.unit}`}
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] shrink-0" />
                                        <span className="font-medium text-[var(--color-on-surface-variant)]">{loc.locationName}:</span>
                                        <span className="font-bold text-[var(--color-primary)]">
                                          {(loc.currentStock || 0).toLocaleString('en-IN')} {item.unit}
                                        </span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Category & Type */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white whitespace-nowrap shadow-2xs"
                                style={{ backgroundColor: category?.color || '#005ac1' }}
                              >
                                {item.categoryName || category?.name || 'General'}
                              </span>
                            </div>
                          </td>

                          {/* Opening Stock */}
                          <td className="py-3 px-3 text-right">
                            {item.type === 'product' ? (
                              <>
                                <p className="font-semibold text-[var(--color-on-surface-variant)]">
                                  {(item.openingStock || 0).toLocaleString('en-IN')}
                                </p>
                                <p className="text-[10px] text-[var(--color-outline)]">{item.unit}</p>
                              </>
                            ) : (
                              <span className="text-xs text-[var(--color-outline)]">—</span>
                            )}
                          </td>

                          {/* Current Stock */}
                          <td className="py-3 px-3 text-right">
                            {item.type === 'product' ? (
                              <div>
                                <div className="flex items-baseline justify-end gap-1">
                                  <span className="font-bold text-sm text-[var(--color-on-surface)]">
                                    {(item.currentStock || 0).toLocaleString('en-IN')}
                                  </span>
                                  <span className="text-[10px] text-[var(--color-outline)] font-bold">{item.unit}</span>
                                </div>
                                {itemLocs.length > 0 && (
                                  <div className="mt-1 space-y-0.5">
                                    {itemLocs.map((loc, lIdx) => (
                                      <div key={lIdx} className="text-[10px] flex items-center justify-end gap-1 font-medium">
                                        <span className="text-[var(--color-outline)] truncate max-w-[100px]">{loc.locationName}:</span>
                                        <span className="font-bold text-[var(--color-primary)]">
                                          {(loc.currentStock || 0).toLocaleString('en-IN')} {item.unit}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-[var(--color-outline)]">—</span>
                            )}
                          </td>

                          {/* HSN / SAC Code */}
                          <td className="py-3 px-3">
                            <span className="font-mono text-xs text-[var(--color-on-surface-variant)] font-semibold">
                              {item.hsnSacCode || '—'}
                            </span>
                          </td>

                          {/* Selling Price */}
                          <td className="py-3 px-3 text-right">
                            <p className="font-bold text-[var(--color-primary)]">
                              {currencySymbol} {item.salePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </p>
                            <p className="text-[10px] text-[var(--color-outline)]">per {item.unit}</p>
                          </td>

                          {/* Opening / Cost Rate */}
                          <td className="py-3 px-3 text-right">
                            <p className="font-semibold text-[var(--color-on-surface-variant)]">
                              {costRate > 0
                                ? `${currencySymbol} ${costRate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                                : '—'}
                            </p>
                            {costRate > 0 && (
                              <p className="text-[10px] text-[var(--color-outline)]">per {item.unit}</p>
                            )}
                          </td>

                          {/* GST */}
                          <td className="py-3 px-3 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--color-surface-container)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)]">
                              {item.taxRateGst}%
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                            
                              <button
                                type="button"
                                onClick={() => handleEdit(item)}
                                className="p-1.5 text-[var(--color-on-surface-variant)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-container)] rounded-full transition-colors"
                                title="Edit Item"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(item)}
                                className="p-1.5 text-[var(--color-on-surface-variant)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-container)] rounded-full transition-colors"
                                title="Delete Item"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Bento Grid / Card Layout */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredItems.map((item) => {
                const category = categories.find((c) => c.id === item.categoryId);
                const costRate = item.openingStockPrice || item.purchasePrice || 0;
                const rawCardLocs = item.type === 'product'
                  ? (item.locations && item.locations.length > 0
                      ? item.locations
                      : item.stockLocation
                        ? item.stockLocation.split(',').map((s, idx) => ({
                            locationName: s.trim(),
                            currentStock: idx === 0 ? Number(item.currentStock) || 0 : 0,
                          }))
                        : [])
                  : [];
                const seenCardLocs = new Set<string>();
                const itemLocs = rawCardLocs.filter((l) => {
                  const n = l.locationName?.trim();
                  if (!n || seenCardLocs.has(n.toLowerCase())) return false;
                  seenCardLocs.add(n.toLowerCase());
                  return true;
                });

                return (
                  <div
                    key={item.id}
                    onClick={() => setViewingItem(item)}
                    className="p-4 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] shadow-xs hover:shadow-md transition-all hover:border-[var(--color-primary)]/40 cursor-pointer flex flex-col justify-between space-y-3"
                  >
                    {/* Card Top */}
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center font-bold shrink-0 text-white"
                            style={{ backgroundColor: category?.color || '#005ac1' }}
                          >
                            {item.type === 'product' ? (
                              <Package className="w-4 h-4" />
                            ) : (
                              <Wrench className="w-4 h-4" />
                            )}
                          </div>
                          <div>
                            <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]">
                              {item.code}
                            </span>
                            <span
                              className="ml-1.5 px-2 py-0.2 rounded-full text-[9px] font-bold text-white uppercase"
                              style={{ backgroundColor: category?.color || '#005ac1' }}
                            >
                              {item.categoryName || category?.name || 'General'}
                            </span>
                          </div>
                        </div>

                        <span className="px-2 py-0.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] text-[var(--color-on-surface)] font-bold text-[10px] rounded-full">
                          GST {item.taxRateGst}%
                        </span>
                      </div>

                      <h3 className="text-sm font-black text-[var(--color-on-surface)] mt-2 line-clamp-2">{item.name}</h3>

                      {item.technicalSpecs && (
                        <p className="text-[11px] text-[var(--color-on-surface-variant)] line-clamp-2 mt-1 bg-[var(--color-surface-container)] p-2 rounded-xl border border-[var(--color-outline-variant)]">
                          {item.technicalSpecs}
                        </p>
                      )}
                    </div>

                    {/* Stock Overview Chips */}
                    {item.type === 'product' && (
                      <div className="p-2.5 bg-[var(--color-surface-container)] rounded-xl border border-[var(--color-outline-variant)] flex items-center justify-between text-xs">
                        <div>
                          <span className="text-[10px] text-[var(--color-on-surface-variant)] uppercase font-semibold">Opening</span>
                          <p className="font-bold text-[var(--color-on-surface)]">
                            {(item.openingStock || 0).toLocaleString('en-IN')} {item.unit}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-[var(--color-primary)] uppercase font-bold">Current Stock</span>
                          <p className="font-black text-sm text-[var(--color-on-surface)]">
                            {(item.currentStock || 0).toLocaleString('en-IN')} {item.unit}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Multi-Location Breakdown Chips in Card */}
                    {item.type === 'product' && itemLocs.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {itemLocs.map((loc, lIdx) => (
                          <span
                            key={lIdx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--color-surface-container)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)] shadow-2xs"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] shrink-0" />
                            <span className="font-medium text-[var(--color-on-surface-variant)]">{loc.locationName}:</span>
                            <span className="font-bold text-[var(--color-primary)]">
                              {(loc.currentStock || 0).toLocaleString('en-IN')} {item.unit}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Card Mid: Rates & HSN */}
                    <div className="pt-2 border-t border-[var(--color-outline-variant)] grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-[10px] font-bold text-[var(--color-outline)] uppercase">Selling Rate</p>
                        <p className="font-extrabold text-[var(--color-primary)]">
                          {currencySymbol} {item.salePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-[9px] text-[var(--color-outline)]">per {item.unit}</p>
                      </div>

                      <div className="text-right">
                        <p className="text-[10px] font-bold text-[var(--color-outline)] uppercase">Opening / Cost</p>
                        <p className="font-semibold text-[var(--color-on-surface)]">
                          {costRate > 0 ? `${currencySymbol} ${costRate.toLocaleString('en-IN')}` : '—'}
                        </p>
                        <p className="text-[9px] text-[var(--color-outline)]">{item.hsnSacCode || 'No HSN'}</p>
                      </div>
                    </div>

                    {/* Remarks & Actions */}
                    <div
                      className="pt-2 border-t border-[var(--color-outline-variant)] flex items-center justify-between"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => setViewingItem(item)}
                        className="text-xs font-bold text-[var(--color-primary)] hover:underline flex items-center gap-0.5"
                      >
                        View Specs <ChevronRight className="w-3 h-3" />
                      </button>

                      <div className="flex items-center gap-1">
                        {item.type === 'product' && (
                          <button
                            type="button"
                            onClick={() => handleOpenAdjustmentModal(item.id)}
                            className="p-1.5 text-[var(--color-primary)] hover:bg-[var(--color-primary-container)] rounded-full transition-colors"
                            title="Adjust Stock"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleEdit(item)}
                          className="p-1.5 text-[var(--color-on-surface-variant)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-container)] rounded-full transition-colors"
                          title="Edit Item"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          className="p-1.5 text-[var(--color-on-surface-variant)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-container)] rounded-full transition-colors"
                          title="Delete Item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: STOCK ADJUSTMENTS LEDGER                                          */}
      {/* ========================================================================= */}
      {activeSubTab === 'adjustments' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Adjustment Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-4 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                  Total Adjustments
                </span>
                <div className="w-8 h-8 rounded-xl bg-[var(--color-surface-container)] text-[var(--color-primary)] flex items-center justify-center font-bold">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-[var(--color-on-surface)] mt-2">{adjustmentStats.totalCount}</p>
              <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                Vouchers & reconciliation logs
              </p>
            </div>

            {/* Inward Additions */}
            <div
              onClick={() => setAdjTypeFilter(adjTypeFilter === 'increase' ? 'all' : 'increase')}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                adjTypeFilter === 'increase'
                  ? 'bg-[var(--color-success-container)]/30 border-[var(--color-success)]'
                  : 'bg-[var(--color-surface-container-lowest)] border-[var(--color-outline-variant)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[var(--color-success)] uppercase tracking-wider">
                  Stock Additions (+)
                </span>
                <div className="w-8 h-8 rounded-xl bg-[var(--color-success-container)] text-[var(--color-success)] flex items-center justify-center font-bold">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-[var(--color-success)] mt-2">
                {adjustmentStats.increaseCount}
              </p>
              <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                Addition vouchers · {adjustmentStats.totalAddedQty.toLocaleString('en-IN', { maximumFractionDigits: 2 })} qty ({currencySymbol} {adjustmentStats.totalAddedValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })})
              </p>
            </div>

            {/* Outward Deductions */}
            <div
              onClick={() => setAdjTypeFilter(adjTypeFilter === 'decrease' ? 'all' : 'decrease')}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                adjTypeFilter === 'decrease'
                  ? 'bg-[var(--color-error-container)]/30 border-[var(--color-error)]'
                  : 'bg-[var(--color-surface-container-lowest)] border-[var(--color-outline-variant)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[var(--color-error)] uppercase tracking-wider">
                  Stock Reductions (-)
                </span>
                <div className="w-8 h-8 rounded-xl bg-[var(--color-error-container)] text-[var(--color-error)] flex items-center justify-center font-bold">
                  <TrendingDown className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-[var(--color-error)] mt-2">
                {adjustmentStats.decreaseCount}
              </p>
              <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                Reduction vouchers · {adjustmentStats.totalReducedQty.toLocaleString('en-IN', { maximumFractionDigits: 2 })} qty ({currencySymbol} {adjustmentStats.totalReducedValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })})
              </p>
            </div>

            {/* Net Valuation Impact */}
            <div className="p-4 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                  Net Value Impact
                </span>
                <div className="w-8 h-8 rounded-xl bg-[var(--color-primary-container)] text-[var(--color-primary)] flex items-center justify-center font-bold">
                  <IndianRupee className="w-4 h-4" />
                </div>
              </div>
              <p
                className={`text-2xl font-black mt-2 ${
                  adjustmentStats.netValueImpact >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'
                }`}
              >
                {adjustmentStats.netValueImpact >= 0 ? '+' : ''}{currencySymbol} {adjustmentStats.netValueImpact.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
              <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                Valuation adjustment total
              </p>
            </div>
          </div>

          {/* Search, Filter & Action Bar */}
          <div className="p-4 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] shadow-xs space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Search */}
              <div className="relative flex-1 max-w-lg">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-outline)]" />
                <input
                  type="text"
                  placeholder="Search by voucher #, item name, code, reason, audit ref, or location..."
                  value={adjSearchQuery}
                  onChange={(e) => setAdjSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
                {adjSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setAdjSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-outline)] hover:text-[var(--color-on-surface)]"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Item Filter */}
                <select
                  value={adjItemFilter}
                  onChange={(e) => setAdjItemFilter(e.target.value)}
                  className="px-3 py-1.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-semibold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                >
                  <option value="all">All Products</option>
                  {items.filter(i => i.type === 'product').map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.code} — {it.name}
                    </option>
                  ))}
                </select>

                {/* Sort */}
                <div className="flex items-center gap-1 bg-[var(--color-surface-container)] px-3 py-1.5 rounded-full border border-[var(--color-outline-variant)]">
                  <ArrowUpDown className="w-3 h-3 text-[var(--color-outline)]" />
                  <select
                    value={adjSortBy}
                    onChange={(e: any) => setAdjSortBy(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-[var(--color-on-surface)] focus:outline-none"
                  >
                    <option value="recent">Date: Newest First</option>
                    <option value="oldest">Date: Oldest First</option>
                    <option value="qty_desc">Highest Quantity</option>
                    <option value="val_desc">Highest Value</option>
                  </select>
                </div>

                {/* Export & Print */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="p-2 text-[var(--color-on-surface-variant)] hover:text-[var(--color-primary)] hover:bg-[var(--color-surface-container)] rounded-full transition-colors border border-[var(--color-outline-variant)]"
                    title="Export Stock Adjustments CSV"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="p-2 text-[var(--color-on-surface-variant)] hover:text-[var(--color-primary)] hover:bg-[var(--color-surface-container)] rounded-full transition-colors border border-[var(--color-outline-variant)]"
                    title="Print Ledger"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenAdjustmentModal()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary)] hover:opacity-95 text-[var(--color-on-primary)] font-bold text-xs rounded-full shadow-xs transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Adjustment
                </button>
              </div>
            </div>

            
          </div>

          {/* Adjustments Table */}
          {filteredAdjustments.length === 0 ? (
            <div className="bg-[var(--color-surface-container-lowest)] rounded-[28px] border border-[var(--color-outline-variant)] p-12 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-[var(--color-surface-container)] text-[var(--color-outline)] flex items-center justify-center mx-auto">
                <SlidersHorizontal className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[var(--color-on-surface)]">No Stock Adjustments Recorded</h3>
                <p className="text-xs text-[var(--color-on-surface-variant)] max-w-md mx-auto mt-1">
                  Record physical stock discrepancies, plant batch sampling deductions, handling wastage, or opening stock reconciliations.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleOpenAdjustmentModal()}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-[var(--color-primary)] hover:opacity-95 text-[var(--color-on-primary)] font-bold text-xs rounded-full shadow-xs transition-all"
              >
                <Plus className="w-4 h-4" />
                Record First Stock Adjustment
              </button>
            </div>
          ) : (
            <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs min-w-[900px]">
                  <thead>
                    <tr className="border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3.5 px-4">Voucher & Date</th>
                      <th className="py-3.5 px-3">Item Details</th>
                      <th className="py-3.5 px-3 text-center">Type</th>
                      <th className="py-3.5 px-3 text-right">Adjusted Qty</th>
                      <th className="py-3.5 px-3 text-right">Rate & Valuation</th>
                      <th className="py-3.5 px-3 text-center">Stock Progression</th>
                      <th className="py-3.5 px-3">Reason & Reference</th>
                      <th className="py-3.5 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-outline-variant)]">
                    {filteredAdjustments.map((adj) => {
                      const totalVal = adj.totalValue || (adj.quantity * (adj.rate || 0));

                      return (
                        <tr key={adj.id} className="hover:bg-[var(--color-surface-container)]/60 transition-colors">
                          {/* Voucher & Date */}
                          <td className="py-3 px-4">
                            <span className="font-mono text-xs font-bold text-[var(--color-primary)] block">
                              {adj.adjustmentNumber || 'STK-ADJ'}
                            </span>
                            <span className="text-[11px] text-[var(--color-on-surface-variant)] flex items-center gap-1 mt-0.5">
                              <Calendar className="w-3 h-3 text-[var(--color-outline)]" />
                              {new Date(adj.date).toLocaleDateString('en-IN')}
                            </span>
                          </td>

                          {/* Item Details */}
                          <td className="py-3 px-3">
                            <div className="font-bold text-[var(--color-on-surface)]">{adj.itemName}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[10px] bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] px-1.5 py-0.2 rounded-full font-bold">
                                {adj.itemCode}
                              </span>
                              {adj.location && (
                                <span className="text-[10px] text-[var(--color-outline)] flex items-center gap-0.5">
                                  <Warehouse className="w-3 h-3" />
                                  {adj.location}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Type */}
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                adj.type === 'increase'
                                  ? 'bg-[var(--color-success-container)] text-[var(--color-success)] border border-[var(--color-success)]/30'
                                  : 'bg-[var(--color-error-container)] text-[var(--color-error)] border border-[var(--color-error)]/30'
                              }`}
                            >
                              {adj.type === 'increase' ? (
                                <>
                                  <TrendingUp className="w-3 h-3" />
                                  + Inward Add
                                </>
                              ) : (
                                <>
                                  <TrendingDown className="w-3 h-3" />
                                  - Reduction
                                </>
                              )}
                            </span>
                          </td>

                          {/* Adjusted Qty */}
                          <td className="py-3 px-3 text-right">
                            <span
                              className={`text-sm font-black ${
                                adj.type === 'increase' ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'
                              }`}
                            >
                              {adj.type === 'increase' ? '+' : '-'} {adj.quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-[10px] text-[var(--color-outline)] block">{adj.unit}</span>
                          </td>

                          {/* Rate & Valuation */}
                          <td className="py-3 px-3 text-right">
                            <div className="font-bold text-[var(--color-on-surface)]">
                              {currencySymbol} {totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            {adj.rate !== undefined && adj.rate > 0 && (
                              <div className="text-[10px] text-[var(--color-outline)]">
                                @ {currencySymbol} {adj.rate.toLocaleString('en-IN')}/{adj.unit}
                              </div>
                            )}
                          </td>

                          {/* Stock Progression */}
                          <td className="py-3 px-3 text-center">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--color-surface-container)] rounded-xl border border-[var(--color-outline-variant)] text-[11px] font-mono">
                              <span className="text-[var(--color-on-surface-variant)] font-semibold">
                                {adj.previousStock?.toLocaleString('en-IN') ?? '—'}
                              </span>
                              <span className="text-[var(--color-outline)]">➔</span>
                              <span className="font-bold text-[var(--color-primary)]">
                                {adj.newStock?.toLocaleString('en-IN') ?? '—'}
                              </span>
                              <span className="text-[9px] text-[var(--color-outline)]">{adj.unit}</span>
                            </div>
                          </td>

                          {/* Reason & Reference */}
                          <td className="py-3 px-3">
                            <div className="font-semibold text-[var(--color-on-surface)] max-w-xs truncate">
                              {adj.reason}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--color-outline)]">
                              {adj.referenceNumber && (
                                <span className="font-mono bg-[var(--color-surface-container-high)] px-1.5 py-0.2 rounded font-bold text-[var(--color-on-surface-variant)]">
                                  Ref: {adj.referenceNumber}
                                </span>
                              )}
                              {adj.notes && <span className="truncate max-w-[150px]">“{adj.notes}”</span>}
                            </div>
                          </td>

                          {/* Action */}
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteAdjustment(adj)}
                              className="p-1.5 text-[var(--color-on-surface-variant)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-container)] rounded-full transition-colors"
                              title="Delete & Revert Adjustment"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALS                                                                    */}
      {/* ========================================================================= */}
      {isItemFormOpen && (
        <ItemFormModal
          initialItem={editingItem}
          categories={categories}
          units={units}
          locations={locations}
          currencySymbol={currencySymbol}
          onClose={() => {
            setIsItemFormOpen(false);
            setEditingItem(null);
          }}
          onOpenCategories={() => setIsCategoriesOpen(true)}
          onOpenUnits={() => setIsUnitsOpen(true)}
          onOpenLocations={() => setIsLocationsOpen(true)}
        />
      )}

      {isStockAdjustmentModalOpen && (
        <StockAdjustmentModal
          items={items}
          locations={locations}
          initialItemId={adjustmentTargetItemId}
          currencySymbol={currencySymbol}
          onClose={() => {
            setIsStockAdjustmentModalOpen(false);
            setAdjustmentTargetItemId(undefined);
          }}
          onSubmit={handleStockAdjustmentSubmit}
        />
      )}

      {isCategoriesOpen && (
        <CategoryManagerModal
          categories={categories}
          items={items}
          onClose={() => setIsCategoriesOpen(false)}
        />
      )}

      {isUnitsOpen && (
        <UnitManagerModal
          units={units}
          items={items}
          onClose={() => setIsUnitsOpen(false)}
        />
      )}

      {isLocationsOpen && (
        <LocationManagerModal
          locations={locations}
          items={items}
          onClose={() => setIsLocationsOpen(false)}
        />
      )}

      {viewingItem && (
        <ItemDetailModal
          item={viewingItem}
          category={categories.find((c) => c.id === viewingItem.categoryId)}
          currencySymbol={currencySymbol}
          onClose={() => setViewingItem(null)}
          onEdit={(itm) => {
            setViewingItem(null);
            handleEdit(itm);
          }}
          onDelete={(itm) => handleDelete(itm)}
          onGoToInventory={onNavigateToInventory}
        />
      )}
    </div>
  );
};
