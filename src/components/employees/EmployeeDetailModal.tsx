import React, { useState, useEffect } from 'react';
import {
  X,
  Contact,
  Phone,
  Mail,
  Calendar,
  Clock,
  CreditCard,
  Landmark,
  Loader2,
  ExternalLink,
  Edit,
  Coins,
  BadgeCheck,
} from 'lucide-react';
import { Employee, EmployeePayment } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { api } from '../../services/api';
import { AppDocument } from '../../types';

interface EmployeeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
  payments: EmployeePayment[];
  currencySymbol: string;
  onEdit: (emp: Employee) => void;
}

/**
 * Employee Details — full master-card view opened by clicking the employee's
 * name in the Staff Directory. Shows every captured field, the linked
 * verification documents (Aadhaar / PAN scans from S3) and this employee's
 * payment history, with quick Edit / Payslip actions.
 */
export function EmployeeDetailModal({
  isOpen,
  onClose,
  employee,
  payments,
  currencySymbol,
  onEdit,
}: EmployeeDetailModalProps) {
  const [docs, setDocs] = useState<AppDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);

  useEffect(() => {
    if (!isOpen || !employee) return;
    let active = true;
    setIsLoadingDocs(true);
    api
      .getEmployeeDocuments(employee.id)
      .then((res) => {
        if (active && res.success) setDocs(res.data || []);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setIsLoadingDocs(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen, employee?.id]);

  if (!isOpen || !employee) return null;

  const empPayments = payments.filter((p) => p.employeeId === employee.id);
  const openDocument = async (docId: string) => {
    try {
      const res = await api.getDocumentDownloadUrl(docId);
      if (res.success && res.data?.url) {
        window.open(res.data.url, '_blank', 'noopener');
      }
    } catch {
      // the list link below still carries the fallback doc record
    }
  };

  const infoRow = (label: string, value?: string | number | null, Icon?: any) => (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-[var(--color-outline-variant)]/40 last:border-0">
      <span className="text-[10px] font-black text-[var(--color-on-surface-variant)] uppercase tracking-wider flex items-center gap-1.5 shrink-0 pt-0.5">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </span>
      <span className="text-xs font-bold text-[var(--color-on-surface)] text-right break-words min-w-0">
        {value === undefined || value === null || value === '' ? '—' : value}
      </span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/40 backdrop-blur-xs">
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-outline-variant)] shadow-2xl w-full max-w-2xl overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-[var(--color-outline-variant)] flex justify-between items-start bg-[var(--color-surface-container)]">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] font-black flex items-center justify-center text-sm border border-[var(--color-outline-variant)] shrink-0">
              {employee.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .substring(0, 2)
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-[var(--color-on-surface)] flex items-center gap-2">
                <Contact className="w-5 h-5 text-[var(--color-primary)] shrink-0" />
                {employee.name}
              </h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="inline-block text-[10px] font-bold bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] px-2 py-0.5 rounded-full capitalize">
                  {employee.role}
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                  employee.status === 'active'
                    ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]'
                    : 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${employee.status === 'active' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'}`} />
                  {employee.status}
                </span>
                <span className="text-[10px] font-mono text-[var(--color-on-surface-variant)] truncate max-w-[140px]">{employee.id}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] p-1.5 rounded-full hover:bg-[var(--color-surface-container-high)] shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Personal & Identity */}
          <div className="p-4 rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)]">
            <h4 className="text-[10px] font-black text-[var(--color-primary)] uppercase tracking-wider mb-2">Personal & Identity</h4>
            {infoRow('Phone', employee.phone, Phone)}
            {infoRow('Email', employee.email, Mail)}
            {infoRow('Aadhaar No', employee.aadhaarNo)}
            {infoRow('PAN No', employee.panNo)}
            {employee.role === 'driver' && infoRow('Driving License (HCV)', employee.licenseNo, BadgeCheck)}
            {infoRow('Joining Date', employee.joiningDate, Calendar)}
            {infoRow('Shift In Time', employee.defaultInTime, Clock)}
            {infoRow('Shift Out Time', employee.defaultOutTime, Clock)}
          </div>

          {/* Compensation & Bank */}
          <div className="p-4 rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)]">
            <h4 className="text-[10px] font-black text-[var(--color-success)] uppercase tracking-wider mb-2">Payout Structure & Bank Details</h4>
            {infoRow(
              'Base Payout',
              `${formatCurrency(employee.salaryBase, currencySymbol)} per ${employee.salaryType}`,
              CreditCard
            )}
            {infoRow('Bank Account No', employee.bankAccountNo, Landmark)}
            {infoRow('IFSC Code', employee.bankIFSC, Landmark)}
            {infoRow('UPI Address (VPA)', employee.upiAddress, Landmark)}
            {infoRow('Name on Account', employee.nameOnAccount, Landmark)}
          </div>

          {/* Verification documents */}
          <div className="p-4 rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)]">
            <h4 className="text-[10px] font-black text-[var(--color-primary)] uppercase tracking-wider mb-2">Verification Documents</h4>
            {isLoadingDocs ? (
              <p className="flex items-center gap-1.5 text-[10px] text-[var(--color-on-surface-variant)] py-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading documents…
              </p>
            ) : docs.length === 0 ? (
              <p className="text-xs text-[var(--color-on-surface-variant)] py-1">No documents uploaded yet.</p>
            ) : (
              <div className="space-y-1">
                {docs.map((d) => (
                  <div key={d.id} className="flex items-center justify-between p-2 rounded-xl bg-[var(--color-surface-container)] text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <ExternalLink className="w-3.5 h-3.5 text-[var(--color-on-surface-variant)] shrink-0" />
                      <span className="font-bold text-[var(--color-on-surface)] truncate block max-w-[260px]" title={d.documentName || d.fileName}>
                        {d.documentName || d.fileName}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openDocument(d.id)}
                      className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-primary)] hover:underline shrink-0"
                    >
                      Open
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payment history */}
          <div className="p-4 rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)]">
            <h4 className="text-[10px] font-black text-[var(--color-success)] uppercase tracking-wider mb-2">Payment History</h4>
            {empPayments.length === 0 ? (
              <p className="text-xs text-[var(--color-on-surface-variant)] py-1">No payments recorded for this employee yet.</p>
            ) : (
              <div className="space-y-1">
                {empPayments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-2 rounded-xl bg-[var(--color-surface-container)] text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Coins className="w-3.5 h-3.5 text-[var(--color-on-surface-variant)] shrink-0" />
                      <span className="font-bold text-[var(--color-on-surface)] capitalize">{p.type}</span>
                      <span className="text-[10px] text-[var(--color-on-surface-variant)]">{p.date}</span>
                    </div>
                    <span className={`font-black text-xs ${p.type === 'advance' ? 'text-[var(--color-error)]' : 'text-[var(--color-success)]'}`}>
                      {p.type === 'advance' ? '-' : ''}{formatCurrency(p.amount, currencySymbol)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--color-outline-variant)] flex justify-end gap-3 bg-[var(--color-surface-container)]">
          <button
            onClick={() => {
              onClose();
              onEdit(employee);
            }}
            className="px-4 py-2 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] font-bold text-xs rounded-full hover:bg-[var(--color-surface-container-highest)] transition flex items-center gap-1.5"
          >
            <Edit className="w-3.5 h-3.5" /> Edit Details
          </button>
        </div>
      </div>
    </div>
  );
}