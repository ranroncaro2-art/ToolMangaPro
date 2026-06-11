import React, { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { Sparkles, RefreshCw, ZoomIn, Sliders, Play, Check, X, AlertCircle, Download } from 'lucide-react';

export default function VideoManager() {
  const {
    currentProject,
    videoGeneratingIds = [],
    generateVideo,
    updateImagePromptCell,
    videoLogs = [],
    videoQueue = [],
    videoActive = [],
    fetchVideoQueueAndLogs,
    videoGenConfig,
    batchJobs = {},
    startBatchVideoGeneration,
    cancelBatchJob
  } = useProjectStore();

  const activeJob = batchJobs[`${currentProject.id}_video`];
  const isBatchGenerating = activeJob?.isRunning || false;

  const [zoomedMedia, setZoomedMedia] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const [isLogsExpanded, setIsLogsExpanded] = useState(false);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Pagination & Filter States
  const [pageSize, setPageSize] = useState<number>(30);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [activeFilter, setActiveFilter] = useState<'all' | 'generated' | 'not_generated' | 'failed' | 'missing_image'>('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [failedVideoIds, setFailedVideoIds] = useState<number[]>([]);
  const [downloadingIds, setDownloadingIds] = useState<number[]>([]);
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);
  const [batchDownloadProgress, setBatchDownloadProgress] = useState({ current: 0, total: 0 });

  // Poll server queue & logs
  useEffect(() => {
    fetchVideoQueueAndLogs();
    const interval = setInterval(() => {
      fetchVideoQueueAndLogs();
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchVideoQueueAndLogs]);

  // Scroll console to bottom on new logs
  useEffect(() => {
    if (isLogsExpanded && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [videoLogs, isLogsExpanded]);

  const handleGenerate = async (stt: number) => {
    try {
      await generateVideo(stt);
      setFailedVideoIds(prev => prev.filter(id => id !== stt));
    } catch (err) {
      setFailedVideoIds(prev => Array.from(new Set([...prev, stt])));
      alert('Tạo video thất bại: ' + (err as Error).message);
    }
  };

  const handleGenerateSelected = async () => {
    if (selectedIds.length === 0 || isBatchGenerating) return;
    try {
      await startBatchVideoGeneration(selectedIds);
      setSelectedIds([]);
    } catch (err) {
      alert('Tạo video thất bại: ' + (err as Error).message);
    }
  };

  const handleGenerateUncreated = async () => {
    const uncreatedSttList = (currentProject.imagePrompts || [])
      .filter(p => !p.videoUrl && !!p.imageUrl)
      .map(p => p.stt);
    
    if (uncreatedSttList.length === 0) {
      alert('Tất cả phân cảnh sẵn sàng đều đã được tạo video hoặc chưa có ảnh để tạo!');
      return;
    }

    try {
      await startBatchVideoGeneration(uncreatedSttList);
      setSelectedIds([]);
    } catch (err) {
      alert('Tạo video thất bại: ' + (err as Error).message);
    }
  };

  const handleDownloadVideo = async (row: any) => {
    if (!row.videoUrl) return;
    const stt = row.stt;
    if (downloadingIds.includes(stt)) return;
    setDownloadingIds(prev => [...prev, stt]);

    const fileName = `segment_${String(stt).padStart(2, '0')}.mp4`;
    const rawSaveDir = currentProject.videoSaveDir;

    if (rawSaveDir) {
      const sep = rawSaveDir.includes('/') ? '/' : '\\';
      const cleanBase = rawSaveDir.replace(/[\\/]+$/, '');
      const saveDir = `${cleanBase}${sep}videos`;
      try {
        const response = await fetch('/api/video/download', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: row.videoUrl,
            saveDir,
            fileName
          })
        });
        if (response.ok) {
          alert(`Đã tải và lưu video thành công vào thư mục: \n${saveDir}\\${fileName}`);
          setDownloadingIds(prev => prev.filter(id => id !== stt));
          return;
        }
      } catch (err) {
        console.error('Failed to download locally, falling back to browser download', err);
      }
    }

    // Browser download fallback
    try {
      const res = await fetch(row.videoUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Browser download failed', err);
      window.open(row.videoUrl, '_blank');
    } finally {
      setDownloadingIds(prev => prev.filter(id => id !== stt));
    }
  };

  const handleDownloadSelected = async () => {
    const selectables = selectedIds.filter(stt => {
      const row = (currentProject.imagePrompts || []).find(r => r.stt === stt);
      return row && !!row.videoUrl;
    });

    if (selectables.length === 0) {
      alert('Không có video nào khả dụng để tải trong danh sách đã chọn!');
      return;
    }

    const rawSaveDir = currentProject.videoSaveDir;
    if (!rawSaveDir) {
      alert('Vui lòng thiết lập "Thư mục lưu video trên máy tính" trong tab "Cấu hình dự án" trước khi tải hàng loạt!');
      return;
    }
    const sep = rawSaveDir.includes('/') ? '/' : '\\';
    const cleanBase = rawSaveDir.replace(/[\\/]+$/, '');
    const saveDir = `${cleanBase}${sep}videos`;

    setIsBatchDownloading(true);
    setBatchDownloadProgress({ current: 0, total: selectables.length });

    let successCount = 0;
    for (let i = 0; i < selectables.length; i++) {
      const stt = selectables[i];
      const row = (currentProject.imagePrompts || []).find(r => r.stt === stt);
      if (!row || !row.videoUrl) continue;

      const fileName = `segment_${String(stt).padStart(2, '0')}.mp4`;
      try {
        const response = await fetch('/api/video/download', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: row.videoUrl,
            saveDir,
            fileName
          })
        });
        if (response.ok) {
          successCount++;
        }
      } catch (err) {
        console.error(`Failed to download segment #${stt}:`, err);
      }
      setBatchDownloadProgress(prev => ({ ...prev, current: i + 1 }));
    }

    setIsBatchDownloading(false);
    alert(`Đã tải thành công ${successCount}/${selectables.length} video vào thư mục:\n${saveDir}`);
  };

  const handleUpdateMotion = (stt: number, value: string) => {
    const rowIndex = (currentProject.imagePrompts || []).findIndex(p => p.stt === stt);
    if (rowIndex !== -1) {
      updateImagePromptCell(rowIndex, 'motion', value);
    }
  };

  // Filter Logic
  const filteredPrompts = (currentProject.imagePrompts || []).filter((row) => {
    if (activeFilter === 'generated') {
      return !!row.videoUrl;
    }
    if (activeFilter === 'not_generated') {
      return !row.videoUrl;
    }
    if (activeFilter === 'failed') {
      return failedVideoIds.includes(row.stt);
    }
    if (activeFilter === 'missing_image') {
      return !row.imageUrl;
    }
    return true;
  });

  // Toggle select all matching current filter (only select those that have imageUrl)
  const handleToggleSelectAll = () => {
    const selectables = filteredPrompts.filter(r => !!r.imageUrl).map(r => r.stt);
    const isAllSelected = selectables.length > 0 && selectables.every(stt => selectedIds.includes(stt));

    if (isAllSelected) {
      setSelectedIds(prev => prev.filter(stt => !selectables.includes(stt)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...selectables])));
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

  const isVideoFile = (url: string) => {
    if (!url) return false;
    const cleanUrl = url.split('?')[0].toLowerCase();
    return cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.webm') || cleanUrl.endsWith('.ogg');
  };

  const totalUncreatedVideos = (currentProject.imagePrompts || []).filter(p => !p.videoUrl && !!p.imageUrl).length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      <div className="pb-4 border-b border-gray-900 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Tạo video</h2>
          <p className="text-xs text-gray-500 mt-1">
            Generate 4-second motion videos based on your generated shot images and motion descriptions.
          </p>
        </div>
        <div className="text-xs text-gray-400 font-medium bg-slate-900/40 border border-slate-900 px-3 py-1.5 rounded-lg">
          Tổng số phân cảnh: <strong className="text-violet-400">{currentProject.imagePrompts?.length || 0}</strong>
        </div>
      </div>

      {currentProject.imagePrompts?.length === 0 ? (
        <div className="text-center py-20 text-gray-500 text-sm border border-dashed border-gray-800 rounded-xl bg-slate-900/5">
          Vui lòng tạo hoặc hoàn thành bước **3. Image Prompts** để lấy danh sách phân cảnh.
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
                    checked={filteredPrompts.filter(r => !!r.imageUrl).length > 0 && filteredPrompts.filter(r => !!r.imageUrl).map(r => r.stt).every(stt => selectedIds.includes(stt))}
                    ref={(el) => {
                      if (el) {
                        const selectables = filteredPrompts.filter(r => !!r.imageUrl).map(r => r.stt);
                        const isAll = selectables.length > 0 && selectables.every(stt => selectedIds.includes(stt));
                        const isSome = selectables.some(stt => selectedIds.includes(stt));
                        el.indeterminate = isSome && !isAll;
                      }
                    }}
                    onChange={handleToggleSelectAll}
                    className="rounded border-gray-900 text-violet-600 focus:ring-violet-500/20 bg-slate-950 w-4 h-4 cursor-pointer"
                  />
                  Chọn tất cả ảnh sẵn sàng {activeFilter !== 'all' ? `(${filteredPrompts.filter(r => !!r.imageUrl).length})` : ''}
                </label>

                <button
                  onClick={handleGenerateSelected}
                  disabled={selectedIds.length === 0 || isBatchGenerating || videoGeneratingIds.some(id => id.startsWith(`${currentProject.id || ''}_`))}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:from-slate-900 disabled:to-slate-950 disabled:opacity-40 text-white font-bold py-2 px-4 rounded-lg text-xs tracking-wider shadow-lg active:scale-98 transition duration-200 cursor-pointer select-none"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {isBatchGenerating ? 'Đang tạo hàng loạt...' : `Tạo tất cả video đã chọn (${selectedIds.length})`}
                </button>

                <button
                  onClick={handleGenerateUncreated}
                  disabled={isBatchGenerating || totalUncreatedVideos === 0 || videoGeneratingIds.some(id => id.startsWith(`${currentProject.id || ''}_`))}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-900 disabled:opacity-40 text-white font-bold py-2 px-4 rounded-lg text-xs tracking-wider shadow-lg active:scale-98 transition duration-200 cursor-pointer select-none"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {isBatchGenerating ? 'Đang tạo hàng loạt...' : `Tạo video chưa tạo (${totalUncreatedVideos})`}
                </button>

                <button
                  onClick={handleDownloadSelected}
                  disabled={selectedIds.length === 0 || isBatchDownloading}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-900 disabled:opacity-40 text-white font-bold py-2 px-4 rounded-lg text-xs tracking-wider shadow-lg active:scale-98 transition duration-200 cursor-pointer select-none"
                >
                  <Download className="w-3.5 h-3.5" />
                  {isBatchDownloading
                    ? `Đang tải (${batchDownloadProgress.current}/${batchDownloadProgress.total})...`
                    : `Tải tất cả video đã chọn (${selectedIds.filter(stt => {
                        const r = (currentProject.imagePrompts || []).find(row => row.stt === stt);
                        return r && !!r.videoUrl;
                      }).length})`}
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
                  {(['all', 'generated', 'not_generated', 'failed', 'missing_image'] as const).map((filter) => {
                    const label = filter === 'all' ? 'Tổng' 
                                : filter === 'generated' ? 'Thành công' 
                                : filter === 'not_generated' ? 'Chưa có video' 
                                : filter === 'failed' ? 'Lỗi'
                                : 'Thiếu ảnh';
                    const count = filter === 'all' ? currentProject.imagePrompts.length 
                                : filter === 'generated' ? currentProject.imagePrompts.filter(p => !!p.videoUrl).length 
                                : filter === 'not_generated' ? currentProject.imagePrompts.filter(p => !p.videoUrl).length 
                                : filter === 'failed' ? failedVideoIds.length
                                : currentProject.imagePrompts.filter(p => !p.imageUrl).length;
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
                            : 'text-gray-400 hover:text-slate-200 border border-transparent'
                        }`}
                      >
                        {label}
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${isActive ? 'bg-violet-950 text-violet-400' : 'bg-slate-900 text-gray-400'}`}>
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
                  <span className="text-violet-400 animate-pulse">Đang tiến hành tạo video hàng loạt...</span>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 font-mono">
                      Hoàn thành: {activeJob.completed.length} / {activeJob.tasks.length} {activeJob.failed.length > 0 && `(Lỗi: ${activeJob.failed.length})`}
                    </span>
                    <button
                      onClick={() => cancelBatchJob(currentProject.id!, 'video')}
                      className="text-rose-400 hover:text-rose-300 font-bold px-2 py-0.5 border border-rose-950 hover:border-rose-900 rounded bg-rose-950/20 text-[9px] uppercase cursor-pointer"
                    >
                      Dừng tạo
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

            {/* Batch download progress */}
            {isBatchDownloading && (
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-900 animate-fadeIn space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-semibold">
                  <span className="text-emerald-400 animate-pulse">Đang tiến hành tải video hàng loạt...</span>
                  <span className="text-gray-500 font-mono">
                    Hoàn thành: {batchDownloadProgress.current} / {batchDownloadProgress.total}
                  </span>
                </div>
                <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-emerald-600 to-teal-500 h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${(batchDownloadProgress.current / batchDownloadProgress.total) * 100}%`
                    }}
                  ></div>
                </div>
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between pt-3 border-t border-slate-950 gap-3 select-none">
                <span className="text-xs text-gray-500">
                  Hiển thị <strong className="text-slate-300">{Math.min((currentPage - 1) * pageSize + 1, totalItems)}</strong> - <strong className="text-slate-300">{Math.min(currentPage * pageSize, totalItems)}</strong> trong tổng số <strong className="text-slate-300">{totalItems}</strong> dòng phân cảnh
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
                              : 'bg-slate-950 border-slate-900 text-gray-400 hover:text-slate-300'
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
                const isGenerating = videoGeneratingIds.includes(`${currentProject.id || ''}_${row.stt}`);
                const isSelected = selectedIds.includes(row.stt);
                
                return (
                  <div
                    key={row.stt}
                    className={`transition-all duration-300 flex flex-col md:flex-row gap-5 items-stretch border rounded-xl p-4.5 ${
                      isSelected
                        ? 'bg-violet-950/10 border-violet-800/80 shadow-lg shadow-violet-500/5'
                        : 'bg-slate-900/20 border-slate-900 hover:border-slate-800'
                    }`}
                  >
                    {/* Checkbox and STT Column */}
                    <div className="md:w-14 flex md:flex-col items-center justify-center gap-2 border-b md:border-b-0 md:border-r border-slate-900/60 pb-3 md:pb-0 md:pr-4 select-none shrink-0">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block md:mb-1.5 md:text-center">Chọn</span>
                      <div className="flex md:flex-col items-center gap-2 md:gap-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!row.imageUrl}
                          onChange={() => {
                            setSelectedIds(prev =>
                              prev.includes(row.stt)
                                ? prev.filter(id => id !== row.stt)
                                : [...prev, row.stt]
                            );
                          }}
                          className="rounded border-gray-900 text-violet-600 focus:ring-violet-500/20 bg-slate-950 w-4 h-4 cursor-pointer disabled:opacity-20"
                        />
                        <span className="text-xs font-bold text-slate-350 font-mono tracking-tight bg-slate-950 px-2 py-0.5 rounded border border-slate-900">
                          #{String(row.stt).padStart(2, '0')}
                        </span>
                      </div>
                    </div>

                    {/* Content Details Column (Motion Prompt textarea) */}
                    <div className="flex-1 flex flex-col min-w-[200px]">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-2 select-none">
                        Mô tả chuyển động (Motion Prompt)
                      </span>
                      <textarea
                        value={row.motion || ''}
                        onChange={(e) => handleUpdateMotion(row.stt, e.target.value)}
                        placeholder="Nhập mô tả chuyển động camera/nhân vật (ví dụ: cinematic camera panning slowly left, the man nods slowly...)"
                        className="w-full flex-1 min-h-[100px] bg-slate-950/45 border border-slate-900/80 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 rounded-lg p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none transition resize-none font-mono leading-relaxed"
                      />
                    </div>

                    {/* Previews and Output Container (Symmetric Shot ref and Video output) */}
                    <div className="w-full md:w-[440px] flex flex-col sm:flex-row gap-4 shrink-0 select-none">
                      
                      {/* Column 1: Input Shot Image Reference */}
                      <div className="flex-1 flex flex-col justify-between bg-slate-950/35 rounded-xl p-3 border border-slate-900/50 min-h-[160px]">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-2 text-center select-none">Ảnh Shots tham chiếu</span>
                        
                        {row.imageUrl ? (
                          <div className="flex-1 flex flex-col justify-between space-y-2.5">
                            <div 
                              onClick={() => setZoomedMedia({ url: row.imageUrl!, type: isVideoFile(row.imageUrl || '') ? 'video' : 'image' })}
                              className="relative overflow-hidden rounded-lg aspect-video bg-black/40 border border-slate-900 group cursor-pointer"
                            >
                              {isVideoFile(row.imageUrl) ? (
                                <video
                                  src={row.imageUrl}
                                  loop
                                  muted
                                  autoPlay
                                  playsInline
                                  className="w-full h-full object-cover rounded-lg group-hover:scale-102 transition duration-300 pointer-events-none"
                                />
                              ) : (
                                <img
                                  src={row.imageUrl}
                                  alt={`Shot ref #${row.stt}`}
                                  className="w-full h-full object-cover rounded-lg group-hover:scale-102 transition duration-300"
                                />
                              )}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition duration-200">
                                <ZoomIn className="w-4 h-4 text-white/80" />
                              </div>
                            </div>

                            <button
                              onClick={() => setZoomedMedia({ url: row.imageUrl!, type: isVideoFile(row.imageUrl || '') ? 'video' : 'image' })}
                              className="w-full flex items-center justify-center gap-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-850 text-[10px] py-1.5 rounded font-semibold text-slate-350 hover:text-slate-100 transition cursor-pointer select-none"
                            >
                              <ZoomIn className="w-3 h-3 text-slate-400" />
                              Xem ảnh Shots
                            </button>
                          </div>
                        ) : (
                          <div className="flex-1 flex flex-col justify-between space-y-2.5">
                            <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-amber-900/30 bg-amber-950/5 rounded-lg p-3 text-center aspect-video">
                              <AlertCircle className="w-5 h-5 text-amber-500/80 mb-1 animate-pulse" />
                              <span className="text-[9px] font-bold text-amber-500/90 uppercase tracking-wider">Chưa có ảnh</span>
                            </div>
                            
                            <button
                              disabled
                              className="w-full flex items-center justify-center gap-1.5 bg-slate-900/30 border border-slate-950/50 text-[10px] py-1.5 rounded font-semibold text-slate-600 cursor-not-allowed select-none"
                            >
                              Thiếu ảnh gốc
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Column 2: Video Output Player or Generation Trigger */}
                      <div className="flex-1 flex flex-col justify-between bg-slate-950/40 rounded-xl p-3 border border-slate-900/50 min-h-[160px]">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-2 text-center select-none">Video kết quả</span>
                        
                        {isGenerating ? (
                          <div className="flex-1 flex flex-col justify-between space-y-2.5">
                            <div className="flex-1 flex flex-col items-center justify-center bg-black/40 border border-slate-900 rounded-lg aspect-video">
                              <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mb-1.5"></div>
                              <span className="text-[9px] font-bold text-violet-400 uppercase tracking-wider animate-pulse">
                                Đang vẽ...
                              </span>
                            </div>
                            
                            <button
                              disabled
                              className="w-full flex items-center justify-center gap-1.5 bg-slate-900/30 border border-slate-950/50 text-[10px] py-1.5 rounded font-semibold text-violet-500/60 cursor-not-allowed select-none animate-pulse"
                            >
                              Đang xử lý...
                            </button>
                          </div>
                        ) : row.videoUrl ? (
                          <div className="flex-1 flex flex-col justify-between space-y-2.5">
                            <div 
                              onClick={() => setZoomedMedia({ url: row.videoUrl!, type: 'video' })}
                              className="relative overflow-hidden rounded-lg aspect-video bg-black/40 border border-slate-900 group cursor-pointer"
                            >
                              <video
                                src={row.videoUrl}
                                loop
                                muted
                                autoPlay
                                playsInline
                                className="w-full h-full object-cover rounded-lg group-hover:scale-102 transition duration-300 pointer-events-none"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition duration-200">
                                <ZoomIn className="w-4 h-4 text-white/80" />
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <button
                                onClick={() => handleGenerate(row.stt)}
                                disabled={!row.imageUrl}
                                className="flex-1 flex items-center justify-center gap-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-850 text-[10px] py-1.5 rounded font-semibold text-slate-350 hover:text-slate-100 transition cursor-pointer select-none"
                              >
                                <RefreshCw className="w-3 h-3 text-slate-400" />
                                Tạo lại video
                              </button>
                              <button
                                onClick={() => handleDownloadVideo(row)}
                                disabled={downloadingIds.includes(row.stt)}
                                className="bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-750 text-slate-350 hover:text-slate-100 px-2.5 py-1.5 rounded transition cursor-pointer flex items-center justify-center shrink-0"
                                title="Tải video về máy tính"
                              >
                                {downloadingIds.includes(row.stt) ? (
                                  <div className="w-3.5 h-3.5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                  <Download className="w-3.5 h-3.5 text-violet-400" />
                                )}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex-1 flex flex-col justify-between space-y-2.5">
                            <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-800/80 bg-slate-900/10 rounded-lg p-3 text-center aspect-video">
                              <Play className="w-5 h-5 text-slate-600 mb-1" />
                              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Chưa tạo video</span>
                            </div>
                            
                            <button
                              onClick={() => handleGenerate(row.stt)}
                              disabled={!row.imageUrl}
                              className="w-full flex items-center justify-center gap-1.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:from-slate-900 disabled:to-slate-950 disabled:opacity-40 text-white font-bold py-1.5 rounded text-[10px] tracking-wider transition active:scale-98 cursor-pointer select-none"
                            >
                              <Play className="w-3 h-3" />
                              Tạo video
                            </button>
                          </div>
                        )}
                      </div>

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
            <Sliders className="w-4 h-4 text-fuchsia-400" />
            <h3 className="font-bold text-slate-200 text-xs tracking-wide uppercase">
              Hàng chờ & Logs tạo video
            </h3>
            <span className="h-4 w-px bg-gray-800 mx-1"></span>
            <div className="flex items-center gap-3 text-[10px] text-gray-500 font-mono">
              <span className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${videoActive.length > 0 ? 'bg-fuchsia-550 animate-pulse' : 'bg-gray-700'}`}></span>
                Đang chạy: <strong className="text-slate-300">{videoActive.length}</strong>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span>
                Chờ: <strong className="text-slate-300">{videoQueue.length}</strong>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-500"></span>
                Tổng Logs: <strong className="text-slate-300">{videoLogs.length}</strong>
              </span>
            </div>
          </div>
          <button className="text-slate-400 hover:text-slate-200 focus:outline-none transition bg-transparent border-0 cursor-pointer">
            {isLogsExpanded ? (
              <span className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-400">Ẩn Console ▲</span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-400">Hiện Console ▼</span>
            )}
          </button>
        </div>

        {/* Console Panel */}
        {isLogsExpanded && (
          <div className="grid grid-cols-1 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-950 bg-slate-950/20 h-[240px] animate-fadeIn">
            {/* Left Column: Server Queue */}
            <div className="lg:col-span-1 p-3 flex flex-col h-full overflow-hidden">
              <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2 border-b border-slate-900 pb-1">
                Hàng chờ tạo video
              </div>
              <div className="flex-1 overflow-y-auto space-y-1.5 font-mono text-[10px]">
                {videoActive.length === 0 && videoQueue.length === 0 ? (
                  <div className="text-gray-550 italic text-center py-10">Không có yêu cầu nào</div>
                ) : (
                  <>
                    {/* Active Items */}
                    {videoActive.map((item) => (
                      <div key={item.id} className="flex items-center justify-between bg-fuchsia-950/20 border border-fuchsia-900/40 p-2 rounded text-fuchsia-450">
                        <div className="truncate flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 animate-ping"></span>
                          <span className="font-semibold">{item.assetId}</span>
                          <span className="text-[8px] bg-fuchsia-950 text-fuchsia-400 px-1 py-0.2 rounded font-sans uppercase">
                            Video
                          </span>
                        </div>
                        <span className="text-[8px] text-gray-500">{item.startTime}</span>
                      </div>
                    ))}
                    {/* Queued Items */}
                    {videoQueue.map((item) => (
                      <div key={item.id} className="flex items-center justify-between bg-slate-900/40 border border-slate-900 p-2 rounded text-slate-450">
                        <div className="truncate flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span>
                          <span>{item.assetId}</span>
                          <span className="text-[8px] bg-slate-950 text-gray-400 px-1 py-0.2 rounded font-sans uppercase">
                            Video
                          </span>
                        </div>
                        <span className="text-[8px] text-gray-400 font-bold font-sans">ĐỢI</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Right Column: Console System Logs */}
            <div className="lg:col-span-3 p-3 flex flex-col h-full overflow-hidden bg-slate-950/40">
              <div className="flex items-center justify-between mb-2 border-b border-slate-900 pb-1">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  Video Logs Console
                </div>
                <div className="text-[8px] text-gray-550 font-mono">
                  Auto-refreshing (2s)
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto bg-black/50 p-2.5 rounded border border-slate-950 font-mono text-[10px] space-y-1 scrollbar-thin">
                {videoLogs.length === 0 ? (
                  <div className="text-gray-550 italic text-center py-12 select-none">Chưa có log hệ thống</div>
                ) : (
                  videoLogs.map((log) => {
                    let bgBadge = 'bg-fuchsia-950 text-fuchsia-400';
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
                        <span className={`leading-relaxed ${log.type === 'error' ? 'text-rose-400' : 'text-slate-300'}`}>
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
      {zoomedMedia && (
        <div
          onClick={() => setZoomedMedia(null)}
          className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center cursor-zoom-out p-4 transition-all duration-300 ease-in-out animate-fadeIn"
        >
          {zoomedMedia.type === 'video' ? (
            <video
              src={zoomedMedia.url}
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
              src={zoomedMedia.url}
              alt="Zoomed Reference Media"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl scale-100"
            />
          )}
        </div>
      )}
    </div>
  );
}
