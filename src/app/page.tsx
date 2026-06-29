"use client";

import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import MenuBar from '../components/MenuBar';
import HistorySidebar from '../components/HistorySidebar';
import SRTUpload from '../components/SRTUpload';
import SceneMappingGrid from '../components/SceneMappingGrid';
import ImagePromptGrid from '../components/ImagePromptGrid';
import ReferenceManager from '../components/ReferenceManager';
import ShotsManager from '../components/ShotsManager';
import VideoManager from '../components/VideoManager';
import CinemaManager from '../components/CinemaManager';
import GlobalQueueMonitor from '../components/GlobalQueueMonitor';
import { UploadCloud, Table, Sparkles, FolderOpen, Film, Play, Tv, Loader2, RefreshCw } from 'lucide-react';
import { useProjectStore } from '../store/useProjectStore';
import LoginScreen from '../components/LoginScreen';

import { ModuleRegistry } from 'ag-grid-community';
import { AllCommunityModule } from 'ag-grid-community';

// Register all community features globally for AG Grid v33+
ModuleRegistry.registerModules([AllCommunityModule]);

export default function Home() {
  const [activeTab, setActiveTab] = useState<'upload' | 'mapping' | 'prompts' | 'shots' | 'references' | 'video' | 'cinema'>('upload');
  const { initializeStore, currentProject, loadHistory, loadProject, saveCurrentProject, exportProject } = useProjectStore();

  // Refresh state
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [deployRedirectUrl, setDeployRedirectUrl] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);

  const isValidAbsoluteUrl = (url: string | null | undefined): boolean => {
    if (!url) return false;
    const cleaned = url.trim().toLowerCase();
    if (cleaned === '' || cleaned === 'undefined' || cleaned === 'null' || cleaned === '/') return false;
    return cleaned.startsWith('http://') || cleaned.startsWith('https://');
  };

  // Check login session on mount
  useEffect(() => {
    const sessionActive = localStorage.getItem('login_session_active') === 'true';
    const savedRedirect = localStorage.getItem('login_deploy_link');

    if (sessionActive) {
      setIsAuthenticated(true);
      if (savedRedirect && isValidAbsoluteUrl(savedRedirect)) {
        setDeployRedirectUrl(savedRedirect);
      } else {
        localStorage.removeItem('login_deploy_link');
        setDeployRedirectUrl(null);
      }
    }
    setCheckingAuth(false);
  }, []);

  // Handle automatic redirection when authenticated & redirect link is set
  useEffect(() => {
    if (isAuthenticated && deployRedirectUrl && isValidAbsoluteUrl(deployRedirectUrl)) {
      const timer = setTimeout(() => {
        window.location.href = deployRedirectUrl;
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, deployRedirectUrl]);

  useEffect(() => {
    initializeStore();
  }, []);

  const handleRefresh = async () => {
    if (!currentProject?.id || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await loadProject(currentProject.id);
      await loadHistory();
    } catch (err) {
      console.error("Failed to refresh project:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Sync when window gains focus
  useEffect(() => {
    const handleFocus = async () => {
      try {
        await loadHistory();
        if (currentProject?.id) {
          await loadProject(currentProject.id);
        }
      } catch (err) {
        console.error("Failed to sync project on focus:", err);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [currentProject?.id, loadHistory, loadProject]);

  const handleSave = async () => {
    try {
      if (currentProject.name) {
        await saveCurrentProject(currentProject.name);
        alert('Đã lưu dự án thành công!');
      } else {
        alert('Tên dự án không hợp lệ để lưu.');
      }
    } catch (err: any) {
      alert('Lưu dự án thất bại: ' + err.message);
    }
  };

  const handleExport = () => {
    if (currentProject.id) {
      exportProject(currentProject.id);
    } else {
      alert('Không có dự án hiện tại để xuất.');
    }
  };

  // Handle keyboard shortcuts (F5, Ctrl+S, Ctrl+E, Ctrl+R, Ctrl+Shift+I, F11)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // F5 -> Refresh Project Data
      if (e.key === 'F5') {
        e.preventDefault();
        handleRefresh();
      }
      
      // Ctrl + S -> Save Project
      if (isCtrl && key === 's') {
        e.preventDefault();
        handleSave();
      }

      // Ctrl + E -> Export Project
      if (isCtrl && key === 'e') {
        e.preventDefault();
        handleExport();
      }

      // Ctrl + R / Ctrl + Shift + R -> App Reload
      if (isCtrl && key === 'r') {
        e.preventDefault();
        const electronAPI = (window as any).electronAPI;
        if (electronAPI?.sendWindowAction) {
          electronAPI.sendWindowAction('reload');
        }
      }

      // Ctrl + Shift + I -> Toggle DevTools
      if (isCtrl && e.shiftKey && key === 'i') {
        e.preventDefault();
        const electronAPI = (window as any).electronAPI;
        if (electronAPI?.sendWindowAction) {
          electronAPI.sendWindowAction('toggle-devtools');
        }
      }

      // F11 -> Toggle Full Screen
      if (e.key === 'F11') {
        e.preventDefault();
        const electronAPI = (window as any).electronAPI;
        if (electronAPI?.sendWindowAction) {
          electronAPI.sendWindowAction('toggle-fullscreen');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentProject?.id, currentProject?.name, isRefreshing, saveCurrentProject, exportProject]);


  const isUploadCompleted = !!currentProject?.srtContent;
  const isMappingCompleted = (currentProject?.sceneMapping || []).length > 0;
  const isPromptsCompleted = (currentProject?.imagePrompts || []).length > 0;
  const isShotsCompleted = (currentProject?.imagePrompts || []).some(p => p.imageUrl);
  const isReferencesCompleted = (currentProject?.characters?.length || 0) > 0 || (currentProject?.exteriors?.length || 0) > 0;
  const isVideoCompleted = (currentProject?.imagePrompts || []).some(p => p.videoUrl);

  // Auth gate checks
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#070b13] flex items-center justify-center text-slate-400 select-none">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-violet-500 animate-pulse-soft" />
          <p className="text-[10px] uppercase tracking-widest font-semibold text-slate-500">Đang kiểm tra bảo mật...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated && deployRedirectUrl) {
    return (
      <div className="min-h-screen bg-[#070b13] flex items-center justify-center text-slate-400 select-none px-4">
        <div className="w-full max-w-sm glass-panel border border-slate-800/80 rounded-2xl p-8 text-center flex flex-col items-center gap-5 shadow-2xl relative">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-violet-600/10 blur-[120px] pointer-events-none" />
          <div className="w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200">Đang khởi chạy hệ thống...</p>
            <p className="text-xs text-slate-500 mt-2 break-all leading-relaxed max-w-xs">
              Đang điều hướng đến: <br/>
              <span className="font-mono text-violet-400/90 font-medium mt-1.5 block">{deployRedirectUrl}</span>
            </p>
          </div>
          <button
            onClick={() => {
              // Sign out and clear stored redirect URL
              localStorage.removeItem('login_session_active');
              localStorage.removeItem('login_session_user');
              localStorage.removeItem('login_session_mac');
              localStorage.removeItem('login_deploy_link');
              setIsAuthenticated(false);
              setDeployRedirectUrl(null);
            }}
            className="text-xs text-slate-500 hover:text-slate-300 underline cursor-pointer transition-colors pt-2"
          >
            Đăng xuất / Huỷ điều hướng
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <LoginScreen
        onLoginSuccess={(link) => {
          setIsAuthenticated(true);
          if (link && isValidAbsoluteUrl(link)) {
            setDeployRedirectUrl(link);
          } else {
            setDeployRedirectUrl(null);
          }
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#090d16] text-slate-100">
      {/* Top Menu Bar */}
      <MenuBar onSave={handleSave} onExport={handleExport} />

      {/* Header Banner */}
      <Header />

      {/* Main Workspace */}
      <div className="flex flex-1 flex-col lg:flex-row overflow-hidden">
        {/* Left Sidebar - History & Project Operations */}
        <HistorySidebar onNewProjectCreated={() => setActiveTab('upload')} />

        {/* Right Workspace Panel */}
        <main className="flex-1 flex flex-col overflow-hidden bg-slate-950/20">
          {/* Workspace Tabs Header */}
          <div className="glass-panel border-b border-gray-900 px-6 py-2 flex items-center justify-between gap-4 shrink-0 overflow-x-auto">
            <div className="flex flex-wrap items-center gap-1">
              <button
                onClick={() => setActiveTab('upload')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition cursor-pointer select-none ${
                  activeTab === 'upload'
                    ? isUploadCompleted
                      ? 'bg-slate-900 text-emerald-400 border border-emerald-950'
                      : 'bg-slate-900 text-violet-400 border border-gray-800'
                    : isUploadCompleted
                    ? 'text-emerald-500 hover:text-emerald-400 hover:bg-slate-900/20'
                    : 'text-gray-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                <UploadCloud className="w-4 h-4" />
                1. Cấu hình dự án
              </button>
              <button
                onClick={() => setActiveTab('mapping')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition cursor-pointer select-none ${
                  activeTab === 'mapping'
                    ? isMappingCompleted
                      ? 'bg-slate-900 text-emerald-400 border border-emerald-950'
                      : 'bg-slate-900 text-violet-400 border border-gray-800'
                    : isMappingCompleted
                    ? 'text-emerald-500 hover:text-emerald-400 hover:bg-slate-900/20'
                    : 'text-gray-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                <Table className="w-4 h-4" />
                2. Scene Mapping
              </button>
              <button
                onClick={() => setActiveTab('prompts')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition cursor-pointer select-none ${
                  activeTab === 'prompts'
                    ? isPromptsCompleted
                      ? 'bg-slate-900 text-emerald-400 border border-emerald-950'
                      : 'bg-slate-900 text-fuchsia-400 border border-gray-800'
                    : isPromptsCompleted
                    ? 'text-emerald-500 hover:text-emerald-400 hover:bg-slate-900/20'
                    : 'text-gray-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                3. Image Prompts
              </button>

              <button
                onClick={() => setActiveTab('references')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition cursor-pointer select-none ${
                  activeTab === 'references'
                    ? isReferencesCompleted
                      ? 'bg-slate-900 text-emerald-400 border border-emerald-950'
                      : 'bg-slate-900 text-violet-400 border border-gray-800'
                    : isReferencesCompleted
                    ? 'text-emerald-500 hover:text-emerald-400 hover:bg-slate-900/20'
                    : 'text-gray-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                <FolderOpen className="w-4 h-4" />
                4. Asset References
              </button>

              <button
                onClick={() => setActiveTab('shots')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition cursor-pointer select-none ${
                  activeTab === 'shots'
                    ? isShotsCompleted
                      ? 'bg-slate-900 text-emerald-400 border border-emerald-950'
                      : 'bg-slate-900 text-violet-400 border border-gray-800'
                    : isShotsCompleted
                    ? 'text-emerald-500 hover:text-emerald-400 hover:bg-slate-900/20'
                    : 'text-gray-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                <Film className="w-4 h-4" />
                5. Tạo ảnh Shots
              </button>

              <button
                onClick={() => setActiveTab('video')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition cursor-pointer select-none ${
                  activeTab === 'video'
                    ? isVideoCompleted
                      ? 'bg-slate-900 text-emerald-400 border border-emerald-950'
                      : 'bg-slate-900 text-violet-400 border border-gray-800'
                    : isVideoCompleted
                    ? 'text-emerald-500 hover:text-emerald-400 hover:bg-slate-900/20'
                    : 'text-gray-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                <Play className="w-4 h-4" />
                6. Tạo video
              </button>

              <button
                onClick={() => setActiveTab('cinema')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition cursor-pointer select-none ${
                  activeTab === 'cinema'
                    ? 'bg-slate-900 text-violet-400 border border-gray-800'
                    : 'text-gray-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                <Tv className="w-4 h-4" />
                7. Rạp phim
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0 pr-2">
              {currentProject?.id && (
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900/60 hover:bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-350 hover:text-slate-100 hover:border-slate-700 transition cursor-pointer disabled:opacity-40 select-none shadow-sm"
                  title="Làm mới dữ liệu từ cơ sở dữ liệu (F5)"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-violet-400 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Làm mới (F5)</span>
                </button>
              )}
              {/* GlobalQueueMonitor is rendered globally as a floating button at page root */}
            </div>
          </div>

          {/* Active Workspace View Area */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="h-full">
              {activeTab === 'upload' && (
                <SRTUpload onNextTab={() => setActiveTab('mapping')} />
              )}
              {activeTab === 'mapping' && (
                <SceneMappingGrid onNextTab={() => setActiveTab('prompts')} />
              )}
              {activeTab === 'prompts' && (
                <ImagePromptGrid />
              )}
              {activeTab === 'references' && (
                <ReferenceManager />
              )}
              {activeTab === 'shots' && (
                <ShotsManager />
              )}
              {activeTab === 'video' && (
                <VideoManager />
              )}
              {activeTab === 'cinema' && (
                <CinemaManager />
              )}
            </div>
          </div>
        </main>
      </div>
      <GlobalQueueMonitor />
    </div>
  );
}
