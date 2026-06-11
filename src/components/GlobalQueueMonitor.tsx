"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Activity, X, ChevronDown, Film, Sparkles, Image, Play } from 'lucide-react';
import { useProjectStore } from '../store/useProjectStore';

export default function GlobalQueueMonitor() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeLogTab, setActiveLogTab] = useState<'text' | 'image' | 'video'>('image');

  const {
    currentProject,
    history,
    loadHistory,
    fetchGlobalQueues,
    globalTextQueue,
    globalTextActive,
    globalTextLogs,
    globalServerQueue,
    globalServerActive,
    globalSystemLogs,
    globalVideoQueue,
    globalVideoActive,
    globalVideoLogs,
    batchJobs,
    cancelBatchJob
  } = useProjectStore();

  // Poll global queues every 3 seconds
  useEffect(() => {
    loadHistory();
    fetchGlobalQueues();
    const interval = setInterval(() => {
      fetchGlobalQueues();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchGlobalQueues, loadHistory]);

  // Map project IDs to project names
  const projectNames = useMemo(() => {
    const nameMap = new Map<string, string>();
    if (Array.isArray(history)) {
      history.forEach(p => {
        if (p.id) nameMap.set(p.id, p.name);
      });
    }
    return nameMap;
  }, [history]);

  // Count active + queued tasks for badges
  const textCount = (globalTextActive?.length || 0) + (globalTextQueue?.length || 0);
  const imageCount = (globalServerActive?.length || 0) + (globalServerQueue?.length || 0);
  const videoCount = (globalVideoActive?.length || 0) + (globalVideoQueue?.length || 0);

  // Active client background batch processes
  const activeJobs = Object.entries(batchJobs || {})
    .filter(([_, job]) => job.isRunning)
    .map(([key, job]) => ({ key, ...job }));

  const hasAnyServerTask = textCount > 0 || imageCount > 0 || videoCount > 0;
  const hasAnyClientJob = activeJobs.length > 0;

  const renderServerQueueItems = () => {
    const items: React.ReactNode[] = [];

    // Active Text
    if (Array.isArray(globalTextActive)) {
      globalTextActive.forEach(item => {
        const projName = projectNames.get(item.projectId) || (item.projectId === currentProject.id ? currentProject.name : 'Dự án khác');
        items.push(
          <div key={`act-text-${item.id}`} className="flex items-center justify-between gap-3 text-xs p-2 bg-violet-950/20 border border-violet-900/30 rounded">
            <div className="flex items-center gap-2 truncate">
              <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse shrink-0" />
              <span className="font-semibold text-violet-400 shrink-0">[AI]</span>
              <span className="text-slate-300 truncate" title={projName}>{projName}</span>
              <span className="text-slate-400">({item.label || item.type})</span>
            </div>
            <span className="text-[10px] text-slate-500 shrink-0">{item.startTime}</span>
          </div>
        );
      });
    }

    // Queued Text
    if (Array.isArray(globalTextQueue)) {
      globalTextQueue.forEach(item => {
        const projName = projectNames.get(item.projectId) || (item.projectId === currentProject.id ? currentProject.name : 'Dự án khác');
        items.push(
          <div key={`q-text-${item.id}`} className="flex items-center justify-between gap-3 text-xs p-2 bg-slate-900/30 border border-slate-800/50 rounded text-slate-400">
            <div className="flex items-center gap-2 truncate">
              <span className="w-2 h-2 rounded-full bg-slate-700 shrink-0" />
              <span className="font-medium text-slate-500 shrink-0">[AI]</span>
              <span className="truncate">{projName}</span>
              <span>({item.label || item.type})</span>
            </div>
            <span className="text-[10px] text-slate-500 shrink-0">Chờ...</span>
          </div>
        );
      });
    }

    // Active Images
    if (Array.isArray(globalServerActive)) {
      globalServerActive.forEach(item => {
        const projName = projectNames.get(item.projectId) || (item.projectId === currentProject.id ? currentProject.name : 'Dự án khác');
        items.push(
          <div key={`act-img-${item.id}`} className="flex items-center justify-between gap-3 text-xs p-2 bg-emerald-950/20 border border-emerald-900/30 rounded">
            <div className="flex items-center gap-2 truncate">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="font-semibold text-emerald-400 shrink-0">[Ảnh]</span>
              <span className="text-slate-300 truncate" title={projName}>{projName}</span>
              <span className="text-slate-400">({item.assetId})</span>
            </div>
            <span className="text-[10px] text-slate-500 shrink-0">{item.startTime}</span>
          </div>
        );
      });
    }

    // Queued Images
    if (Array.isArray(globalServerQueue)) {
      globalServerQueue.forEach(item => {
        const projName = projectNames.get(item.projectId) || (item.projectId === currentProject.id ? currentProject.name : 'Dự án khác');
        items.push(
          <div key={`q-img-${item.id}`} className="flex items-center justify-between gap-3 text-xs p-2 bg-slate-900/30 border border-slate-800/50 rounded text-slate-400">
            <div className="flex items-center gap-2 truncate">
              <span className="w-2 h-2 rounded-full bg-slate-700 shrink-0" />
              <span className="font-medium text-slate-500 shrink-0">[Ảnh]</span>
              <span className="truncate">{projName}</span>
              <span>({item.assetId})</span>
            </div>
            <span className="text-[10px] text-slate-500 shrink-0">Chờ...</span>
          </div>
        );
      });
    }

    // Active Videos
    if (Array.isArray(globalVideoActive)) {
      globalVideoActive.forEach(item => {
        const projName = projectNames.get(item.projectId) || (item.projectId === currentProject.id ? currentProject.name : 'Dự án khác');
        items.push(
          <div key={`act-vid-${item.id}`} className="flex items-center justify-between gap-3 text-xs p-2 bg-fuchsia-950/20 border border-fuchsia-900/30 rounded">
            <div className="flex items-center gap-2 truncate">
              <span className="w-2 h-2 rounded-full bg-fuchsia-500 animate-pulse shrink-0" />
              <span className="font-semibold text-fuchsia-400 shrink-0">[Video]</span>
              <span className="text-slate-300 truncate" title={projName}>{projName}</span>
              <span className="text-slate-400">(STT: {item.stt})</span>
            </div>
            <span className="text-[10px] text-slate-500 shrink-0">{item.startTime}</span>
          </div>
        );
      });
    }

    // Queued Videos
    if (Array.isArray(globalVideoQueue)) {
      globalVideoQueue.forEach(item => {
        const projName = projectNames.get(item.projectId) || (item.projectId === currentProject.id ? currentProject.name : 'Dự án khác');
        items.push(
          <div key={`q-vid-${item.id}`} className="flex items-center justify-between gap-3 text-xs p-2 bg-slate-900/30 border border-slate-800/50 rounded text-slate-400">
            <div className="flex items-center gap-2 truncate">
              <span className="w-2 h-2 rounded-full bg-slate-700 shrink-0" />
              <span className="font-medium text-slate-500 shrink-0">[Video]</span>
              <span className="truncate">{projName}</span>
              <span>(STT: {item.stt})</span>
            </div>
            <span className="text-[10px] text-slate-500 shrink-0">Chờ...</span>
          </div>
        );
      });
    }

    if (items.length === 0) {
      return (
        <div className="text-xs text-slate-500 italic p-3 text-center border border-slate-900 rounded bg-slate-950/20">
          Hàng đợi máy chủ đang trống.
        </div>
      );
    }

    return <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">{items}</div>;
  };

  const renderLogs = () => {
    let logsList: any[] = [];
    if (activeLogTab === 'text') {
      logsList = globalTextLogs || [];
    } else if (activeLogTab === 'video') {
      logsList = globalVideoLogs || [];
    } else {
      logsList = globalSystemLogs || [];
    }

    const sortedLogs = [...logsList].reverse().slice(0, 20);

    if (sortedLogs.length === 0) {
      return (
        <div className="text-[10px] text-slate-500 italic p-3 font-mono text-center">
          Chưa có nhật ký hoạt động nào.
        </div>
      );
    }

    return (
      <div className="bg-slate-950/80 border border-slate-900/60 rounded-lg p-2.5 font-mono text-[10px] h-32 overflow-y-auto space-y-1 text-slate-300">
        {sortedLogs.map(log => {
          const projName = projectNames.get(log.projectId) || (log.projectId === currentProject.id ? currentProject.name : 'Dự án khác');
          let typeColor = 'text-blue-400';
          if (log.type === 'success') typeColor = 'text-emerald-400';
          if (log.type === 'error') typeColor = 'text-red-450 font-bold';

          return (
            <div key={log.id} className="leading-relaxed border-b border-slate-900/30 pb-0.5 last:border-0">
              <span className="text-slate-500">[{log.timestamp}]</span>{' '}
              <span className="text-slate-400 font-semibold">[{projName}]</span>{' '}
              <span className={typeColor}>{log.message}</span>
            </div>
          );
        })}
      </div>
    );
  };

  // Error detection
  const hasJobErrors = Object.values(batchJobs || {}).some(
    (job: any) => job.failed && job.failed.length > 0
  );
  const hasLogErrors = 
    (globalSystemLogs || []).some((log: any) => log.type === 'error') ||
    (globalTextLogs || []).some((log: any) => log.type === 'error') ||
    (globalVideoLogs || []).some((log: any) => log.type === 'error');
  const hasError = hasJobErrors || hasLogErrors;

  const totalCount = textCount + imageCount + videoCount + activeJobs.length;

  return (
    <>
      {/* Floating Action Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-[9990] p-4 rounded-full shadow-[0_0_20px_rgba(0,0,0,0.8)] border transition-all duration-300 active:scale-95 flex items-center justify-center cursor-pointer select-none ${
          hasError
            ? 'bg-rose-950/85 border-rose-500/60 text-rose-400 shadow-rose-950/50 animate-pulse'
            : hasAnyServerTask || hasAnyClientJob
            ? 'bg-emerald-950/85 border-emerald-500/60 text-emerald-400 shadow-emerald-950/50 animate-pulse'
            : 'bg-slate-900/95 border-slate-805 text-slate-300 hover:border-slate-700 hover:text-white'
        }`}
        title="Giám sát hàng đợi hệ thống"
      >
        <Activity className={`w-6 h-6 ${hasAnyServerTask || hasAnyClientJob ? 'animate-pulse' : ''}`} />
        
        {/* Pulsing notification count badge */}
        {totalCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-[10px] font-bold text-white shadow-md border border-slate-950">
            {totalCount}
          </span>
        )}
      </button>

      {/* Floating Modal Panel */}
      {isOpen && (
        <>
          {/* Backdrop for click outside */}
          <div className="fixed inset-0 z-[9980] bg-black/50 backdrop-blur-xs" onClick={() => setIsOpen(false)} />

          <div className="fixed right-6 bottom-24 w-[460px] bg-[#121c29] border border-slate-800/80 rounded-2xl shadow-2xl shadow-black/90 backdrop-blur-xl z-[9985] flex flex-col max-h-[75vh] overflow-hidden text-slate-200 animate-in fade-in slide-in-from-bottom-4 duration-200">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-slate-800/60 flex items-center justify-between bg-slate-900/40">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-violet-400" />
                <h3 className="font-semibold text-xs uppercase tracking-wider text-slate-300">Hệ thống hàng đợi toàn cục</h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-500 hover:text-slate-300 transition cursor-pointer p-0.5 rounded hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Contents */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              
              {/* SECTION 1: Client Background Jobs */}
              {hasAnyClientJob && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Tiến trình vẽ/tạo hàng loạt (Nền)</h4>
                  <div className="space-y-2">
                    {activeJobs.map(job => {
                      const projName = projectNames.get(job.projectId) || (job.projectId === currentProject.id ? currentProject.name : 'Dự án khác');
                      const total = job.tasks?.length || 0;
                      const completed = job.completed?.length || 0;
                      const failed = job.failed?.length || 0;
                      const progress = total > 0 ? Math.round(((completed + failed) / total) * 100) : 0;
                      
                      const typeLabel = job.type === 'shot' ? 'Vẽ ảnh phân cảnh'
                                      : job.type === 'video' ? 'Tạo video phân cảnh'
                                      : 'Tạo ảnh tham chiếu (Assets)';
                      
                      const barColor = job.type === 'shot' ? 'bg-emerald-500'
                                     : job.type === 'video' ? 'bg-fuchsia-500'
                                     : 'bg-cyan-500';

                      return (
                        <div key={job.key} className="p-3 bg-slate-900/50 border border-slate-800/40 rounded-lg space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium text-xs text-slate-300 truncate max-w-[240px]" title={projName}>
                              📁 {projName}
                            </div>
                            <button
                              onClick={() => cancelBatchJob(job.projectId, job.type)}
                              className="text-[10px] text-red-400 hover:text-red-300 font-semibold px-2 py-0.5 rounded border border-red-950/80 hover:bg-red-950/20 transition cursor-pointer shrink-0"
                            >
                              Dừng vẽ
                            </button>
                          </div>
                          
                          <div className="flex justify-between items-center text-[10px] text-slate-400">
                            <span>{typeLabel}</span>
                            <span>{completed}/{total} hoàn thành {failed > 0 && `(${failed} lỗi)`}</span>
                          </div>

                          <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-900/40">
                            <div
                              className={`h-full ${barColor} transition-all duration-350`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SECTION 2: Active Server Queues */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Hàng chờ tác vụ đang xử lý</h4>
                {renderServerQueueItems()}
              </div>

              {/* SECTION 3: Combined Console Logs */}
              <div className="space-y-2 border-t border-slate-800/60 pt-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Nhật ký hệ thống</h4>
                  {/* Tabs */}
                  <div className="flex items-center bg-slate-950 border border-slate-900 rounded p-0.5 gap-0.5">
                    <button
                      onClick={() => setActiveLogTab('text')}
                      className={`px-2 py-0.5 text-[9px] font-medium rounded transition cursor-pointer ${
                        activeLogTab === 'text'
                          ? 'bg-violet-950/80 text-violet-400 border border-violet-900/40'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      AI Text
                    </button>
                    <button
                      onClick={() => setActiveLogTab('image')}
                      className={`px-2 py-0.5 text-[9px] font-medium rounded transition cursor-pointer ${
                        activeLogTab === 'image'
                          ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-900/40'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      Vẽ ảnh
                    </button>
                    <button
                      onClick={() => setActiveLogTab('video')}
                      className={`px-2 py-0.5 text-[9px] font-medium rounded transition cursor-pointer ${
                        activeLogTab === 'video'
                          ? 'bg-fuchsia-950/80 text-fuchsia-400 border border-fuchsia-900/40'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      Video
                    </button>
                  </div>
                </div>

                {renderLogs()}
              </div>

            </div>
          </div>
        </>
      )}
    </>
  );
}
