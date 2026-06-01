import React, { useState, useEffect, useRef } from 'react';
import { File, Upload, Download, Trash2, Clock, MoreHorizontal, FileText, Image as ImageIcon, Search, AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';
import { fileService, WorkspaceFile, FileVersion } from '../../services/fileService';
import { useWorkspace } from '../../context/WorkspaceContext';

interface FilePanelProps {
  entityType: string;
  entityId: string;
  currentUserId: string;
  canEdit: boolean;
}

export function FilePanel({ entityType, entityId, currentUserId, canEdit }: FilePanelProps) {
  const { workspace } = useWorkspace() as any;
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Versions view state
  const [viewingVersionsFor, setViewingVersionsFor] = useState<string | null>(null);
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);

  useEffect(() => {
    if (workspace?.id) {
      loadFiles();
    }
  }, [workspace?.id, entityType, entityId]);

  const loadFiles = async () => {
    setErrorState(null);
    const { data, error } = await fileService.fetchFiles(workspace.id, entityType, entityId);
    
    if (error) {
      if (error?.code === 'PGRST116' || error?.code === '42501' || error?.message?.includes('RLS')) {
        setErrorState("You no longer have access to these files.");
      } else {
        setErrorState("Failed to load files.");
      }
      return;
    }
    
    setFiles(data);
  };

  const handleUploadClick = () => {
    if (!canEdit) return;
    fileInputRef.current?.click();
  };

  const handleReplaceClick = (fileId: string) => {
    if (!canEdit) return;
    setReplaceTargetId(fileId);
    replaceInputRef.current?.click();
  };

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.cmd', '.sh', '.js', '.mjs', '.vbs'];

  const validateFile = (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      alert(`File size exceeds 50MB limit.`);
      return false;
    }
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      alert(`File type ${ext} is blocked for security reasons.`);
      return false;
    }
    return true;
  };

  const onFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile || !workspace?.id) return;
    
    if (!validateFile(selectedFile)) {
      if (e.target) e.target.value = '';
      return;
    }

    if (files.some(f => f.file_name.toLowerCase() === selectedFile.name.toLowerCase())) {
      alert(`A file named "${selectedFile.name}" already exists. Please rename your file or use the "Upload New Version" button on the existing file.`);
      if (e.target) e.target.value = '';
      return;
    }

    setIsUploading(true);
    setUploadProgress(10); // Mock progress

    const result = await fileService.uploadFile(
      workspace.id,
      entityType,
      entityId,
      selectedFile,
      currentUserId,
      (p) => setUploadProgress(p)
    );

    setIsUploading(false);
    setUploadProgress(0);
    
    if (e.target) e.target.value = ''; // Reset input

    if (result) {
      setFiles([result, ...files]);
    }
  };

  const onReplaceSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    const targetFile = files.find(f => f.id === replaceTargetId);
    
    if (!selectedFile || !targetFile || !workspace?.id) {
      setReplaceTargetId(null);
      return;
    }

    if (!validateFile(selectedFile)) {
      setReplaceTargetId(null);
      if (e.target) e.target.value = '';
      return;
    }

    setIsUploading(true);
    
    const result = await fileService.replaceFile(
      targetFile,
      selectedFile,
      currentUserId,
      'New version uploaded'
    );

    setIsUploading(false);
    setReplaceTargetId(null);
    if (e.target) e.target.value = ''; // Reset

    if (result) {
      setFiles(files.map(f => f.id === result.id ? result : f));
      if (viewingVersionsFor === result.id) {
        loadVersions(result.id);
      }
    }
  };

  const handleDelete = async (fileRec: WorkspaceFile) => {
    if (!canEdit) return;
    if (window.confirm(`Are you sure you want to archive ${fileRec.file_name}?`)) {
      const success = await fileService.deleteFile(fileRec, currentUserId);
      if (success) {
        setFiles(files.filter(f => f.id !== fileRec.id));
        if (viewingVersionsFor === fileRec.id) setViewingVersionsFor(null);
      }
    }
  };

  const handleDownload = async (storagePath: string, fileName: string) => {
    const url = await fileService.getFileDownloadUrl(storagePath, fileName);
    if (url) {
      window.open(url, '_blank'); // Or a hidden <a> tag trigger
    }
  };

  const loadVersions = async (fileId: string) => {
    setIsLoadingVersions(true);
    setViewingVersionsFor(fileId);
    const data = await fileService.fetchFileVersions(fileId);
    setVersions(data);
    setIsLoadingVersions(false);
  };

  const handleRestoreVersion = async (fileRec: WorkspaceFile, versionRec: FileVersion) => {
    if (!canEdit) return;
    if (window.confirm(`Are you sure you want to restore version ${versionRec.version_number}? This will create a new current version.`)) {
      setIsUploading(true);
      const result = await fileService.restoreVersion(fileRec, versionRec, currentUserId);
      setIsUploading(false);
      if (result) {
        setFiles(files.map(f => f.id === result.id ? result : f));
        loadVersions(result.id);
      }
    }
  };

  const toggleVersions = (fileId: string) => {
    if (viewingVersionsFor === fileId) {
      setViewingVersionsFor(null);
    } else {
      loadVersions(fileId);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <ImageIcon className="w-8 h-8 text-accent-primary" />;
    if (mimeType.includes('pdf')) return <FileText className="w-8 h-8 text-signal-error" />;
    return <File className="w-8 h-8 text-accent-secondary" />;
  };

  if (errorState) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-signal-critical bg-[var(--pm-surface)] rounded-xl border border-signal-critical/20">
        <AlertTriangle className="w-8 h-8 mb-2" />
        <p className="text-sm font-semibold">{errorState}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-[var(--pm-surface)] rounded-xl border border-[var(--pm-border)] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--pm-border)] bg-surface-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <File className="w-4 h-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">Files & Attachments</h3>
          <span className="bg-surface-3 text-text-tertiary px-2 py-0.5 rounded-full text-[10px] font-bold">
            {files.length}
          </span>
        </div>
        
        {canEdit && (
          <button 
            onClick={handleUploadClick}
            disabled={isUploading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-primary hover:bg-accent-primary/90 text-white text-xs font-semibold rounded-md transition-colors disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload File
          </button>
        )}
        
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          onChange={onFileSelect} 
        />
        <input 
          type="file" 
          ref={replaceInputRef} 
          className="hidden" 
          onChange={onReplaceSelect} 
        />
      </div>

      {/* Uploading State */}
      {isUploading && (
        <div className="p-3 bg-surface-2 border-b border-[var(--pm-border)] flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-accent-primary border-t-transparent rounded-full animate-spin shrink-0" />
          <div className="flex-1">
            <div className="text-xs font-semibold text-text-primary">Uploading file...</div>
            <div className="h-1 bg-surface-3 rounded-full overflow-hidden mt-1">
              <div className="h-full bg-accent-primary transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* File List */}
      <div className="flex flex-col divide-y divide-[var(--pm-border)]">
        {files.length === 0 && !isUploading ? (
          <div className="p-8 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mb-3">
              <Upload className="w-5 h-5 text-text-quaternary" />
            </div>
            <p className="text-sm font-medium text-text-secondary">No files attached yet.</p>
            <p className="text-xs text-text-tertiary mt-1 max-w-[200px]">
              Upload documents, designs, or references related to this work.
            </p>
          </div>
        ) : (
          files.map(f => (
            <div key={f.id} className="flex flex-col">
              <div className="p-4 flex items-start gap-4 hover:bg-surface-2 transition-colors group">
                <div className="shrink-0 p-2 bg-[var(--pm-surface)] rounded-lg border border-[var(--pm-border)] shadow-sm">
                  {getIcon(f.mime_type)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-text-primary truncate" title={f.file_name}>
                        {f.file_name}
                      </h4>
                      <div className="flex items-center gap-3 mt-1 text-xs text-text-tertiary">
                        <span>{formatSize(f.file_size)}</span>
                        <span>•</span>
                        <div className="flex items-center gap-1">
                          {f.uploader?.avatar_url ? (
                            <img src={f.uploader.avatar_url} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />
                          ) : (
                            <div className="w-3.5 h-3.5 rounded-full bg-surface-3 flex items-center justify-center text-[8px] font-bold">
                              {f.uploader?.full_name?.charAt(0) || '?'}
                            </div>
                          )}
                          <span>{f.uploader?.full_name || 'Former Member'}</span>
                        </div>
                        <span>•</span>
                        <span>{new Date(f.updated_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleDownload(f.storage_path, f.file_name)}
                        className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-3 rounded-md transition-colors"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => toggleVersions(f.id)}
                        className={`p-1.5 rounded-md transition-colors ${viewingVersionsFor === f.id ? 'bg-surface-3 text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-surface-3'}`}
                        title="Version History"
                      >
                        <Clock className="w-4 h-4" />
                      </button>
                      {canEdit && (
                        <>
                          <button 
                            onClick={() => handleReplaceClick(f.id)}
                            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-3 rounded-md transition-colors"
                            title="Upload New Version"
                          >
                            <Upload className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(f)}
                            className="p-1.5 text-text-secondary hover:text-signal-critical hover:bg-signal-critical/10 rounded-md transition-colors"
                            title="Archive File"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Version History Sub-panel */}
              {viewingVersionsFor === f.id && (
                <div className="bg-surface-2 border-t border-[var(--pm-border)] p-4 pl-16">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-text-tertiary mb-3">Version History</h5>
                  {isLoadingVersions ? (
                    <div className="text-xs text-text-quaternary animate-pulse">Loading versions...</div>
                  ) : (
                    <div className="flex flex-col gap-3 relative before:absolute before:inset-y-0 before:left-2.5 before:w-px before:bg-[var(--pm-border)]">
                      {versions.map((v, i) => (
                        <div key={v.id} className="relative pl-6 flex items-start gap-3">
                          <div className={`absolute left-[7px] top-1.5 w-2 h-2 rounded-full border-2 ${i === 0 ? 'bg-accent-primary border-[var(--pm-surface)] shadow-[0_0_0_2px_var(--accent-primary)]' : 'bg-surface-3 border-[var(--pm-surface)]'}`} />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-semibold ${i === 0 ? 'text-text-primary' : 'text-text-secondary'}`}>
                                  Version {v.version_number}
                                </span>
                                {i === 0 && <span className="bg-accent-primary/10 text-accent-primary text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">Current</span>}
                              </div>
                                <button 
                                  onClick={() => handleDownload(v.storage_path, f.file_name)}
                                  className="text-xs text-accent-primary hover:underline flex items-center gap-1"
                                >
                                  <Download className="w-3 h-3" />
                                  Download
                                </button>
                                {canEdit && i > 0 && (
                                  <button 
                                    onClick={() => handleRestoreVersion(f, v)}
                                    className="text-xs text-accent-secondary hover:underline flex items-center gap-1 ml-3"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    Restore
                                  </button>
                                )}
                            </div>
                            <p className="text-xs text-text-tertiary mt-0.5">{v.change_note}</p>
                            <div className="flex items-center gap-2 mt-1 text-[10px] text-text-quaternary">
                              <span>By {v.uploader?.full_name || 'Former Member'}</span>
                              <span>•</span>
                              <span>{new Date(v.created_at).toLocaleString()}</span>
                              <span>•</span>
                              <span>{formatSize(v.file_size)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
