import React, { useEffect, useState, useRef } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { Plus, Folder, Copy, Trash2, Calendar, Database, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function HistorySidebar({ onNewProjectCreated }: { onNewProjectCreated?: () => void }) {
  const {
    history,
    loadHistory,
    createNewProject,
    loadProject,
    deleteProject,
    duplicateProject,
    currentProject,
    setSrtContent,
    runningProjects
  } = useProjectStore();

  const [showNameModal, setShowNameModal] = useState(false);
  const [projectNameInput, setProjectNameInput] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [srtContent, setSrtContentState] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleNewProject = () => {
    setProjectNameInput('New Manga Storyboard');
    setSrtFile(null);
    setSrtContentState('');
    setErrorMsg('');
    setShowNameModal(true);
  };

  const processFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.srt')) {
      setErrorMsg('Only .srt subtitle files are supported.');
      return;
    }
    setErrorMsg('');
    setSrtFile(file);

    // Auto fill project name if it is default
    if (projectNameInput === 'New Manga Storyboard' || !projectNameInput.trim()) {
      setProjectNameInput(file.name.replace(/\.srt$/i, ''));
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setSrtContentState(content);
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

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectNameInput.trim()) {
      alert('Please enter a project name.');
      return;
    }
    try {
      await createNewProject(projectNameInput.trim(), srtContent);
      setShowNameModal(false);
      setSrtFile(null);
      setSrtContentState('');
      if (onNewProjectCreated) {
        onNewProjectCreated();
      }
    } catch (err) {
      alert('Failed to create project: ' + (err as Error).message);
    }
  };

  const handleOpen = async (id: string) => {
    try {
      await loadProject(id);
    } catch (err) {
      alert('Failed to load project: ' + (err as Error).message);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this project?')) {
      try {
        await deleteProject(id);
      } catch (err) {
        alert('Failed to delete project: ' + (err as Error).message);
      }
    }
  };

  const handleDuplicate = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await duplicateProject(id);
    } catch (err) {
      alert('Failed to duplicate project: ' + (err as Error).message);
    }
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return isoStr;
    }
  };

  return (
    <aside className="w-full lg:w-72 bg-slate-950/40 border-r border-gray-900 flex flex-col h-full shrink-0">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-gray-900">
        <button
          onClick={handleNewProject}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-medium py-2 px-4 rounded-lg shadow-lg shadow-violet-500/10 hover:shadow-violet-500/20 active:scale-98 transition text-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {/* Project History List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          <Database className="w-3.5 h-3.5" />
          Projects History ({history.length})
        </div>

        {history.length === 0 ? (
          <div className="text-center py-8 text-gray-600 text-xs">
            No saved projects yet.
          </div>
        ) : (
          history.map((project) => {
            const isActive = currentProject.id === project.id;
            return (
              <div
                key={project.id}
                onClick={() => handleOpen(project.id)}
                className={`group flex flex-col gap-1.5 p-3 rounded-lg border text-left cursor-pointer transition relative ${
                  isActive
                    ? 'bg-violet-950/20 border-violet-800 shadow-md shadow-violet-500/5'
                    : 'bg-slate-900/40 border-slate-900 hover:bg-slate-900/80 hover:border-slate-800'
                }`}
              >
                {/* Project Title */}
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-xs text-slate-200 group-hover:text-violet-400 transition truncate pr-2">
                    {project.name}
                  </div>
                  {runningProjects[project.id] && (
                    <div className={`flex items-center gap-1.5 border rounded px-1.5 py-0.5 shrink-0 text-[8px] font-bold ${
                      runningProjects[project.id].endsWith('_queued')
                        ? 'bg-slate-800/40 border-slate-700 text-slate-400'
                        : 'bg-violet-950/80 border-violet-805 text-violet-300'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                        runningProjects[project.id].endsWith('_queued')
                          ? 'bg-slate-500'
                          : 'bg-violet-400'
                      }`} />
                      <span>
                        {runningProjects[project.id] === 'mapping'
                          ? 'MAPPING'
                          : runningProjects[project.id] === 'prompts'
                          ? 'PROMPTS'
                          : 'QUEUED'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Metadata */}
                <div className="flex items-center justify-between text-[10px] text-gray-500">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-gray-600" />
                    <span>{formatDate(project.createdAt)}</span>
                  </div>
                  <span className="font-mono bg-slate-950 px-1.5 py-0.5 rounded border border-gray-900 text-gray-400">
                    {project.modelName.length > 15 ? `${project.modelName.substring(0, 15)}...` : project.modelName}
                  </span>
                </div>

                {/* Floating Actions on Hover */}
                <div className="absolute right-2 top-2.5 hidden group-hover:flex items-center gap-1 bg-slate-900/90 p-1 rounded border border-gray-800 shadow-lg">
                  <button
                    onClick={(e) => handleDuplicate(e, project.id)}
                    className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
                    title="Duplicate"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, project.id)}
                    className="p-1 rounded text-red-500/70 hover:text-red-400 hover:bg-slate-800 transition cursor-pointer"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Name Modal Popup */}
      {showNameModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 text-slate-200">
          <form onSubmit={handleCreateProject} className="bg-slate-900 border border-gray-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="border-b border-gray-800 px-5 py-3 flex items-center justify-between">
              <h3 className="font-semibold text-xs text-slate-200 uppercase tracking-wider">Create New Project</h3>
              <button
                type="button"
                onClick={() => setShowNameModal(false)}
                className="text-gray-500 hover:text-gray-300 transition text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                  Project Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Manga Episode 1..."
                  value={projectNameInput}
                  onChange={(e) => setProjectNameInput(e.target.value)}
                  className="w-full bg-slate-950 border border-gray-900 focus:border-violet-500 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none transition"
                  autoFocus
                  required
                />
              </div>

              {/* SRT Upload Section */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                  Upload SRT Subtitles (Optional)
                </label>
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border border-dashed rounded-lg p-5 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[110px] ${
                    dragActive
                      ? 'border-violet-500 bg-violet-950/10'
                      : srtFile
                      ? 'border-emerald-600/50 bg-emerald-950/5 hover:border-emerald-500'
                      : 'border-gray-800 bg-slate-950 hover:border-violet-500/50 hover:bg-slate-900/10'
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".srt"
                    className="hidden"
                  />
                  {srtFile ? (
                    <div className="space-y-1.5 flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-emerald-950 flex items-center justify-center text-emerald-400">
                        <CheckCircle2 className="w-4.5 h-4.5" />
                      </div>
                      <div className="text-[11px] font-semibold text-slate-200 truncate max-w-[280px]">
                        {srtFile.name}
                      </div>
                      <p className="text-[10px] text-gray-500">Subtitle file selected</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="w-5 h-5 text-violet-400 mx-auto" />
                      <div>
                        <p className="font-semibold text-slate-300 text-[11px]">Drag & drop your .srt file here</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">or click to browse</p>
                      </div>
                    </div>
                  )}
                </div>
                {errorMsg && (
                  <div className="mt-2 text-red-450 text-[10px] flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="border-t border-gray-800 px-5 py-3 flex justify-end gap-2 shrink-0 bg-slate-950/20">
              <button
                type="button"
                onClick={() => setShowNameModal(false)}
                className="px-3.5 py-1.5 rounded-lg border border-gray-850 hover:bg-slate-900 text-xs text-slate-400 hover:text-slate-200 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-violet-600 hover:bg-violet-500 text-white font-semibold px-4 py-1.5 rounded-lg text-xs transition active:scale-95 cursor-pointer"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </aside>
  );
}
