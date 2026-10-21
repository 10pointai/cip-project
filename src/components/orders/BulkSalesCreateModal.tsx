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
  items: BulkItemLine[];
  // Per-document one-shot inventory application (quotation never deducts;
  // invoice deducts permanently — the flag is forced on there)
  updateInventory: boolean;
  // Per-document payment settlement (sales order & invoice stages)
  settlementType: 'none' | 'credit' | 'account';
  settlementAccountId: string;
  paymentMode: string;
}

const STAGE_CHOICES: Array<{ id: SalesStage; label: string }> = [
  { id: 'quotation', label: 'Quotation' },
  { id: 'sales_order', label: 'Sales Order' },
  { id: 'sales_invoice', label: 'Invoice' },
];

/** Document number prefix per stage (mirrors suggestStageNumber): */
const PREFIX_BY_STAGE: Record<string, string> = {
  quotation: 'QUO',
  sales_order: 'SO',
  sales_invoice: 'INV',
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

  // Fresh batch every time the modal opens — 5 empty documents ready to fill
  useEffect(() => {
    if (!isOpen) return;
    setDocs(Array.from({ length: 5 }, emptyDoc));
    setError(null);
    setIsPasteOpen(false);
    setPasteText('');
    setPasteReport(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const productItems = useMemo(() => items.filter((i) => i.type === 'product' && i.isActive), [items]);

  // Cash/Bank accounts are read straight from the cloud store (the same source
  // the single-create form uses); keyed on isOpen so each open re-reads them.
  const activeAccounts = useMemo(() => {
    try {
      return cloudStore.getAccounts().filter((a) => a.isActive);
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
    const mk = (prefix: string, n: number) => `${prefix}-${year}-${String(n).padStart(4, '0')}`;
    return docs.map((doc) => {
      const prefix = PREFIX_BY_STAGE[doc.stage] || 'SO';
      let n = nextForPrefix.get(prefix) || 1;
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
      settlementType: stage === 'sales_invoice' ? 'credit' : 'none',
      settlementAccountId: '',
      updateInventory: stage === 'sales_invoice',
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
      const validLines = doc.items.filter((l) => l.itemId && Number(l.quantity) > 0 && Number(l.rate) > 0);
      if (validLines.length === 0) {
        setError(`Document ${i + 1} (${num}): Add at least one valid item with a quantity and rate greater than zero.`);
        return;
      }
      if (!doc.date) {
        setError(`Document ${i + 1} (${num}): Please pick the document date.`);
        return;
      }
      if (doc.settlementType === 'account') {
        if (!doc.settlementAccountId || !activeAccounts.find((a) => a.id === doc.settlementAccountId)) {
          setError(`Document ${i + 1} (${num}): The selected Cash/Bank account is invalid. Please choose an active account or Book on credit.`);
          return;
        }
      }
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
      const { subtotal, taxAmount, totalAmount } = calcDoc(doc);
      const updateInventory =
        doc.stage === 'sales_invoice' ? true : doc.stage === 'sales_order' ? doc.updateInventory : false;
      onAddSale({
        saleNumber: docNumbers[i],
        partyId: doc.partyId,
        date: doc.date,
        items: itemsList,
        subtotal,
        taxAmount,
        totalAmount,
        stage: {
          stageType: doc.stage,
          stageNumber: docNumbers[i],
          date: doc.date,
          updateInventory,
          updateCash: doc.settlementType !== 'none',
          settlementType: doc.settlementType !== 'none' ? doc.settlementType : undefined,
          settlementAccountId: doc.settlementType === 'account' ? doc.settlementAccountId : undefined,
          paymentMode: doc.settlementType === 'account' ? doc.paymentMode : undefined,
        },
      });
    });

    onClose();
  };

  if (!isOpen) return null;

  const batchTotal = docs.reduce((sum, d) => sum + calcDoc(d).totalAmount, 0);
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
              <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                Each document = its own party + one or more items (＋ Item to add another) — type rows in the grid or paste from Excel
              </p>
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

          {/* Paste from Excel panel */}
          <div className="rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] overflow-hidden">
            <button
              type="button"
              onClick={() => setIsPasteOpen((open) => !open)}
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-[var(--color-surface-container-high)]/50 transition-colors"
            >
              <span className="flex items-center gap-2 text-xs font-bold text-[var(--color-on-surface)]">
                <ClipboardPaste className="w-4 h-4 text-[var(--color-primary)]" /> Paste from Excel / Google Sheets
              </span>
              <span className="text-[10px] font-bold text-[var(--color-on-surface-variant)]">
                {isPasteOpen ? 'Hide' : 'Columns: Party | Item | Quantity | Rate'}
              </span>
            </button>
            {isPasteOpen && (
              <div className="px-4 pb-4 pt-2 space-y-2 border-t border-[var(--color-outline-variant)]/60">
                <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                  Copy your rows in Excel/Sheets, paste below and press Import. Columns per line:
                  <strong className="text-[var(--color-on-surface)]"> Party | Item | Quantity | Rate</strong> (tab or comma separated; a header line is skipped
                  automatically). Parties and items are matched by name/code — the rate defaults to the item's sale price when empty.
                  <strong className="text-[var(--color-on-surface)]"> Consecutive rows with the same party merge into one document</strong>, so multiple item
                  lines of an order can be pasted one after another. Imported documents arrive as <strong className="text-[var(--color-on-surface)]">Sales
                  Orders</strong> dated today. You can also paste <strong className="text-[var(--color-on-surface)]">directly onto the grid</strong> with Ctrl+V.
                </p>
                <textarea
                  rows={6}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={'Sharma Traders\tBIT-EMP\t50\t4200\nSharma Traders\tBIT-VG30\t20\t4150\nVerma Infra\tBIT-EMP\t25\t4200'}
                  className="w-full px-3 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl text-[11px] font-mono font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => importPaste(pasteText)}
                      disabled={!pasteText.trim()}
                      className="px-4 py-1.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-[11px] font-bold hover:opacity-90 disabled:opacity-40 transition-all"
                    >
                      Import Rows
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPasteText('');
                        setPasteReport(null);
                      }}
                      className="px-3 py-1.5 text-[11px] font-bold text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                  {pasteReport && (
                    <div className="text-[10px] font-bold flex items-center gap-2 flex-wrap">
                      <span className="text-[var(--color-success)]">{pasteReport.ok} row(s) matched</span>
                      {(pasteReport.badParties.length > 0 || pasteReport.badItems.length > 0) && (
                        <span className="text-[var(--color-error)] inline-flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Unmatched parties: {pasteReport.badParties.join(', ') || '—'} · Items: {pasteReport.badItems.join(', ') || '—'} — resolve them in the grid below
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* The grid — one ROW per item line; a document's lines sit together,
              its document-level columns spanning them */}
          <div className="border border-[var(--color-outline-variant)] rounded-2xl bg-[var(--color-surface-container)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[1700px]">
                <thead>
                  <tr className="bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] font-bold text-[10px] uppercase border-b border-[var(--color-outline-variant)]">
                    <th className="py-2.5 px-2 w-9 text-center">#</th>
                    <th className="py-2.5 px-2 w-40">Type</th>
                    <th className="py-2.5 px-3 min-w-[150px]">Doc Number</th>
                    <th className="py-2.5 px-3 w-40">Date</th>
                    <th className="py-2.5 px-3 min-w-[200px]">Party</th>
                    <th className="py-2.5 px-3 min-w-[220px]">Item / Product</th>
                    <th className="py-2.5 px-2 w-14"></th>
                    <th className="py-2.5 px-3 w-28">Qty</th>
                    <th className="py-2.5 px-3 w-32">Rate ({settings.currency?.symbol || '₹'})</th>
                    <th className="py-2.5 px-3 w-24">GST</th>
                    <th className="py-2.5 px-3 w-28 text-right">Line Amount</th>
                    <th className="py-2.5 px-3 w-32 text-right">Doc Total</th>
                    <th className="py-2.5 px-2 w-24 text-center">Stock</th>
                    <th className="py-2.5 px-3 min-w-[180px]">Payment Settlement</th>
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
                                    onChange={(v) => patchDoc(doc.id, { partyId: v, partyRaw: undefined })}
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
                          <td className="py-1.5 px-1.5 text-center align-middle w-14">
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
                            <input
                              type="number"
                              step="any"
                              placeholder="0"
                              value={line.quantity}
                              onChange={(e) => handleLineChange(doc, line, 'quantity', e.target.value)}
                              className="w-full px-2 py-1.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-lg text-xs font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                            />
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
                                {formatCurrency2(docCalc.totalAmount)}
                              </span>
                              <span className="block text-[9px] text-[var(--color-on-surface-variant)] font-semibold">Doc Total · GST Incl.</span>
                            </td>
                          )}

                          {isGroupStart && (
                            <>
                              {/* Stock — per document; quotation never deducts, invoice always does */}
                              <td rowSpan={lines.length} className="py-2 px-2 text-center align-top">
                                {doc.stage === 'quotation' ? (
                                  <span className="text-[11px] font-bold text-[var(--color-outline)] block pt-1.5">—</span>
                                ) : doc.stage === 'sales_invoice' ? (
                                  <span
                                    title="Issuing an invoice permanently posts the FIFO dispatch — inventory always deducts"
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 mt-1.5 rounded bg-[var(--color-primary-container)] text-[9px] font-bold uppercase text-[var(--color-on-primary-container)]"
                                  >
                                    <Boxes className="w-2.5 h-2.5" /> ON
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={doc.updateInventory}
                                    title={doc.updateInventory ? 'FIFO sale_dispatch posts at batch save' : 'Inventory stays untouched'}
                                    onClick={() => patchDoc(doc.id, { updateInventory: !doc.updateInventory })}
                                    className={`relative inline-flex h-5 w-9 shrink-0 mt-1.5 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                      doc.updateInventory ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-surface-container-highest)]'
                                    } cursor-pointer`}
                                  >
                                    <span
                                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                        doc.updateInventory ? 'translate-x-4' : 'translate-x-0'
                                      }`}
                                    />
                                  </button>
                                )}
                              </td>

                              {/* Per-document payment settlement */}
                              <td rowSpan={lines.length} className="py-2 px-3 align-top">
                                {doc.stage === 'quotation' ? (
                                  <span className="text-[11px] font-bold text-[var(--color-outline)] block pt-1.5">—</span>
                                ) : (
                                  <>
                                    <select
                                      value={doc.settlementType === 'account' ? doc.settlementAccountId : doc.settlementType}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        if (v === 'none' || v === 'credit') {
                                          patchDoc(doc.id, { settlementType: v, settlementAccountId: '' });
                                        } else {
                                          patchDoc(doc.id, { settlementType: 'account', settlementAccountId: v, paymentMode: doc.paymentMode || 'bank_transfer' });
                                        }
                                      }}
                                      className={`w-full mt-0.5 px-2 py-1.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-lg text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] ${
                                        doc.settlementType === 'account' && !doc.settlementAccountId ? 'border-[var(--color-error)]/60' : ''
                                      }`}
                                    >
                                      {doc.stage !== 'sales_invoice' && <option value="none">Don't touch</option>}
                                      <option value="credit">Book on credit</option>
                                      {activeAccounts.map((acc) => (
                                        <option key={acc.id} value={acc.id}>
                                          {acc.name} [{acc.type === 'bank' ? (acc.bankName || 'Bank A/c') : 'Cash'}]
                                        </option>
                                      ))}
                                    </select>
                                    {doc.settlementType === 'account' && (
                                      <select
                                        value={doc.paymentMode}
                                        onChange={(e) => patchDoc(doc.id, { paymentMode: e.target.value })}
                                        className="w-full mt-1 px-2 py-1 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-lg text-[10px] font-medium text-[var(--color-on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                      >
                                        <option value="bank_transfer">Bank Transfer / IMPS</option>
                                        <option value="neft_rtgs">NEFT / RTGS</option>
                                        <option value="upi">UPI / QR Code</option>
                                        <option value="cheque">Cheque / DD</option>
                                        <option value="cash">Cash</option>
                                      </select>
                                    )}
                                  </>
                                )}
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
                <span className="text-[10px] text-[var(--color-on-surface-variant)] font-medium ml-1">
                  (new documents, one item each)
                </span>
              </div>
              <p className="text-[10px] text-[var(--color-on-surface-variant)] font-medium hidden sm:flex items-center gap-1.5">
                <ClipboardPaste className="w-3 h-3" /> Tip: copy rows in Excel and press Ctrl+V anywhere on the grid — consecutive same-party lines merge into one document.
              </p>
            </div>
          </div>

          {/* Batch summary */}
          <div className="p-3.5 bg-[var(--color-success-container)]/30 border border-[var(--color-success)]/30 rounded-2xl text-[11px] text-[var(--color-on-success-container)] flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Batch summary:</span> {stageCounts || 'no rows yet'} ({totalLines} item line{totalLines !== 1 ? 's' : ''} across{' '}
              {docs.length} document{docs.length !== 1 ? 's' : ''}) will be created at once ({formatCurrency2(batchTotal)} total GST inclusive), numbered per
              stage automatically and shown on the list right away.
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