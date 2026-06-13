import React, { useState, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, GridReadyEvent, CellValueChangedEvent } from 'ag-grid-community';
import { useProjectStore } from '../store/useProjectStore';
import { Plus, Trash2, Merge, Split, Sparkles, AlertCircle, Sliders } from 'lucide-react';

export default function SceneMappingGrid({ onNextTab }: { onNextTab: () => void }) {
  const {
    currentProject,
    updateSceneMappingCell,
    addSceneRow,
    deleteSceneRow,
    mergeScenes,
    splitScene,
    generateImagePrompts,
    isGeneratingImagePrompts,
    cancelImagePrompts,
    batchStatus,
    textLogs = [],
    textQueue = [],
    textActive = [],
    fetchTextQueueAndLogs
  } = useProjectStore();

  const [isLogsExpanded, setIsLogsExpanded] = useState(false);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Poll server queue & logs for Text API
  React.useEffect(() => {
    fetchTextQueueAndLogs();
    const interval = setInterval(() => {
      fetchTextQueueAndLogs();
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchTextQueueAndLogs]);

  // Scroll console to bottom on new logs
  React.useEffect(() => {
    if (isLogsExpanded && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [textLogs, isLogsExpanded]);

  const [gridApi, setGridApi] = useState<any>(null);
  const [selectedCount, setSelectedCount] = useState(0);

  const onGridReady = (params: GridReadyEvent) => {
    setGridApi(params.api);
  };

  const onSelectionChanged = () => {
    if (gridApi) {
      setSelectedCount(gridApi.getSelectedNodes().length);
    }
  };

  const onCellValueChanged = (event: CellValueChangedEvent) => {
    const rowIndex = event.rowIndex;
    const colId = event.column.getColId();
    if (rowIndex !== null) {
      updateSceneMappingCell(rowIndex, colId, event.newValue);
    }
  };

  const handleAddRow = () => {
    let index = currentProject.sceneMapping.length;
    if (gridApi) {
      const selected = gridApi.getSelectedNodes();
      if (selected.length > 0) {
        // Insert below the first selected row
        index = selected[0].rowIndex + 1;
      }
    }
    addSceneRow(index);
  };

  const handleDeleteRows = () => {
    if (!gridApi) return;
    const selected = gridApi.getSelectedNodes();
    if (selected.length === 0) {
      alert('Please select at least one row to delete.');
      return;
    }

    if (confirm(`Are you sure you want to delete the ${selected.length} selected row(s)?`)) {
      // Sort in descending order of STT so indices don't shift during delete
      const stts = selected.map((node: any) => node.data.stt).sort((a: number, b: number) => b - a);
      stts.forEach((stt: number) => deleteSceneRow(stt));
      gridApi.deselectAll();
    }
  };

  const handleMergeRows = () => {
    if (!gridApi) return;
    const selected = gridApi.getSelectedNodes();
    if (selected.length < 2) {
      alert('Please select 2 or more rows to merge.');
      return;
    }

    const stts = selected.map((node: any) => node.data.stt);
    mergeScenes(stts);
    gridApi.deselectAll();
  };

  const handleSplitRow = () => {
    if (!gridApi) return;
    const selected = gridApi.getSelectedNodes();
    if (selected.length !== 1) {
      alert('Please select exactly 1 row to split.');
      return;
    }

    const stt = selected[0].data.stt;
    splitScene(stt);
    gridApi.deselectAll();
  };

  const handleGenerateImagePrompts = async () => {
    try {
      await generateImagePrompts();
      onNextTab(); // Navigate to the prompts tab on success
    } catch (err) {
      alert('Generation failed: ' + (err as Error).message);
    }
  };

  // AG Grid columns configuration
  const columnDefs: ColDef[] = [
    {
      headerName: 'STT',
      field: 'stt',
      width: 80,
      pinned: 'left',
      cellStyle: { justifyContent: 'center', fontWeight: 'bold' }
    },
    {
      headerName: 'Subtitle Range',
      field: 'subtitleRange',
      width: 140,
      editable: true,
      cellStyle: { fontFamily: 'monospace' }
    },
    {
      headerName: 'Time Range',
      field: 'timeRange',
      width: 220,
      editable: true,
      cellStyle: { fontFamily: 'monospace' }
    },
    {
      headerName: 'Characters',
      field: 'characters',
      width: 180,
      editable: true
    },
    {
      headerName: 'Props',
      field: 'props',
      width: 160,
      editable: true
    },
    {
      headerName: 'Situation',
      field: 'mainSituation',
      width: 240,
      editable: true
    },
    {
      headerName: 'Emotion',
      field: 'mainEmotion',
      width: 140,
      editable: true
    },
    {
      headerName: 'Scene Description',
      field: 'sceneDescription',
      flex: 1,
      minWidth: 300,
      editable: true,
      cellEditor: 'agLargeTextCellEditor',
      cellEditorPopup: true,
      cellEditorParams: {
        maxLength: 2000,
        rows: 6,
        cols: 50
      }
    }
  ];

  const defaultColDef = {
    sortable: true,
    filter: true,
    resizable: true
  };

  return (
    <div className="space-y-4 flex flex-col h-full">
      {/* Grid Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/40 p-3 rounded-lg border border-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleAddRow}
            className="flex items-center gap-1 bg-slate-950 hover:bg-slate-900 border border-gray-800 hover:border-gray-700 text-slate-300 hover:text-slate-200 text-xs px-3 py-2 rounded transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Row
          </button>
          <button
            onClick={handleDeleteRows}
            disabled={selectedCount === 0}
            className="flex items-center gap-1 bg-slate-950 hover:bg-red-950/20 border border-gray-800 hover:border-red-900/50 text-slate-300 hover:text-red-400 text-xs px-3 py-2 rounded disabled:opacity-50 disabled:hover:bg-slate-950 disabled:hover:text-slate-300 disabled:hover:border-gray-800 transition cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete ({selectedCount})
          </button>
          <div className="h-4 w-px bg-gray-800" />
          <button
            onClick={handleMergeRows}
            disabled={selectedCount < 2}
            className="flex items-center gap-1 bg-slate-950 hover:bg-slate-900 border border-gray-800 hover:border-gray-700 text-slate-300 hover:text-slate-200 text-xs px-3 py-2 rounded disabled:opacity-50 disabled:hover:bg-slate-950 disabled:hover:text-slate-300 transition cursor-pointer"
            title="Merge selected scene blocks"
          >
            <Merge className="w-3.5 h-3.5" />
            Merge
          </button>
          <button
            onClick={handleSplitRow}
            disabled={selectedCount !== 1}
            className="flex items-center gap-1 bg-slate-950 hover:bg-slate-900 border border-gray-800 hover:border-gray-700 text-slate-300 hover:text-slate-200 text-xs px-3 py-2 rounded disabled:opacity-50 disabled:hover:bg-slate-950 disabled:hover:text-slate-300 transition cursor-pointer"
            title="Split selected scene into duplicate row to split contents"
          >
            <Split className="w-3.5 h-3.5" />
            Split
          </button>
        </div>

        {isGeneratingImagePrompts ? (
          <button
            onClick={cancelImagePrompts}
            className="flex items-center gap-2 bg-rose-650 hover:bg-rose-555 text-white font-semibold text-xs px-4 py-2.5 rounded shadow-lg shadow-rose-500/10 active:scale-98 transition cursor-pointer font-bold animate-pulse-soft"
          >
            Dừng lại
          </button>
        ) : (
          <button
            onClick={handleGenerateImagePrompts}
            disabled={currentProject.sceneMapping.length === 0}
            className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:from-gray-850 disabled:to-gray-900 disabled:opacity-50 text-white font-semibold text-xs px-4 py-2.5 rounded shadow-lg shadow-violet-500/10 hover:shadow-violet-500/20 active:scale-98 transition cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            Generate Image Prompts
          </button>
        )}
      </div>

      {/* Loading Batch Status */}
      {isGeneratingImagePrompts && (
        <div className="bg-violet-950/20 border border-violet-850 p-3.5 rounded-lg flex items-center gap-3 animate-pulse-soft text-slate-300 text-xs">
          <AlertCircle className="w-4 h-4 text-violet-400" />
          <span className="font-semibold text-violet-300 uppercase tracking-wider text-[10px]">Batch Mode:</span>
          <span>{batchStatus || 'Sending scene mapping to AI provider...'}</span>
        </div>
      )}

      {/* Grid Container */}
      <div className="ag-theme-quartz-dark w-full h-[550px]">
        <AgGridReact
          theme="legacy"
          rowData={currentProject.sceneMapping}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          rowSelection={{
            mode: 'multiRow',
            checkboxes: true,
            headerCheckbox: true
          }}
          suppressRowClickSelection={true}
          onGridReady={onGridReady}
          onSelectionChanged={onSelectionChanged}
          onCellValueChanged={onCellValueChanged}
          animateRows={true}
        />
      </div>

      <div className="text-[10px] text-gray-500 italic flex items-center justify-between">
        <span>* Double click any cell to edit details. All changes are auto-saved.</span>
        <span>Total Scenes: {currentProject.sceneMapping.length}</span>
      </div>

      {/* Collapsible API Logs & Queue Monitor */}
      <div className="bg-[#090d16] border border-gray-900 rounded-xl overflow-hidden mt-2 shadow-xl select-none shrink-0">
        {/* Header Bar */}
        <div
          onClick={() => setIsLogsExpanded(!isLogsExpanded)}
          className="bg-slate-900/60 px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-900 border-b border-slate-950 transition"
        >
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-violet-400" />
            <h3 className="font-bold text-slate-200 text-xs tracking-wide uppercase">
              Hàng chờ & Logs API Văn bản
            </h3>
            <span className="h-4 w-px bg-gray-800 mx-1"></span>
            <div className="flex items-center gap-3 text-[10px] text-gray-500 font-mono">
              <span className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${textActive.length > 0 ? 'bg-violet-500 animate-pulse' : 'bg-gray-700'}`}></span>
                Đang chạy: <strong className="text-slate-300">{textActive.length}</strong>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                Chờ: <strong className="text-slate-300">{textQueue.length}</strong>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500"></span>
                Tổng Logs: <strong className="text-slate-300">{textLogs.length}</strong>
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
          <div className="grid grid-cols-1 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-950 bg-slate-950/20 h-[180px] animate-fadeIn">
            {/* Left Column: Server Queue */}
            <div className="lg:col-span-1 p-3 flex flex-col h-full overflow-hidden">
              <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2 border-b border-slate-900 pb-1">
                Hàng chờ văn bản
              </div>
              <div className="flex-1 overflow-y-auto space-y-1.5 font-mono text-[10px]">
                {textActive.length === 0 && textQueue.length === 0 ? (
                  <div className="text-gray-550 italic text-center py-6">Không có yêu cầu nào</div>
                ) : (
                  <>
                    {/* Active Items */}
                    {textActive.map((item) => (
                      <div key={item.id} className="flex items-center justify-between bg-violet-950/20 border border-violet-900/40 p-2 rounded text-violet-400">
                        <div className="truncate flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-ping"></span>
                          <span className="font-semibold">{item.type === 'mapping' ? 'Scene Map' : 'Prompts'}</span>
                          {item.label && (
                            <span className="text-[8px] bg-violet-950 text-violet-400 px-1 py-0.2 rounded font-sans uppercase">
                              {item.label}
                            </span>
                          )}
                        </div>
                        <span className="text-[8px] text-gray-500">{item.startTime}</span>
                      </div>
                    ))}
                    {/* Queued Items */}
                    {textQueue.map((item) => (
                      <div key={item.id} className="flex items-center justify-between bg-slate-900/40 border border-slate-900 p-2 rounded text-slate-400">
                        <div className="truncate flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                          <span>{item.type === 'mapping' ? 'Scene Map' : 'Prompts'}</span>
                          {item.label && (
                            <span className="text-[8px] bg-slate-950 text-gray-400 px-1 py-0.2 rounded font-sans uppercase">
                              {item.label}
                            </span>
                          )}
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
                  API Text Logs Console
                </div>
                <div className="text-[8px] text-gray-550 font-mono">
                  Auto-refreshing (2s)
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto bg-black/50 p-2.5 rounded border border-slate-950 font-mono text-[10px] space-y-1 scrollbar-thin">
                {textLogs.length === 0 ? (
                  <div className="text-gray-550 italic text-center py-8 select-none">Chưa có log API</div>
                ) : (
                  textLogs.map((log) => {
                    let bgBadge = 'bg-violet-950 text-violet-400';
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
    </div>
  );
}
