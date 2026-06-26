import React, { useState, useEffect, useRef } from 'react';
import { useProjectStore, getCardTitle, findBestCharacterMatch, findBestExteriorMatch, parseCharactersField } from '../store/useProjectStore';
import { Sparkles, RefreshCw, ZoomIn, Film, Image as ImageIcon, Sliders, Play, Database, Check, Upload, X } from 'lucide-react';

export default function ShotsManager() {
  const {
    currentProject,
    shotGeneratingIds = [],
    generateShotImage,
    systemLogs = [],
    serverQueue = [],
    serverActive = [],
    fetchServerQueueAndLogs,
    imageGenConfig,
    addCharacter,
    addExterior,
    batchJobs = {},
    startBatchShotGeneration,
    cancelBatchJob,
    updateSegmentCharacterOverride,
    updateSegmentExteriorOverride,
    uploadImage
  } = useProjectStore();

  const activeJob = batchJobs[`${currentProject.id}_shot`];
  const isBatchGenerating = activeJob?.isRunning || false;

  const characters = currentProject.characters || [];
  const exteriors = currentProject.exteriors || [];

  const existingCharRefs = characters.filter(c => !!c.image);
  const existingExtRefs = exteriors.filter(e => !!e.image);

  const isRowMissingRefs = (row: any) => {
    const charNames = parseCharactersField(row.characters);
    for (const name of charNames) {
      const char = findBestCharacterMatch(characters, name);
      const charId = char?.characterId || name;
      const override = row.characterOverrides?.[charId];
      if (override?.image) continue;
      if (!char || !char.image) return true;
    }
    const extName = (row.exterior || '').trim();
    if (extName) {
      const ext = findBestExteriorMatch(exteriors, extName);
      const extId = ext?.exteriorId || extName;
      const override = row.exteriorOverride;
      if (override?.image) return false;
      if (!ext || !ext.image) return true;
    }
    return false;
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const [zoomedShot, setZoomedShot] = useState<string | null>(null);
  const [isLogsExpanded, setIsLogsExpanded] = useState(false);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Modal states for assigning reference images
  const [assignModal, setAssignModal] = useState<{
    isOpen: boolean;
    type: 'character' | 'exterior';
    targetId: string;
    currentImage?: string;
    stt?: number;
  } | null>(null);

  const handleOpenAssignModal = (type: 'character' | 'exterior', targetId: string, currentImage?: string, stt?: number) => {
    setAssignModal({
      isOpen: true,
      type,
      targetId,
      currentImage,
      stt
    });
  };

  const handleAssignImage = async (imageUrl: string, mediaId?: string, accountId?: string) => {
    if (!assignModal) return;
    try {
      if (assignModal.stt !== undefined) {
        if (assignModal.type === 'character') {
          await updateSegmentCharacterOverride(assignModal.stt, assignModal.targetId, imageUrl, mediaId, accountId);
        } else {
          await updateSegmentExteriorOverride(assignModal.stt, imageUrl, mediaId, accountId);
        }
      } else {
        if (assignModal.type === 'character') {
          await addCharacter(assignModal.targetId, imageUrl, mediaId, accountId);
        } else {
          await addExterior(assignModal.targetId, imageUrl, mediaId, accountId);
        }
      }
      setAssignModal(null);
    } catch (err) {
      alert('Không thể gán ảnh tham chiếu: ' + (err as Error).message);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const res = await uploadImage(file);
      const mediaId = res.media_id;
      const accountId = (res as any).account_id || (res as any).accountId;
      
      const base64 = await fileToBase64(file);
      if (base64) {
        await handleAssignImage(base64, mediaId, accountId);
      }
    } catch (err) {
      alert('Không thể tải lên ảnh: ' + (err as Error).message);
    }
  };

  // Pagination & Filter States
  const [pageSize, setPageSize] = useState<number>(30);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [activeFilter, setActiveFilter] = useState<'all' | 'generated' | 'not_generated' | 'failed' | 'missing_ref'>('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [failedShotIds, setFailedShotIds] = useState<number[]>([]);

  // Poll server queue & logs
  useEffect(() => {
    fetchServerQueueAndLogs();
    const interval = setInterval(() => {
      fetchServerQueueAndLogs();
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchServerQueueAndLogs]);

  // Scroll console to bottom on new logs
  useEffect(() => {
    if (isLogsExpanded && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [systemLogs, isLogsExpanded]);

  const handleGenerate = async (stt: number) => {
    try {
      await generateShotImage(stt);
      setFailedShotIds(prev => prev.filter(id => id !== stt));
    } catch (err) {
      setFailedShotIds(prev => Array.from(new Set([...prev, stt])));
      alert('Vẽ ảnh thất bại: ' + (err as Error).message);
    }
  };

  const handleGenerateSelected = async () => {
    if (selectedIds.length === 0 || isBatchGenerating) return;
    try {
      await startBatchShotGeneration(selectedIds);
      setSelectedIds([]);
    } catch (err) {
      alert('Vẽ ảnh thất bại: ' + (err as Error).message);
    }
  };

  const handleGenerateUncreated = async () => {
    const uncreatedSttList = (currentProject.imagePrompts || [])
      .filter(p => !p.imageUrl)
      .map(p => p.stt);
    
    if (uncreatedSttList.length === 0) {
      alert('Tất cả phân cảnh đều đã có ảnh!');
      return;
    }

    try {
      await startBatchShotGeneration(uncreatedSttList);
      setSelectedIds([]);
    } catch (err) {
      alert('Vẽ ảnh thất bại: ' + (err as Error).message);
    }
  };

  const isVideoFile = (url: string) => {
    if (!url) return false;
    const cleanUrl = url.split('?')[0].toLowerCase();
    return cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.webm') || cleanUrl.endsWith('.ogg');
  };

  // Filter Logic
  const filteredPrompts = (currentProject.imagePrompts || []).filter((row) => {
    if (activeFilter === 'generated') {
      return !!row.imageUrl;
    }
    if (activeFilter === 'not_generated') {
      return !row.imageUrl;
    }
    if (activeFilter === 'failed') {
      return failedShotIds.includes(row.stt);
    }
    if (activeFilter === 'missing_ref') {
      return isRowMissingRefs(row);
    }
    return true;
  });

  // Toggle select all matching current filter
  const handleToggleSelectAll = () => {
    const allFilteredStts = filteredPrompts.map(r => r.stt);
    const isAllSelected = allFilteredStts.length > 0 && allFilteredStts.every(stt => selectedIds.includes(stt));

    if (isAllSelected) {
      // Deselect all matching filtered items
      setSelectedIds(prev => prev.filter(stt => !allFilteredStts.includes(stt)));
    } else {
      // Select all matching filtered items
      setSelectedIds(prev => Array.from(new Set([...prev, ...allFilteredStts])));
    }
  };

  // Pagination Logic
  const totalItems = filteredPrompts.length;
  const totalPages = pageSize === -1 ? 1 : Math.ceil(totalItems / pageSize);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const paginatedPrompts = pageSize === -1 
    ? filteredPrompts 
    : filteredPrompts.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const totalUncreatedShots = (currentProject.imagePrompts || []).filter(p => !p.imageUrl).length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      <div className="pb-4 border-b border-gray-900 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Tạo ảnh Shots</h2>
          <p className="text-xs text-gray-500 mt-1">
            Generate and inspect final storyboard scene illustrations/animations segment-by-segment.
          </p>
        </div>
        <div className="text-xs text-gray-400 font-medium bg-slate-900/40 border border-slate-900 px-3 py-1.5 rounded-lg">
          Tổng số phân cảnh: <strong className="text-violet-400">{currentProject.imagePrompts?.length || 0}</strong>
        </div>
      </div>

      {currentProject.imagePrompts?.length === 0 ? (
        <div className="text-center py-20 text-gray-500 text-sm border border-dashed border-gray-800 rounded-xl bg-slate-900/5">
          Vui lòng tạo hoặc hoàn thành bước **3. Image Prompts** để lấy danh sách phân cảnh vẽ ảnh.
        </div>
      ) : (
        <div className="space-y-4">
          
          {/* Controls, Filters & Pagination Toolbar */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-4 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              
              {/* Batch Actions */}
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={filteredPrompts.length > 0 && filteredPrompts.map(r => r.stt).every(stt => selectedIds.includes(stt))}
                    ref={(el) => {
                      if (el) {
                        const allStts = filteredPrompts.map(r => r.stt);
                        const isAll = allStts.length > 0 && allStts.every(stt => selectedIds.includes(stt));
                        const isSome = allStts.some(stt => selectedIds.includes(stt));
                        el.indeterminate = isSome && !isAll;
                      }
                    }}
                    onChange={handleToggleSelectAll}
                    className="rounded border-gray-900 text-violet-600 focus:ring-violet-500/20 bg-slate-950 w-4 h-4 cursor-pointer"
                  />
                  Chọn tất cả {activeFilter !== 'all' ? `(${filteredPrompts.length})` : ''}
                </label>

                <button
                  onClick={handleGenerateSelected}
                  disabled={selectedIds.length === 0 || isBatchGenerating || shotGeneratingIds.some(id => id.startsWith(`${currentProject.id || ''}_`))}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:from-slate-900 disabled:to-slate-950 disabled:opacity-40 text-white font-bold py-2 px-4 rounded-lg text-xs tracking-wider shadow-lg active:scale-98 transition duration-200 cursor-pointer select-none"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {isBatchGenerating ? 'Đang tạo hàng loạt...' : `Tạo lại tất cả ảnh đã chọn (${selectedIds.length})`}
                </button>

                <button
                  onClick={handleGenerateUncreated}
                  disabled={isBatchGenerating || totalUncreatedShots === 0 || shotGeneratingIds.some(id => id.startsWith(`${currentProject.id || ''}_`))}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-900 disabled:opacity-40 text-white font-bold py-2 px-4 rounded-lg text-xs tracking-wider shadow-lg active:scale-98 transition duration-200 cursor-pointer select-none"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {isBatchGenerating ? 'Đang tạo hàng loạt...' : `Tạo ảnh chưa tạo (${totalUncreatedShots})`}
                </button>

                {selectedIds.length > 0 && (
                  <button
                    onClick={() => setSelectedIds([])}
                    className="text-xs text-gray-500 hover:text-gray-400 font-semibold transition bg-transparent border-0 cursor-pointer"
                  >
                    Bỏ chọn
                  </button>
                )}
              </div>

              {/* Filters & Page Size */}
              <div className="flex flex-wrap items-center gap-4">
                
                {/* Filters */}
                <div className="bg-slate-950 p-1 rounded-lg border border-slate-900 flex items-center gap-1">
                  {(['all', 'generated', 'not_generated', 'failed', 'missing_ref'] as const).map((filter) => {
                    const label = filter === 'all' ? 'Tất cả' 
                                : filter === 'generated' ? 'Đã tạo' 
                                : filter === 'not_generated' ? 'Chưa tạo' 
                                : filter === 'failed' ? 'Lỗi'
                                : 'Thiếu Ref';
                    const count = filter === 'all' ? currentProject.imagePrompts.length 
                                : filter === 'generated' ? currentProject.imagePrompts.filter(p => !!p.imageUrl).length 
                                : filter === 'not_generated' ? currentProject.imagePrompts.filter(p => !p.imageUrl).length 
                                : filter === 'failed' ? failedShotIds.length
                                : currentProject.imagePrompts.filter(isRowMissingRefs).length;
                    const isActive = activeFilter === filter;
                    return (
                      <button
                        key={filter}
                        onClick={() => {
                          setActiveFilter(filter);
                          setSelectedIds([]);
                          setCurrentPage(1);
                        }}
                        className={`text-xs px-3 py-1 rounded-md font-semibold transition cursor-pointer select-none flex items-center gap-1.5 ${
                          isActive
                            ? 'bg-slate-900 text-violet-400 border border-slate-800'
                            : 'text-gray-500 hover:text-slate-350 border border-transparent'
                        }`}
                      >
                        {label}
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${isActive ? 'bg-violet-950 text-violet-400' : 'bg-slate-900 text-gray-550'}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Page Size */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 font-semibold select-none">Hiển thị:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="bg-slate-950 border border-slate-900 rounded-lg text-xs text-slate-200 px-3 py-1.5 focus:outline-none focus:border-violet-500 transition cursor-pointer"
                  >
                    <option value={10}>10 dòng</option>
                    <option value={20}>20 dòng</option>
                    <option value={30}>30 dòng</option>
                    <option value={40}>40 dòng</option>
                    <option value={50}>50 dòng</option>
                    <option value={-1}>Tất cả</option>
                  </select>
                </div>

              </div>
            </div>

            {/* Batch progress */}
            {isBatchGenerating && activeJob && (
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-900 animate-fadeIn space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-semibold">
                  <span className="text-violet-400 animate-pulse">Đang tiến hành vẽ ảnh hàng loạt...</span>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 font-mono">
                      Hoàn thành: {activeJob.completed.length} / {activeJob.tasks.length} {activeJob.failed.length > 0 && `(Lỗi: ${activeJob.failed.length})`}
                    </span>
                    <button
                      onClick={() => cancelBatchJob(currentProject.id!, 'shot')}
                      className="text-rose-400 hover:text-rose-300 font-bold px-2 py-0.5 border border-rose-950 hover:border-rose-900 rounded bg-rose-950/20 text-[9px] uppercase cursor-pointer"
                    >
                      Dừng vẽ
                    </button>
                  </div>
                </div>
                <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-violet-600 to-fuchsia-600 h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${(activeJob.completed.length / activeJob.tasks.length) * 100}%`
                    }}
                  ></div>
                </div>
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between pt-3 border-t border-slate-950 gap-3 select-none">
                <span className="text-xs text-gray-500">
                  Hiển thị <strong className="text-slate-350">{Math.min((currentPage - 1) * pageSize + 1, totalItems)}</strong> - <strong className="text-slate-350">{Math.min(currentPage * pageSize, totalItems)}</strong> trong tổng số <strong className="text-slate-350">{totalItems}</strong> dòng phân cảnh
                </span>
                
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    className="bg-slate-950 border border-slate-900 disabled:opacity-40 text-xs px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition font-semibold cursor-pointer"
                  >
                    Trước
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }).map((_, idx) => {
                      const pageNum = idx + 1;
                      const isCurrent = pageNum === currentPage;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-semibold font-mono transition border ${
                            isCurrent
                              ? 'bg-violet-950/20 border-violet-800 text-violet-400 font-bold'
                              : 'bg-slate-950 border-slate-900 text-gray-550 hover:text-slate-350'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    className="bg-slate-950 border border-slate-900 disabled:opacity-40 text-xs px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition font-semibold cursor-pointer"
                  >
                    Sau
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Paginated Segment List */}
          {paginatedPrompts.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm border border-dashed border-gray-800 rounded-xl bg-slate-900/5">
              Không tìm thấy dòng phân cảnh nào phù hợp với bộ lọc hiện tại.
            </div>
          ) : (
            <div className="space-y-4">
              {paginatedPrompts.map((row) => {
                const isGenerating = shotGeneratingIds.includes(`${currentProject.id || ''}_${row.stt}`);
                const isSelected = selectedIds.includes(row.stt);
                
                // Get character references
                const charNames = parseCharactersField(row.characters);
                const matchedChars = charNames
                  .map((name) => findBestCharacterMatch(characters, name))
                  .filter((c: any): c is any => !!c);

                // Get background reference
                const extName = (row.exterior || '').trim();
                const matchedExt = extName
                  ? findBestExteriorMatch(exteriors, extName)
                  : undefined;

                return (
                  <div
                    key={row.stt}
                    className={`transition-all duration-300 flex flex-col md:flex-row gap-6 items-stretch border rounded-xl p-5 ${
                      isSelected
                        ? 'bg-violet-950/5 border-violet-900/60 shadow-lg shadow-violet-500/2'
                        : 'bg-slate-900/30 border-slate-900/80 hover:border-slate-800/80'
                    }`}
                  >
                    {/* Checkbox and STT Column */}
                    <div className="md:w-16 flex md:flex-col items-center justify-center gap-2 border-b md:border-b-0 md:border-r border-slate-950 pb-4 md:pb-0 md:pr-4 select-none shrink-0">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block md:mb-1 md:text-center">Chọn</span>
                      <div className="flex md:flex-col items-center gap-2 md:gap-1.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            setSelectedIds(prev =>
                              prev.includes(row.stt)
                                ? prev.filter(id => id !== row.stt)
                                : [...prev, row.stt]
                            );
                          }}
                          className="rounded border-gray-900 text-violet-600 focus:ring-violet-500/20 bg-slate-950 w-4 h-4 cursor-pointer"
                        />
                        <span className="text-xs font-black text-slate-400 font-mono tracking-tight bg-slate-950 px-2 py-0.5 rounded border border-slate-900">
                          #{String(row.stt).padStart(2, '0')}
                        </span>
                      </div>
                    </div>

                {/* Content Details Column */}
                <div className="flex-1 space-y-4">
                  {/* Prompt Text */}
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block">Image Prompt (Mô tả cảnh)</span>
                    <p className="text-slate-200 text-xs leading-relaxed font-medium bg-slate-950/20 border border-slate-900/30 p-2.5 rounded-lg">
                      {row.description}
                    </p>
                  </div>


                  {/* Previews of character & background sheets */}
                  <div className="flex flex-wrap gap-4 pt-1">
                    {/* Character Assets */}
                    {charNames.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1">
                          <Database className="w-3 h-3 text-violet-400" />
                          Nhân vật tham chiếu ({charNames.length})
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {charNames.map((name) => {
                            const char = findBestCharacterMatch(characters, name);
                            const charId = char?.characterId || name;
                            const override = row.characterOverrides?.[charId];
                            const charTitle = getCardTitle(charId);
                            const charImage = override?.image || char?.image || '';
                            return (
                              <div
                                key={name}
                                onClick={() => handleOpenAssignModal('character', charId, charImage, row.stt)}
                                className={`group relative bg-slate-950 border p-1 rounded-lg flex items-center gap-2 pr-3 hover:border-violet-500/50 transition cursor-pointer ${
                                  charImage ? 'border-slate-900/80 bg-slate-950' : 'border-dashed border-amber-900/60 bg-amber-950/5'
                                }`}
                                title={charImage ? "Nhấp để thay đổi ảnh tham chiếu" : "Chưa có ảnh tham chiếu. Nhấp để thêm!"}
                              >
                                {charImage ? (
                                  <img
                                    src={charImage}
                                    alt={charTitle}
                                    className="w-8 h-8 object-cover rounded-md border border-slate-900"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-md bg-amber-950/20 flex items-center justify-center text-[9px] font-bold text-amber-500 border border-amber-900/40 select-none animate-pulse">
                                    +
                                  </div>
                                )}
                                <span className={`text-[10px] font-semibold truncate max-w-[80px] ${charImage ? 'text-slate-300' : 'text-amber-400'}`}>
                                  {charTitle}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Exterior Asset */}
                    {extName && (
                      <div className="space-y-1.5">
                        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1">
                          <ImageIcon className="w-3 h-3 text-fuchsia-400" />
                          Bối cảnh tham chiếu
                        </span>
                        {(() => {
                          const ext = findBestExteriorMatch(exteriors, extName);
                          const extId = ext?.exteriorId || extName;
                          const override = row.exteriorOverride;
                          const extTitle = getCardTitle(extId);
                          const extImage = override?.image || ext?.image || '';
                          return (
                            <div
                              onClick={() => handleOpenAssignModal('exterior', extId, extImage, row.stt)}
                              className={`group relative bg-slate-950 border p-1 rounded-lg flex items-center gap-2 pr-3 hover:border-fuchsia-500/50 transition cursor-pointer ${
                                extImage ? 'border-slate-900/80 bg-slate-950' : 'border-dashed border-amber-900/60 bg-amber-950/5'
                              }`}
                              title={extImage ? "Nhấp để thay đổi ảnh tham chiếu" : "Chưa có ảnh tham chiếu. Nhấp để thêm!"}
                            >
                              {extImage ? (
                                <img
                                  src={extImage}
                                  alt={extTitle}
                                  className="w-8 h-8 object-cover rounded-md border border-slate-900"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-md bg-amber-950/20 flex items-center justify-center text-[9px] font-bold text-amber-500 border border-amber-900/40 select-none animate-pulse">
                                  +
                                </div>
                              )}
                              <span className={`text-[10px] font-semibold truncate max-w-[120px] ${extImage ? 'text-slate-300' : 'text-amber-400'}`}>
                                {extTitle}
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Render Output Column */}
                <div className="md:w-56 flex flex-col justify-center items-center bg-slate-950/40 rounded-xl p-3 border border-slate-950 md:min-h-[140px]">
                  {isGenerating ? (
                    <div className="flex flex-col items-center justify-center py-6 space-y-3">
                      <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider animate-pulse">
                        Đang vẽ cảnh...
                      </span>
                    </div>
                  ) : row.imageUrl ? (
                    <div className="w-full h-full flex flex-col justify-between space-y-3 relative group">
                      <div className="relative overflow-hidden rounded-lg aspect-video md:aspect-auto md:h-28 bg-black/40 border border-slate-900">
                        {isVideoFile(row.imageUrl) ? (
                          <video
                            src={row.imageUrl}
                            loop
                            muted
                            autoPlay
                            playsInline
                            onClick={() => setZoomedShot(row.imageUrl!)}
                            className="w-full h-full object-cover rounded-lg cursor-zoom-in group-hover:scale-102 transition duration-300"
                          />
                        ) : (
                          <img
                            src={row.imageUrl}
                            alt={`Shot #${row.stt}`}
                            onClick={() => setZoomedShot(row.imageUrl!)}
                            className="w-full h-full object-cover rounded-lg cursor-zoom-in group-hover:scale-102 transition duration-300"
                          />
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center pointer-events-none transition duration-200">
                          <ZoomIn className="w-5 h-5 text-white/80" />
                        </div>
                      </div>

                      <button
                        onClick={() => handleGenerate(row.stt)}
                        className="w-full flex items-center justify-center gap-1.5 bg-slate-950 border border-gray-800 hover:border-gray-700 hover:bg-slate-900 text-[10px] py-1.5 rounded font-semibold text-slate-400 hover:text-slate-200 transition cursor-pointer select-none"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Tạo lại ảnh
                      </button>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center py-4">
                      <button
                        onClick={() => handleGenerate(row.stt)}
                        className="flex items-center justify-center gap-1.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-bold py-2.5 px-6 rounded-lg text-xs tracking-wider shadow-lg shadow-violet-500/10 active:scale-98 transition duration-200 cursor-pointer select-none"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Vẽ ảnh Shot
                      </button>
                      <span className="text-[8px] text-gray-500 mt-2 text-center max-w-[140px] leading-relaxed">
                        Sử dụng ảnh nhân vật & bối cảnh tham chiếu
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
            </div>
          )}
        </div>
      )}

      {/* Collapsible System Logs & Queue Monitor */}
      <div className="bg-[#090d16] border border-gray-900 rounded-xl overflow-hidden mt-6 shadow-xl">
        {/* Header Bar */}
        <div
          onClick={() => setIsLogsExpanded(!isLogsExpanded)}
          className="bg-slate-900/60 px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-900 select-none border-b border-slate-950 transition"
        >
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-violet-400" />
            <h3 className="font-bold text-slate-200 text-xs tracking-wide uppercase">
              Hàng chờ & Logs hệ thống
            </h3>
            <span className="h-4 w-px bg-gray-800 mx-1"></span>
            <div className="flex items-center gap-3 text-[10px] text-gray-500 font-mono">
              <span className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${serverActive.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-gray-700'}`}></span>
                Đang chạy: <strong className="text-slate-350">{serverActive.length}</strong>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                Chờ: <strong className="text-slate-350">{serverQueue.length}</strong>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500"></span>
                Tổng Logs: <strong className="text-slate-350">{systemLogs.length}</strong>
              </span>
            </div>
          </div>
          <button className="text-slate-400 hover:text-slate-200 focus:outline-none transition bg-transparent border-0 cursor-pointer">
            {isLogsExpanded ? (
              <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">Ẩn Console ▲</span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">Hiện Console ▼</span>
            )}
          </button>
        </div>

        {/* Console Panel */}
        {isLogsExpanded && (
          <div className="grid grid-cols-1 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-950 bg-slate-950/20 h-[240px] animate-fadeIn">
            {/* Left Column: Server Queue */}
            <div className="lg:col-span-1 p-3 flex flex-col h-full overflow-hidden">
              <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2 border-b border-slate-900 pb-1">
                Hàng chờ vẽ ảnh
              </div>
              <div className="flex-1 overflow-y-auto space-y-1.5 font-mono text-[10px]">
                {serverActive.length === 0 && serverQueue.length === 0 ? (
                  <div className="text-gray-650 italic text-center py-10">Không có yêu cầu nào</div>
                ) : (
                  <>
                    {/* Active Items */}
                    {serverActive.map((item) => (
                      <div key={item.id} className="flex items-center justify-between bg-emerald-950/20 border border-emerald-900/40 p-2 rounded text-emerald-400">
                        <div className="truncate flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                          <span className="font-semibold">{item.assetId}</span>
                          <span className="text-[8px] bg-emerald-950 text-emerald-500 px-1 py-0.2 rounded font-sans uppercase">
                            {item.assetType === 'shot' ? 'Shot' : item.assetType === 'character' ? 'Nhân vật' : 'Bối cảnh'}
                          </span>
                        </div>
                        <span className="text-[8px] text-gray-500">{item.startTime}</span>
                      </div>
                    ))}
                    {/* Queued Items */}
                    {serverQueue.map((item) => (
                      <div key={item.id} className="flex items-center justify-between bg-slate-900/40 border border-slate-900 p-2 rounded text-slate-400">
                        <div className="truncate flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                          <span>{item.assetId}</span>
                          <span className="text-[8px] bg-slate-950 text-gray-550 px-1 py-0.2 rounded font-sans uppercase">
                            {item.assetType === 'shot' ? 'Shot' : item.assetType === 'character' ? 'Nhân vật' : 'Bối cảnh'}
                          </span>
                        </div>
                        <span className="text-[8px] text-gray-550 font-bold font-sans">ĐỢI</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Right Column: Console System Logs */}
            <div className="lg:col-span-3 p-3 flex flex-col h-full overflow-hidden bg-slate-950/40">
              <div className="flex items-center justify-between mb-2 border-b border-slate-900 pb-1">
                <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                  System Logs Console
                </div>
                <div className="text-[8px] text-gray-650 font-mono">
                  Auto-refreshing (2s)
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto bg-black/50 p-2.5 rounded border border-slate-950 font-mono text-[10px] space-y-1 scrollbar-thin">
                {systemLogs.length === 0 ? (
                  <div className="text-gray-750 italic text-center py-12 select-none">Chưa có log hệ thống</div>
                ) : (
                  systemLogs.map((log) => {
                    let bgBadge = 'bg-blue-950 text-blue-400';
                    if (log.type === 'success') {
                      bgBadge = 'bg-emerald-950 text-emerald-400';
                    } else if (log.type === 'error') {
                      bgBadge = 'bg-rose-950/60 text-rose-400';
                    }
                    return (
                      <div key={log.id} className="flex items-start gap-2 border-b border-slate-900/10 pb-0.5 hover:bg-slate-900/10 transition">
                        <span className="text-gray-600 select-none shrink-0 font-bold">[{log.timestamp}]</span>
                        <span className={`text-[8px] px-1 py-0.2 rounded font-bold shrink-0 uppercase tracking-wider font-sans mt-0.5 ${bgBadge}`}>
                          {log.type}
                        </span>
                        <span className={`leading-relaxed ${log.type === 'error' ? 'text-rose-350' : 'text-slate-300'}`}>
                          {log.message}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={consoleEndRef} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen Lightbox Zoom Overlay */}
      {zoomedShot && (
        <div
          onClick={() => setZoomedShot(null)}
          className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center cursor-zoom-out p-4 transition-all duration-300 ease-in-out animate-fadeIn"
        >
          {isVideoFile(zoomedShot) ? (
            <video
              src={zoomedShot}
              loop
              muted
              autoPlay
              controls
              playsInline
              onClick={(e) => e.stopPropagation()}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl scale-100"
            />
          ) : (
            <img
              src={zoomedShot}
              alt="Zoomed Shot Illustration"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl scale-100"
            />
          )}
        </div>
      )}

      {/* Assign Reference Image Modal */}
      {assignModal && assignModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#0b0f19] border border-gray-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-900 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                  Cập nhật ảnh tham chiếu
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Đối tượng: <strong className="text-violet-400">{getCardTitle(assignModal.targetId)}</strong> ({assignModal.type === 'character' ? 'Nhân vật' : 'Bối cảnh'})
                </p>
              </div>
              <button
                onClick={() => setAssignModal(null)}
                className="text-gray-400 hover:text-slate-200 transition cursor-pointer p-1 hover:bg-slate-900 rounded-lg bg-transparent border-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 scrollbar-thin">
              {/* Active / Current Image */}
              <div className="flex items-center gap-4 bg-slate-950/40 p-4 rounded-xl border border-slate-900/60">
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                  {assignModal.currentImage ? (
                    <img 
                      src={assignModal.currentImage} 
                      alt="Hiện tại" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] text-gray-600 font-mono">No Img</span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Ảnh hiện tại</span>
                  <p className="text-xs text-gray-400 mt-1">
                    {assignModal.currentImage 
                      ? "Bạn có thể tải ảnh mới lên hoặc chọn từ thư viện ảnh đã vẽ để thay thế." 
                      : "Đối tượng chưa có ảnh mẫu. Vui lòng tải lên hoặc chọn bên dưới."}
                  </p>
                </div>
              </div>

              {/* Action 1: Upload new image */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Tải ảnh mới từ thiết bị</span>
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-900 hover:border-violet-500/40 bg-slate-950/20 hover:bg-slate-950/40 transition rounded-xl p-6 cursor-pointer group">
                  <Upload className="w-8 h-8 text-gray-500 group-hover:text-violet-400 transition mb-2" />
                  <span className="text-xs font-semibold text-slate-300">Nhấp để tải lên (PNG, JPG, WebP)</span>
                  <span className="text-[9px] text-gray-500 mt-1">Ảnh sẽ được lưu trực tiếp vào thẻ tham chiếu</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleFileUpload} 
                    className="hidden" 
                  />
                </label>
              </div>

              {/* Action 2: Gallery of created reference images */}
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">
                  Chọn từ ảnh tham chiếu đã tạo ({existingCharRefs.length + existingExtRefs.length})
                </span>
                
                {existingCharRefs.length === 0 && existingExtRefs.length === 0 ? (
                  <div className="text-center py-8 text-gray-650 text-xs italic bg-slate-950/20 border border-slate-900/60 rounded-xl">
                    Chưa có ảnh tham chiếu nào được tạo trong dự án này.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Character References Gallery */}
                    {existingCharRefs.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-[9px] font-bold text-violet-400 uppercase tracking-wider block">Ảnh nhân vật ({existingCharRefs.length})</span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {existingCharRefs.map((char) => (
                            <div 
                              key={char.characterId}
                              onClick={() => handleAssignImage(char.image, char.mediaId, char.accountId)}
                              className="group relative aspect-square bg-slate-950 border border-slate-900 rounded-lg overflow-hidden cursor-pointer hover:border-violet-500 transition shadow"
                            >
                              <img 
                                src={char.image} 
                                alt={char.characterId} 
                                className="w-full h-full object-cover opacity-75 group-hover:opacity-100 transition" 
                              />
                              <div className="absolute bottom-1.5 left-1.5 bg-black/75 px-1.5 py-0.5 rounded text-[8px] font-bold text-slate-300 truncate max-w-[90%]">
                                {getCardTitle(char.characterId)}
                              </div>
                              <div className="absolute inset-0 bg-violet-600/10 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                                <span className="text-[10px] bg-violet-600 px-2 py-0.5 rounded font-bold text-white shadow">
                                  Chọn ảnh
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Background References Gallery */}
                    {existingExtRefs.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-[9px] font-bold text-fuchsia-400 uppercase tracking-wider block">Ảnh bối cảnh ({existingExtRefs.length})</span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {existingExtRefs.map((ext) => (
                            <div 
                              key={ext.exteriorId}
                              onClick={() => handleAssignImage(ext.image, ext.mediaId, ext.accountId)}
                              className="group relative aspect-video bg-slate-950 border border-slate-900 rounded-lg overflow-hidden cursor-pointer hover:border-fuchsia-500 transition shadow"
                            >
                              <img 
                                src={ext.image} 
                                alt={ext.exteriorId} 
                                className="w-full h-full object-cover opacity-75 group-hover:opacity-100 transition" 
                              />
                              <div className="absolute bottom-1.5 left-1.5 bg-black/75 px-1.5 py-0.5 rounded text-[8px] font-bold text-slate-300 truncate max-w-[90%]">
                                {getCardTitle(ext.exteriorId)}
                              </div>
                              <div className="absolute inset-0 bg-fuchsia-600/10 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                                <span className="text-[10px] bg-fuchsia-600 px-2 py-0.5 rounded font-bold text-white shadow">
                                  Chọn ảnh
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-900 bg-slate-950/20 flex justify-end">
              <button
                onClick={() => setAssignModal(null)}
                className="bg-slate-900 hover:bg-slate-800 text-gray-400 hover:text-slate-200 font-bold py-2 px-5 rounded-lg text-xs tracking-wider cursor-pointer border-0"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
