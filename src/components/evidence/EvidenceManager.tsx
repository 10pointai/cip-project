import React, { useState, useMemo, useRef } from 'react';
import {
  Folder,
  FolderPlus,
  FileText,
  UploadCloud,
  Search,
  Filter,
  ChevronRight,
  MoreVertical,
  Trash2,
  Edit2,
  Eye,
  Download,
  Printer,
  Sparkles,
  Tag,
  ArrowLeft,
  LayoutGrid,
  List,
  CheckCircle2,
  Calendar,
  Layers,
  Paperclip,
  Users,
  Truck,
  HardHat,
  Building2,
  ShieldCheck,
  FileSpreadsheet,
  FileCheck,
  ExternalLink,
  X,
  Plus,
  FolderOpen,
} from 'lucide-react';
import { EvidenceFolder, EvidenceFile, EvidenceEntityType } from '../../types';
import { useDatabase } from '../../hooks/useDatabase';
import { useToast } from '../common/Toast';
import { formatDate } from '../../utils/formatters';
import { uploadFileToS3 } from '../../services/s3Upload';
import { UploadProgressBar, UploadRowState } from '../common/UploadProgressBar';

/** One queued file in the upload modal — keeps the raw File for the S3 stream */
interface EvidenceUploadQueueItem {
  qid: string;
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
  file: File;
}

interface EvidenceManagerProps {
  initialEntityType?: EvidenceEntityType;
  initialEntityId?: string;
  initialEntityName?: string;
  initialFolderId?: string;
  title?: string;
  onClose?: () => void;
  isEmbedded?: boolean;
}

export function EvidenceManager({
  initialEntityType,
  initialEntityId,
  initialEntityName,
  initialFolderId,
  title,
  onClose,
  isEmbedded = false,
}: EvidenceManagerProps) {
  const { db, evidenceFolders, evidenceFiles, parties, vehicles, employees } = useDatabase();
  const { showToast } = useToast();

  // Navigation State
  const [activeEntityType, setActiveEntityType] = useState<EvidenceEntityType | 'all'>(
    initialEntityType || 'all'
  );
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(initialFolderId || null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');

  // Modals state
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedFileForPreview, setSelectedFileForPreview] = useState<EvidenceFile | null>(null);
  const [folderToEdit, setFolderToEdit] = useState<EvidenceFolder | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<EvidenceFolder | null>(null);
  const [fileToDelete, setFileToDelete] = useState<EvidenceFile | null>(null);

  // New Folder Form
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#0284c7');
  const [newFolderDescription, setNewFolderDescription] = useState('');

  // Upload Modal Form
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadFilesQueue, setUploadFilesQueue] = useState<EvidenceUploadQueueItem[]>([]);
  // Per-row upload progress (keyed by qid) rendered by UploadProgressBar
  const [uploadStates, setUploadStates] = useState<Record<string, UploadRowState>>({});
  const [isUploading, setIsUploading] = useState(false);
  const uploadAbortsRef = useRef<Map<string, () => void>>(new Map());
  const [uploadTargetFolderId, setUploadTargetFolderId] = useState<string>(currentFolderId || '');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadLinkedEntryType, setUploadLinkedEntryType] = useState('');
  const [uploadLinkedEntryId, setUploadLinkedEntryId] = useState('');

  // Current active folder object
  const currentFolder = useMemo(() => {
    if (!currentFolderId) return null;
    return evidenceFolders.find((f) => f.id === currentFolderId) || null;
  }, [evidenceFolders, currentFolderId]);

  // Compute breadcrumbs trail
  const breadcrumbs = useMemo(() => {
    const trail: EvidenceFolder[] = [];
    let curr = currentFolder;
    while (curr) {
      trail.unshift(curr);
      if (curr.parentId) {
        curr = evidenceFolders.find((f) => f.id === curr!.parentId) || null;
      } else {
        curr = null;
      }
    }
    return trail;
  }, [evidenceFolders, currentFolder]);

  // Filtered folders inside current view level
  const displayedFolders = useMemo(() => {
    return evidenceFolders.filter((f) => {
      // If inside a specific folder, show its direct children
      if (currentFolderId) {
        return f.parentId === currentFolderId;
      }

      // At root level
      if (f.parentId !== null) return false;

      // Entity type filtering
      if (initialEntityId) {
        return f.entityId === initialEntityId;
      }
      if (activeEntityType !== 'all') {
        return f.entityType === activeEntityType;
      }

      return true;
    }).filter((f) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        f.name.toLowerCase().includes(q) ||
        (f.description && f.description.toLowerCase().includes(q)) ||
        (f.entityName && f.entityName.toLowerCase().includes(q))
      );
    });
  }, [evidenceFolders, currentFolderId, activeEntityType, initialEntityId, searchQuery]);

  // Filtered files inside current view level
  const displayedFiles = useMemo(() => {
    return evidenceFiles.filter((fl) => {
      // If inside a specific folder, show files in this folder
      if (currentFolderId) {
        return fl.folderId === currentFolderId;
      }

      // If at root of a specific entity (embedded mode)
      if (initialEntityId) {
        return fl.entityId === initialEntityId;
      }

      // If at root of a specific entity type
      if (activeEntityType !== 'all') {
        return fl.entityType === activeEntityType;
      }

      // Show recent files or all root level files
      return true;
    }).filter((fl) => {
      if (selectedTag !== 'all') {
        if (!fl.tags || !fl.tags.includes(selectedTag)) return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        fl.name.toLowerCase().includes(q) ||
        (fl.description && fl.description.toLowerCase().includes(q)) ||
        (fl.entityName && fl.entityName.toLowerCase().includes(q)) ||
        (fl.linkedEntryId && fl.linkedEntryId.toLowerCase().includes(q)) ||
        (fl.linkedEntryType && fl.linkedEntryType.toLowerCase().includes(q))
      );
    });
  }, [evidenceFiles, currentFolderId, initialEntityId, activeEntityType, selectedTag, searchQuery]);

  // Gather unique tags for filter chips
  const allTags = useMemo(() => {
    const tagsSet = new Set<string>();
    evidenceFiles.forEach((f) => {
      f.tags?.forEach((t) => tagsSet.add(t));
    });
    return Array.from(tagsSet);
  }, [evidenceFiles]);

  // Format File Size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Handler: Create Folder
  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    let entityType = activeEntityType === 'all' ? 'general' : activeEntityType;
    let entityId = initialEntityId;
    let entityName = initialEntityName;

    // Inherit from parent folder if inside one
    if (currentFolder) {
      entityType = currentFolder.entityType;
      entityId = currentFolder.entityId;
      entityName = currentFolder.entityName;
    }

    db.addFolder({
      name: newFolderName.trim(),
      entityType,
      entityId,
      entityName,
      parentId: currentFolderId,
      isSystemGenerated: false,
      color: newFolderColor,
      description: newFolderDescription.trim(),
    });

    setNewFolderName('');
    setNewFolderDescription('');
    setIsNewFolderOpen(false);
  };

  // Handler: Update Folder
  const handleUpdateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderToEdit || !folderToEdit.name.trim()) return;

    db.updateFolder(folderToEdit.id, {
      name: folderToEdit.name.trim(),
      color: folderToEdit.color,
      description: folderToEdit.description?.trim(),
    });

    setFolderToEdit(null);
  };

  // Handler: File Upload Submission — streams every queued file to AWS S3
  // through the shared s3Upload service with live progress; the permanent S3
  // link is stored on the evidence record (s3Url/s3Key). Files fall back to
  // local dataUrl records ONLY when S3 is unconfigured on the server.
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadFilesQueue.length === 0 || isUploading) return;

    const targetFldId = uploadTargetFolderId || currentFolderId;
    const targetFolder = evidenceFolders.find((f) => f.id === targetFldId);

    const targetEntityType = targetFolder?.entityType || (activeEntityType === 'all' ? 'general' : activeEntityType);
    const targetEntityId = targetFolder?.entityId || initialEntityId;
    const targetEntityName = targetFolder?.entityName || initialEntityName;

    const parsedTags = uploadTags
      ? uploadTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    setIsUploading(true);
    let uploadedCount = 0;
    let localCount = 0;
    const failedQids: string[] = [];

    for (const q of uploadFilesQueue) {
      const { promise, abort } = uploadFileToS3(q.file, {
        feature: 'evidence',
        entityType: targetEntityType,
        entityId: targetEntityId,
        onProgress: (p) =>
          setUploadStates((prev) => ({ ...prev, [q.qid]: { status: 'uploading', progress: p } })),
      });
      uploadAbortsRef.current.set(q.qid, abort);
      const res = await promise;

      if (res.success && res.publicUrl) {
        uploadedCount += 1;
        setUploadStates((prev) => ({ ...prev, [q.qid]: { status: 'done', url: res.publicUrl } }));
        db.addFile({
          folderId: targetFldId || 'fld-gen-1',
          name: q.name,
          size: q.size,
          type: q.type,
          dataUrl: q.dataUrl,
          s3Url: res.publicUrl,
          s3Key: res.key,
          entityType: targetEntityType,
          entityId: targetEntityId,
          entityName: targetEntityName,
          linkedEntryType: uploadLinkedEntryType || undefined,
          linkedEntryId: uploadLinkedEntryId || undefined,
          description: uploadDescription || `Uploaded ${q.name}`,
          tags: parsedTags.length > 0 ? parsedTags : ['Evidence'],
        });
      } else if (res.error === 'not-configured') {
        // S3 keys absent on the server — keep the legacy local (dataUrl) record
        // so the module degrades gracefully until credentials are pasted in .env
        localCount += 1;
        setUploadStates((prev) => ({
          ...prev,
          [q.qid]: {
            status: 'local',
            message: res.message || 'AWS S3 is not configured — stored locally.',
          },
        }));
        db.addFile({
          folderId: targetFldId || 'fld-gen-1',
          name: q.name,
          size: q.size,
          type: q.type,
          dataUrl: q.dataUrl,
          entityType: targetEntityType,
          entityId: targetEntityId,
          entityName: targetEntityName,
          linkedEntryType: uploadLinkedEntryType || undefined,
          linkedEntryId: uploadLinkedEntryId || undefined,
          description: uploadDescription || `Uploaded ${q.name}`,
          tags: parsedTags.length > 0 ? parsedTags : ['Evidence'],
        });
      } else {
        failedQids.push(q.qid);
        setUploadStates((prev) => ({
          ...prev,
          [q.qid]: { status: res.error === 'aborted' ? 'aborted' : 'failed', message: res.message },
        }));
      }
    }

    setIsUploading(false);
    uploadAbortsRef.current.clear();

    // Progress toast summary
    if (uploadedCount > 0) showToast(`${uploadedCount} file${uploadedCount > 1 ? 's' : ''} uploaded to AWS S3.`, 'success');
    if (localCount > 0) showToast(`${localCount} file${localCount > 1 ? 's' : ''} stored locally — AWS S3 not configured.`, 'info');

    const remaining = failedQids.length > 0
      ? uploadFilesQueue.filter((q) => failedQids.includes(q.qid))
      : [];

    if (failedQids.length === 0) {
      setUploadFilesQueue([]);
      setUploadStates({});
      setUploadDescription('');
      setUploadTags('');
      setUploadLinkedEntryType('');
      setUploadLinkedEntryId('');
      setIsUploadOpen(false);
    } else {
      // Keep failed rows in the queue so the admin can retry after fixing them
      setUploadFilesQueue(remaining);
      const keptStates: Record<string, UploadRowState> = {};
      failedQids.forEach((qid) => {
        const s = uploadStates[qid];
        if (s) keptStates[qid] = s;
      });
      setUploadStates(keptStates);
      showToast(`${failedQids.length} upload${failedQids.length > 1 ? 's' : '' } failed — fix or cancel those rows.`, 'error');
    }
  };

  const handleQueueFiles = (filesList: FileList | null) => {
    if (!filesList) return;
    const newQueue: EvidenceUploadQueueItem[] = [...uploadFilesQueue];
    Array.from(filesList).forEach((file) => {
      const qid = `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const reader = new FileReader();
      reader.onload = (e) => {
        newQueue.push({
          qid,
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          dataUrl: e.target?.result as string,
          file,
        });
        setUploadFilesQueue([...newQueue]);
      };
      reader.readAsDataURL(file);
    });
  };

  // Closing the upload dialog abandons any in-flight S3 streams
  const handleUploadModalClose = () => {
    if (isUploading) {
      uploadAbortsRef.current.forEach((abort) => abort());
      uploadAbortsRef.current.clear();
      setIsUploading(false);
    }
    setUploadFilesQueue([]);
    setUploadStates({});
    setIsUploadOpen(false);
  };

  // Helper to get folder stats
  const getFolderStats = (folderId: string) => {
    const directFiles = evidenceFiles.filter((fl) => fl.folderId === folderId);
    const directSubfolders = evidenceFolders.filter((f) => f.parentId === folderId);
    const totalSize = directFiles.reduce((acc, fl) => acc + (fl.size || 0), 0);
    return {
      filesCount: directFiles.length,
      subfoldersCount: directSubfolders.length,
      totalSize: formatFileSize(totalSize),
    };
  };

  return (
    <div className={`space-y-5 ${isEmbedded ? '' : 'p-4 sm:p-6 max-w-7xl mx-auto'}`}>
      {/* Header Bar */}
      

      {/* Module / Entity Filter Tabs (only when not restricted to single entity) */}
      {!initialEntityId && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[
            { id: 'all', label: 'All Vaults', icon: Layers },
            { id: 'party', label: 'Parties & Customers', icon: Users },
            { id: 'vehicle', label: 'Fleet & Logistics', icon: Truck },
            { id: 'employee', label: 'Staff & Personnel', icon: HardHat },
            { id: 'general', label: 'Plant & Compliance', icon: Building2 },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeEntityType === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveEntityType(tab.id as any);
                  setCurrentFolderId(null);
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] border border-[var(--color-primary)]/30 shadow-2xs'
                    : 'bg-[var(--color-surface-container-low)] text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)]/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      )}


      {/* Folders Section */}
      {displayedFolders.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wider text-[var(--color-on-surface-variant)] flex items-center gap-1.5">
              <Folder className="w-4 h-4 text-[var(--color-primary)]" />
              <span>Folders ({displayedFolders.length})</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
            {displayedFolders.map((fld) => {
              const stats = getFolderStats(fld.id);
              return (
                <div
                  key={fld.id}
                  onClick={() => setCurrentFolderId(fld.id)}
                  className="p-4 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] border border-[var(--color-outline-variant)] rounded-2xl cursor-pointer transition-all hover:border-[var(--color-primary)] group relative shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${fld.color || '#0284c7'}20`, color: fld.color || '#0284c7' }}
                    >
                      <Folder className="w-5 h-5 fill-current opacity-80" />
                    </div>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFolderToEdit(fld);
                        }}
                        className="p-1 hover:bg-[var(--color-surface-container-highest)] rounded text-[var(--color-outline)] hover:text-[var(--color-on-surface)]"
                        title="Edit Folder"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {!fld.isSystemGenerated && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFolderToDelete(fld);
                          }}
                          className="p-1 hover:bg-[var(--color-error-container)] rounded text-[var(--color-outline)] hover:text-[var(--color-error)]"
                          title="Delete Folder"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-[var(--color-on-surface)] group-hover:text-[var(--color-primary)] truncate transition-colors">
                    {fld.name}
                  </h3>

                  {fld.description && (
                    <p className="text-[11px] text-[var(--color-on-surface-variant)] line-clamp-1 mt-0.5">
                      {fld.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[var(--color-outline-variant)]/60 text-[10px] font-semibold text-[var(--color-outline)]">
                    <span>
                      {stats.filesCount} file{stats.filesCount !== 1 ? 's' : ''}
                      {stats.subfoldersCount > 0 ? ` • ${stats.subfoldersCount} subfolders` : ''}
                    </span>
                    <span>{stats.totalSize}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Files Section */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          

          {/* Filter Chips */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedTag('all')}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-colors ${
                  selectedTag === 'all'
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)] border border-[var(--color-outline-variant)]'
                }`}
              >
                All Tags
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(tag)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-colors ${
                    selectedTag === tag
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)] border border-[var(--color-outline-variant)]'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>

        
      </div>

      {/* MODAL: New Folder */}
      {isNewFolderOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-outline-variant)]">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-[var(--color-primary)]" />
                <h3 className="text-base font-black text-[var(--color-on-surface)]">Create New Folder</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewFolderOpen(false)}
                className="p-1 rounded-full text-[var(--color-outline)] hover:text-[var(--color-on-surface)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateFolder} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1.5">
                  Folder Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Inward Delivery Challans 2026"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-xl text-xs text-[var(--color-on-surface)] focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1.5">
                  Folder Color Theme
                </label>
                <div className="flex items-center gap-2">
                  {['#0284c7', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'].map(
                    (col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => setNewFolderColor(col)}
                        style={{ backgroundColor: col }}
                        className={`w-7 h-7 rounded-full transition-transform ${
                          newFolderColor === col ? 'ring-2 ring-offset-2 ring-[var(--color-primary)] scale-110' : ''
                        }`}
                      />
                    )
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1.5">
                  Description / Purpose
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief note about the documents kept in this directory"
                  value={newFolderDescription}
                  onChange={(e) => setNewFolderDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-xl text-xs text-[var(--color-on-surface)] focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewFolderOpen(false)}
                  className="px-4 py-2 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-full text-xs font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[var(--color-primary)] hover:opacity-90 text-white rounded-full text-xs font-bold shadow-sm transition-all"
                >
                  Create Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Upload Files */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-outline-variant)]">
              <div className="flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-[var(--color-primary)]" />
                <h3 className="text-base font-black text-[var(--color-on-surface)]">Upload Documents & Evidence</h3>
              </div>
              <button
                type="button"
                onClick={handleUploadModalClose}
                className="p-1 rounded-full text-[var(--color-outline)] hover:text-[var(--color-on-surface)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              {/* Destination Folder Selector */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1.5">
                  Target Destination Folder *
                </label>
                <select
                  value={uploadTargetFolderId}
                  onChange={(e) => setUploadTargetFolderId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-xl text-xs text-[var(--color-on-surface)] focus:outline-none focus:border-[var(--color-primary)]"
                >
                  {evidenceFolders.map((f) => (
                    <option key={f.id} value={f.id}>
                      📁 {f.name} ({f.entityType.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              {/* Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[var(--color-outline-variant)] hover:border-[var(--color-primary)] rounded-xl p-5 text-center cursor-pointer bg-[var(--color-surface-container-low)] hover:bg-[var(--color-surface-container)] transition-all"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                  className="hidden"
                  onChange={(e) => handleQueueFiles(e.target.files)}
                />
                <div className="flex flex-col items-center justify-center gap-1.5">
                  <UploadCloud className="w-8 h-8 text-[var(--color-primary)]" />
                  <p className="text-xs font-bold text-[var(--color-on-surface)]">
                    Click to browse files or drop here
                  </p>
                  <p className="text-[11px] text-[var(--color-on-surface-variant)]">
                    Supports PDFs, PNG, JPG, Excel, Docs up to 10MB
                  </p>
                </div>
              </div>

              {/* Queued Files preview + live S3 progress */}
              {uploadFilesQueue.length > 0 && (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {uploadFilesQueue.map((file) => {
                    const rowState = uploadStates[file.qid] || { status: 'queued' as const };
                    const canRemoveRow = !isUploading || (rowState.status === 'failed' || rowState.status === 'aborted');
                    return (
                      <UploadProgressBar
                        key={file.qid}
                        name={file.name}
                        size={file.size}
                        state={rowState}
                        onCancel={() => {
                          uploadAbortsRef.current.get(file.qid)?.();
                          uploadAbortsRef.current.delete(file.qid);
                        }}
                        onRemove={
                          canRemoveRow
                            ? () => {
                                setUploadFilesQueue(uploadFilesQueue.filter((f) => f.qid !== file.qid));
                                setUploadStates((prev) => {
                                  const next = { ...prev };
                                  delete next[file.qid];
                                  return next;
                                });
                              }
                            : undefined
                        }
                      />
                    );
                  })}
                </div>
              )}

              {/* Extra Metadata fields */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1.5">
                  Document Notes / Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. Weighbridge gross tare slip signed by site engineer"
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  className="w-full px-3.5 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-xl text-xs text-[var(--color-on-surface)] focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1.5">
                    Linked Voucher / Bill # (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. SINV-26/001 or TS-26/001"
                    value={uploadLinkedEntryId}
                    onChange={(e) => setUploadLinkedEntryId(e.target.value)}
                    className="w-full px-3.5 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-xl text-xs text-[var(--color-on-surface)] focus:outline-none focus:border-[var(--color-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1.5">
                    Tags (Comma separated)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Invoice, Signed, DBM"
                    value={uploadTags}
                    onChange={(e) => setUploadTags(e.target.value)}
                    className="w-full px-3.5 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-xl text-xs text-[var(--color-on-surface)] focus:outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleUploadModalClose}
                  className="px-4 py-2 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-full text-xs font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadFilesQueue.length === 0 || isUploading}
                  className="px-5 py-2 bg-[var(--color-primary)] disabled:opacity-50 hover:opacity-90 text-white rounded-full text-xs font-bold shadow-sm transition-all"
                >
                  {isUploading ? 'Uploading…' : `Save & Upload (${uploadFilesQueue.length})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: File Preview & Inspector */}
      {selectedFileForPreview && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-outline-variant)]">
              <div className="flex items-center gap-2 overflow-hidden">
                <FileText className="w-5 h-5 text-[var(--color-primary)] shrink-0" />
                <h3 className="text-base font-black text-[var(--color-on-surface)] truncate">
                  {selectedFileForPreview.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFileForPreview(null)}
                className="p-1 rounded-full text-[var(--color-outline)] hover:text-[var(--color-on-surface)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Preview Frame */}
            <div className="rounded-xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)] p-4 flex items-center justify-center min-h-[220px]">
              {selectedFileForPreview.type.startsWith('image/') && selectedFileForPreview.dataUrl ? (
                <img
                  src={selectedFileForPreview.dataUrl}
                  alt={selectedFileForPreview.name}
                  className="max-h-72 object-contain rounded-lg"
                />
              ) : (
                <div className="text-center space-y-2">
                  <FileText className="w-16 h-16 text-[var(--color-primary)] mx-auto" />
                  <p className="text-xs font-bold text-[var(--color-on-surface)]">
                    {selectedFileForPreview.name}
                  </p>
                  <p className="text-[11px] text-[var(--color-on-surface-variant)]">
                    Document format: {selectedFileForPreview.type} • {formatFileSize(selectedFileForPreview.size)}
                  </p>
                </div>
              )}
            </div>

            {/* File Metadata Details */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 bg-[var(--color-surface-container)] rounded-xl text-xs">
              <div>
                <p className="text-[10px] font-bold text-[var(--color-outline)] uppercase">Entity Associated</p>
                <p className="font-bold text-[var(--color-on-surface)] mt-0.5">
                  {selectedFileForPreview.entityName || selectedFileForPreview.entityType}
                </p>
              </div>

              <div>
                <p className="text-[10px] font-bold text-[var(--color-outline)] uppercase">File Size</p>
                <p className="font-bold text-[var(--color-on-surface)] mt-0.5">
                  {formatFileSize(selectedFileForPreview.size)}
                </p>
              </div>

              <div>
                <p className="text-[10px] font-bold text-[var(--color-outline)] uppercase">Uploaded On</p>
                <p className="font-bold text-[var(--color-on-surface)] mt-0.5">
                  {formatDate(selectedFileForPreview.createdAt)}
                </p>
              </div>

              {selectedFileForPreview.linkedEntryId && (
                <div>
                  <p className="text-[10px] font-bold text-[var(--color-outline)] uppercase">Linked Voucher</p>
                  <p className="font-bold text-[var(--color-primary)] mt-0.5">
                    {selectedFileForPreview.linkedEntryId}
                  </p>
                </div>
              )}

              {selectedFileForPreview.description && (
                <div className="col-span-2">
                  <p className="text-[10px] font-bold text-[var(--color-outline)] uppercase">Description</p>
                  <p className="font-medium text-[var(--color-on-surface-variant)] mt-0.5">
                    {selectedFileForPreview.description}
                  </p>
                </div>
              )}
            </div>

            {/* Tags */}
            {selectedFileForPreview.tags && selectedFileForPreview.tags.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {selectedFileForPreview.tags.map((t) => (
                  <span
                    key={t}
                    className="px-2.5 py-0.5 rounded-full bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] text-[10px] font-bold"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  setFileToDelete(selectedFileForPreview);
                  setSelectedFileForPreview(null);
                }}
                className="px-3 py-2 text-[var(--color-error)] hover:bg-[var(--color-error-container)]/40 rounded-full text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete File</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedFileForPreview(null)}
                  className="px-4 py-2 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-full text-xs font-bold transition-colors"
                >
                  Close
                </button>

                {selectedFileForPreview.dataUrl && (
                  <a
                    href={selectedFileForPreview.dataUrl}
                    download={selectedFileForPreview.name}
                    className="px-4 py-2 bg-[var(--color-primary)] hover:opacity-90 text-white rounded-full text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Edit Folder */}
      {folderToEdit && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-outline-variant)]">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-[var(--color-primary)]" />
                <h3 className="text-base font-black text-[var(--color-on-surface)]">Edit Folder Properties</h3>
              </div>
              <button
                type="button"
                onClick={() => setFolderToEdit(null)}
                className="p-1 rounded-full text-[var(--color-outline)] hover:text-[var(--color-on-surface)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateFolder} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1.5">
                  Folder Name *
                </label>
                <input
                  type="text"
                  required
                  value={folderToEdit.name}
                  onChange={(e) => setFolderToEdit({ ...folderToEdit, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-xl text-xs text-[var(--color-on-surface)] focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1.5">
                  Folder Color Theme
                </label>
                <div className="flex items-center gap-2">
                  {['#0284c7', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'].map(
                    (col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => setFolderToEdit({ ...folderToEdit, color: col })}
                        style={{ backgroundColor: col }}
                        className={`w-7 h-7 rounded-full transition-transform ${
                          folderToEdit.color === col ? 'ring-2 ring-offset-2 ring-[var(--color-primary)] scale-110' : ''
                        }`}
                      />
                    )
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1.5">
                  Description / Purpose
                </label>
                <textarea
                  rows={2}
                  value={folderToEdit.description || ''}
                  onChange={(e) => setFolderToEdit({ ...folderToEdit, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-xl text-xs text-[var(--color-on-surface)] focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFolderToEdit(null)}
                  className="px-4 py-2 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-full text-xs font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[var(--color-primary)] hover:opacity-90 text-white rounded-full text-xs font-bold shadow-sm transition-all"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL: Delete Folder */}
      {folderToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-[var(--color-error)]">
              <Trash2 className="w-5 h-5" />
              <h3 className="text-base font-black">Delete Folder?</h3>
            </div>
            <p className="text-xs text-[var(--color-on-surface-variant)] leading-relaxed">
              Are you sure you want to delete the folder <strong>"{folderToDelete.name}"</strong>? All subfolders and evidence files inside will be permanently removed.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFolderToDelete(null)}
                className="px-4 py-2 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-full text-xs font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  db.deleteFolder(folderToDelete.id);
                  if (currentFolderId === folderToDelete.id) {
                    setCurrentFolderId(null);
                  }
                  setFolderToDelete(null);
                }}
                className="px-4 py-2 bg-[var(--color-error)] hover:opacity-90 text-white rounded-full text-xs font-bold shadow-sm transition-all"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL: Delete File */}
      {fileToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-[var(--color-error)]">
              <Trash2 className="w-5 h-5" />
              <h3 className="text-base font-black">Delete Evidence File?</h3>
            </div>
            <p className="text-xs text-[var(--color-on-surface-variant)] leading-relaxed">
              Are you sure you want to delete <strong>"{fileToDelete.name}"</strong>? This attachment will be unlinked from records.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFileToDelete(null)}
                className="px-4 py-2 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-full text-xs font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  db.deleteFile(fileToDelete.id);
                  setFileToDelete(null);
                }}
                className="px-4 py-2 bg-[var(--color-error)] hover:opacity-90 text-white rounded-full text-xs font-bold shadow-sm transition-all"
              >
                Delete File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
