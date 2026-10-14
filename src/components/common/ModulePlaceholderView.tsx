import React from 'react';
import { Package, Layers, Truck, FileText, Building2, UserCheck, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
import { NavigationTab } from '../layout/Sidebar';

interface ModulePlaceholderViewProps {
  tab: NavigationTab;
  onNavigateToParties: () => void;
  onNavigateToDashboard: () => void;
}

const MODULE_DETAILS: Record<
  string,
  {
    title: string;
    description: string;
    icon: any;
    features: string[];
    linkedPartyData: string;
  }
> = {
  distribution: {
    title: 'Distribution Management',
    description: 'Hot mix asphalt batch dispatches, electronic delivery challans, site weighbridge receipts, and customer billing milestones.',
    icon: Package,
    features: [
      'Digital weighbridge integration (Tare, Gross & Net weights in MT)',
      'Delivery Challan (DC) generation with vehicle number & driver details',
      'Asphalt mix temperature logs at dispatch (150°C - 165°C compliance)',
      'Customer site receipt acknowledgment & instant invoice generation',
    ],
    linkedPartyData: 'Uses Client / Customer Master from Party Directory for automated billing & destination sites.',
  },
  inventory: {
    title: 'Inventory & Stockyard Management',
    description: 'Raw material storage monitoring for bulk bitumen tanks, aggregate stockpile yards, bulk cement silos, and burner diesel storage.',
    icon: Layers,
    features: [
      'Bulk Bitumen tank levels (VG-30, VG-40, CRMB-55, Polymer Modified)',
      'Aggregate stockpile grading (40mm, 20mm, 10mm, 6mm, Washed Stone Dust)',
      'Diesel fuel storage levels with daily burner consumption logs',
      'Minimum reorder level alerts and procurement requisitions',
    ],
    linkedPartyData: 'Directly linked with Quarry & Refinery Suppliers in the Party Directory for auto-replenishment.',
  },
  logistics: {
    title: 'Logistics & Tipper Fleet Management',
    description: 'Insulated tipper trucks, bitumen tankers, multi-axle dumpers, trip freights, diesel allowances, and driver trip slips.',
    icon: Truck,
    features: [
      'Insulated asphalt tipper haulage tracking to highway job sites',
      'Bitumen tanker turnaround time & refinery unloading slips',
      'Freight ledger calculation per Metric Tonne per Kilometer (MT/KM)',
      'Transporter billing reconciliation against delivery challans',
    ],
    linkedPartyData: 'Synchronized with Transporter Accounts & Freight Ledgers in Party Management.',
  },
  orders: {
    title: 'Custom Order Management',
    description: 'Highway mix designs (Bituminous Concrete, Dense Bituminous Macadam, Wet Mix Macadam, Granular Sub-base) and tender orders.',
    icon: FileText,
    features: [
      'Client job mix formula (JMF) specification sheets (MORTH 5th Revision standards)',
      'Daily scheduled delivery quotas (e.g. 500 MT / day)',
      'Advance payment & credit approval milestone verification',
      'Work order tracking against client purchase orders (PO)',
    ],
    linkedPartyData: 'Pulls credit limits, payment terms, and billing history from Customer Parties.',
  },
  production: {
    title: 'Production & Asphalt Batching Management',
    description: 'Hot Mix Plant batching schedules, pugmill mixing cycles, aggregate crusher output, and quality control (QC) lab test logs.',
    icon: Building2,
    features: [
      'Daily batching targets & pugmill recipe adjustments (Bitumen % binder content)',
      'Quarry primary/secondary jaw & cone crusher output reports',
      'QC Lab Test logging (Bitumen extraction, Marshall stability, Aggregate Impact Value)',
      'Plant downtime, burner efficiency, and maintenance scheduling',
    ],
    linkedPartyData: 'Consumes raw materials from Supplier Parties and produces mix for Customer Parties.',
  },
  vendors: {
    title: 'Vendor Contracts & Purchase Orders (PO)',
    description: 'Supplier rate contracts for bitumen refineries, stone quarries, bulk cement suppliers, equipment spares, and fuel.',
    icon: UserCheck,
    features: [
      'Annual/Quarterly fixed-price supplier contracts (e.g. ₹/MT for 20mm basalt metal)',
      'Purchase Order (PO) creation with approval workflow',
      'Three-way matching (PO vs Goods Receipt Slip vs Supplier Bill)',
      'Supplier performance rating on delivery timeliness and aggregate quality',
    ],
    linkedPartyData: 'Manages all Vendor/Supplier Master profiles and accounts ledger.',
  },
};

export function ModulePlaceholderView({
  tab,
  onNavigateToParties,
  onNavigateToDashboard,
}: ModulePlaceholderViewProps) {
  const details = MODULE_DETAILS[tab] || {
    title: 'Operations Module',
    description: 'This module is scheduled for implementation in the next iteration.',
    icon: Package,
    features: [],
    linkedPartyData: '',
  };

  const Icon = details.icon;

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6 animate-in fade-in duration-200">
      <div className="bg-[var(--color-surface-container-lowest)] p-8 rounded-[28px] border border-[var(--color-outline-variant)] shadow-2xs space-y-6 text-center sm:text-left">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <div className="w-14 h-14 rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] flex items-center justify-center shrink-0">
            <Icon className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 justify-center sm:justify-start">
              <span className="px-3 py-0.5 bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] rounded-full text-[11px] font-bold uppercase tracking-wider">
                Module Roadmap & Specifications
              </span>
              <span className="text-xs text-[var(--color-on-surface-variant)]">Scheduled Implementation Phase</span>
            </div>
            <p className="text-xs sm:text-sm text-[var(--color-on-surface-variant)] font-medium">
              Architecture and database schemas have been provisioned. Review upcoming roadmap capabilities below.
            </p>
          </div>
        </div>

        {/* Feature Highlights Planned */}
        <div className="pt-4 border-t border-[var(--color-outline-variant)]">
          <h2 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider mb-3 text-left">
            Upcoming Features Planned for this Module:
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
            {details.features.map((feature, i) => (
              <div key={i} className="flex items-start gap-2.5 p-3 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)] text-xs text-[var(--color-on-surface)]">
                <CheckCircle2 className="w-4 h-4 text-[var(--color-primary)] shrink-0 mt-0.5" />
                <span className="font-medium">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Party Connection */}
        <div className="p-4 bg-[var(--color-secondary-container)] rounded-2xl border border-[var(--color-secondary)]/20 text-xs text-[var(--color-on-secondary-container)] flex items-center gap-3 text-left">
          <Sparkles className="w-5 h-5 text-[var(--color-secondary)] shrink-0" />
          <div>
            <p className="font-bold">Party Master & Ledger Integration Ready:</p>
            <p className="opacity-90">{details.linkedPartyData}</p>
          </div>
        </div>

        {/* Navigation Action Buttons */}
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-2">
          <button
            onClick={onNavigateToParties}
            className="flex items-center gap-2 px-5 py-2.5 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-bold text-xs rounded-full shadow-xs transition-colors"
          >
            Go to Party Directory & Ledgers
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={onNavigateToDashboard}
            className="px-5 py-2.5 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] font-bold text-xs rounded-full transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
