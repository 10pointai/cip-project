import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  X,
  Plus,
  Trash2,
  Layers,
  AlertTriangle,
  ClipboardPaste,
  CheckCircle2,
  Boxes,
} from 'lucide-react';
import { Party, Item, CompanySettings, SalesStage } from '../../types';
import { cloudStore } from '../../services/cloudStore';
import { SearchableSelect } from './SearchableSelect';

/** One item line inside a draft document. */
interface BulkItemLine {
  id: string;
  itemId: string;
  /** Pasted item text that could not be matched — flagged until fixed */
  itemRaw?: string;
  quantity: string;
  rate: string;
  gstRate: string;
}

/** One draft document: its own stage type, date, party, item LINES (one or
 *  many), one-shot inventory toggle and payment settlement. In the grid the
 *  document's item lines are consecutive rows — the document-level columns
 *  span them. */
interface BulkDoc {
  id: string;
  stage: SalesStage;
  date: string;
  partyId: string;
  /** Pasted party text that could not be matched — flagged until fixed */
  partyRaw?: string;
  /** Compulsory fleet vehicle attachment (same rule as the Add Sale form) */
  vehicleId: string;
  /** Outsourced plate — set when vehicleId is the '__out__' marker */
  outsourcedNo: string;
  /** Load weight of the whole document — ONE common value for all its items
   *  (rides the sale master; the trip slip's load derives from it) */
  weight: string;
  /** Trip plan — drop site address + travel distance (km), per document */
  siteAddress: string;
  distanceKm: string;
  /** Include-gate: ON → transport cost (weight × distance × rate + own GST)
   *  is added to the document; OFF → nothing added. Independent of the rate:
   *  rate + GST are ALWAYS captured (always saved), even with the toggle off. */
  includeTransport: boolean;
  freightRate: string;
  freightGst: string;
  items: BulkItemLine[];
  // Per-document one-shot inventory application (quotation never deducts;
  // invoice deducts permanently — the flag is forced on there)
  updateInventory: boolean;
  // Per-document payment settlement (sales order & invoice stages)
  settlementType: 'none' | 'credit' | 'account';
  settlementAccountId: string;
  paymentMode: string;
}

// 2026-10-28: the DIRECT invoice row is back in bulk too (like the single
// create popover) — stock + forced credit apply equally to SO and Invoice.
const STAGE_CHOICES: Array<{ id: SalesStage; label: string }> = [
  { id: 'quotation', label: 'Quotation' },
  { id: 'sales_order', label: 'Sales Order' },
  { id: 'sales_invoice', label: 'Invoice (Direct)' },
];

/** Document number prefix per stage (mirrors suggestStageNumber): */
const PREFIX_BY_STAGE: Record<string, string> = {
  quotation: 'QUO',
  sales_order: 'SO',
  sales_invoice: 'INV', // legacy rows only
};

const todayStr = () => new Date().toISOString().split('T')[0];

const emptyItemLine = (): BulkItemLine => ({
  id: `bulkline-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
  itemId: '',
  quantity: '',
  rate: '',
  gstRate: '',
});

const emptyDoc = (): BulkDoc => ({
  id: `bulkdoc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
  stage: 'sales_order',
  date: todayStr(),
  partyId: '',
  vehicleId: '',
  outsourcedNo: '',
  weight: '',
  siteAddress: '',
  distanceKm: '',
  includeTransport: false,
  freightRate: '',
  freightGst: '0',
  items: [emptyItemLine()],
  updateInventory: false,
  settlementType: 'none',
  settlementAccountId: '',
  paymentMode: 'bank_transfer',
});

interface BulkSalesCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  parties: Party[];
  items: Item[];
  settings: CompanySettings;
  /** All document numbers already in use (auto numbering skips them) */
  existingNumbers: string[];
  /** Same mutator the single-create form uses (one call per document) */
  onAddSale: (payload: any) => any;
}

export function BulkSalesCreateModal({
  isOpen,
  onClose,
  parties,
  items,
  settings,
  existingNumbers,
  onAddSale,
}: BulkSalesCreateModalProps) {
  const [docs, setDocs] = useState<BulkDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteReport, setPasteReport] = useState<{ ok: number; badParties: string[]; badItems: string[] } | null>(null);

  // Fresh batch every time the modal opens — ONE empty document to start;
  // more rows via "Add Row" / paste-in
  useEffect(() => {
    if (!isOpen) return;
    setDocs(Array.from({ length: 1 }, emptyDoc));
    setError(null);
    setIsPasteOpen(false);
    setPasteText('');
    setPasteReport(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const productItems = useMemo(() => items.filter((i) => i.type === 'product' && i.isActive), [items]);

  // Cash/Bank accounts + fleet vehicles are read straight from the cloud store
  // (the same sources the single-create form uses); keyed on isOpen so each
  // open re-reads them.
  const activeAccounts = useMemo(() => {
    try {
      return cloudStore.getAccounts().filter((a) => a.isActive);
    } catch {
      return [];
    }
  }, [isOpen]);

  const fleetVehicles = useMemo(() => {
    try {
      return cloudStore.getVehicles();
    } catch {
      return [];
    }
  }, [isOpen]);

  // Per-document numbers: each document is numbered from ITS OWN stage's
  // sequence (QUO-… / SO-… / INV-…), always skipping every number already in
  // the books plus the ones handed out earlier in this batch.
  const stagePattern = docs.map((d) => d.stage).join('|');
  const docNumbers = useMemo(() => {
    const used = new Set(existingNumbers);
    const year = new Date().getFullYear();
    const nextForPrefix = new Map<string, number>();
    // RST (2026-10-28): sales_order numbers are BARE serials ('0001', no
    // prefix/year); the batch continues the global serial — skipping every
    // serial already in the books AND one past the highest in use (deleted
    // orders' numbers stay spent server-side).
    let serialStart = 0;
    for (const v of used) {
      if (/^\d+$/.test(String(v))) serialStart = Math.max(serialStart, parseInt(String(v), 10));
    }
    const mk = (prefix: string, n: number) =>
      prefix === 'RST' ? String(n).padStart(4, '0') : `${prefix}-${year}-${String(n).padStart(4, '0')}`;
    return docs.map((doc) => {
      let prefix = PREFIX_BY_STAGE[doc.stage] || 'SO';
      if (doc.stage === 'sales_order') prefix = 'RST';
      let n = nextForPrefix.get(prefix) || (prefix === 'RST' ? serialStart + 1 : 1);
      while (used.has(mk(prefix, n))) n++;
      const num = mk(prefix, n);
      used.add(num);
      nextForPrefix.set(prefix, n + 1);
      return num;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stagePattern, existingNumbers, docs.length]);

  // Per-line totals (same 2dp rounding as the single-create form)
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const formatCurrency2 = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: settings.currency?.code || 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(round2(amount));

  const calcLine = (line: BulkItemLine) => {
    const lineTotal = (Number(line.quantity) || 0) * (Number(line.rate) || 0);
    const subtotal = round2(lineTotal);
    const taxAmount = round2((lineTotal * (Number(line.gstRate) || 0)) / 100);
    return { subtotal, taxAmount, totalAmount: round2(subtotal + taxAmount) };
  };

  const calcDoc = (doc: BulkDoc) =>
    doc.items.reduce(
      (acc, line) => {
        const c = calcLine(line);
        return { subtotal: round2(acc.subtotal + c.subtotal), taxAmount: round2(acc.taxAmount + c.taxAmount), totalAmount: round2(acc.totalAmount + c.totalAmount) };
      },
      { subtotal: 0, taxAmount: 0, totalAmount: 0 }
    );

  // Fleet cost (per-sale): weight × distance × rate + its own GST slab. The
  // grand doc total includes both (computed client-side for display; the
  // server recomputes authoritative stage totals on save). toNum keeps null /
  // garbage states from ever producing NaN.
  const toNum = (v: any): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  // Outsource check: an outsourced vehicle books NO transport cost — the
  // rate/GST inputs are disabled (forced 0) and the include-toggle is off
  const isOutsourcedDoc = (doc: BulkDoc) => doc.vehicleId === '__out__';
  const fleetCostOf = (doc: BulkDoc) =>
    doc.includeTransport && !isOutsourcedDoc(doc)
      ? round2(toNum(doc.weight) * toNum(doc.distanceKm) * toNum(doc.freightRate))
      : 0;
  const fleetGstOf = (doc: BulkDoc) =>
    round2((fleetCostOf(doc) * toNum(doc.freightGst)) / 100);

  // Mutators
  const patchDoc = (id: string, patch: Partial<BulkDoc>) => {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const patchLine = (docId: string, lineId: string, patch: Partial<BulkItemLine>) => {
    setDocs((prev) =>
      prev.map((d) =>
        d.id !== docId ? d : { ...d, items: d.items.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) }
      )
    );
  };

  // Stage is a document property — switching re-seeds that document's
  // stage-driven defaults (settlement + inventory); item lines are kept.
  const setDocStage = (doc: BulkDoc, stage: SalesStage) => {
    if (doc.stage === stage) return;
    patchDoc(doc.id, {
      stage,
      // 2026-10-28 client rule: quotation touches nothing; SO / direct
      // invoice ALWAYS dispatch AND book the forced CREDIT flow.
      settlementType: stage === 'quotation' ? 'none' : 'credit',
      settlementAccountId: '',
      updateInventory: stage !== 'quotation',
    });
  };

  const handleLineChange = (doc: BulkDoc, line: BulkItemLine, field: keyof BulkItemLine, value: string) => {
    if (field === 'itemId') {
      const prod = productItems.find((p) => p.id === value);
      if (prod) {
        patchLine(doc.id, line.id, { itemId: value, itemRaw: undefined, rate: String(prod.salePrice ?? 0), gstRate: String(prod.taxRateGst ?? 0) });
      } else {
        patchLine(doc.id, line.id, { itemId: value, itemRaw: undefined });
      }
      return;
    }
    patchLine(doc.id, line.id, { [field]: value } as Partial<BulkItemLine>);
  };

  const addDocument = (count: number) => {
    setDocs((prev) => [...prev, ...Array.from({ length: count }, emptyDoc)]);
  };

  /** Adds another item line to this document (the ＋ Item control on its last line) */
  const addLineToDoc = (docId: string) => {
    setDocs((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, items: [...d.items, emptyItemLine()] } : d))
    );
  };

  /** Removes an item line; a document that loses its last line is removed */
  const removeLine = (docId: string, lineId: string) => {
    setDocs((prev) => {
      const target = prev.find((d) => d.id === docId);
      if (!target) return prev;
      if (target.items.length === 1) {
        // The document's last line — the document itself is removed
        return prev.length === 1 ? prev : prev.filter((d) => d.id !== docId);
      }
      return prev.map((d) => (d.id === docId ? { ...d, items: d.items.filter((l) => l.id !== lineId) } : d));
    });
  };

  const removeDoc = (docId: string) => {
    if (docs.length === 1) return;
    setDocs((prev) => prev.filter((d) => d.id !== docId));
  };

  // --- Excel paste -----------------------------------------------------------
  // Expected columns per line: Party | Item | Quantity | Rate (tab or comma
  // separated; copies straight out of Excel / Google Sheets). CONSECUTIVE
  // lines with the same party are merged into one document (its multiple
  // items); a line with a different (or unmatched) party starts a new one.
  const normKey = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

  const matchParty = (raw: string): Party | undefined => {
    const key = normKey(raw);
    if (!key) return undefined;
    return (
      parties.find((p) => normKey(p.name) === key) ||
      parties.find((p) => normKey(p.tradeName || '') === key) ||
      parties.find((p) => normKey(p.name).includes(key)) ||
      parties.find((p) => normKey(p.tradeName || '').includes(key))
    );
  };

  const matchItem = (raw: string): Item | undefined => {
    const key = normKey(raw);
    if (!key) return undefined;
    return (
      productItems.find((p) => normKey(p.code) === key) ||
      productItems.find((p) => normKey(p.name) === key) ||
      productItems.find((p) => normKey(p.code).includes(key)) ||
      productItems.find((p) => normKey(p.name).includes(key))
    );
  };

  const importPaste = useCallback(
    (text: string) => {
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      if (lines.length === 0) return;

      // Skip a header line when the first row looks like column names
      const looksLikeHeader = /party|customer|client|item|material|product|qty|quantity/i.test(lines[0]);
      const dataLines = looksLikeHeader ? lines.slice(1) : lines;

      const badParties = new Set<string>();
      const badItems = new Set<string>();
      const imported: BulkDoc[] = [];
      let ok = 0;
      let lastPartyKey = '\u0000-none\u0000';

      dataLines.forEach((line) => {
        const cells = line.includes('\t') ? line.split('\t') : line.split(',');
        const get = (i: number) => (cells[i] ?? '').trim();
        const party = matchParty(get(0));
        const item = matchItem(get(1));
        const qty = get(2);
        const rate = get(3);
        const partyKey = party ? party.id : `raw:${normKey(get(0)) || Math.random()}`;
        if (!party) badParties.add(get(0) || '(empty)');
        if (!item) badItems.add(get(1) || '(empty)');
        if (party && item && Number(qty) > 0) ok++;

        const lineDraft: BulkItemLine = {
          ...emptyItemLine(),
          itemId: item?.id || '',
          itemRaw: item ? undefined : get(1),
          quantity: qty,
          rate: rate || String(item?.salePrice ?? ''),
          gstRate: String(item?.taxRateGst ?? 0),
        };

        // Same party as the previous pasted line → another item of THAT doc
        const prevDoc = imported[imported.length - 1];
        if (prevDoc && party && partyKey === lastPartyKey) {
          prevDoc.items.push(lineDraft);
        } else {
          imported.push({
            ...emptyDoc(),
            stage: 'sales_order',
            date: todayStr(),
            partyId: party?.id || '',
            partyRaw: party ? undefined : get(0),
            items: [lineDraft],
          });
          lastPartyKey = party ? partyKey : '\u0000-none\u0000';
        }
      });

      setDocs((prev) => {
        // A still-untouched grid (only the untouched default documents) is
        // replaced outright; otherwise the imported documents are appended
        const base = prev.every(
          (d) => !d.partyId && !d.partyRaw && d.items.every((l) => !l.itemId && !l.itemRaw && !l.quantity && !l.rate)
        )
          ? []
          : prev;
        return [...base, ...imported];
      });
      setPasteReport({ ok, badParties: [...badParties], badItems: [...badItems] });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parties, productItems]
  );

  // Pasting DIRECTLY anywhere onto the grid (Ctrl+V) fills new rows — the
  // fastest path from a spreadsheet to a batch of documents.
  const handleGridPaste = (e: React.ClipboardEvent) => {
    // Leave the textarea and every text/number input's own paste intact
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return;
    const text = e.clipboardData.getData('text/plain') || '';
    if (!text.trim()) return;
    // Only intercept genuine multi-cell pastes; single-value copies should
    // not swallow a plain paste into an input.
    if (!(text.includes('\t') || text.includes('\n'))) return;
    e.preventDefault();
    importPaste(text);
  };

  // --- Submit ----------------------------------------------------------------
  const handleSubmitBatch = () => {
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      const num = docNumbers[i] || `document ${i + 1}`;
      if (!doc.partyId) {
        setError(`Document ${i + 1} (${num}): Please select a Party.`);
        return;
      }
      // Compulsory vehicle (same rule as the Add Sale form) — the trip slip
      // derives from this attachment. Quotation-stage documents ship without
      // one (same rule as the single-create form; the vehicle attaches when
      // the quotation advances).
      if (doc.stage !== 'quotation') {
      if (doc.vehicleId === '__out__') {
        if (!doc.outsourcedNo.trim()) {
          setError(`Document ${i + 1} (${num}): Enter the outsourced vehicle number.`);
          return;
        }
      } else if (!doc.vehicleId || !fleetVehicles.some((v) => v.id === doc.vehicleId)) {
        setError(`Document ${i + 1} (${num}): Attach a fleet vehicle or mark the vehicle as Outsourced — sales orders always carry a dispatch trip.`);
        return;
      }
      }
      const validLines = doc.items.filter((l) => l.itemId && Number(l.quantity) > 0 && Number(l.rate) > 0);
      if (validLines.length === 0) {
        setError(`Document ${i + 1} (${num}): Add at least one valid item with a quantity and rate greater than zero.`);
        return;
      }
      if (!doc.date) {
        setError(`Document ${i + 1} (${num}): Please pick the document date.`);
        return;
      }
      // Transport-cost inclusion needs its computation basis (w × d × rate)
      if (doc.includeTransport && !isOutsourcedDoc(doc)) {
        if (!(Number(doc.weight) > 0) || !(Number(doc.distanceKm) > 0)) {
          setError(`Document ${i + 1} (${num}): Including Transport Cost needs the doc weight (MT) and distance (km).`);
          return;
        }
        if (!(Number(doc.freightRate) > 0)) {
          setError(`Document ${i + 1} (${num}): Enter the Fleet Cost rate per tonne per KM.`);
          return;
        }
      }
      // (No settlement-account validation: 2026-10-28 — the money flow is
      // FORCE-BOOKED on credit for every SO / direct invoice; nothing to pick.)
    }

    docs.forEach((doc, i) => {
      const itemsList = doc.items
        .filter((l) => l.itemId && Number(l.quantity) > 0 && Number(l.rate) > 0)
        .map((line) => {
          const product = items.find((it) => it.id === line.itemId)!;
          const prodLocs =
            product.locations && product.locations.length > 0
              ? product.locations
              : product.stockLocation
                ? product.stockLocation.split(',').map((s) => ({ locationName: s.trim() }))
                : [];
          return {
            itemId: line.itemId,
            quantity: Number(line.quantity),
            rate: Number(line.rate),
            gstRate: Number(line.gstRate) || 0,
            locationName: prodLocs[0]?.locationName || undefined,
          };
        });
      const { subtotal, taxAmount } = calcDoc(doc);
      // 2026-10-28 client rule: SO / direct-invoice docs ALWAYS apply the
      // dispatch + book the forced CREDIT flow (the server enforces this too —
      // payload values are explicit so the optimistic row matches instantly);
      // quotations touch nothing.
      const moneyStage = doc.stage === 'sales_order' || doc.stage === 'sales_invoice';
      const updateInventory = moneyStage ? true : false;
      // Dispatch: own fleet (FK) or OUTSOURCED (typed plate on the master)
      onAddSale({
        saleNumber: docNumbers[i],
        partyId: doc.partyId,
        date: doc.date,
        ...(doc.vehicleId === '__out__'
          ? { vehicleNo: doc.outsourcedNo.trim().toUpperCase() }
          : { vehicleId: doc.vehicleId }),
        // ONE common load weight for the whole document (rides the sale master;
        // the trip slip's load derives from it — no per-line splitting)
        weightTonnes: Number(doc.weight) || undefined,
        siteAddress: doc.siteAddress.trim() || undefined,
        distanceKm: Number(doc.distanceKm) || undefined,
        // Fleet cost: added to the document ONLY when the include-toggle is
        // on (never for an outsourced vehicle); the RATE + GST are ALWAYS
        // saved with the sale — the toggle gates the amount, not the pricing
        transportCharges: fleetCostOf(doc),
        freightRatePerTonne: isOutsourcedDoc(doc) ? 0 : (Number(doc.freightRate) || undefined),
        freightGstRate: isOutsourcedDoc(doc) ? 0 : (Number(doc.freightGst) >= 0 ? Number(doc.freightGst) : undefined),
        items: itemsList,
        subtotal,
        taxAmount,
        totalAmount: docGrand(doc),
        stage: {
          stageType: doc.stage,
          stageNumber: docNumbers[i],
          date: doc.date,
          // 2026-10-28 client rule: forced dispatch + forced credit at the
          // money stages; quotation carries no flow
          updateInventory,
          updateCash: moneyStage,
          settlementType: moneyStage ? 'credit' : undefined,
        },
      });
    });

    onClose();
  };

  if (!isOpen) return null;

  const docGrand = (d: BulkDoc) => round2(calcDoc(d).totalAmount + fleetCostOf(d) + fleetGstOf(d));
  const batchTotal = docs.reduce((sum, d) => sum + docGrand(d), 0);
  const stageCounts = STAGE_CHOICES.map((s) => {
    const count = docs.filter((d) => d.stage === s.id).length;
    return count > 0 ? `${count} ${s.label.toLowerCase()}${count !== 1 ? 's' : ''}` : null;
  }).filter(Boolean).join(' · ');
  const totalLines = docs.reduce((sum, d) => sum + d.items.length, 0);

  return (
    <div className="fixed inset-0 z-50 bg-[var(--color-scrim)]/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="bg-[var(--color-surface)] rounded-3xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border border-[var(--color-outline-variant)] animate-in fade-in zoom-in-95 duration-150"
        onPaste={handleGridPaste}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--color-outline-variant)] flex items-center justify-between bg-[var(--color-surface-container)]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold bg-[var(--color-success-container)] text-[var(--color-on-success-container)]">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--color-on-surface)]">Bulk Create Sales Documents</h3>
              
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-2xl bg-[var(--color-error-container)]/40 border border-[var(--color-error)]/40 flex items-center justify-between text-xs text-[var(--color-error)] font-medium">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
              <button type="button" onClick={() => setError(null)} className="p-1 hover:opacity-70">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          

          {/* The grid — one ROW per item line; a document's lines sit together,
              its document-level columns spanning them */}
          <div className="border border-[var(--color-outline-variant)] rounded-2xl bg-[var(--color-surface-container)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[3010px]">
                <thead>
                  <tr className="bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] font-bold text-[10px] uppercase border-b border-[var(--color-outline-variant)]">
                    <th className="py-2.5 px-2 w-10 text-center">#</th>
                    <th className="py-2.5 px-2 w-48">Type</th>
                    <th className="py-2.5 px-3 min-w-[170px]">REF/RST</th>
                    <th className="py-2.5 px-3 w-48">Date</th>
                    <th className="py-2.5 px-3 min-w-[240px]">Party</th>
                    <th className="py-2.5 px-3 min-w-[260px]">Item / Product</th>
                    <th className="py-2.5 px-2 w-16"></th>
                    <th className="py-2.5 px-3 w-32">Qty</th>
                    <th className="py-2.5 px-3 w-36">Rate ({settings.currency?.symbol || '₹'})</th>
                    <th className="py-2.5 px-3 w-28">GST</th>
                    <th className="py-2.5 px-3 w-32 text-right">Line Amount</th>
                    <th className="py-2.5 px-3 w-36 text-right">Doc Total</th>
                    {/* Update Stock + Payment Settlement columns REMOVED
                        (2026-10-28): stock deducts and the flow books credit
                        automatically at the money stages — nothing to choose */}
                    <th className="py-2.5 px-3 min-w-[190px]">Vehicle *</th>
                    <th className="py-2.5 px-3 w-28">Weight (MT)</th>
                    <th className="py-2.5 px-3 w-28">Distance (km)</th>
                    <th className="py-2.5 px-3 min-w-[240px]">Site / Drop Address</th>
                    <th className="py-2.5 px-3 min-w-[200px]">Fleet Cost (₹/T-km)</th>
                    <th className="py-2.5 px-2 w-24 text-center">Include Transport Cost</th>
                    <th className="py-2.5 px-3 w-32 text-right">Doc Total</th>
                    <th className="py-2.5 px-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-outline-variant)]/60">
                  {docs.map((doc, di) => {
                    const docNum = docNumbers[di];
                    const lines = doc.items;
                    return lines.map((line, li) => {
                      const isGroupStart = li === 0;
                      const isGroupEnd = li === lines.length - 1;
                      const lineProd = productItems.find((p) => p.id === line.itemId);
                      const calc = calcLine(line);
                      const itemUnmatched = !line.itemId && Boolean(line.itemRaw);
                      const partyUnmatched = isGroupStart && !doc.partyId && Boolean(doc.partyRaw);
                      const docCalc = calcDoc(doc);
                      return (
                        <tr
                          key={line.id}
                          className={`bg-[var(--color-surface-container-lowest)] ${isGroupStart && di > 0 ? 'border-t-2 border-t-[color:var(--color-outline-variant)]' : ''}`}
                        >
                          {/* Document-level cells span the document's item rows */}
                          {isGroupStart && (
                            <>
                              <td rowSpan={lines.length} className="py-2 px-2 text-center align-top">
                                <div className="pt-1">
                                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-[var(--color-surface-container-high)] text-[10px] font-black text-[var(--color-on-surface-variant)]">
                                    {di + 1}
                                  </span>
                                </div>
                              </td>
                              <td rowSpan={lines.length} className="py-2 px-2 align-top">
                                <select
                                  value={doc.stage}
                                  onChange={(e) => setDocStage(doc, e.target.value as SalesStage)}
                                  className="w-full px-2 py-1.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-lg text-[11px] font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                >
                                  {STAGE_CHOICES.map((s) => (
                                    <option key={s.id} value={s.id}>{s.label}</option>
                                  ))}
                                </select>
                              </td>
                              <td rowSpan={lines.length} className="py-2 px-3 align-top text-xs font-black text-[var(--color-on-surface)] whitespace-nowrap">
                                <span className="block pt-1.5">{docNum || '—'}</span>
                                <span className="block text-[9px] text-[var(--color-on-surface-variant)] font-semibold mt-0.5">
                                  {lines.length} item{lines.length !== 1 ? 's' : ''}
                                </span>
                              </td>
                              <td rowSpan={lines.length} className="py-2 px-3 align-top">
                                <input
                                  type="date"
                                  value={doc.date}
                                  onChange={(e) => patchDoc(doc.id, { date: e.target.value })}
                                  className="w-full mt-0.5 px-2 py-1.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-lg text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                />
                              </td>
                              <td rowSpan={lines.length} className="py-2 px-3 align-top">
                                <div className={`mt-0.5 ${partyUnmatched ? 'rounded-lg ring-1 ring-[var(--color-error)]/60' : ''}`}>
                                  <SearchableSelect
                                    value={doc.partyId}
                                    onChange={(v) => {
                                      patchDoc(doc.id, { partyId: v, partyRaw: undefined });
                                      // Pre-fill the drop site from the party's
                                      // address once (still editable per document)
                                      if (!doc.siteAddress.trim()) {
                                        const p = parties.find((pp) => pp.id === v);
                                        if (p?.address) {
                                          patchDoc(doc.id, {
                                            siteAddress: [
                                              p.address.street, p.address.city,
                                              `${p.address.state} ${p.address.pincode}`.trim(),
                                            ].filter(Boolean).join(', '),
                                          });
                                        }
                                      }
                                    }}
                                    placeholder={partyUnmatched ? `"${doc.partyRaw}" — not found` : 'Type party name...'}
                                    closedDisplay={(() => {
                                      if (partyUnmatched) return `"${doc.partyRaw}" — not found`;
                                      const p = parties.find((pp) => pp.id === doc.partyId);
                                      return p ? p.name : '';
                                    })()}
                                    options={parties.map((p) => ({
                                      value: p.id,
                                      label: p.name,
                                      sub: p.tradeName ? `(${p.tradeName})` : undefined,
                                    }))}
                                  />
                                </div>
                              </td>
                            </>
                          )}

                          {/* Item line cells */}
                          <td className="py-1.5 px-3">
                            <div className={itemUnmatched ? 'rounded-lg ring-1 ring-[var(--color-error)]/60' : ''}>
                              <SearchableSelect
                                value={line.itemId}
                                onChange={(v) => handleLineChange(doc, line, 'itemId', v)}
                                placeholder={itemUnmatched ? `"${line.itemRaw}" — not found` : 'Type item code or name...'}
                                closedDisplay={(() => {
                                  if (itemUnmatched) return `"${line.itemRaw}" — not found`;
                                  return lineProd ? `${lineProd.code} (${lineProd.name})` : '';
                                })()}
                                options={productItems.map((p) => ({
                                  value: p.id,
                                  label: p.code,
                                  sub: `(${p.name}) · Qty: ${p.currentStock || 0} ${p.unit}`,
                                }))}
                              />
                            </div>
                          </td>

                          {/* Item-line actions — ＋ Item on the group's last line,
                              ✕ per line — right after the item column */}
                          <td className="py-1.5 px-1.5 text-center align-middle w-16">
                            <div className="flex items-center justify-center gap-0.5">
                              {isGroupEnd && (
                                <button
                                  type="button"
                                  title={`Add another item to document ${di + 1}`}
                                  onClick={() => addLineToDoc(doc.id)}
                                  className="p-1 text-[var(--color-primary)] hover:bg-[var(--color-primary-container)]/40 rounded-full transition-colors"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={lines.length === 1 && docs.length === 1}
                                onClick={() => removeLine(doc.id, line.id)}
                                title={lines.length === 1 ? 'Removes the whole document (last item line)' : 'Remove this item line'}
                                className="p-1 text-[var(--color-error)]/70 hover:text-[var(--color-error)] hover:bg-[var(--color-error-container)]/30 disabled:opacity-20 rounded-full transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="py-1.5 px-3">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                step="any"
                                placeholder="0"
                                value={line.quantity}
                                onChange={(e) => handleLineChange(doc, line, 'quantity', e.target.value)}
                                className="w-full px-2 py-1.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-lg text-xs font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                              />
                              {/* The chosen item's unit rides the quantity input */}
                              {(() => {
                                const unitProd = items.find((it) => it.id === line.itemId);
                                return unitProd ? <span className="text-[10px] text-[var(--color-on-surface-variant)] font-semibold whitespace-nowrap">{unitProd.unit}</span> : null;
                              })()}
                            </div>
                          </td>
                          <td className="py-1.5 px-3">
                            <input
                              type="number"
                              step="any"
                              placeholder="0.00"
                              value={line.rate}
                              onChange={(e) => handleLineChange(doc, line, 'rate', e.target.value)}
                              className="w-full px-2 py-1.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-lg text-xs font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                            />
                          </td>
                          <td className="py-1.5 px-3">
                            <SearchableSelect
                              value={line.gstRate}
                              onChange={(v) => handleLineChange(doc, line, 'gstRate', v)}
                              disabledText={!lineProd ? '--' : undefined}
                              closedDisplay={line.gstRate === '' ? '--' : undefined}
                              options={[
                                { value: '', label: '--' },
                                { value: '0', label: '0%' },
                                { value: '5', label: '5%' },
                                { value: '12', label: '12%' },
                                { value: '18', label: '18%' },
                                { value: '28', label: '28%' },
                                ...(line.gstRate !== '' && !['0', '5', '12', '18', '28'].includes(line.gstRate)
                                  ? [{ value: line.gstRate, label: `${line.gstRate}% (Item Default)` }]
                                  : []),
                              ]}
                            />
                          </td>
                          <td className="py-1.5 px-3 text-right text-xs font-bold text-[var(--color-on-surface)] whitespace-nowrap">
                            {formatCurrency2(calc.totalAmount)}
                          </td>

                          {/* Document total (this document's lines summed) — kept blue */}
                          {isGroupStart && (
                            <td rowSpan={lines.length} className="py-2 px-3 align-top text-right">
                              <span className="block pt-1 text-xs font-black text-[var(--color-primary)] whitespace-nowrap">
                                {formatCurrency2(round2(docCalc.totalAmount + fleetCostOf(doc) + fleetGstOf(doc)))}
                              </span>
                              <span className="block text-[9px] text-[var(--color-on-surface-variant)] font-semibold">Doc Total · GST Incl.</span>
                            </td>
                          )}

                          {isGroupStart && (
                            <>
                              {/* Update Stock + Payment Settlement cells REMOVED
                                  (2026-10-28 — forced at the money stages) */}

                              {/* Dispatch & trip: vehicle (compulsory, same rule
                                  as the Add Sale form — own fleet or OUTSOURCED)
                                  + ONE common doc weight + distance + drop site
                                  — the auto-derived trip slip derives from these */}
                              <td rowSpan={lines.length} className="py-2 px-3 align-top">
                                {doc.vehicleId === '__out__' ? (
                                  <div className="space-y-1">
                                    <input
                                      type="text"
                                      autoFocus
                                      placeholder="RJ-14-AB-9012"
                                      value={doc.outsourcedNo}
                                      onChange={(e) => patchDoc(doc.id, { outsourcedNo: e.target.value.toUpperCase() })}
                                      className="w-full mt-0.5 px-2 py-1.5 bg-[var(--color-surface-container)] border border-[var(--color-primary)] rounded-lg text-[11px] font-mono font-bold text-[var(--color-on-surface)] focus:outline-none"
                                      title="Outsourced / market vehicle — type the plate yourself"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => patchDoc(doc.id, { vehicleId: '', outsourcedNo: '' })}
                                      className="text-[9px] font-bold text-[var(--color-primary)] hover:opacity-80"
                                    >
                                      Use fleet list
                                    </button>
                                  </div>
                                ) : (
                                  <div className="mt-0.5">
                                    <SearchableSelect
                                      value={doc.vehicleId}
                                      onChange={(v) => patchDoc(doc.id, { vehicleId: v, outsourcedNo: v === '__out__' ? '' : doc.outsourcedNo })}
                                      placeholder="Type vehicle number..."
                                      closedDisplay={(() => {
                                        const v = fleetVehicles.find((vv) => vv.id === doc.vehicleId);
                                        return v ? v.vehicleNo : '';
                                      })()}
                                      options={[
                                        { value: '__out__', label: 'Outsourced — type number', sub: '' },
                                        ...fleetVehicles.map((v) => ({
                                          value: v.id,
                                          label: v.vehicleNo,
                                          sub: `${v.type.toUpperCase()}${v.costPerKm !== undefined ? ` • ₹${v.costPerKm}/km` : ''}${v.currentDriverName ? ` • ${v.currentDriverName}` : ''}`,
                                        })),
                                      ]}
                                    />
                                  </div>
                                )}
                              </td>
                              <td rowSpan={lines.length} className="py-2 px-3 align-top">
                                <input
                                  type="number"
                                  step="any"
                                  placeholder="e.g. 24.5"
                                  value={doc.weight}
                                  onChange={(e) => patchDoc(doc.id, { weight: e.target.value })}
                                  className="w-full mt-0.5 px-2 py-1.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-lg text-xs font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                  title="Load weight of the WHOLE document in metric tonnes (one common value for all its items) — rides the dispatch trip slip"
                                />
                              </td>
                              <td rowSpan={lines.length} className="py-2 px-3 align-top">
                                <input
                                  type="number"
                                  step="any"
                                  placeholder="e.g. 42"
                                  value={doc.distanceKm}
                                  onChange={(e) => patchDoc(doc.id, { distanceKm: e.target.value })}
                                  className="w-full mt-0.5 px-2 py-1.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-lg text-xs font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                />
                              </td>
                              <td rowSpan={lines.length} className="py-2 px-3 align-top">
                                <input
                                  type="text"
                                  placeholder="e.g. NH-48 Site, Km 42"
                                  value={doc.siteAddress}
                                  onChange={(e) => patchDoc(doc.id, { siteAddress: e.target.value })}
                                  className="w-full mt-0.5 px-2 py-1.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-lg text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                />
                              </td>

                              {/* Fleet cost (per-sale): rate + GST are ALWAYS
                                  captured (saved with the sale even when the
                                  include-toggle is off). For an OUTSOURCED
                                  vehicle the cell is left EMPTY. */}
                              <td rowSpan={lines.length} className="py-2 px-3 align-top">
                                {isOutsourcedDoc(doc) ? (
                                  <span className="text-[var(--color-on-surface-variant)] font-semibold">—</span>
                                ) : (
                                  <div className="flex items-center gap-1.5 mt-0.5 flex-nowrap min-w-[160px]">
                                    <input
                                      type="number"
                                      step="any"
                                      placeholder="₹/T-km"
                                      value={doc.freightRate}
                                      onChange={(e) => patchDoc(doc.id, { freightRate: e.target.value })}
                                      className="w-16 px-1.5 py-1 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-lg text-[10px] font-mono font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                      title="Rate per tonne per KM"
                                    />
                                    <select
                                      value={doc.freightGst}
                                      onChange={(e) => patchDoc(doc.id, { freightGst: e.target.value })}
                                      className="py-1 pl-1 pr-0.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-lg text-[10px] font-bold text-[var(--color-on-surface)] focus:outline-none"
                                      title="GST on the fleet-cost row"
                                    >
                                      <option value="0">0%</option>
                                      <option value="5">5%</option>
                                      <option value="12">12%</option>
                                      <option value="18">18%</option>
                                      <option value="28">28%</option>
                                    </select>
                                  </div>
                                )}
                                {/* GST calculations show ONLY when the include
                                    toggle is ON — never a zero/excluded line */}
                                {doc.includeTransport && !isOutsourcedDoc(doc) && (
                                  Number(doc.weight) > 0 && Number(doc.distanceKm) > 0 && Number(doc.freightRate) > 0 ? (
                                    <p className="text-[10px] font-black text-[var(--color-primary)] whitespace-nowrap mt-1">
                                      {fleetCostOf(doc).toFixed(2)}
                                      {toNum(doc.freightGst) > 0 && (
                                        <span className="font-bold"> +{fleetGstOf(doc).toFixed(2)} GST</span>
                                      )}
                                    </p>
                                  ) : (
                                    null
                                  )
                                )}
                              </td>

                              {/* INCLUDE TRANSPORT COST — the gate: ON adds the
                                  fleet cost + its GST to the document; OFF adds
                                  nothing. For an OUTSOURCED vehicle the cell is
                                  left EMPTY. */}
                              <td rowSpan={lines.length} className="py-2 px-2 align-top text-center">
                                {isOutsourcedDoc(doc) ? (
                                  <span className="text-[var(--color-on-surface-variant)] font-semibold">—</span>
                                ) : (
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={doc.includeTransport}
                                    title={doc.includeTransport ? 'Transport cost included in the document total' : 'Transport cost not added (rate/GST still saved)'}
                                    onClick={() => patchDoc(doc.id, { includeTransport: !doc.includeTransport })}
                                    className={`relative inline-flex h-5 w-9 shrink-0 mt-1 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none cursor-pointer ${
                                      doc.includeTransport ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-surface-container-highest)]'
                                    }`}
                                  >
                                    <span
                                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                        doc.includeTransport ? 'translate-x-4' : 'translate-x-0'
                                      }`}
                                    />
                                  </button>
                                )}
                              </td>

                              {/* Document total repeated right after the Fleet
                                  Cost column so the dispatch columns read
                                  together (incl. fleet cost + its GST) */}
                              <td rowSpan={lines.length} className="py-2 px-3 align-top text-right">
                                <span className="block pt-1 text-xs font-black text-[var(--color-primary)] whitespace-nowrap">
                                  {formatCurrency2(docGrand(doc))}
                                </span>
                              </td>
                            </>
                          )}

                          {/* Whole-document remove — spans the document's rows */}
                          {isGroupStart && (
                            <td rowSpan={lines.length} className="py-2 px-2 text-center align-top">
                              <button
                                type="button"
                                disabled={docs.length === 1}
                                onClick={() => removeDoc(doc.id)}
                                title={docs.length === 1 ? 'The batch needs at least one document' : `Remove whole document ${di + 1} (all its items)`}
                                className="p-1 mt-1.5 text-[var(--color-error)]/70 hover:text-[var(--color-error)] hover:bg-[var(--color-error-container)]/30 disabled:opacity-20 rounded-full transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>

            {/* Add Row / Add 5 Rows — new independent documents */}
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => addDocument(1)}
                  className="inline-flex items-center gap-1 px-4 py-1.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-[11px] font-bold hover:opacity-90 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Row
                </button>
                <button
                  type="button"
                  onClick={() => addDocument(5)}
                  className="inline-flex items-center gap-1 px-4 py-1.5 border border-[var(--color-outline-variant)] text-[var(--color-on-surface)] rounded-full text-[11px] font-bold hover:bg-[var(--color-surface-container-high)] transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add 5 Rows
                </button>
                
              </div>
              
            </div>
          </div>

        
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 border border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] rounded-full text-xs font-semibold hover:bg-[var(--color-surface-container-high)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmitBatch}
            className="px-6 py-2.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-semibold hover:opacity-90 transition-all shadow-xs"
          >
            Create {docs.length} Document{docs.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}