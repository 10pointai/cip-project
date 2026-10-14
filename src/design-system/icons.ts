/**
 * Material Design 3 (M3) Centralized Icon Catalog & Registry
 * All icons used in the application consolidated in one place.
 */

import React from 'react';
import {
  LayoutDashboard,
  Users,
  Boxes,
  ArrowUpRight,
  ArrowDownLeft,
  Building2,
  Truck,
  Contact,
  Settings,
  Warehouse,
  Plus,
  Edit2,
  Trash2,
  Check,
  AlertCircle,
  Lock,
  X,
  Search,
  Filter,
  Download,
  Upload,
  Calendar,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  Eye,
  MoreVertical,
  Printer,
  FileText,
  CheckCircle2,
  Clock,
  Coins,
  Fuel,
  Scale,
  Wrench,
  ShieldCheck,
  Layers,
  Sparkles,
  Package,
  MapPin,
  FileSpreadsheet,
  RefreshCw,
  Phone,
  Mail,
  Share2,
  Info,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Percent,
  CheckSquare,
  Square,
  Copy,
  ExternalLink,
  Menu,
  Sun,
  Moon,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';

/**
 * Standard M3 Icon Sizes
 */
export const m3IconSizes = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

export type M3IconSize = keyof typeof m3IconSizes;

/**
 * Master Registry of all application icons
 */
export const m3IconRegistry = {
  // Navigation & Core Views
  dashboard: LayoutDashboard,
  parties: Users,
  inventory: Boxes,
  sales: ArrowUpRight,
  purchases: ArrowDownLeft,
  production: Building2,
  fleets: Truck,
  employees: Contact,
  settings: Settings,
  locations: Warehouse,

  // Actions & Operations
  add: Plus,
  edit: Edit2,
  delete: Trash2,
  close: X,
  check: Check,
  search: Search,
  filter: Filter,
  download: Download,
  upload: Upload,
  print: Printer,
  refresh: RefreshCw,
  copy: Copy,
  view: Eye,
  more: MoreVertical,
  externalLink: ExternalLink,
  menu: Menu,

  // Status & Feedback
  success: CheckCircle2,
  warning: AlertCircle,
  error: AlertCircle,
  info: Info,
  lock: Lock,
  clock: Clock,
  verified: ShieldCheck,

  // Directional
  chevronDown: ChevronDown,
  chevronUp: ChevronUp,
  chevronRight: ChevronRight,
  chevronLeft: ChevronLeft,

  // Domain & Asphalt Plant
  plant: Building2,
  truck: Truck,
  rawMaterial: Package,
  scale: Scale,
  fuel: Fuel,
  maintenance: Wrench,
  layers: Layers,
  locationPin: MapPin,

  // Financial & Documents
  currency: Coins,
  dollar: DollarSign,
  invoice: FileText,
  spreadsheet: FileSpreadsheet,
  calendar: Calendar,
  trendUp: TrendingUp,
  trendDown: TrendingDown,
  percent: Percent,

  // Communication
  phone: Phone,
  email: Mail,
  share: Share2,

  // Selection
  checked: CheckSquare,
  unchecked: Square,

  // System
  sparkles: Sparkles,
  sun: Sun,
  moon: Moon,
} as const;

export type M3IconName = keyof typeof m3IconRegistry;

/**
 * Semantic Icon Categories for documentation and organization
 */
export const m3IconCategories: Record<string, { label: string; icons: M3IconName[] }> = {
  navigation: {
    label: 'Navigation & Core Modules',
    icons: ['dashboard', 'parties', 'inventory', 'sales', 'purchases', 'production', 'fleets', 'employees', 'settings', 'locations'],
  },
  actions: {
    label: 'Actions & Utilities',
    icons: ['add', 'edit', 'delete', 'close', 'check', 'search', 'filter', 'download', 'upload', 'print', 'refresh', 'copy', 'view', 'more', 'menu'],
  },
  status: {
    label: 'Status, Feedback & Security',
    icons: ['success', 'warning', 'error', 'info', 'lock', 'clock', 'verified'],
  },
  plant: {
    label: 'Plant, Logistics & Machinery',
    icons: ['plant', 'truck', 'rawMaterial', 'scale', 'fuel', 'maintenance', 'layers', 'locationPin'],
  },
  finance: {
    label: 'Financial & Documents',
    icons: ['currency', 'dollar', 'invoice', 'spreadsheet', 'calendar', 'trendUp', 'trendDown', 'percent'],
  },
  directional: {
    label: 'Directional & Disclosure',
    icons: ['chevronDown', 'chevronUp', 'chevronRight', 'chevronLeft'],
  },
  communication: {
    label: 'Communication & Contact',
    icons: ['phone', 'email', 'share'],
  },
};

export interface M3IconProps extends Omit<LucideProps, 'size'> {
  name?: M3IconName;
  icon?: LucideIcon;
  size?: M3IconSize | number;
  className?: string;
}

/**
 * Central M3 Icon Component
 * Renders any registered icon or custom Lucide icon with standard M3 dimensions.
 */
export const M3Icon: React.FC<M3IconProps> = ({
  name,
  icon: CustomIcon,
  size = 'md',
  className = '',
  ...props
}) => {
  if (CustomIcon && React.isValidElement(CustomIcon)) {
    const numericSize = typeof size === 'number' ? size : m3IconSizes[size] || 20;
    return React.cloneElement(CustomIcon as React.ReactElement<any>, {
      size: (CustomIcon.props as any).size || numericSize,
      strokeWidth: (CustomIcon.props as any).strokeWidth || 1.85,
      className: `${(CustomIcon.props as any).className || ''} ${className}`.trim(),
      ...props,
    });
  }

  const IconComponent = CustomIcon || (name ? m3IconRegistry[name] : null);

  if (!IconComponent) {
    console.warn(`[M3Icon] Icon "${name}" not found in registry.`);
    return null;
  }

  const numericSize = typeof size === 'number' ? size : m3IconSizes[size] || 20;

  return React.createElement(IconComponent, {
    size: numericSize,
    strokeWidth: 1.85,
    className,
    ...props,
  });
};
