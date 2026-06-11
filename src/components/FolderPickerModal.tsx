import React, { useState, useEffect, useMemo } from 'react';
import { Folder, FolderOpen, ArrowUp, Plus, X, HardDrive, Home, Search, FolderPlus } from 'lucide-react';

interface FolderPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  initialPath?: string;
  title?: string;
}

interface FolderItem {
  name: string;
  path: string;
}

interface ShortcutItem {
  name: string;
  path: string;
}

export default function FolderPickerModal({
  isOpen,
  onClose,
  onSelect,
  initialPath = '',
  title = 'Chọn thư mục'
}: FolderPickerModalProps) {
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [shortcuts, setShortcuts] = useState<ShortcutItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [manualPathInput, setManualPathInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // New folder creation state
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Sync initialPath when modal opens
  useEffect(() => {
    if (isOpen) {
      const pathValue = initialPath || '';
      setCurrentPath(pathValue);
      setManualPathInput(pathValue);
      setErrorMsg('');
      setIsCreatingFolder(false);
      setNewFolderName('');
      setSearchQuery('');
    }
  }, [isOpen, initialPath]);

  // Fetch directory list whenever currentPath changes
  useEffect(() => {
    if (!isOpen) return;

    const fetchDirectory = async () => {
      setIsLoading(true);
      setErrorMsg('');
      try {
        const url = `/api/video/select-directory?path=${encodeURIComponent(currentPath)}`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Server returned status ${res.status}`);
        }
        const data = await res.json();
        
        if (data.success === false) {
          setErrorMsg(data.message || 'Không thể đọc thư mục này');
          if (data.currentPath) {
            setManualPathInput(data.currentPath);
          }
          if (data.shortcuts) {
            setShortcuts(data.shortcuts);
          }
          setFolders([]);
          setParentPath(null);
        } else {
          setCurrentPath(data.currentPath);
          setManualPathInput(data.currentPath);
          setFolders(data.folders || []);
          setParentPath(data.parentPath);
          setShortcuts(data.shortcuts || []);
        }
      } catch (err: any) {
        console.error('Error fetching directories:', err);
        setErrorMsg('Không thể kết nối đến máy chủ: ' + err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDirectory();
  }, [currentPath, isOpen]);

  // Handle path split for breadcrumbs
  const breadcrumbs = useMemo(() => {
    if (!currentPath) return [];
    
    const isWindows = currentPath.includes('\\') || /^[A-Za-z]:/.test(currentPath);
    const separator = isWindows ? '\\' : '/';
    
    // Split, clean empty elements (but keep drive letter if Windows)
    const parts = currentPath.split(separator).filter(Boolean);
    
    // Reconstruct full paths for each breadcrumb segment
    return parts.map((part, index) => {
      let fullPath = parts.slice(0, index + 1).join(separator);
      
      // If it's Windows and starts with a drive letter, ensure it ends with backslash if it's the root
      if (isWindows && index === 0 && part.endsWith(':')) {
        fullPath += '\\';
      } else if (!isWindows && index === 0) {
        // Unix root path
        fullPath = '/' + fullPath;
      }
      
      return {
        name: part,
        path: fullPath
      };
    });
  }, [currentPath]);

  // Handle manual path navigation
  const handleGoToManualPath = () => {
    if (manualPathInput.trim()) {
      setCurrentPath(manualPathInput.trim());
      setErrorMsg('');
    }
  };

  // Filter folders based on search query
  const filteredFolders = useMemo(() => {
    if (!searchQuery) return folders;
    const query = searchQuery.toLowerCase();
    return folders.filter(f => f.name.toLowerCase().includes(query));
  }, [folders, searchQuery]);

  // Create new folder
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      setIsLoading(true);
      const isWindows = currentPath.includes('\\') || /^[A-Za-z]:/.test(currentPath);
      const separator = isWindows ? '\\' : '/';
      
      const newFolderPath = currentPath.endsWith(separator) 
        ? currentPath + newFolderName.trim()
        : currentPath + separator + newFolderName.trim();

      const response = await fetch('/api/video/select-directory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: newFolderPath })
      });

      if (!response.ok) {
        throw new Error('Failed to create folder');
      }

      const data = await response.json();
      if (data.success && data.path) {
        setCurrentPath(data.path);
        setIsCreatingFolder(false);
        setNewFolderName('');
      } else {
        alert('Không thể tạo thư mục mới.');
      }
    } catch (err: any) {
      alert('Lỗi tạo thư mục: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectCurrent = () => {
    onSelect(currentPath);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-3xl w-full h-[600px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-slate-850 px-6 py-4 flex items-center justify-between shrink-0 bg-slate-900/80">
          <div className="flex items-center gap-2 text-slate-200 font-semibold">
            <FolderOpen className="w-5 h-5 text-violet-400" />
            <span className="font-sans text-sm tracking-wide font-bold">{title}</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition text-lg font-bold p-1 rounded hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Address Bar / Breadcrumbs */}
        <div className="bg-slate-950 px-6 py-3 border-b border-slate-900 flex flex-col gap-2 shrink-0">
          {/* Breadcrumbs */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 font-medium">
            <button
              onClick={() => setCurrentPath(shortcuts[0]?.path || 'C:\\')}
              className="hover:text-violet-400 transition"
              title="Gốc"
            >
              <Home className="w-3.5 h-3.5" />
            </button>
            
            {breadcrumbs.map((segment, idx) => (
              <React.Fragment key={segment.path}>
                <span className="text-slate-600">/</span>
                <button
                  onClick={() => setCurrentPath(segment.path)}
                  className={`hover:text-violet-400 transition truncate max-w-[150px] ${
                    idx === breadcrumbs.length - 1 ? 'text-violet-400 font-bold' : ''
                  }`}
                >
                  {segment.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          {/* Manual Input Line */}
          <div className="flex gap-2">
            <input
              type="text"
              value={manualPathInput}
              onChange={(e) => setManualPathInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGoToManualPath()}
              placeholder="Đường dẫn thư mục (ví dụ: D:\Project\voice)"
              className="flex-1 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 px-3 py-2 focus:outline-none focus:border-violet-500 transition font-mono"
            />
            <button
              onClick={handleGoToManualPath}
              className="bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-slate-100 px-4 py-2 rounded-lg text-xs font-semibold border border-slate-800 transition"
            >
              Đi đến
            </button>
          </div>
        </div>

        {/* Content Layout */}
        <div className="flex-1 flex overflow-hidden min-h-0 bg-slate-900/30">
          {/* Left Panel: Shortcuts & Drives */}
          <div className="w-64 border-r border-slate-850 bg-slate-950/40 p-4 space-y-4 overflow-y-auto shrink-0 scrollbar-thin">
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 px-1">Lối tắt nhanh</div>
              <div className="space-y-1">
                {shortcuts.map((sc) => {
                  const isDrive = sc.name.startsWith('Ổ đĩa');
                  return (
                    <button
                      key={sc.path}
                      onClick={() => setCurrentPath(sc.path)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition ${
                        currentPath === sc.path
                          ? 'bg-violet-950/45 text-violet-300 border border-violet-900/30'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50 border border-transparent'
                      }`}
                    >
                      {isDrive ? (
                        <HardDrive className="w-4 h-4 text-fuchsia-400 shrink-0" />
                      ) : (
                        <Home className="w-4 h-4 text-violet-400 shrink-0" />
                      )}
                      <span className="truncate">{sc.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Panel: Folder List */}
          <div className="flex-1 flex flex-col overflow-hidden p-4">
            {/* Folder controls (Search + Create Folder) */}
            <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Lọc thư mục..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 rounded-lg text-xs text-slate-200 pl-9 pr-3 py-2 focus:outline-none focus:border-violet-500 transition"
                />
              </div>

              {!isCreatingFolder ? (
                <button
                  onClick={() => setIsCreatingFolder(true)}
                  className="bg-violet-600/10 hover:bg-violet-600/20 text-violet-300 border border-violet-900/40 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <FolderPlus className="w-4 h-4" />
                  Thư mục mới
                </button>
              ) : (
                <form onSubmit={handleCreateFolder} className="flex gap-2 animate-fadeIn">
                  <input
                    type="text"
                    placeholder="Tên thư mục mới"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    autoFocus
                    className="bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 px-3 py-1.5 focus:outline-none focus:border-violet-500 transition"
                  />
                  <button
                    type="submit"
                    className="bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                  >
                    Tạo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingFolder(false);
                      setNewFolderName('');
                    }}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition"
                  >
                    Hủy
                  </button>
                </form>
              )}
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="bg-red-950/20 border border-red-900/40 text-red-400 text-xs p-3 rounded-lg mb-3 shrink-0">
                {errorMsg}
              </div>
            )}

            {/* Folders List Container */}
            <div className="flex-1 border border-slate-850 rounded-xl bg-slate-950/25 overflow-y-auto min-h-0 scrollbar-thin">
              {isLoading ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-500 gap-2">
                  <span className="w-4 h-4 border-2 border-t-transparent border-violet-500 rounded-full animate-spin"></span>
                  Đang tải...
                </div>
              ) : filteredFolders.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 py-10">
                  <Folder className="w-10 h-10 text-slate-600 mb-2" />
                  <span className="text-xs">Không có thư mục nào</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 p-2">
                  {/* Up One Level Directory */}
                  {parentPath && (
                    <button
                      onClick={() => setCurrentPath(parentPath)}
                      className="w-full flex items-center gap-2.5 p-2 rounded-lg text-xs text-left text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition border border-transparent font-medium"
                    >
                      <ArrowUp className="w-4 h-4 text-violet-400 shrink-0" />
                      <span>.. (Thư mục cha)</span>
                    </button>
                  )}

                  {/* Directories */}
                  {filteredFolders.map((folder) => (
                    <button
                      key={folder.path}
                      onClick={() => setCurrentPath(folder.path)}
                      className="w-full flex items-center gap-2.5 p-2 rounded-lg text-xs text-left text-slate-300 hover:text-slate-100 hover:bg-slate-900 transition border border-transparent font-medium group"
                    >
                      <Folder className="w-4 h-4 text-amber-500 group-hover:scale-105 transition shrink-0" />
                      <span className="truncate">{folder.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-850 px-6 py-4 flex items-center justify-between shrink-0 bg-slate-900/85">
          <div className="text-[10px] text-slate-400 font-mono truncate max-w-[400px]">
            Đang chọn: <span className="text-violet-400">{currentPath || 'Chưa chọn'}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 px-4 py-2 rounded-lg text-xs font-semibold border border-slate-850 transition"
            >
              Hủy bỏ
            </button>
            <button
              onClick={handleSelectCurrent}
              disabled={isLoading || !!errorMsg || !currentPath}
              className="bg-violet-600 hover:bg-violet-500 disabled:bg-violet-850 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-xs font-bold shadow-lg transition"
            >
              Chọn thư mục này
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
