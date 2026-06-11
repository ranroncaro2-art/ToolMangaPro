import React, { useState } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { Settings, Save, RefreshCw, Key, Database, Cpu, Download, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import pkg from '../../package.json';

export default function Header() {
  const {
    apiConfig,
    setApiConfig,
    currentProject,
    saveCurrentProject,
    exportProject,
    tokenUsage,
    resetTokenUsage,
    imageGenConfig,
    setImageGenConfig,
    videoGenConfig,
    setVideoGenConfig
  } = useProjectStore();

  const [showSettings, setShowSettings] = useState(false);
  const [projectName, setProjectName] = useState(currentProject.name);
  const [isSaving, setIsSaving] = useState(false);
  const [activeConfigTab, setActiveConfigTab] = useState<'provider' | 'image' | 'video' | 'update'>('provider');
  const [githubToken, setGithubToken] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('github_updater_token') || '' : ''));
  const [githubBranch, setGithubBranch] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('github_updater_branch') || 'main' : 'main'));
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; commits: any[] } | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateProgress, setUpdateProgress] = useState<{ status: string; percent: number } | null>(null);

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateError(null);
    setUpdateInfo(null);
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github+json',
      };
      if (githubToken.trim()) {
        headers['Authorization'] = `Bearer ${githubToken.trim()}`;
      }

      // Fetch package.json content
      const pkgUrl = `https://api.github.com/repos/ranroncaro2-art/ToolMangaPro/contents/package.json?ref=${githubBranch}`;
      const pkgRes = await fetch(pkgUrl, { headers });
      
      if (!pkgRes.ok) {
        throw new Error(`Không thể truy cập file package.json (${pkgRes.status} ${pkgRes.statusText}). Hãy kiểm tra lại Token hoặc tên chi nhánh.`);
      }

      const pkgData = await pkgRes.json();
      if (!pkgData.content) {
        throw new Error("Không thể đọc được nội dung package.json từ GitHub.");
      }

      // Decode base64 package.json content
      const decodedContent = atob(pkgData.content.replace(/\s/g, ''));
      const parsedPkg = JSON.parse(decodedContent);
      const latestVersion = parsedPkg.version;

      // Fetch latest commits
      const commitsUrl = `https://api.github.com/repos/ranroncaro2-art/ToolMangaPro/commits?sha=${githubBranch}&per_page=5`;
      let commitsList: any[] = [];
      try {
        const commitsRes = await fetch(commitsUrl, { headers });
        if (commitsRes.ok) {
          commitsList = await commitsRes.json();
        }
      } catch (commitsErr) {
        console.error("Failed to fetch commits list:", commitsErr);
      }

      setUpdateInfo({
        version: latestVersion,
        commits: Array.isArray(commitsList) ? commitsList : []
      });
    } catch (err: any) {
      console.error(err);
      setUpdateError(err.message || "Đã xảy ra lỗi khi kết nối với GitHub.");
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleApplyUpdate = async () => {
    if (!updateInfo) return;
    const confirmMsg = `Bạn có chắc chắn muốn cập nhật hệ thống từ phiên bản ${pkg.version} lên phiên bản ${updateInfo.version}? Quá trình này sẽ tải về và chạy bộ cài đặt ứng dụng mới nhất.`;
    if (!window.confirm(confirmMsg)) return;

    setIsApplyingUpdate(true);
    setUpdateError(null);
    setUpdateProgress(null);

    // If running in packaged Electron app, use native setup updater
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.triggerAppUpdate) {
      const removeListener = electronAPI.onUpdateProgress((prog: any) => {
        setUpdateProgress(prog);
      });

      try {
        const res = await electronAPI.triggerAppUpdate({
          token: githubToken,
          version: updateInfo.version
        });
        if (res.success) {
          if (res.isDev) {
            alert(`[DEV MODE] Đã tải bộ cài về:\n${res.path}`);
            setIsApplyingUpdate(false);
            setUpdateProgress(null);
          } else {
            setUpdateProgress({ status: 'installing', percent: 100 });
          }
        } else {
          throw new Error(res.error || "Không thể tải hoặc chạy bộ cài đặt.");
        }
      } catch (err: any) {
        console.error(err);
        setUpdateError(err.message || "Lỗi trong quá trình cập nhật tự động.");
        setIsApplyingUpdate(false);
        setUpdateProgress(null);
      } finally {
        removeListener();
      }
      return;
    }

    // Fallback for browser/dev environments (source code overwrite)
    try {
      const res = await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken, branch: githubBranch })
      });

      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setShowSettings(false);
      } else {
        throw new Error(data.error || "Cập nhật không thành công.");
      }
    } catch (err: any) {
      console.error(err);
      setUpdateError(err.message || "Đã xảy ra lỗi trong quá trình ghi đè mã nguồn mới.");
    } finally {
      setIsApplyingUpdate(false);
    }
  };

  React.useEffect(() => {
    setProjectName(currentProject.name);
  }, [currentProject.name]);

  const handleSaveProject = async () => {
    setIsSaving(true);
    try {
      await saveCurrentProject(projectName);
    } catch (err) {
      alert('Failed to save project: ' + (err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const getProviderLabel = (prov: string) => {
    switch (prov) {
      case 'openai': return 'OpenAI';
      case 'gemini': return 'Google Gemini';
      case 'claude': return 'Anthropic Claude';
      default: return prov;
    }
  };

  return (
    <>
      <header className="glass-panel border-b border-gray-800 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 z-50">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto">
        <div className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="M"
            className="w-8 h-8 rounded-lg object-cover shadow-lg shadow-violet-500/20"
          />
          <span className="font-bold text-lg bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            TOOL MANGA ANIME PRO
          </span>
        </div>

        <div className="h-6 w-px bg-gray-800 hidden sm:block" />

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onBlur={handleSaveProject}
            placeholder="Project Name..."
            className="bg-transparent border border-transparent hover:border-gray-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded px-2 py-1 text-sm font-medium text-slate-200 transition outline-none w-full sm:w-48"
          />
          <button
            onClick={handleSaveProject}
            disabled={isSaving}
            className="p-1.5 rounded bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-slate-400 hover:text-slate-200 disabled:opacity-50 transition cursor-pointer"
            title="Save Project"
          >
            <Save className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => currentProject.id && exportProject(currentProject.id)}
            disabled={!currentProject.id}
            className="p-1.5 rounded bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-slate-400 hover:text-slate-200 disabled:opacity-50 transition cursor-pointer"
            title="Export Project"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats & Controls */}
      <div className="flex flex-wrap items-center justify-end gap-6 w-full md:w-auto">
        {/* Token Usage Stats */}
        {tokenUsage.inputTokens > 0 && (
          <div className="flex items-center gap-4 text-xs bg-slate-950/80 border border-slate-900 rounded-lg p-2 pr-3">
            <div className="flex flex-col">
              <span className="text-gray-500 font-semibold uppercase tracking-wider text-[9px]">Input / Output Tokens</span>
              <span className="text-slate-300 font-mono">
                {tokenUsage.inputTokens.toLocaleString()} / {tokenUsage.outputTokens.toLocaleString()}
              </span>
            </div>
            <div className="w-px h-8 bg-gray-900" />
            <div className="flex flex-col">
              <span className="text-gray-500 font-semibold uppercase tracking-wider text-[9px]">Est. Cost</span>
              <span className="text-emerald-400 font-mono font-bold">
                ${tokenUsage.cost.toFixed(4)}
              </span>
            </div>
            <button
              onClick={resetTokenUsage}
              className="p-1 text-gray-500 hover:text-gray-300 hover:bg-gray-950 rounded transition cursor-pointer"
              title="Reset Stats"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Model Indicator */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400 bg-slate-950/60 border border-slate-900 rounded-lg px-3 py-2">
          <Cpu className="w-3.5 h-3.5 text-violet-400" />
          <span className="font-semibold text-slate-300">{getProviderLabel(apiConfig.provider)}</span>
          <span className="text-gray-600">|</span>
          <span className="font-mono text-slate-400">{apiConfig.modelName}</span>
        </div>

        {/* Settings button */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 text-sm bg-violet-600 hover:bg-violet-500 text-white font-medium px-4 py-2 rounded-lg transition shadow-lg shadow-violet-500/20 active:scale-95 cursor-pointer"
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
      </div>
      </header>

      {/* Settings Modal (Overlay Card) */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-slate-900 border border-gray-800 rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Modal Title */}
            <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-slate-200 font-semibold">
                <Database className="w-5 h-5 text-violet-400" />
                AI Configuration
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="text-gray-500 hover:text-gray-300 transition text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Modal Tabs Header */}
            <div className="flex border-b border-gray-800/80 bg-slate-950/40 shrink-0 text-center select-none">
              <button
                type="button"
                onClick={() => setActiveConfigTab('provider')}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                  activeConfigTab === 'provider'
                    ? 'text-violet-400 border-b-2 border-violet-500 bg-violet-600/5'
                    : 'text-gray-500 hover:text-slate-300'
                }`}
              >
                AI API Config
              </button>
              <button
                type="button"
                onClick={() => setActiveConfigTab('image')}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                  activeConfigTab === 'image'
                    ? 'text-violet-400 border-b-2 border-violet-500 bg-violet-600/5'
                    : 'text-gray-500 hover:text-slate-300'
                }`}
              >
                Image Gen
              </button>
              <button
                type="button"
                onClick={() => setActiveConfigTab('video')}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                  activeConfigTab === 'video'
                    ? 'text-violet-400 border-b-2 border-violet-500 bg-violet-600/5'
                    : 'text-gray-500 hover:text-slate-300'
                }`}
              >
                Video Gen
              </button>
              <button
                type="button"
                onClick={() => setActiveConfigTab('update')}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                  activeConfigTab === 'update'
                    ? 'text-violet-400 border-b-2 border-violet-500 bg-violet-600/5'
                    : 'text-gray-500 hover:text-slate-300'
                }`}
              >
                Cập nhật
              </button>
            </div>

            {/* Modal Scrollable Content */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              
              {/* TAB 1: PROVIDER AND API */}
              {activeConfigTab === 'provider' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                      AI Provider
                    </label>
                    <select
                      value={apiConfig.provider}
                      onChange={(e) =>
                        setApiConfig({
                          provider: e.target.value as any,
                          modelName:
                            e.target.value === 'openai'
                              ? 'gpt-4o-mini'
                              : e.target.value === 'gemini'
                              ? 'gemini-2.5-flash'
                              : 'claude-3-5-sonnet-latest'
                        })
                      }
                      className="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition cursor-pointer"
                    >
                      <option value="gemini">Google Gemini</option>
                      <option value="openai">OpenAI</option>
                      <option value="claude">Anthropic Claude</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                      Model Name
                    </label>
                    {(() => {
                      const presets: Record<string, { value: string; label: string }[]> = {
                        openai: [
                          { value: 'gpt-4o-mini', label: 'GPT 4o-mini' },
                          { value: 'gpt-4o', label: 'GPT 4o' },
                          { value: 'o1-mini', label: 'o1-mini' },
                          { value: 'gpt-3.5-turbo', label: 'GPT 3.5-turbo' }
                        ],
                        gemini: [
                          { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Default)' },
                          { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
                          { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
                          { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' }
                        ],
                        claude: [
                          { value: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet' },
                          { value: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' },
                          { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' }
                        ]
                      };

                      const currentPresets = presets[apiConfig.provider] || [];
                      const isPreset = currentPresets.some(p => p.value === apiConfig.modelName);

                      return (
                        <div className="space-y-2">
                          <select
                            value={isPreset ? apiConfig.modelName : 'custom'}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val !== 'custom') {
                                setApiConfig({ modelName: val });
                              } else {
                                setApiConfig({ modelName: apiConfig.modelName });
                              }
                            }}
                            className="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition cursor-pointer"
                          >
                            {currentPresets.map((preset) => (
                              <option key={preset.value} value={preset.value}>
                                {preset.label}
                              </option>
                            ))}
                            <option value="custom">Custom Model...</option>
                          </select>

                          {!isPreset && (
                            <input
                              type="text"
                              placeholder="Enter custom model name..."
                              value={apiConfig.modelName}
                              onChange={(e) => setApiConfig({ modelName: e.target.value })}
                              className="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition font-mono"
                            />
                          )}
                        </div>
                      );
                    })()}
                    <span className="text-[10px] text-gray-500 mt-1 block">
                      Select a preset model or choose "Custom Model..." to input a specific name.
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                        <Key className="w-3.5 h-3.5 text-violet-400" />
                        API Key
                      </label>
                    </div>
                    <input
                      type="password"
                      placeholder="Enter API key..."
                      value={apiConfig.apiKey}
                      onChange={(e) => setApiConfig({ apiKey: e.target.value })}
                      className="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition font-mono"
                    />
                    <span className="text-[10px] text-gray-500 mt-1 block">
                      Keys are stored locally in your browser.
                    </span>
                  </div>

                  {/* Google API URL Configuration */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                      Google API URL
                    </label>
                    <input
                      type="text"
                      placeholder="http://127.0.0.1:5000"
                      value={apiConfig.googleApiUrl || ''}
                      onChange={(e) => setApiConfig({ googleApiUrl: e.target.value })}
                      className="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition font-mono"
                    />
                    <span className="text-[10px] text-gray-500 mt-1 block">
                      Địa chỉ API Google (mặc định: http://127.0.0.1:5000)
                    </span>
                  </div>
                </div>
              )}

              {/* TAB 2: IMAGE GENERATION */}
              {activeConfigTab === 'image' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="text-[11px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                    Cấu hình vẽ ảnh (Image Gen)
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                        Số lượng
                      </label>
                      <select
                        value={imageGenConfig.count}
                        onChange={(e) => setImageGenConfig({ count: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition cursor-pointer"
                      >
                        <option value={1}>1 Ảnh</option>
                        <option value={2}>2 Ảnh</option>
                        <option value={3}>3 Ảnh</option>
                        <option value={4}>4 Ảnh</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                        Tỷ lệ (Aspect Ratio)
                      </label>
                      <select
                        value={imageGenConfig.aspectRatio}
                        onChange={(e) => setImageGenConfig({ aspectRatio: e.target.value })}
                        className="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition cursor-pointer"
                      >
                        <option value="IMAGE_ASPECT_RATIO_LANDSCAPE">16:9 Ngang</option>
                        <option value="IMAGE_ASPECT_RATIO_PORTRAIT">9:16 Dọc</option>
                        <option value="IMAGE_ASPECT_RATIO_SQUARE">1:1 Vuông</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                        Model (Mô hình tạo Ảnh/Video)
                      </label>
                      <select
                        value={imageGenConfig.model}
                        onChange={(e) => setImageGenConfig({ model: e.target.value })}
                        className="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition cursor-pointer"
                      >
                        <optgroup label="Tạo Ảnh (Image Models)">
                          <option value="GEM_PIX_2">Nano Banana Pro (GEM_PIX_2)</option>
                          <option value="NARWHAL">Nano Banana 2 (NARWHAL)</option>
                        </optgroup>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                          Số luồng chạy song song
                        </label>
                        <select
                          value={imageGenConfig.concurrency}
                          onChange={(e) => setImageGenConfig({ concurrency: Number(e.target.value) })}
                          className="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition cursor-pointer"
                        >
                          <option value={1}>1 Luồng (Tuần tự)</option>
                          <option value={2}>2 Luồng song song</option>
                          <option value={3}>3 Luồng song song</option>
                          <option value={4}>4 Luồng song song</option>
                          <option value={6}>6 Luồng song song</option>
                          <option value={8}>8 Luồng song song</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                          Khoảng trễ (giây)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={300}
                          value={imageGenConfig.delayTime !== undefined ? imageGenConfig.delayTime : 5}
                          onChange={(e) => setImageGenConfig({ delayTime: Number(e.target.value) })}
                          className="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: VIDEO GENERATION */}
              {activeConfigTab === 'video' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="text-[11px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                    Cấu hình tạo video (Video Gen)
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                        Số lượng
                      </label>
                      <select
                        value={videoGenConfig.count}
                        onChange={(e) => setVideoGenConfig({ count: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition cursor-pointer"
                      >
                        <option value={1}>1 Video</option>
                        <option value={2}>2 Video</option>
                        <option value={3}>3 Video</option>
                        <option value={4}>4 Video</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                        Tỷ lệ (Aspect Ratio)
                      </label>
                      <select
                        value={videoGenConfig.aspectRatio}
                        onChange={(e) => setVideoGenConfig({ aspectRatio: e.target.value })}
                        className="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition cursor-pointer"
                      >
                        <option value="VIDEO_ASPECT_RATIO_LANDSCAPE">16:9 Ngang</option>
                        <option value="VIDEO_ASPECT_RATIO_PORTRAIT">9:16 Dọc</option>
                        <option value="VIDEO_ASPECT_RATIO_SQUARE">1:1 Vuông</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                        Model Video (T2V)
                      </label>
                      <select
                        value={videoGenConfig.model}
                        onChange={(e) => setVideoGenConfig({ model: e.target.value })}
                        className="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition cursor-pointer"
                      >
                        <optgroup label="Text → Video">
                          <option value="veo_3_fast_10_credit">Veo 3 Fast - 10 credit</option>
                          <option value="veo_3_fast_relaxed">Veo 3 Fast Relaxed - có phí</option>
                          <option value="veo_3_standard">Veo 3 Standard - có phí</option>
                          <option value="veo_3_quality_100_credit">Veo 3 Quality - 100 credit</option>
                          <option value="veo_3_fast_portrait_0_credit">Veo 3 Fast Portrait - 0 credit</option>
                          <option value="veo_3_1_r2v_lite_low_priority">Veo 3.1 Lite - 0 credit</option>
                        </optgroup>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                        Số luồng chạy song song
                      </label>
                      <select
                        value={videoGenConfig.concurrency || 1}
                        onChange={(e) => setVideoGenConfig({ concurrency: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition cursor-pointer"
                      >
                        <option value={1}>1 Luồng (Tuần tự)</option>
                        <option value={2}>2 Luồng song song</option>
                        <option value={3}>3 Luồng song song</option>
                        <option value={4}>4 Luồng song song</option>
                        <option value={6}>6 Luồng song song</option>
                        <option value={8}>8 Luồng song song</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: UPDATE TOOL */}
              {activeConfigTab === 'update' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="text-[11px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                    Cập nhật hệ thống
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                        GitHub Token (để trống nếu repo public)
                      </label>
                      <input
                        type="password"
                        placeholder="ghp_..."
                        value={githubToken}
                        onChange={(e) => {
                          setGithubToken(e.target.value);
                          localStorage.setItem('github_updater_token', e.target.value);
                        }}
                        className="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                        Chi nhánh (Branch)
                      </label>
                      <input
                        type="text"
                        placeholder="main"
                        value={githubBranch}
                        onChange={(e) => {
                          setGithubBranch(e.target.value);
                          localStorage.setItem('github_updater_branch', e.target.value);
                        }}
                        className="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition font-mono"
                      />
                    </div>

                    <div className="pt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={handleCheckUpdate}
                        disabled={isCheckingUpdate || isApplyingUpdate}
                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-650 font-semibold py-2 px-3 rounded-lg text-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        {isCheckingUpdate ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            Đang kiểm tra...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3.5 h-3.5" />
                            Kiểm tra phiên bản
                          </>
                        )}
                      </button>

                      {updateInfo && (
                        <button
                          type="button"
                          onClick={handleApplyUpdate}
                          disabled={isApplyingUpdate}
                          className="flex-1 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold py-2 px-3 rounded-lg text-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-violet-500/10"
                        >
                          {isApplyingUpdate ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Đang cập nhật...
                            </>
                          ) : (
                            <>
                              <Download className="w-3.5 h-3.5" />
                              Tải & Cập nhật
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {isApplyingUpdate && updateProgress && (
                      <div className="bg-slate-950/80 border border-slate-905 rounded-lg p-4 space-y-2.5 shadow-inner">
                        <div className="flex justify-between text-[11px] font-bold">
                          <span className="text-gray-400 uppercase tracking-wider">
                            {updateProgress.status === 'downloading' ? 'Đang tải bộ cài đặt mới...' : 'Đang chạy bộ cài đặt...'}
                          </span>
                          <span className="text-violet-400 font-mono">{updateProgress.percent}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-violet-600 to-fuchsia-600 transition-all duration-300 rounded-full" 
                            style={{ width: `${updateProgress.percent}%` }}
                          />
                        </div>
                        <p className="text-[9px] text-gray-500 italic">Ứng dụng sẽ tự động đóng và khởi chạy trình cài đặt sau khi tải xong.</p>
                      </div>
                    )}

                    {updateError && (
                      <div className="bg-red-950/20 border border-red-900/50 text-red-400 p-3 rounded-lg text-xs flex gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{updateError}</span>
                      </div>
                    )}

                    <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl space-y-3">
                      <div className="flex justify-between text-xs border-b border-gray-900 pb-2">
                        <span className="text-gray-500 font-semibold uppercase tracking-wider">Phiên bản hiện tại:</span>
                        <span className="font-mono font-bold text-slate-300">{pkg.version}</span>
                      </div>

                      {updateInfo ? (
                        <>
                          <div className="flex justify-between text-xs border-b border-gray-900 pb-2">
                            <span className="text-gray-500 font-semibold uppercase tracking-wider">Phiên bản mới nhất:</span>
                            <span className="font-mono font-bold text-emerald-400 flex items-center gap-1.5">
                              {updateInfo.version}
                              {updateInfo.version !== pkg.version ? (
                                <span className="bg-emerald-950 text-emerald-400 border border-emerald-900/40 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider scale-90 animate-pulse">Có cập nhật</span>
                              ) : (
                                <span className="bg-slate-900 text-slate-400 border border-slate-800 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider scale-90">Mới nhất</span>
                              )}
                            </span>
                          </div>

                          {updateInfo.commits && updateInfo.commits.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Thông tin các thay đổi gần đây:</span>
                              <div className="max-h-[140px] overflow-y-auto space-y-2 pr-1 scrollbar-thin text-[11px]">
                                {updateInfo.commits.map((c: any, idx: number) => (
                                  <div key={idx} className="border-b border-gray-900/50 pb-1.5 last:border-b-0">
                                    <p className="text-slate-300 leading-normal font-sans font-medium">{c.commit?.message?.split('\n')[0]}</p>
                                    <div className="flex items-center gap-2 text-[9px] text-slate-500 mt-0.5">
                                      <span className="font-semibold text-slate-400">{c.commit?.author?.name}</span>
                                      <span>•</span>
                                      <span>{c.commit?.author?.date ? new Date(c.commit.author.date).toLocaleDateString('vi-VN') : ''}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-[10.5px] text-slate-500 text-center py-2 italic">
                          Nhấp "Kiểm tra phiên bản" để quét cập nhật từ GitHub.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="border-t border-gray-800 px-6 py-4 flex justify-end shrink-0">
              <button
                onClick={() => setShowSettings(false)}
                className="bg-violet-600 hover:bg-violet-500 text-white font-semibold px-4 py-2 rounded-lg text-sm transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
