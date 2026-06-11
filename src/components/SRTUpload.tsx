import React, { useRef, useState, useEffect } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import FolderPickerModal from './FolderPickerModal';
import { Upload, FileText, Clock, Sparkles, CheckCircle2, AlertTriangle, Play, Palette, Settings, Plus, Trash2, Save, Download, FolderOpen } from 'lucide-react';
import { parseSRT, matchScriptWithSrt } from '../lib/srtParser';

export default function SRTUpload({ onNextTab }: { onNextTab: () => void }) {
  const {
    currentProject,
    setSrtContent,
    apiConfig,
    generateSceneMapping,
    isGeneratingSceneMapping,
    generateAllMappingAndPrompts,
    isGeneratingImagePrompts,
    generateFullCombo,
    isGeneratingAssets,
    targetDuration,
    setTargetDuration,
    styles = [],
    setSelectedStyleId,
    addStyle,
    updateStyle,
    deleteStyle,
    setCurrentProjectField
  } = useProjectStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scriptFileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
  const [scriptText, setScriptText] = useState('');

  useEffect(() => {
    if (currentProject.scriptContent !== undefined) {
      setScriptText(currentProject.scriptContent || '');
    }
  }, [currentProject.scriptContent]);

  const handleScriptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
        const content = evt.target?.result as string;
        setScriptText(content);
        setCurrentProjectField('scriptContent', content);
      };
      reader.readAsText(file);
    }
  };

  const handleMergeScriptSrt = () => {
    if (!currentProject.srtContent) {
      alert('Vui lòng tải tệp phụ đề SRT trước!');
      return;
    }
    if (!scriptText.trim()) {
      alert('Vui lòng nhập kịch bản phim!');
      return;
    }

    if (currentProject.sceneMapping && currentProject.sceneMapping.length > 0) {
      const confirmReset = confirm(
        'Cảnh báo: Tạo SRT mới từ kịch bản sẽ đặt lại dữ liệu phân cảnh (Scene Mapping) và các prompt hiện tại. Bạn có muốn tiếp tục?'
      );
      if (!confirmReset) return;
    }

    try {
      const mergedSrt = matchScriptWithSrt(scriptText, currentProject.srtContent);
      setSrtContent(mergedSrt, currentProject.name);
      setCurrentProjectField('scriptContent', scriptText);

      // Download merged SRT
      const element = document.createElement("a");
      const file = new Blob([mergedSrt], { type: 'text/plain;charset=utf-8' });
      element.href = URL.createObjectURL(file);
      element.download = `${currentProject.name}_full.srt`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);

      alert('Đã tạo và đồng bộ SRT full thành công! Tệp phụ đề đã được tải về máy của bạn.');
    } catch (err: any) {
      alert('Lỗi khi ghép kịch bản: ' + err.message);
    }
  };

  // Drawing style management states
  const [showStyleManager, setShowStyleManager] = useState(false);
  const [editingStyle, setEditingStyle] = useState<any>(null);
  const [isNewStyle, setIsNewStyle] = useState(false);
  const [styleForm, setStyleForm] = useState({
    name: '',
    characterSuffix: '',
    backgroundSuffix: '',
    sceneSuffix: ''
  });

  const currentStyle = styles.find(s => s.id === (currentProject.selectedStyleId || 'manga_color')) || styles[0] || {
    characterSuffix: '',
    backgroundSuffix: '',
    sceneSuffix: ''
  };

  const hasApiKey = !!apiConfig?.apiKey;

  useEffect(() => {
    if (currentStyle && !editingStyle) {
      setEditingStyle(currentStyle);
      setStyleForm({
        name: currentStyle.name,
        characterSuffix: currentStyle.characterSuffix,
        backgroundSuffix: currentStyle.backgroundSuffix,
        sceneSuffix: currentStyle.sceneSuffix
      });
    }
  }, [currentStyle]);

  const handleSelectStyleToEdit = (style: any) => {
    setIsNewStyle(false);
    setEditingStyle(style);
    setStyleForm({
      name: style.name,
      characterSuffix: style.characterSuffix,
      backgroundSuffix: style.backgroundSuffix,
      sceneSuffix: style.sceneSuffix
    });
  };

  const handleNewStyleInit = () => {
    setIsNewStyle(true);
    setEditingStyle(null);
    setStyleForm({
      name: '',
      characterSuffix: '',
      backgroundSuffix: '',
      sceneSuffix: ''
    });
  };

  const handleSaveStyle = () => {
    if (!styleForm.name.trim()) {
      alert('Vui lòng nhập tên style!');
      return;
    }
    if (isNewStyle) {
      addStyle(styleForm);
      setIsNewStyle(false);
      alert('Đã thêm style vẽ ảnh mới thành công!');
    } else if (editingStyle?.isCustom) {
      updateStyle(editingStyle.id, styleForm);
      alert('Đã cập nhật style vẽ ảnh thành công!');
    }
  };

  const handleDeleteStyle = () => {
    if (!editingStyle || !editingStyle.isCustom) return;
    if (confirm(`Bạn có chắc chắn muốn xóa style "${editingStyle.name}" không?`)) {
      deleteStyle(editingStyle.id);
      setEditingStyle(null);
      setIsNewStyle(true);
      setStyleForm({
        name: '',
        characterSuffix: '',
        backgroundSuffix: '',
        sceneSuffix: ''
      });
      alert('Đã xóa style thành công!');
    }
  };

  const handleSelectDirectory = () => {
    setIsFolderPickerOpen(true);
  };

  const handleFolderSelectConfirm = async (selectedPath: string) => {
    try {
      const response = await fetch('/api/video/select-directory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: selectedPath })
      });
      if (!response.ok) {
        throw new Error('Failed to configure directory on server');
      }
      const data = await response.json();
      if (data.success && data.path) {
        setCurrentProjectField('videoSaveDir', data.path);
      }
    } catch (err: any) {
      console.error('Error selecting directory:', err);
      alert('Không thể cấu hình thư mục: ' + err.message);
    }
  };

  const processFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.srt')) {
      setErrorMsg('Only .srt subtitle files are supported.');
      return;
    }
    setErrorMsg('');

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setSrtContent(content, file.name.replace(/\.srt$/i, ''));
    };
    reader.onerror = () => {
      setErrorMsg('Failed to read file.');
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleGenerate = async (resume: boolean = false) => {
    if (!currentProject.srtContent) return;
    setErrorMsg('');
    try {
      await generateSceneMapping(resume);
      onNextTab(); // Go to Scene Mapping Grid tab
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleGenerateAll = async (resume: boolean = false) => {
    if (!currentProject.srtContent) return;
    setErrorMsg('');
    try {
      await generateAllMappingAndPrompts(resume);
      onNextTab(); // Go to Scene Mapping Grid tab
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleGenerateFullCombo = async (resume: boolean = false) => {
    if (!currentProject.srtContent) return;
    setErrorMsg('');
    try {
      await generateFullCombo(resume);
      onNextTab(); // Go to Scene Mapping Grid tab
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  // Generate subtitle blocks array locally for preview
  const previewBlocks = currentProject.srtContent
    ? parseSRT(currentProject.srtContent).blocks.slice(0, 30) // Preview first 30 lines
    : [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-gray-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-200 font-sans">Cấu hình dự án</h2>
          <p className="text-xs text-gray-500 mt-1">
            Thiết lập cấu hình dự án, tải phụ đề SRT và thực hiện các tác vụ tạo phân cảnh, vẽ ảnh.
          </p>
        </div>
      </div>

      {/* 3 Main Action Card Buttons at the Very Top */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Generate Mapping */}
        <div
          className="relative group overflow-hidden bg-slate-900/35 border border-slate-900 p-5 rounded-xl shadow-lg transition-all duration-300 text-left select-none flex flex-col justify-between min-h-[140px]"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] font-bold text-violet-400 font-mono tracking-wider bg-violet-950/50 px-2 py-0.5 rounded border border-violet-900/40">BƯỚC 1</span>
            <Sparkles className="w-5 h-5 text-violet-400 group-hover:scale-110 transition duration-300" />
          </div>
          <div className="mt-3 mb-4">
            <h4 className="font-bold text-slate-200 text-sm tracking-wide">Chỉ chạy mapping</h4>
            <p className="text-[10px] text-gray-400 mt-1 leading-normal font-medium">
              Phân tích kịch bản phụ đề SRT và lập sơ đồ phân cảnh Scene Mapping
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleGenerate(false)}
              disabled={isGeneratingSceneMapping || isGeneratingImagePrompts || isGeneratingAssets || !hasApiKey || !currentProject.srtContent}
              className="flex-1 bg-violet-650 hover:bg-violet-555 disabled:bg-slate-950/20 disabled:text-gray-600 disabled:border-transparent text-white text-[10px] font-bold py-1.5 px-3 rounded-lg border border-violet-600/40 cursor-pointer disabled:cursor-not-allowed transition duration-200 text-center"
            >
              {currentProject.sceneMapping && currentProject.sceneMapping.length > 0 ? 'Tạo mới' : 'Chạy'}
            </button>
            {currentProject.sceneMapping && currentProject.sceneMapping.length > 0 && (
              <button
                onClick={() => handleGenerate(true)}
                disabled={isGeneratingSceneMapping || isGeneratingImagePrompts || isGeneratingAssets || !hasApiKey || !currentProject.srtContent}
                className="flex-1 bg-slate-950 hover:bg-slate-900 border border-slate-850 hover:border-slate-700 text-violet-400 hover:text-violet-300 text-[10px] font-bold py-1.5 px-3 rounded-lg cursor-pointer disabled:cursor-not-allowed transition duration-200 text-center flex items-center justify-center gap-1"
                title="Tiếp tục phân tích các subtitle chưa được mapping"
              >
                <Play className="w-2.5 h-2.5 fill-current" />
                Tạo tiếp
              </button>
            )}
          </div>
          {isGeneratingSceneMapping && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-violet-600 animate-pulse"></div>
          )}
        </div>

        {/* Card 2: Mapping & Prompts */}
        <div
          className="relative group overflow-hidden bg-slate-900/35 border border-slate-900 p-5 rounded-xl shadow-lg transition-all duration-300 text-left select-none flex flex-col justify-between min-h-[140px]"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] font-bold text-fuchsia-400 font-mono tracking-wider bg-fuchsia-950/50 px-2 py-0.5 rounded border border-fuchsia-900/40">BƯỚC 2</span>
            <Sparkles className="w-5 h-5 text-fuchsia-400 group-hover:scale-110 transition duration-300" />
          </div>
          <div className="mt-3 mb-4">
            <h4 className="font-bold text-slate-200 text-sm tracking-wide">Combo chạy mapping và prompts ảnh shots</h4>
            <p className="text-[10px] text-gray-400 mt-1 leading-normal font-medium">
              Tạo lập bối cảnh phim và sinh các prompt mô tả vẽ ảnh
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleGenerateAll(false)}
              disabled={isGeneratingSceneMapping || isGeneratingImagePrompts || isGeneratingAssets || !hasApiKey || !currentProject.srtContent}
              className="flex-1 bg-fuchsia-650 hover:bg-fuchsia-555 disabled:bg-slate-950/20 disabled:text-gray-600 disabled:border-transparent text-white text-[10px] font-bold py-1.5 px-3 rounded-lg border border-fuchsia-600/40 cursor-pointer disabled:cursor-not-allowed transition duration-200 text-center"
            >
              {currentProject.sceneMapping && currentProject.sceneMapping.length > 0 ? 'Tạo mới' : 'Chạy'}
            </button>
            {currentProject.sceneMapping && currentProject.sceneMapping.length > 0 && (
              <button
                onClick={() => handleGenerateAll(true)}
                disabled={isGeneratingSceneMapping || isGeneratingImagePrompts || isGeneratingAssets || !hasApiKey || !currentProject.srtContent}
                className="flex-1 bg-slate-950 hover:bg-slate-900 border border-slate-850 hover:border-slate-700 text-fuchsia-400 hover:text-fuchsia-300 text-[10px] font-bold py-1.5 px-3 rounded-lg cursor-pointer disabled:cursor-not-allowed transition duration-200 text-center flex items-center justify-center gap-1"
                title="Tiếp tục tạo phân cảnh và prompts chưa có"
              >
                <Play className="w-2.5 h-2.5 fill-current" />
                Tạo tiếp
              </button>
            )}
          </div>
          {isGeneratingImagePrompts && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-fuchsia-650 animate-pulse"></div>
          )}
        </div>

        {/* Card 3: Run Full Combo */}
        <div
          className="relative group overflow-hidden bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:from-slate-900 disabled:to-slate-950 p-5 rounded-xl shadow-xl transition-all duration-300 text-left select-none flex flex-col justify-between min-h-[140px]"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] font-bold text-white font-mono tracking-wider bg-white/10 px-2 py-0.5 rounded border border-white/10">TỰ ĐỘNG TOÀN BỘ</span>
            <Sparkles className="w-5 h-5 text-white group-hover:scale-110 transition duration-300" />
          </div>
          <div className="mt-3 mb-4">
            <h4 className="font-bold text-white text-sm tracking-wide">Full combo mapping - prompts shots - vẽ ảnh tham chiếu tự động</h4>
            <p className="text-[10px] text-white/80 mt-1 leading-normal font-medium">
              Chạy tự động toàn bộ: Lập sơ đồ ➔ Tạo Prompt ➔ Vẽ ảnh hàng loạt
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleGenerateFullCombo(false)}
              disabled={isGeneratingSceneMapping || isGeneratingImagePrompts || isGeneratingAssets || !hasApiKey || !currentProject.srtContent}
              className="flex-1 bg-white/10 hover:bg-white/20 disabled:bg-slate-950/20 disabled:text-gray-600 disabled:border-transparent text-white text-[10px] font-bold py-1.5 px-3 rounded-lg cursor-pointer disabled:cursor-not-allowed transition duration-200 text-center"
            >
              {currentProject.sceneMapping && currentProject.sceneMapping.length > 0 ? 'Tạo mới' : 'Chạy'}
            </button>
            {currentProject.sceneMapping && currentProject.sceneMapping.length > 0 && (
              <button
                onClick={() => handleGenerateFullCombo(true)}
                disabled={isGeneratingSceneMapping || isGeneratingImagePrompts || isGeneratingAssets || !hasApiKey || !currentProject.srtContent}
                className="flex-1 bg-white/20 hover:bg-white/30 border border-white/10 text-white text-[10px] font-bold py-1.5 px-3 rounded-lg cursor-pointer disabled:cursor-not-allowed transition duration-200 text-center flex items-center justify-center gap-1"
                title="Tiếp tục chạy combo cho các phần chưa hoàn thành"
              >
                <Play className="w-2.5 h-2.5 fill-current" />
                Tạo tiếp
              </button>
            )}
          </div>
          {isGeneratingAssets && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white animate-pulse"></div>
          )}
        </div>
      </div>

      {/* Warning/Notification Banners */}
      {errorMsg && (
        <div className="bg-red-950/20 border border-red-900 text-red-400 p-3 rounded-lg text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}
      {!hasApiKey && (
        <div className="bg-amber-950/25 border border-amber-900/40 text-amber-400 text-xs p-3 rounded-lg flex gap-2 leading-relaxed">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500 animate-pulse mt-0.5" />
          <span>Vui lòng nhập <strong>API Key</strong> ở phần Cấu hình chung góc trên bên phải trước khi thực hiện các tác vụ tạo AI.</span>
        </div>
      )}

      {/* Main Grid Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Subtitle File Section */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-950 pb-3">
              <FileText className="w-5 h-5 text-violet-400" />
              <h3 className="font-bold text-slate-200 text-sm">File phụ đề (.srt)</h3>
            </div>

            {!currentProject.srtContent ? (
              /* Drag & drop upload box when not loaded */
              <div>
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[140px] ${
                    dragActive
                      ? 'border-violet-500 bg-violet-950/10'
                      : 'border-slate-850 bg-slate-950/10 hover:border-violet-500/50 hover:bg-slate-900/10'
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".srt"
                    className="hidden"
                  />
                  <Upload className="w-8 h-8 text-violet-400/80 mb-2" />
                  <p className="font-semibold text-slate-300 text-xs">Kéo & thả file phụ đề .srt vào đây</p>
                  <p className="text-[10px] text-gray-400 mt-1">hoặc nhấp để chọn file từ máy tính</p>
                </div>
              </div>
            ) : (
              /* Compact view and duration limit when loaded */
              <div className="space-y-4 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-emerald-950/10 border border-emerald-900/40 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-950/60 flex items-center justify-center text-emerald-400 shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-200 text-xs truncate max-w-[280px]">
                        {currentProject.name}.srt
                      </p>
                      <p className="text-[10px] text-emerald-500/80 mt-0.5">
                        Đã tải và phân tách kịch bản thành công
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept=".srt"
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-slate-900 hover:bg-slate-800 border border-slate-850 hover:border-slate-700 text-[10px] font-semibold text-slate-300 hover:text-slate-100 px-3 py-1.5 rounded-lg transition cursor-pointer select-none"
                    >
                      Thay đổi file
                    </button>
                  </div>
                </div>

                {/* Subtitle parameters and duration limit */}
                <div className="bg-slate-950/40 border border-slate-950 rounded-xl p-4 space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center justify-between">
                      <span>Thời lượng tối đa mỗi phân cảnh</span>
                      <span className="text-violet-400 font-mono font-bold text-xs">{targetDuration}s</span>
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="5"
                        max="60"
                        step="5"
                        value={targetDuration}
                        onChange={(e) => setTargetDuration(Number(e.target.value))}
                        className="flex-1 accent-violet-600 bg-slate-900 h-1.5 rounded-lg appearance-none cursor-pointer border border-gray-900"
                      />
                      <input
                        type="number"
                        min="5"
                        max="120"
                        value={targetDuration}
                        onChange={(e) => setTargetDuration(Number(e.target.value))}
                        className="w-14 bg-slate-900 border border-gray-900 rounded text-center text-xs font-mono text-slate-200 py-1 focus:outline-none focus:border-violet-500"
                      />
                    </div>
                    <span className="text-[9px] text-gray-400 mt-1 block leading-normal">
                      AI sẽ tự động phân tách các dòng phụ đề để các phân cảnh không vượt quá giới hạn này.
                    </span>
                  </div>

                  {/* Subtitle Stats */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-violet-400" />
                        <span className="text-gray-500 text-[10px] uppercase font-semibold">Dòng phụ đề</span>
                      </div>
                      <span className="text-sm font-bold text-slate-200 font-mono">
                        {currentProject.srtMeta.lineCount}
                      </span>
                    </div>

                    <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-fuchsia-400" />
                        <span className="text-gray-500 text-[10px] uppercase font-semibold">Thời lượng</span>
                      </div>
                      <span className="text-sm font-bold text-slate-200 font-mono">
                        {currentProject.srtMeta.duration}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Script Input & SRT Merge Section (Side by Side Comparison) */}
          {currentProject.srtContent && (
            <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-950 pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-violet-400" />
                  <h3 className="font-bold text-slate-200 text-sm">Đối chiếu & Đồng bộ Kịch bản</h3>
                </div>
              </div>

              {/* 2-Column Side-by-Side Panel */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                
                {/* Left Panel: Script Input */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-950/50 pb-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Kịch bản gốc (Script)
                    </span>
                    <input
                      type="file"
                      ref={scriptFileInputRef}
                      onChange={handleScriptFileChange}
                      accept=".txt"
                      className="hidden"
                    />
                    <button
                      onClick={() => scriptFileInputRef.current?.click()}
                      className="text-[9px] bg-slate-950 hover:bg-slate-900 border border-slate-900 text-slate-400 hover:text-slate-200 px-2 py-1 transition cursor-pointer select-none flex items-center gap-1 shrink-0"
                    >
                      <Upload className="w-2.5 h-2.5 text-violet-400" />
                      Chọn tệp kịch bản (.txt)
                    </button>
                  </div>

                  <textarea
                    value={scriptText}
                    onChange={(e) => {
                      setScriptText(e.target.value);
                      setCurrentProjectField('scriptContent', e.target.value);
                    }}
                    rows={12}
                    placeholder="Nhập hoặc dán kịch bản tại đây. Ví dụ:&#10;俺：「わかりました」&#10;リナ：「よろしくお願いします」&#10;俺：｛ノーマル｝（よし、大型乾燥機が一台空いてるな）"
                    className="w-full bg-slate-950 border border-gray-900 rounded-xl text-[11px] text-slate-200 p-2.5 focus:outline-none focus:border-violet-500 transition font-mono leading-relaxed resize-y min-h-[260px] h-[280px]"
                  />
                  
                  <div className="flex justify-between items-center text-[10px] text-slate-500 px-1 font-mono">
                    <span>Số dòng trong kịch bản:</span>
                    <span className={`font-bold ${scriptText.split(/\r?\n/).map(l => l.trim()).filter(Boolean).length === (currentProject.srtContent ? parseSRT(currentProject.srtContent).blocks.length : 0) ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {scriptText.split(/\r?\n/).map(l => l.trim()).filter(Boolean).length} dòng
                    </span>
                  </div>
                </div>

                {/* Right Panel: SRT Preview */}
                <div className="space-y-3 md:border-l md:border-slate-950 md:pl-6">
                  <div className="flex items-center justify-between border-b border-slate-950 pb-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Phụ đề gốc (SRT Preview)
                    </span>
                    <span className="text-[9px] text-gray-500 font-mono italic">Đầy đủ các phân cảnh</span>
                  </div>

                  <div className="bg-slate-950 border border-gray-900 rounded-xl p-3 space-y-3 overflow-y-auto min-h-[260px] h-[280px] scrollbar-thin">
                    {(currentProject.srtContent ? parseSRT(currentProject.srtContent).blocks : []).map((block) => (
                      <div key={block.id} className="text-xs flex gap-3 border-b border-gray-900/60 pb-2">
                        <span className="text-gray-600 font-mono select-none w-5 shrink-0 text-[10px]">{block.id}</span>
                        <div className="space-y-0.5 truncate-all">
                          <span className="text-[9px] text-violet-400/80 font-mono block select-none">
                            {block.timeRange}
                          </span>
                          <p className="text-slate-300 leading-normal font-sans text-[11px]">{block.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center text-[10px] text-slate-500 px-1 font-mono">
                    <span>Số phân cảnh SRT:</span>
                    <span className="font-bold text-slate-300">
                      {currentProject.srtContent ? parseSRT(currentProject.srtContent).blocks.length : 0} phân cảnh
                    </span>
                  </div>
                </div>

              </div>

              {/* Validation Message & Action Button Bar */}
              <div className="pt-3 border-t border-slate-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex-1">
                  {(() => {
                    const scriptLinesCount = scriptText.split(/\r?\n/).map(l => l.trim()).filter(Boolean).length;
                    const srtBlocksCount = currentProject.srtContent ? parseSRT(currentProject.srtContent).blocks.length : 0;
                    
                    if (!scriptText.trim()) {
                      return (
                        <div className="text-[10px] text-slate-500 font-medium leading-relaxed font-sans">
                          Vui lòng nhập hoặc tải kịch bản vào cột bên trái để bắt đầu đối chiếu.
                        </div>
                      );
                    }
                    
                    if (scriptLinesCount === srtBlocksCount) {
                      return (
                        <div className="text-[10px] text-emerald-400 bg-emerald-950/20 border border-emerald-900/40 px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium leading-normal animate-fadeIn font-sans">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>Khớp số dòng thoại (<strong>{scriptLinesCount}/{srtBlocksCount}</strong>). Hệ thống đã sẵn sàng đồng bộ 1-1!</span>
                        </div>
                      );
                    } else {
                      return (
                        <div className="text-[10px] text-rose-400 bg-rose-950/20 border border-rose-900/40 px-3 py-1.5 rounded-lg flex items-start gap-1.5 font-medium leading-normal animate-fadeIn font-sans">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                          <span>Lệch dòng: Kịch bản có <strong>{scriptLinesCount}</strong> dòng, nhưng SRT có <strong>{srtBlocksCount}</strong> phân cảnh. Điều chỉnh kịch bản khớp hoàn toàn để tạo phụ đề.</span>
                        </div>
                      );
                    }
                  })()}
                </div>

                <button
                  onClick={handleMergeScriptSrt}
                  disabled={
                    !currentProject.srtContent || 
                    !scriptText.trim() || 
                    scriptText.split(/\r?\n/).map(l => l.trim()).filter(Boolean).length !== (currentProject.srtContent ? parseSRT(currentProject.srtContent).blocks.length : 0)
                  }
                  className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:from-slate-900 disabled:to-slate-950 disabled:text-gray-650 disabled:opacity-40 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-lg hover:shadow-violet-500/10 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed select-none flex items-center gap-1.5 hover:scale-[1.01] active:scale-[0.98] shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Tạo srt full
                </button>
              </div>

            </div>
          )}

          {/* Video Auto-Download Configuration */}
          {currentProject.id && (
            <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-950 pb-3">
                <Download className="w-5 h-5 text-violet-400" />
                <h3 className="font-bold text-slate-200 text-sm">Cấu hình Tải Video tự động</h3>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="autoDownloadVideo"
                    checked={!!currentProject.autoDownloadVideo}
                    onChange={(e) => setCurrentProjectField('autoDownloadVideo', e.target.checked)}
                    className="rounded border-gray-900 text-violet-600 focus:ring-violet-500/20 bg-slate-950 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="autoDownloadVideo" className="text-xs font-semibold text-slate-300 cursor-pointer select-none">
                    Tự động tải video về PC sau khi tạo thành công
                  </label>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Thư mục lưu video trên máy tính (Đường dẫn tuyệt đối)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={currentProject.videoSaveDir || ''}
                      onChange={(e) => setCurrentProjectField('videoSaveDir', e.target.value)}
                      placeholder="Ví dụ: D:\MangaStoryboard\videos hoặc C:\Users\Admin\Downloads"
                      className="flex-1 bg-slate-950 border border-gray-900 rounded-lg text-xs text-slate-200 px-3.5 py-2 focus:outline-none focus:border-violet-500 transition font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleSelectDirectory}
                      className="bg-slate-900 hover:bg-slate-800 border border-slate-850 hover:border-slate-700 text-xs font-semibold text-slate-300 hover:text-slate-100 px-4 py-2 rounded-lg transition cursor-pointer select-none flex items-center gap-1.5 shrink-0"
                    >
                      <FolderOpen className="w-4 h-4 text-violet-400" />
                      Chọn thư mục
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 italic leading-relaxed">
                    * Video sẽ tự động được lưu dưới dạng <code className="bg-slate-950 px-1 py-0.5 rounded font-mono text-[9px] text-violet-400">segment_XX.mp4</code> vào thư mục này ngay sau khi quá trình video hoàn tất.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column (1/3 width) */}
        <div className="space-y-6">
          {/* Style Selection and Management */}
          {currentProject.id && (
            <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-950 pb-3">
                <div className="flex items-center gap-2">
                  <Palette className="w-5 h-5 text-violet-400" />
                  <h3 className="font-bold text-slate-200 text-sm">Style vẽ ảnh</h3>
                </div>
                <button
                  onClick={() => setShowStyleManager(!showStyleManager)}
                  className="text-xs text-violet-400 hover:text-violet-300 font-semibold transition flex items-center gap-1 cursor-pointer bg-transparent border-0"
                >
                  <Settings className="w-3.5 h-3.5" />
                  {showStyleManager ? 'Đóng' : 'Quản lý'}
                </button>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                    Chọn phong cách vẽ (Style)
                  </label>
                  <select
                    value={currentProject.selectedStyleId || 'manga_color'}
                    onChange={(e) => setSelectedStyleId(e.target.value)}
                    className="w-full bg-slate-950 border border-gray-900 rounded-lg text-xs text-slate-200 px-3 py-2 focus:outline-none focus:border-violet-500 transition cursor-pointer"
                  >
                    {styles.map((style) => (
                      <option key={style.id} value={style.id}>
                        {style.name} {style.isCustom ? '(Tùy chỉnh)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-900/60 text-[10px] space-y-2 max-h-[140px] overflow-y-auto scrollbar-thin">
                  <div className="text-[10px] text-violet-400 font-semibold uppercase tracking-wider">Mô tả Style hiện tại</div>
                  <div className="space-y-1.5 font-sans leading-relaxed">
                    <div>
                      <span className="font-bold text-gray-500 uppercase mr-1">Nhân vật:</span>
                      <span className="text-slate-300 italic">{currentStyle.characterSuffix}</span>
                    </div>
                    <div>
                      <span className="font-bold text-gray-500 uppercase mr-1">Bối cảnh:</span>
                      <span className="text-slate-300 italic">{currentStyle.backgroundSuffix}</span>
                    </div>
                    <div>
                      <span className="font-bold text-gray-500 uppercase mr-1">Cảnh:</span>
                      <span className="text-slate-300 italic">{currentStyle.sceneSuffix}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Style Manager Interface */}
              {showStyleManager && (
                <div className="mt-4 pt-4 border-t border-slate-950 space-y-4 animate-fadeIn">
                  {/* Style List */}
                  <div className="bg-slate-950 rounded-lg border border-slate-900/80 p-3 flex flex-col h-[180px]">
                    <div className="flex items-center justify-between mb-2 pb-1 border-b border-gray-900">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Danh sách Style</span>
                      <button
                        onClick={handleNewStyleInit}
                        className="flex items-center gap-1 text-[9px] bg-violet-600/20 text-violet-300 border border-violet-800/50 hover:bg-violet-600/30 px-2 py-0.5 rounded transition cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Thêm mới
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-1 scrollbar-thin">
                      {styles.map((style) => (
                        <div
                          key={style.id}
                          onClick={() => handleSelectStyleToEdit(style)}
                          className={`flex items-center justify-between text-xs p-2 rounded cursor-pointer transition ${
                            (editingStyle?.id === style.id || (!editingStyle && isNewStyle && style.id === 'new'))
                              ? 'bg-violet-950/30 border border-violet-900/60 text-violet-300'
                              : 'hover:bg-slate-900 border border-transparent text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <span className="font-medium truncate">{style.name}</span>
                          <span className="text-[8px] px-1.5 py-0.5 rounded font-mono shrink-0 scale-90 select-none">
                            {style.isCustom ? (
                              <span className="bg-violet-950 text-violet-400 border border-violet-900/40">Custom</span>
                            ) : (
                              <span className="bg-slate-900 text-gray-500 border border-slate-800">System</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Style Form */}
                  <div className="space-y-3 bg-slate-950/40 border border-slate-900/50 p-3 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                        {isNewStyle ? 'Tạo Style mới' : 'Chi tiết Style'}
                      </span>
                      {!editingStyle?.isCustom && !isNewStyle && (
                        <span className="text-[8px] text-amber-500 bg-amber-950/20 border border-amber-900/40 px-2 py-0.5 rounded font-medium select-none scale-90">
                          Mặc định
                        </span>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Tên Style</label>
                        <input
                          type="text"
                          disabled={!isNewStyle && !editingStyle?.isCustom}
                          value={styleForm.name}
                          onChange={(e) => setStyleForm({ ...styleForm, name: e.target.value })}
                          placeholder="Ví dụ: Manga Color, Black and White..."
                          className="w-full bg-slate-950 border border-gray-900 rounded text-xs text-slate-200 px-3 py-2 focus:outline-none focus:border-violet-500 disabled:opacity-50"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                          Nhân vật Suffix (Character sheet)
                        </label>
                        <textarea
                          disabled={!isNewStyle && !editingStyle?.isCustom}
                          value={styleForm.characterSuffix}
                          onChange={(e) => setStyleForm({ ...styleForm, characterSuffix: e.target.value })}
                          rows={2}
                          placeholder="Phong cách thêm vào prompt của nhân vật..."
                          className="w-full bg-slate-950 border border-gray-900 rounded text-xs text-slate-200 px-3 py-1.5 focus:outline-none focus:border-violet-500 disabled:opacity-50 font-mono text-[10px] leading-normal"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                          Bối cảnh Suffix (Background layout)
                        </label>
                        <textarea
                          disabled={!isNewStyle && !editingStyle?.isCustom}
                          value={styleForm.backgroundSuffix}
                          onChange={(e) => setStyleForm({ ...styleForm, backgroundSuffix: e.target.value })}
                          rows={2}
                          placeholder="Phong cách thêm vào prompt của bối cảnh..."
                          className="w-full bg-slate-950 border border-gray-900 rounded text-xs text-slate-200 px-3 py-1.5 focus:outline-none focus:border-violet-500 disabled:opacity-50 font-mono text-[10px] leading-normal"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                          Storyboard Suffix (Scene description)
                        </label>
                        <textarea
                          disabled={!isNewStyle && !editingStyle?.isCustom}
                          value={styleForm.sceneSuffix}
                          onChange={(e) => setStyleForm({ ...styleForm, sceneSuffix: e.target.value })}
                          rows={3}
                          placeholder="Phong cách vẽ chi tiết cho cảnh phim..."
                          className="w-full bg-slate-950 border border-gray-900 rounded text-xs text-slate-200 px-3 py-1.5 focus:outline-none focus:border-violet-500 disabled:opacity-50 font-mono text-[10px] leading-normal"
                        />
                      </div>
                    </div>

                    {(isNewStyle || editingStyle?.isCustom) && (
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-950">
                        {editingStyle?.isCustom && !isNewStyle && (
                          <button
                            onClick={handleDeleteStyle}
                            className="flex items-center gap-1 bg-red-950/30 hover:bg-red-900/20 border border-red-900 text-red-400 text-[10px] px-2.5 py-1.5 rounded transition font-semibold cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" /> Xóa
                          </button>
                        )}
                        <button
                          onClick={handleSaveStyle}
                          className="flex items-center gap-1 bg-violet-600 hover:bg-violet-500 text-white text-[10px] px-3 py-1.5 rounded transition font-semibold cursor-pointer"
                        >
                          <Save className="w-3 h-3" />
                          {isNewStyle ? 'Tạo mới' : 'Lưu'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <FolderPickerModal
        isOpen={isFolderPickerOpen}
        onClose={() => setIsFolderPickerOpen(false)}
        onSelect={handleFolderSelectConfirm}
        initialPath={currentProject.videoSaveDir || ''}
        title="Chọn thư mục lưu video"
      />
    </div>
  );
}
