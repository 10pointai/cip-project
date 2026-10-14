import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  Trash2,
  Paperclip,
  Eye,
  AlertCircle,
} from 'lucide-react';
import { EvidenceFile } from '../../types';

interface EvidenceUploadWidgetProps {
  files: Array<{
    name: string;
    size: number;
    type: string;
    dataUrl?: string;
    description?: string;
  }>;
  onFilesChange: (
    files: Array<{
      name: string;
      size: number;
      type: string;
      dataUrl?: string;
      description?: string;
    }>
  ) => void;
  entityName?: string;
  entryLabel?: string;
  maxFiles?: number;
}

export function EvidenceUploadWidget({
  files,
  onFilesChange,
  entityName,
  entryLabel = 'Transaction',
  maxFiles = 5,
}: EvidenceUploadWidgetProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    setUploadError(null);

    const newFilesList = [...files];

    Array.from(selectedFiles).forEach((file) => {
      if (newFilesList.length >= maxFiles) {
        setUploadError(`Maximum limit of ${maxFiles} attachments reached.`);
        return;
      }

      // Check file size (cap at 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setUploadError(`File "${file.name}" exceeds 10MB limit.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        newFilesList.push({
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          dataUrl: dataUrl,
          description: `Uploaded evidence for ${entryLabel} - ${entityName || 'General'}`,
        });
        onFilesChange([...newFilesList]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemove = (index: number) => {
    const updated = files.filter((_, i) => i !== index);
    onFilesChange(updated);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider flex items-center gap-1.5">
          <Paperclip className="w-3.5 h-3.5 text-[var(--color-primary)]" />
          <span>Upload Supporting Evidences / Documents</span>
          <span className="text-[10px] font-normal text-[var(--color-outline)] normal-case">
            (Optional • Weighbridge slips, Invoices, Bank receipts)
          </span>
        </label>
        <span className="text-[11px] font-semibold text-[var(--color-outline)]">
          {files.length} / {maxFiles} files
        </span>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFileSelect(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-4 sm:p-5 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-[var(--color-primary)] bg-[var(--color-primary-container)]/30'
            : 'border-[var(--color-outline-variant)] hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-container-low)]'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
        />
        <div className="flex flex-col items-center justify-center gap-1.5 pointer-events-none">
          <div className="w-10 h-10 rounded-full bg-[var(--color-primary-container)] text-[var(--color-primary)] flex items-center justify-center mb-1">
            <UploadCloud className="w-5 h-5" />
          </div>
          <p className="text-xs font-semibold text-[var(--color-on-surface)]">
            <span className="text-[var(--color-primary)] underline underline-offset-2">Click to upload</span> or drag and drop
          </p>
          <p className="text-[11px] text-[var(--color-on-surface-variant)]">
            PDF, JPG, PNG, WEBP, Excel up to 10MB
          </p>
        </div>
      </div>

      {uploadError && (
        <div className="flex items-center gap-2 p-2.5 bg-[var(--color-error-container)] text-[var(--color-on-error-container)] rounded-lg text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Uploaded File list preview */}
      {files.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          {files.map((file, idx) => {
            const isImg = file.type.startsWith('image/') && file.dataUrl;
            return (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 p-2.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-xl group transition-all"
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  {isImg ? (
                    <img
                      src={file.dataUrl}
                      alt={file.name}
                      className="w-9 h-9 object-cover rounded-lg border border-[var(--color-outline-variant)] shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)] flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                  )}
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-[var(--color-on-surface)] truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-[10px] text-[var(--color-on-surface-variant)] font-medium">
                      {formatFileSize(file.size)} • Auto-folders to {entityName || 'Entity Vault'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(idx);
                  }}
                  className="p-1.5 text-[var(--color-outline)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-container)]/30 rounded-lg transition-colors shrink-0"
                  title="Remove attachment"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
