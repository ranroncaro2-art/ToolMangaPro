import React, { useState, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, GridReadyEvent, CellValueChangedEvent } from 'ag-grid-community';
import { useProjectStore, getCardTitle, findBestCharacterMatch, findBestExteriorMatch, parseCharactersField, findBestPropMatch } from '../store/useProjectStore';
import * as XLSX from 'xlsx';
import { Download, Database, Image as ImageIcon, Sparkles, User, Package, Sliders } from 'lucide-react';

export default function ImagePromptGrid() {
  const {
    currentProject,
    updateImagePromptCell,
    generateImagePrompts,
    isGeneratingImagePrompts,
    batchStatus,
    textLogs = [],
    textQueue = [],
    textActive = [],
    fetchTextQueueAndLogs
  } = useProjectStore();

  const [isLogsExpanded, setIsLogsExpanded] = useState(false);
  const consoleEndRef = React.useRef<HTMLDivElement>(null);

  // Poll server queue & logs for Text API
  useEffect(() => {
    fetchTextQueueAndLogs();
    const interval = setInterval(() => {
      fetchTextQueueAndLogs();
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchTextQueueAndLogs]);

  // Scroll console to bottom on new logs
  useEffect(() => {
    if (isLogsExpanded && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [textLogs, isLogsExpanded]);

  const characters = currentProject.characters || [];
  const exteriors = currentProject.exteriors || [];
  const props = currentProject.props || [];

  const [gridApi, setGridApi] = useState<any>(null);
  const [selectedRow, setSelectedRow] = useState<any>(null);

  const onGridReady = (params: GridReadyEvent) => {
    setGridApi(params.api);
  };

  const onSelectionChanged = () => {
    if (gridApi) {
      const selected = gridApi.getSelectedRows();
      if (selected.length > 0) {
        setSelectedRow(selected[0]);
      } else {
        setSelectedRow(null);
      }
    }
  };

  const onCellValueChanged = (event: CellValueChangedEvent) => {
    const rowIndex = event.rowIndex;
    const colId = event.column.getColId();
    if (rowIndex !== null) {
      updateImagePromptCell(rowIndex, colId, event.newValue);
    }
  };

  // Reference matching logic
  const getMatchingReferences = () => {
    if (!selectedRow) return { chars: [], exts: [], propsList: [] };

    // Parse characters from the cell
    const charNames = parseCharactersField(selectedRow.characters);

    const matchedChars = charNames
      .map((name: string) => findBestCharacterMatch(characters, name))
      .filter((c: any): c is any => !!c);

    // Match exterior background
    const extName = (selectedRow.exterior || '').trim();
    const matchedExts = extName
      ? [findBestExteriorMatch(exteriors, extName)].filter((e: any): e is any => !!e)
      : [];

    // Match props
    const propNames = parseCharactersField(selectedRow.props);
    const matchedProps = propNames
      .map((name: string) => findBestPropMatch(props, name))
      .filter((p: any): p is any => !!p);

    return {
      chars: matchedChars,
      exts: matchedExts,
      propsList: matchedProps
    };
  };

  const { chars: matchedCharacters, exts: matchedExteriors, propsList: matchedProps } = getMatchingReferences();

  // EXPORT UTILITIES
  const handleExportJSON = () => {
    if (currentProject.imagePrompts.length === 0) {
      alert('No prompt data to export.');
      return;
    }
    const dataStr = JSON.stringify(currentProject.imagePrompts, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentProject.name || 'storyboard'}_prompts.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    if (currentProject.imagePrompts.length === 0) {
      alert('No prompt data to export.');
      return;
    }

    const escapeCSV = (val: any) => {
      if (val === null || val === undefined) return '';
      let str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        str = '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const headers = ['STT', 'Characters', 'Props', 'Description', 'Exterior', 'Motion'];
    const csvRows = [headers.join(',')];

    for (const row of currentProject.imagePrompts) {
      const line = [
        row.stt,
        row.characters,
        row.props || '',
        row.description,
        row.exterior,
        row.motion
      ].map(escapeCSV);
      csvRows.push(line.join(','));
    }

    const csvContent = '\uFEFF' + csvRows.join('\r\n'); // Add UTF-8 BOM for Excel compatibility
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentProject.name || 'storyboard'}_prompts.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportXLSX = () => {
    if (currentProject.imagePrompts.length === 0) {
      alert('No prompt data to export.');
      return;
    }

    const formattedData = currentProject.imagePrompts.map((row) => ({
      STT: row.stt,
      Characters: row.characters,
      Props: row.props || '',
      Description: row.description,
      Exterior: row.exterior,
      Motion: row.motion
    }));

    const ws = XLSX.utils.json_to_sheet(formattedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Manga Prompts');

    // Auto-fit columns helper
    const maxLens = formattedData.reduce((acc: any, row: any) => {
      Object.keys(row).forEach((key) => {
        const len = String(row[key] || '').length;
        acc[key] = Math.max(acc[key] || 5, len);
      });
      return acc;
    }, {});
    ws['!cols'] = Object.keys(maxLens).map((k) => ({ wch: Math.min(50, maxLens[k] + 2) }));

    XLSX.writeFile(wb, `${currentProject.name || 'storyboard'}_prompts.xlsx`);
  };

  // AG Grid columns configuration
  const columnDefs: ColDef[] = [
    {
      headerName: 'STT',
      field: 'stt',
      width: 70,
      pinned: 'left',
      cellStyle: { justifyContent: 'center', fontWeight: 'bold' }
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
      headerName: 'Description (Image Prompt)',
      field: 'description',
      flex: 2,
      minWidth: 350,
      editable: true,
      cellEditor: 'agLargeTextCellEditor',
      cellEditorPopup: true,
      cellEditorParams: {
        maxLength: 2000,
        rows: 6,
        cols: 60
      }
    },
    {
      headerName: 'Exterior Background ID',
      field: 'exterior',
      width: 200,
      editable: true
    },
    {
      headerName: 'Motion / Camera',
      field: 'motion',
      flex: 1,
      minWidth: 220,
      editable: true
    }
  ];

  const defaultColDef = {
    sortable: true,
    filter: true,
    resizable: true
  };

  return (
    <div className="space-y-4 flex flex-col h-full">
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
      {/* Grid Table Container */}
      <div className="xl:col-span-3 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/40 p-3 rounded-lg border border-slate-900">
          <div className="flex items-center gap-2">
            <button
              onClick={generateImagePrompts}
              disabled={isGeneratingImagePrompts || currentProject.sceneMapping.length === 0}
              className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-900 border border-gray-800 hover:border-gray-700 text-xs px-3.5 py-2 rounded text-slate-300 hover:text-slate-200 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              Regenerate Prompts
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">Export:</span>
            <button
              onClick={handleExportXLSX}
              className="flex items-center gap-1 bg-emerald-700 hover:bg-emerald-600 text-white text-xs px-3 py-2 rounded transition font-medium cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              XLSX
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1 bg-slate-950 hover:bg-slate-900 border border-gray-800 hover:border-gray-700 text-slate-300 hover:text-slate-200 text-xs px-3 py-2 rounded transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
            <button
              onClick={handleExportJSON}
              className="flex items-center gap-1 bg-slate-950 hover:bg-slate-900 border border-gray-800 hover:border-gray-700 text-slate-300 hover:text-slate-200 text-xs px-3 py-2 rounded transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              JSON
            </button>
          </div>
        </div>

        {/* AG Grid component */}
        <div className="ag-theme-quartz-dark w-full h-[550px]">
          <AgGridReact
            theme="legacy"
            rowData={currentProject.imagePrompts}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            rowSelection={{
              mode: 'singleRow',
              checkboxes: false
            }}
            onGridReady={onGridReady}
            onSelectionChanged={onSelectionChanged}
            onCellValueChanged={onCellValueChanged}
            animateRows={true}
          />
        </div>

        <div className="text-[10px] text-gray-500 italic flex items-center justify-between">
          <span>* Click a row to load the character and background references on the side panel.</span>
          <span>Total Prompts: {currentProject.imagePrompts.length}</span>
        </div>
      </div>

      {/* Side Visual References Panel */}
      <div className="xl:col-span-1 bg-slate-900/40 border border-slate-900 rounded-xl p-5 space-y-5 h-[620px] overflow-y-auto">
        <div className="border-b border-slate-950 pb-3">
          <h3 className="font-bold text-slate-200 text-sm flex items-center gap-1.5">
            <ImageIcon className="w-4 h-4 text-violet-400" />
            Reference Viewer
          </h3>
          <p className="text-[10px] text-gray-500 mt-1">
            Visual templates for selected row's assets
          </p>
        </div>

        {!selectedRow ? (
          <div className="text-center py-20 text-gray-600 text-xs border border-dashed border-gray-950 rounded-lg">
            Select a row in the table to display matching references.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-xs bg-slate-950 p-2 rounded border border-gray-950 space-y-1">
              <div className="text-gray-500 font-semibold uppercase tracking-wider text-[9px]">Active Row</div>
              <div className="font-semibold text-slate-300 text-xs">Scene #{selectedRow.stt}</div>
            </div>

            {/* Character References */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1">
                <Database className="w-3 h-3 text-violet-400" />
                Character reference ({matchedCharacters.length})
              </h4>
              {matchedCharacters.length === 0 ? (
                <div className="text-[10px] text-gray-600 italic bg-slate-950/40 p-3 rounded-lg border border-slate-950">
                  No matching images for characters: <span className="font-semibold">{selectedRow.characters || 'none'}</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {matchedCharacters.map((char: any) => (
                    <div key={char.characterId} className="bg-slate-950 p-1.5 rounded border border-slate-900">
                      {char.image ? (
                        <img
                          src={char.image}
                          alt={char.characterId}
                          className="w-full h-24 object-cover rounded"
                        />
                      ) : (
                        <div className="w-full h-24 bg-slate-900 flex flex-col items-center justify-center text-[9px] text-gray-500 rounded">
                          <User className="w-6 h-6 mb-1 text-gray-600" />
                          <span>No Image</span>
                        </div>
                      )}
                      <div className="text-[9px] font-semibold text-slate-400 mt-1 truncate text-center">
                        {getCardTitle(char.characterId)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Exterior References */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1">
                <ImageIcon className="w-3 h-3 text-fuchsia-400" />
                Background reference ({matchedExteriors.length})
              </h4>
              {matchedExteriors.length === 0 ? (
                <div className="text-[10px] text-gray-600 italic bg-slate-950/40 p-3 rounded-lg border border-slate-950">
                  No matching image for background: <span className="font-semibold">{selectedRow.exterior || 'none'}</span>
                </div>
              ) : (
                matchedExteriors.map((ext: any) => (
                  <div key={ext.exteriorId} className="bg-slate-950 p-2 rounded border border-slate-900">
                    {ext.image ? (
                      <img
                        src={ext.image}
                        alt={ext.exteriorId}
                        className="w-full h-32 object-cover rounded"
                      />
                    ) : (
                      <div className="w-full h-32 bg-slate-900 flex flex-col items-center justify-center text-[9px] text-gray-500 rounded">
                        <ImageIcon className="w-7 h-7 mb-1 text-gray-600" />
                        <span>No Image</span>
                      </div>
                    )}
                    <div className="text-[9px] font-semibold text-slate-400 mt-1.5 truncate text-center">
                      {getCardTitle(ext.exteriorId)}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Prop References */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1">
                <Package className="w-3 h-3 text-emerald-400" />
                Prop reference ({matchedProps.length})
              </h4>
              {matchedProps.length === 0 ? (
                <div className="text-[10px] text-gray-600 italic bg-slate-950/40 p-3 rounded-lg border border-slate-950">
                  No matching images for props: <span className="font-semibold">{selectedRow.props || 'none'}</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {matchedProps.map((p: any) => (
                    <div key={p.propId} className="bg-slate-950 p-1.5 rounded border border-slate-900">
                      {p.image ? (
                        <img
                          src={p.image}
                          alt={p.propId}
                          className="w-full h-24 object-cover rounded"
                        />
                      ) : (
                        <div className="w-full h-24 bg-slate-900 flex flex-col items-center justify-center text-[9px] text-gray-550 rounded">
                          <Package className="w-6 h-6 mb-1 text-gray-600" />
                          <span>No Image</span>
                        </div>
                      )}
                      <div className="text-[9px] font-semibold text-slate-400 mt-1 truncate text-center">
                        {getCardTitle(p.propId)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
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
