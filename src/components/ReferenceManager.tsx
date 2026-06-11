import React, { useEffect, useState, useRef } from 'react';
import { useProjectStore, getDisplayName, getCardTitle } from '../store/useProjectStore';
import type { Project } from '../lib/db';
import { User, Image as ImageIcon, Trash2, Plus, UploadCloud, Loader2, Maximize2, Sparkles, Square, Sliders, Package, X } from 'lucide-react';

export default function ReferenceManager() {
  const {
    currentProject,
    characters,
    loadCharacters,
    addCharacter,
    deleteCharacter,
    exteriors,
    loadExteriors,
    addExterior,
    deleteExterior,
    props = [],
    loadProps,
    addProp,
    deleteProp,
    updatePropPrompt,
    updateAssetInputImage,
    uploadImage,
    assetGeneratingIds = [],
    isGeneratingAssets = false,
    generateAssetImage,
    generateAllAssetImages,
    cancelAssetGeneration,
    updateCharacterPrompt,
    updateExteriorPrompt,
    imageGenConfig,
    setImageGenConfig,
    getSelectedStyle,
    systemLogs = [],
    serverQueue = [],
    serverActive = [],
    fetchServerQueueAndLogs,
    batchJobs = {}
  } = useProjectStore();

  // Modal states for Reference Image Library
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [modalTarget, setModalTarget] = useState<{ type: 'character' | 'exterior' | 'prop'; id: string } | null>(null);
  const [modalTab, setModalTab] = useState<'character' | 'exterior' | 'prop' | 'pc'>('character');
  const [modalProjects, setModalProjects] = useState<Project[]>([]);
  const [selectedProjId, setSelectedProjId] = useState<string>('');
  const [uploadMode, setUploadMode] = useState<'replace' | 'reference'>('replace'); // replace (Mode 1), reference (Mode 2)
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const { listProjects } = await import('../lib/db');
        const projs = await listProjects();
        setModalProjects(projs);
        if (projs.length > 0 && !selectedProjId) {
          setSelectedProjId(projs[0].id);
        }
      } catch (err) {
        console.error("Failed to load projects for library:", err);
      }
    };
    if (isUploadModalOpen) {
      fetchProjects();
    }
  }, [isUploadModalOpen]);

  const handleOpenUploadModal = (type: 'character' | 'exterior' | 'prop', id: string) => {
    setModalTarget({ type, id });
    setModalTab(type);
    setIsUploadModalOpen(true);
  };

  const handleSelectLibraryImage = async (imageUrl: string, mediaId?: string, accountId?: string) => {
    if (!modalTarget) return;
    const { type, id } = modalTarget;
    try {
      if (uploadMode === 'replace') {
        if (type === 'character') {
          await addCharacter(id, imageUrl, mediaId, accountId);
        } else if (type === 'exterior') {
          await addExterior(id, imageUrl, mediaId, accountId);
        } else {
          await addProp(id, imageUrl, mediaId, accountId);
        }
      } else {
        await updateAssetInputImage(type, id, imageUrl, mediaId || null, accountId || null);
      }
      setIsUploadModalOpen(false);
      setModalTarget(null);
    } catch (err) {
      alert("Lỗi khi áp dụng ảnh tham chiếu: " + (err as Error).message);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !modalTarget) return;
    const file = e.target.files[0];
    setIsUploading(true);
    try {
      const res = await uploadImage(file);
      const mediaId = res.media_id;
      const accountId = (res as any).account_id || (res as any).accountId;
      const base64 = await fileToBase64(file);
      const { type, id } = modalTarget;

      if (uploadMode === 'replace') {
        if (type === 'character') {
          await addCharacter(id, base64, mediaId, accountId);
        } else if (type === 'exterior') {
          await addExterior(id, base64, mediaId, accountId);
        } else {
          await addProp(id, base64, mediaId, accountId);
        }
      } else {
        await updateAssetInputImage(type, id, base64, mediaId, accountId);
      }

      setIsUploadModalOpen(false);
      setModalTarget(null);
    } catch (err) {
      alert("Lỗi khi tải lên ảnh: " + (err as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClearInputImage = async (type: 'character' | 'exterior' | 'prop', id: string) => {
    try {
      await updateAssetInputImage(type, id, null, null);
    } catch (err) {
      console.error("Failed to clear input image:", err);
    }
  };

  // Find images in selected project for library tab
  const getSelectedProjectAssets = () => {
    const proj = modalProjects.find(p => p.id === selectedProjId);
    if (!proj) return [];
    if (modalTab === 'character') return proj.characters || [];
    if (modalTab === 'exterior') return proj.exteriors || [];
    if (modalTab === 'prop') return proj.props || [];
    return [];
  };

  const activeStyle = getSelectedStyle();
  const activeJob = batchJobs[`${currentProject.id}_asset`];
  const isGeneratingAssetsThisProject = activeJob?.isRunning || assetGeneratingIds.some(key => key.startsWith(`${currentProject.id || ''}_`));

  const [activeSubTab, setActiveSubTab] = useState<'characters' | 'exteriors' | 'props'>('characters');
  const [showAddForm, setShowAddForm] = useState(false);

  // Selection states
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  const [selectedExteriors, setSelectedExteriors] = useState<string[]>([]);
  const [selectedProps, setSelectedProps] = useState<string[]>([]);

  // Zoom Lightbox state
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  // System logs & server queue states
  const [isLogsExpanded, setIsLogsExpanded] = useState(false);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Input states
  const [characterId, setCharacterId] = useState('');
  const [characterFile, setCharacterFile] = useState<File | null>(null);
  const [charPreview, setCharPreview] = useState<string | null>(null);

  const [exteriorId, setExteriorId] = useState('');
  const [exteriorFile, setExteriorFile] = useState<File | null>(null);
  const [extPreview, setExtPreview] = useState<string | null>(null);

  const [propId, setPropId] = useState('');
  const [propFile, setPropFile] = useState<File | null>(null);
  const [propPreview, setPropPreview] = useState<string | null>(null);

  const [copiedText, setCopiedText] = useState(false);
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const getCharPrompt = (id: string) => {
    const name = id.trim() ? getDisplayName(id) : '{character_name}';
    const characterSuffix = activeStyle?.characterSuffix || 'modern colored manga anime style';
    return `Character Sheet of ${name}, 3-view reference sheet (front, side, back), full body, white background, modern present-day Japan (year 2026) realism, avoiding retro Shouwa-era appearance, grounded Japanese TV drama realism, ${characterSuffix}, [detailed physical description], modern fashionable Japanese clothing, restrained emotional presence, natural standing posture, neutral facial expression, realistic fabric folds, cinematic realism, production design reference sheet.`;
  };

  const getExtPrompt = (id: string) => {
    const name = id.trim() ? getDisplayName(id) : '{background_name}';
    const backgroundSuffix = activeStyle?.backgroundSuffix || 'modern colored manga anime style';
    return `Background layout sheet of ${name}, 4-camera-angle sheet showing 4 different viewpoints/angles (front, reverse, left side, right side) of the same scene in a 2x2 grid layout, empty scene, no people, modern present-day Japan (year 2026) apartment realism, contemporary metropolitan Japanese design, avoiding retro Shouwa-era aesthetics, ${backgroundSuffix}, [detailed environment description showing consistent furniture and layout across all 4 angles], realistic practical lighting, subtle emotional atmosphere, believable lived-in details, cinematic depth, production-ready environment design reference sheet.`;
  };

  const getPropPrompt = (id: string) => {
    const name = id.trim() ? getDisplayName(id) : '{prop_name}';
    const characterSuffix = activeStyle?.characterSuffix || 'modern colored manga anime style';
    return `Product layout sheet of ${name}, showing the item from multiple clean angles (front, side, isometric), isolated on a pure white background, modern present-day Japan design, avoiding retro appearance, ${characterSuffix}, [detailed prop description showing consistent colors, materials, and form], realistic textures, clean studio lighting, production design reference sheet.`;
  };

  const toggleSelectCharacter = (id: string) => {
    setSelectedCharacters((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const toggleSelectExterior = (id: string) => {
    setSelectedExteriors((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  const toggleSelectProp = (id: string) => {
    setSelectedProps((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleGenerateSingle = async (type: 'character' | 'exterior' | 'prop', id: string) => {
    try {
      await generateAssetImage(type, id);
    } catch (err) {
      alert('Tạo ảnh thất bại: ' + (err as Error).message);
    }
  };

  const handleGenerateSelected = async () => {
    if (selectedCharacters.length === 0 && selectedExteriors.length === 0 && selectedProps.length === 0) return;
    try {
      await generateAllAssetImages({
        characters: selectedCharacters,
        exteriors: selectedExteriors,
        props: selectedProps
      });
      setSelectedCharacters([]);
      setSelectedExteriors([]);
      setSelectedProps([]);
    } catch (err) {
      alert('Tạo ảnh thất bại: ' + (err as Error).message);
    }
  };

  const handleGenerateAll = async () => {
    if (confirm('Bạn có muốn tạo lại toàn bộ ảnh cho tất cả nhân vật, bối cảnh và đạo cụ không?')) {
      try {
        await generateAllAssetImages(undefined);
      } catch (err) {
        alert('Tạo ảnh thất bại: ' + (err as Error).message);
      }
    }
  };

  const handleGenerateUncreated = async () => {
    const uncreatedCharacters = (characters || []).filter(c => !c.image).map(c => c.characterId);
    const uncreatedExteriors = (exteriors || []).filter(e => !e.image).map(e => e.exteriorId);
    const uncreatedProps = (props || []).filter(p => !p.image).map(p => p.propId);

    const totalUncreated = uncreatedCharacters.length + uncreatedExteriors.length + uncreatedProps.length;
    if (totalUncreated === 0) {
      alert('Tất cả nhân vật, bối cảnh và đạo cụ đều đã có ảnh!');
      return;
    }

    try {
      await generateAllAssetImages({
        characters: uncreatedCharacters,
        exteriors: uncreatedExteriors,
        props: uncreatedProps
      });
    } catch (err) {
      alert('Tạo ảnh thất bại: ' + (err as Error).message);
    }
  };

  useEffect(() => {
    loadCharacters();
    loadExteriors();
    loadProps();
  }, [loadCharacters, loadExteriors, loadProps]);

  useEffect(() => {
    fetchServerQueueAndLogs();
    const interval = setInterval(() => {
      fetchServerQueueAndLogs();
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchServerQueueAndLogs]);

  useEffect(() => {
    if (isLogsExpanded && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [systemLogs, isLogsExpanded]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
    });
  };

  const handleCharacterFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCharacterFile(file);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setCharPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleExteriorFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setExteriorFile(file);

      const reader = new FileReader();
      reader.onloadend = () => {
        setExtPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePropFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPropFile(file);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setPropPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddCharacter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!characterId.trim()) {
      alert('Please enter a Character ID.');
      return;
    }
    if (!characterFile) {
      alert('Please select an image file.');
      return;
    }

    try {
      const base64 = await fileToBase64(characterFile);
      // character_id must be unique, check duplicate
      if (characters.some(c => c.characterId.toLowerCase() === characterId.trim().toLowerCase())) {
        alert('Character ID already exists.');
        return;
      }
      await addCharacter(characterId.trim().toLowerCase(), base64);
      // Reset
      setCharacterId('');
      setCharacterFile(null);
      setCharPreview(null);
    } catch (err) {
      alert('Failed to add character: ' + (err as Error).message);
    }
  };

  const handleAddExterior = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exteriorId.trim()) {
      alert('Please enter an Exterior ID.');
      return;
    }
    if (!exteriorFile) {
      alert('Please select an image file.');
      return;
    }

    try {
      const base64 = await fileToBase64(exteriorFile);
      if (exteriors.some(ext => ext.exteriorId.toLowerCase() === exteriorId.trim().toLowerCase())) {
        alert('Exterior ID already exists.');
        return;
      }
      await addExterior(exteriorId.trim().toLowerCase(), base64);
      setExteriorId('');
      setExteriorFile(null);
      setExtPreview(null);
    } catch (err) {
      alert('Failed to add exterior: ' + (err as Error).message);
    }
  };

  const handleAddProp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propId.trim()) {
      alert('Please enter a Prop ID.');
      return;
    }
    if (!propFile) {
      alert('Please select an image file.');
      return;
    }

    try {
      const base64 = await fileToBase64(propFile);
      if (props.some(p => p.propId.toLowerCase() === propId.trim().toLowerCase())) {
        alert('Prop ID already exists.');
        return;
      }
      await addProp(propId.trim().toLowerCase(), base64);
      setPropId('');
      setPropFile(null);
      setPropPreview(null);
    } catch (err) {
      alert('Failed to add prop: ' + (err as Error).message);
    }
  };

  const uncreatedCharactersCount = (characters || []).filter(c => !c.image).length;
  const uncreatedExteriorsCount = (exteriors || []).filter(e => !e.image).length;
  const uncreatedPropsCount = (props || []).filter(p => !p.image).length;
  const totalUncreated = uncreatedCharactersCount + uncreatedExteriorsCount + uncreatedPropsCount;

  return (
    <div className="space-y-6">
      {/* Sub tabs header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-900">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveSubTab('characters')}
            className={`flex items-center gap-2 text-sm font-semibold pb-2 border-b-2 transition cursor-pointer ${
              activeSubTab === 'characters'
                ? 'border-violet-500 text-violet-400'
                : 'border-transparent text-gray-400 hover:text-slate-200'
            }`}
          >
            <User className="w-4 h-4" />
            Character Reference
          </button>
          <button
            onClick={() => setActiveSubTab('exteriors')}
            className={`flex items-center gap-2 text-sm font-semibold pb-2 border-b-2 transition cursor-pointer ${
              activeSubTab === 'exteriors'
                ? 'border-fuchsia-500 text-fuchsia-400'
                : 'border-transparent text-gray-400 hover:text-slate-200'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            Exterior Reference
          </button>
          <button
            onClick={() => setActiveSubTab('props')}
            className={`flex items-center gap-2 text-sm font-semibold pb-2 border-b-2 transition cursor-pointer ${
              activeSubTab === 'props'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-gray-400 hover:text-slate-200'
            }`}
          >
            <Package className="w-4 h-4" />
            Prop Reference
          </button>
        </div>

        <p className="text-xs text-gray-500 hidden sm:block">
          Saved locally for export correlation. (Not sent to LLMs)
        </p>
      </div>

      {/* Settings & Batch Generation Toolbar */}
      <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-4 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Model:</span>
            <select
              value={imageGenConfig.model}
              onChange={(e) => setImageGenConfig({ model: e.target.value })}
              className="bg-slate-950 border border-gray-800 rounded px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-violet-500 cursor-pointer"
            >
              <option value="GEM_PIX_2">GEM_PIX_2 (Nano Banana Pro)</option>
              <option value="NARWHAL">NARWHAL</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Aspect Ratio:</span>
            <select
              value={imageGenConfig.aspectRatio}
              onChange={(e) => setImageGenConfig({ aspectRatio: e.target.value })}
              className="bg-slate-950 border border-gray-800 rounded px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-violet-500 cursor-pointer"
            >
              <option value="IMAGE_ASPECT_RATIO_LANDSCAPE">Landscape (16:9)</option>
              <option value="IMAGE_ASPECT_RATIO_PORTRAIT">Portrait (9:16)</option>
              <option value="IMAGE_ASPECT_RATIO_SQUARE">Square (1:1)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Số luồng:</span>
            <select
              value={imageGenConfig.concurrency}
              onChange={(e) => setImageGenConfig({ concurrency: Number(e.target.value) })}
              className="bg-slate-950 border border-gray-800 rounded px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-violet-500 cursor-pointer"
            >
              <option value={1}>1 Luồng</option>
              <option value={2}>2 Luồng</option>
              <option value={3}>3 Luồng</option>
              <option value={4}>4 Luồng</option>
              <option value={6}>6 Luồng</option>
              <option value={8}>8 Luồng</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Khoảng trễ:</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={300}
                value={imageGenConfig.delayTime !== undefined ? imageGenConfig.delayTime : 5}
                onChange={(e) => setImageGenConfig({ delayTime: Number(e.target.value) })}
                className="bg-slate-950 border border-gray-800 rounded px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-violet-500 w-16"
              />
              <span className="text-[10px] text-gray-500 font-medium select-none">giây</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-xs font-semibold transition active:scale-98 cursor-pointer select-none ${
              showAddForm
                ? 'bg-slate-800 border-gray-700 text-slate-200 hover:bg-slate-700'
                : 'bg-slate-950 border-gray-900 text-gray-400 hover:text-slate-200 hover:border-gray-800'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            Thêm thủ công
          </button>

          <button
            onClick={handleGenerateSelected}
            disabled={isGeneratingAssetsThisProject || (selectedCharacters.length === 0 && selectedExteriors.length === 0 && selectedProps.length === 0)}
            className="flex items-center gap-1.5 bg-violet-655 hover:bg-violet-600 disabled:bg-slate-800 disabled:text-gray-500 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition active:scale-98 cursor-pointer disabled:cursor-not-allowed"
          >
            {isGeneratingAssetsThisProject ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Tạo ảnh đã chọn ({selectedCharacters.length + selectedExteriors.length + selectedProps.length})
          </button>

          <button
            onClick={handleGenerateUncreated}
            disabled={isGeneratingAssetsThisProject || totalUncreated === 0}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-505 disabled:bg-slate-800 disabled:text-gray-500 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition active:scale-98 cursor-pointer disabled:cursor-not-allowed"
          >
            {isGeneratingAssetsThisProject ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Tạo chưa tạo ({totalUncreated})
          </button>

          <button
            onClick={handleGenerateAll}
            disabled={isGeneratingAssetsThisProject || (characters.length === 0 && exteriors.length === 0 && props.length === 0)}
            className="flex items-center gap-1.5 bg-fuchsia-655 hover:bg-fuchsia-600 disabled:bg-slate-800 disabled:text-gray-500 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition active:scale-98 cursor-pointer disabled:cursor-not-allowed"
          >
            {isGeneratingAssetsThisProject ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Tạo tất cả ({characters.length + exteriors.length + props.length})
          </button>

          {isGeneratingAssetsThisProject && (
            <button
              onClick={cancelAssetGeneration}
              className="flex items-center gap-1.5 bg-red-655 hover:bg-red-600 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg transition active:scale-98 cursor-pointer shadow-lg shadow-red-500/10"
              title="Dừng tiến trình vẽ ảnh hiện tại"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Dừng vẽ ảnh
            </button>
          )}
        </div>
      </div>

      {/* Batch progress */}
      {activeJob && activeJob.isRunning && (
        <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-4 animate-fadeIn space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold">
            <span className="text-violet-400 animate-pulse">Đang tiến hành vẽ ảnh tham chiếu hàng loạt...</span>
            <div className="flex items-center gap-3">
              <span className="text-gray-400 font-mono">
                Hoàn thành: {activeJob.completed.length} / {activeJob.tasks.length} {activeJob.failed.length > 0 && `(Lỗi: ${activeJob.failed.length})`}
              </span>
              <button
                onClick={cancelAssetGeneration}
                className="text-rose-400 hover:text-rose-300 font-bold px-2 py-0.5 border border-rose-950 hover:border-rose-900 rounded bg-rose-950/20 text-[9px] uppercase cursor-pointer"
              >
                Dừng vẽ
              </button>
            </div>
          </div>
          <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-gray-900">
            <div 
              className="bg-gradient-to-r from-violet-600 to-fuchsia-600 h-full rounded-full transition-all duration-300"
              style={{
                width: `${(activeJob.completed.length / activeJob.tasks.length) * 100}%`
              }}
            ></div>
          </div>
        </div>
      )}

      {activeSubTab === 'characters' ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {showAddForm && (
            <div className="lg:col-span-1 bg-slate-900/40 border border-slate-900 rounded-xl p-5 h-fit animate-in slide-in-from-left duration-200">
              <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-violet-400" />
                Add Character
              </h3>
              <form onSubmit={handleAddCharacter} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    Character ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. kenji, doctor"
                    value={characterId}
                    onChange={(e) => setCharacterId(e.target.value)}
                    className="w-full bg-slate-950 border border-gray-900 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500 transition"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Reference Image
                  </label>
                  <div className="relative border border-dashed border-gray-800 hover:border-violet-500/50 rounded-lg p-4 transition flex flex-col items-center justify-center bg-slate-950/60 cursor-pointer min-h-[140px]">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleCharacterFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    {charPreview ? (
                      <img
                        src={charPreview}
                        alt="Preview"
                        className="w-full h-32 object-cover rounded-lg"
                      />
                    ) : (
                      <div className="text-center space-y-2 text-gray-500 pointer-events-none">
                        <UploadCloud className="w-8 h-8 mx-auto text-gray-600" />
                        <span className="text-[10px] block">PNG, JPG, WEBP</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-lg border border-gray-900 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-gray-550 uppercase tracking-wider">
                      Character Prompt (3-View)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(getCharPrompt(characterId))}
                      className="text-[10px] text-violet-400 hover:text-violet-300 font-semibold transition cursor-pointer select-none"
                    >
                      {copiedText ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div className="text-[10px] text-gray-400 font-mono leading-relaxed bg-slate-905 p-2 rounded border border-gray-850 select-all max-h-[80px] overflow-y-auto break-words">
                    {getCharPrompt(characterId)}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold py-2 rounded-lg transition active:scale-98 cursor-pointer"
                >
                  Add Character Reference
                </button>
              </form>
            </div>
          )}

          <div className={showAddForm ? "lg:col-span-3 space-y-4" : "lg:col-span-4 space-y-4"}>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Character Directory ({characters.length})
            </h3>
            {characters.length === 0 ? (
              <div className="border border-dashed border-gray-900 rounded-xl py-16 text-center text-gray-600 text-xs">
                No character references added yet.
              </div>
            ) : (
              <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 ${showAddForm ? '' : 'lg:grid-cols-4'} gap-4`}>
                {characters.map((char) => {
                  const isGenerating = assetGeneratingIds.includes(`${currentProject.id || ''}_character_${char.characterId}`);
                  const isSelected = selectedCharacters.includes(char.characterId);
                  return (
                    <div
                      key={char.characterId}
                      className={`group bg-slate-900/40 border rounded-xl overflow-hidden relative flex flex-col shadow-sm transition-all duration-300 ${
                        isSelected ? 'border-violet-500 ring-1 ring-violet-500' : 'border-slate-900'
                      }`}
                    >
                      <div className="absolute top-2.5 left-2.5 z-20">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectCharacter(char.characterId)}
                          className="w-4 h-4 rounded border-gray-800 text-violet-650 bg-slate-950 focus:ring-violet-500 cursor-pointer"
                        />
                      </div>

                      <div className="aspect-square bg-slate-950 overflow-hidden relative flex items-center justify-center border-b border-gray-900">
                        {char.image ? (
                          <img
                            src={char.image}
                            alt={char.characterId}
                            onClick={() => setZoomedImage(char.image)}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300 cursor-zoom-in"
                          />
                        ) : (
                          <div className="text-center p-4 text-gray-600 flex flex-col items-center gap-2 select-none">
                            <User className="w-10 h-10 text-gray-700" />
                            <span className="text-[9px] uppercase tracking-wider font-semibold">No Image Uploaded</span>
                          </div>
                        )}
                        
                        <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition duration-200 z-20">
                          {char.image && (
                            <button
                              onClick={() => setZoomedImage(char.image)}
                              className="p-1.5 bg-black/60 hover:bg-slate-805 text-slate-300 hover:text-white rounded-lg border border-white/5 cursor-pointer"
                              title="Phóng to"
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => deleteCharacter(char.characterId)}
                            className="p-1.5 bg-black/60 hover:bg-red-950/80 text-slate-300 hover:text-red-400 rounded-lg border border-white/5 cursor-pointer"
                            title="Delete Reference"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="p-3.5 bg-slate-950/65 flex-1 flex flex-col justify-between gap-3">
                        <div className="space-y-2">
                          <div className="font-bold text-xs text-slate-200 truncate uppercase tracking-wide border-b border-gray-900/50 pb-1 flex items-center justify-between gap-1.5">
                            <span className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-violet-400" />
                              {getCardTitle(char.characterId)}
                            </span>
                            {char.mediaId && (
                              <span className="text-[8px] bg-violet-900/40 text-violet-300 px-1.5 py-0.5 rounded border border-violet-850 font-semibold uppercase tracking-wider">
                                API
                              </span>
                            )}
                          </div>
                          {(char.role || char.age || char.gender || char.personality) ? (
                            <div className="space-y-1 text-[10px] text-slate-400">
                              {char.role && (
                                <div><span className="text-gray-500 font-semibold uppercase text-[8px] tracking-wider block">Role</span> {char.role}</div>
                              )}
                              {(char.age || char.gender) && (
                                <div><span className="text-gray-500 font-semibold uppercase text-[8px] tracking-wider block">Demographics</span> {char.age || '?'}, {char.gender || '?'}</div>
                              )}
                              {char.personality && (
                                <div><span className="text-gray-500 font-semibold uppercase text-[8px] tracking-wider block">Personality</span> <p className="line-clamp-2 leading-relaxed">{char.personality}</p></div>
                              )}
                            </div>
                          ) : (
                            <div className="text-[9px] text-gray-655 italic">No details extracted. Add a reference image or generate below.</div>
                          )}

                          {/* Show media metadata if generated via API */}
                          {(char.mediaId || char.accountId) && (
                            <div className="bg-slate-950/90 border border-gray-900/85 rounded p-1.5 space-y-0.5 text-[9px] font-mono text-gray-500">
                              {char.mediaId && <div className="truncate" title={char.mediaId}>Media: {char.mediaId}</div>}
                              {char.accountId && <div className="truncate">Acc: {char.accountId}</div>}
                            </div>
                          )}
                          {char.inputImage && (
                            <div className="bg-slate-950/60 border border-slate-900 rounded p-1.5 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 overflow-hidden">
                                <img src={char.inputImage} alt="Input reference" className="w-7 h-7 object-cover rounded border border-gray-800" />
                                <span className="text-[9px] text-gray-400 truncate">Ảnh vẽ 3 mặt</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleClearInputImage('character', char.characterId)}
                                className="text-[9px] text-rose-400 hover:text-rose-300 font-semibold cursor-pointer border-0 bg-transparent"
                              >
                                Xóa
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-gray-900/50 flex flex-col gap-2">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleGenerateSingle('character', char.characterId)}
                              disabled={isGenerating || isGeneratingAssetsThisProject}
                              className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-gray-500 text-white text-[11px] font-semibold py-1.5 rounded-lg transition active:scale-98 cursor-pointer flex items-center justify-center gap-1.5 disabled:cursor-not-allowed"
                            >
                              {isGenerating ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Sparkles className="w-3.5 h-3.5" />
                              )}
                              Tạo ảnh
                            </button>
                            
                            <button
                              type="button"
                              onClick={() => handleOpenUploadModal('character', char.characterId)}
                              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold py-1.5 rounded-lg border border-slate-700 transition active:scale-98 cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <UploadCloud className="w-3.5 h-3.5" />
                              Tải lên
                            </button>
                          </div>
                          
                          <div className="space-y-1 mt-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-[8px] text-gray-550 font-bold uppercase tracking-wider">Prompt Sheet (3-View)</span>
                              <button
                                type="button"
                                onClick={() => handleCopy(char.prompt || '')}
                                className="text-[9px] text-violet-400 hover:text-violet-300 font-semibold transition cursor-pointer select-none"
                              >
                                {copiedText ? 'Copied!' : 'Copy'}
                              </button>
                            </div>
                            <textarea
                              value={char.prompt || ''}
                              onChange={(e) => updateCharacterPrompt(char.characterId, e.target.value)}
                              className="w-full bg-slate-950/80 border border-gray-900 rounded p-1.5 text-[9px] font-mono text-slate-350 focus:outline-none focus:border-violet-500 transition h-14 resize-none leading-relaxed"
                              placeholder="Nhập prompt nhân vật..."
                            />
                          </div>
                        </div>
                    </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : activeSubTab === 'exteriors' ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {showAddForm && (
            <div className="lg:col-span-1 bg-slate-900/40 border border-slate-900 rounded-xl p-5 h-fit animate-in slide-in-from-left duration-200">
              <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-fuchsia-400" />
                Add Exterior
              </h3>
              <form onSubmit={handleAddExterior} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    Exterior Background ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. apartment_livingroom"
                    value={exteriorId}
                    onChange={(e) => setExteriorId(e.target.value)}
                    className="w-full bg-slate-950 border border-gray-900 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-fuchsia-500 transition"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Reference Image
                  </label>
                  <div className="relative border border-dashed border-gray-800 hover:border-fuchsia-500/50 rounded-lg p-4 transition flex flex-col items-center justify-center bg-slate-950/60 cursor-pointer min-h-[140px]">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleExteriorFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    {extPreview ? (
                      <img
                        src={extPreview}
                        alt="Preview"
                        className="w-full h-32 object-cover rounded-lg"
                      />
                    ) : (
                      <div className="text-center space-y-2 text-gray-500 pointer-events-none">
                        <UploadCloud className="w-8 h-8 mx-auto text-gray-600" />
                        <span className="text-[10px] block">PNG, JPG, WEBP</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-lg border border-gray-900 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-gray-550 uppercase tracking-wider">
                      Background Prompt (4-Angle)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(getExtPrompt(exteriorId))}
                      className="text-[10px] text-fuchsia-400 hover:text-fuchsia-300 font-semibold transition cursor-pointer select-none"
                    >
                      {copiedText ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div className="text-[10px] text-gray-400 font-mono leading-relaxed bg-slate-905 p-2 rounded border border-gray-850 select-all max-h-[80px] overflow-y-auto break-words">
                    {getExtPrompt(exteriorId)}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-fuchsia-600 hover:bg-fuchsia-505 text-white text-xs font-semibold py-2 rounded-lg transition active:scale-98 cursor-pointer"
                >
                  Add Exterior Reference
                </button>
              </form>
            </div>
          )}

          <div className={showAddForm ? "lg:col-span-3 space-y-4" : "lg:col-span-4 space-y-4"}>
            <h3 className="text-xs font-semibold text-gray-555 uppercase tracking-wider">
              Background Directory ({exteriors.length})
            </h3>
            {exteriors.length === 0 ? (
              <div className="border border-dashed border-gray-900 rounded-xl py-16 text-center text-gray-600 text-xs">
                No exterior background references added yet.
              </div>
            ) : (
              <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 ${showAddForm ? '' : 'lg:grid-cols-4'} gap-4`}>
                {exteriors.map((ext) => {
                  const isGenerating = assetGeneratingIds.includes(`${currentProject.id || ''}_exterior_${ext.exteriorId}`);
                  const isSelected = selectedExteriors.includes(ext.exteriorId);
                  return (
                    <div
                      key={ext.exteriorId}
                      className={`group bg-slate-900/40 border rounded-xl overflow-hidden relative flex flex-col shadow-sm transition-all duration-300 ${
                        isSelected ? 'border-fuchsia-500 ring-1 ring-fuchsia-500' : 'border-slate-900'
                      }`}
                    >
                      <div className="absolute top-2.5 left-2.5 z-20">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectExterior(ext.exteriorId)}
                          className="w-4 h-4 rounded border-gray-800 text-fuchsia-605 bg-slate-950 focus:ring-fuchsia-505 cursor-pointer"
                        />
                      </div>

                      <div className="aspect-square bg-slate-950 overflow-hidden relative flex items-center justify-center border-b border-gray-900">
                        {ext.image ? (
                          <img
                            src={ext.image}
                            alt={ext.exteriorId}
                            onClick={() => setZoomedImage(ext.image)}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300 cursor-zoom-in"
                          />
                        ) : (
                          <div className="text-center p-4 text-gray-655 flex flex-col items-center gap-2 select-none">
                            <ImageIcon className="w-10 h-10 text-gray-700" />
                            <span className="text-[9px] uppercase tracking-wider font-semibold">No Image Uploaded</span>
                          </div>
                        )}
                        
                        <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition duration-200 z-20">
                          {ext.image && (
                            <button
                              onClick={() => setZoomedImage(ext.image)}
                              className="p-1.5 bg-black/60 hover:bg-slate-805 text-slate-300 hover:text-white rounded-lg border border-white/5 cursor-pointer"
                              title="Phóng to"
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => deleteExterior(ext.exteriorId)}
                            className="p-1.5 bg-black/60 hover:bg-red-955/80 text-slate-300 hover:text-red-400 rounded-lg border border-white/5 cursor-pointer"
                            title="Delete Reference"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="p-3.5 bg-slate-950/65 flex-1 flex flex-col justify-between gap-3">
                        <div className="space-y-2">
                          <div className="font-bold text-xs text-slate-200 truncate uppercase tracking-wide border-b border-gray-900/50 pb-1 flex items-center justify-between gap-1.5">
                            <span className="flex items-center gap-1.5">
                              <ImageIcon className="w-3.5 h-3.5 text-fuchsia-400" />
                              {getCardTitle(ext.exteriorId)}
                            </span>
                            {ext.mediaId && (
                              <span className="text-[8px] bg-fuchsia-900/40 text-fuchsia-300 px-1.5 py-0.5 rounded border border-fuchsia-850 font-semibold uppercase tracking-wider">
                                API
                              </span>
                            )}
                          </div>

                          {/* Show media metadata if generated via API */}
                          {(ext.mediaId || ext.accountId) && (
                            <div className="bg-slate-950/90 border border-gray-900/85 rounded p-1.5 space-y-0.5 text-[9px] font-mono text-gray-500">
                              {ext.mediaId && <div className="truncate" title={ext.mediaId}>Media: {ext.mediaId}</div>}
                              {ext.accountId && <div className="truncate">Acc: {ext.accountId}</div>}
                            </div>
                          )}
                          {ext.inputImage && (
                            <div className="bg-slate-950/60 border border-slate-900 rounded p-1.5 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 overflow-hidden">
                                <img src={ext.inputImage} alt="Input reference" className="w-7 h-7 object-cover rounded border border-gray-800" />
                                <span className="text-[9px] text-gray-400 truncate">Ảnh vẽ bối cảnh</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleClearInputImage('exterior', ext.exteriorId)}
                                className="text-[9px] text-rose-400 hover:text-rose-300 font-semibold cursor-pointer border-0 bg-transparent"
                              >
                                Xóa
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-gray-900/50 flex flex-col gap-2">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleGenerateSingle('exterior', ext.exteriorId)}
                              disabled={isGenerating || isGeneratingAssetsThisProject}
                              className="flex-1 bg-fuchsia-600 hover:bg-fuchsia-505 disabled:bg-slate-800 disabled:text-gray-500 text-white text-[11px] font-semibold py-1.5 rounded-lg transition active:scale-98 cursor-pointer flex items-center justify-center gap-1.5 disabled:cursor-not-allowed"
                            >
                              {isGenerating ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Sparkles className="w-3.5 h-3.5" />
                              )}
                              Tạo ảnh
                            </button>
                            
                            <button
                              type="button"
                              onClick={() => handleOpenUploadModal('exterior', ext.exteriorId)}
                              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold py-1.5 rounded-lg border border-slate-700 transition active:scale-98 cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <UploadCloud className="w-3.5 h-3.5" />
                              Tải lên
                            </button>
                          </div>
                          
                          <div className="space-y-1 mt-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-[8px] text-gray-555 font-bold uppercase tracking-wider">Prompt Sheet (4-Angle)</span>
                              <button
                                type="button"
                                onClick={() => handleCopy(ext.prompt || '')}
                                className="text-[9px] text-fuchsia-400 hover:text-fuchsia-300 font-semibold transition cursor-pointer select-none"
                              >
                                {copiedText ? 'Copied!' : 'Copy'}
                              </button>
                            </div>
                            <textarea
                              value={ext.prompt || ''}
                              onChange={(e) => updateExteriorPrompt(ext.exteriorId, e.target.value)}
                              className="w-full bg-slate-950/80 border border-gray-900 rounded p-1.5 text-[9px] font-mono text-slate-350 focus:outline-none focus:border-fuchsia-500 transition h-14 resize-none leading-relaxed"
                              placeholder="Nhập prompt bối cảnh..."
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {showAddForm && (
            <div className="lg:col-span-1 bg-slate-900/40 border border-slate-900 rounded-xl p-5 h-fit animate-in slide-in-from-left duration-200">
              <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-emerald-405" />
                Add Prop
              </h3>
              <form onSubmit={handleAddProp} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    Prop / Item ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. smartphone, car, notebook"
                    value={propId}
                    onChange={(e) => setPropId(e.target.value)}
                    className="w-full bg-slate-950 border border-gray-900 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Reference Image
                  </label>
                  <div className="relative border border-dashed border-gray-850 hover:border-emerald-500/50 rounded-lg p-4 transition flex flex-col items-center justify-center bg-slate-950/60 cursor-pointer min-h-[140px]">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePropFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    {propPreview ? (
                      <img
                        src={propPreview}
                        alt="Preview"
                        className="w-full h-32 object-cover rounded-lg"
                      />
                    ) : (
                      <div className="text-center space-y-2 text-gray-500 pointer-events-none">
                        <UploadCloud className="w-8 h-8 mx-auto text-gray-650" />
                        <span className="text-[10px] block">PNG, JPG, WEBP</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-lg border border-gray-900 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                      Prop Prompt (Multi-Angle)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(getPropPrompt(propId))}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold transition cursor-pointer select-none"
                    >
                      {copiedText ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div className="text-[10px] text-gray-400 font-mono leading-relaxed bg-slate-905 p-2 rounded border border-gray-850 select-all max-h-[80px] overflow-y-auto break-words">
                    {getPropPrompt(propId)}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-505 text-white text-xs font-semibold py-2 rounded-lg transition active:scale-98 cursor-pointer"
                >
                  Add Prop Reference
                </button>
              </form>
            </div>
          )}

          <div className={showAddForm ? "lg:col-span-3 space-y-4" : "lg:col-span-4 space-y-4"}>
            <h3 className="text-xs font-semibold text-gray-555 uppercase tracking-wider">
              Prop Directory ({props.length})
            </h3>
            {props.length === 0 ? (
              <div className="border border-dashed border-gray-900 rounded-xl py-16 text-center text-gray-600 text-xs">
                No prop references added yet.
              </div>
            ) : (
              <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 ${showAddForm ? '' : 'lg:grid-cols-4'} gap-4`}>
                {props.map((p) => {
                  const isGenerating = assetGeneratingIds.includes(`${currentProject.id || ''}_prop_${p.propId}`);
                  const isSelected = selectedProps.includes(p.propId);
                  return (
                    <div
                      key={p.propId}
                      className={`group bg-slate-900/40 border rounded-xl overflow-hidden relative flex flex-col shadow-sm transition-all duration-300 ${
                        isSelected ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-slate-900'
                      }`}
                    >
                      <div className="absolute top-2.5 left-2.5 z-20">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectProp(p.propId)}
                          className="w-4 h-4 rounded border-gray-800 text-emerald-600 bg-slate-950 focus:ring-emerald-500 cursor-pointer"
                        />
                      </div>

                      <div className="aspect-square bg-slate-950 overflow-hidden relative flex items-center justify-center border-b border-gray-900">
                        {p.image ? (
                          <img
                            src={p.image}
                            alt={p.propId}
                            onClick={() => setZoomedImage(p.image)}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300 cursor-zoom-in"
                          />
                        ) : (
                          <div className="text-center p-4 text-gray-655 flex flex-col items-center gap-2 select-none">
                            <Package className="w-10 h-10 text-gray-700" />
                            <span className="text-[9px] uppercase tracking-wider font-semibold">No Image Uploaded</span>
                          </div>
                        )}
                        
                        <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition duration-200 z-20">
                          {p.image && (
                            <button
                              onClick={() => setZoomedImage(p.image)}
                              className="p-1.5 bg-black/60 hover:bg-slate-805 text-slate-300 hover:text-white rounded-lg border border-white/5 cursor-pointer"
                              title="Phóng to"
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => deleteProp(p.propId)}
                            className="p-1.5 bg-black/60 hover:bg-red-955/80 text-slate-300 hover:text-red-400 rounded-lg border border-white/5 cursor-pointer"
                            title="Delete Reference"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="p-3.5 bg-slate-950/65 flex-1 flex flex-col justify-between gap-3">
                        <div className="space-y-2">
                          <div className="font-bold text-xs text-slate-200 truncate uppercase tracking-wide border-b border-gray-900/50 pb-1 flex items-center justify-between gap-1.5">
                            <span className="flex items-center gap-1.5">
                              <Package className="w-3.5 h-3.5 text-emerald-400" />
                              {getCardTitle(p.propId)}
                            </span>
                            {p.mediaId && (
                              <span className="text-[8px] bg-emerald-900/40 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-850 font-semibold uppercase tracking-wider">
                                API
                              </span>
                            )}
                          </div>

                          {/* Show media metadata if generated via API */}
                          {(p.mediaId || p.accountId) && (
                            <div className="bg-slate-950/90 border border-gray-900/85 rounded p-1.5 space-y-0.5 text-[9px] font-mono text-gray-500">
                              {p.mediaId && <div className="truncate" title={p.mediaId}>Media: {p.mediaId}</div>}
                              {p.accountId && <div className="truncate">Acc: {p.accountId}</div>}
                            </div>
                          )}
                          {p.inputImage && (
                            <div className="bg-slate-950/60 border border-slate-900 rounded p-1.5 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 overflow-hidden">
                                <img src={p.inputImage} alt="Input reference" className="w-7 h-7 object-cover rounded border border-gray-800" />
                                <span className="text-[9px] text-gray-400 truncate">Ảnh vẽ đạo cụ</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleClearInputImage('prop', p.propId)}
                                className="text-[9px] text-rose-400 hover:text-rose-300 font-semibold cursor-pointer border-0 bg-transparent"
                              >
                                Xóa
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-gray-900/50 flex flex-col gap-2">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleGenerateSingle('prop', p.propId)}
                              disabled={isGenerating || isGeneratingAssetsThisProject}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-505 disabled:bg-slate-800 disabled:text-gray-500 text-white text-[11px] font-semibold py-1.5 rounded-lg transition active:scale-98 cursor-pointer flex items-center justify-center gap-1.5 disabled:cursor-not-allowed"
                            >
                              {isGenerating ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Sparkles className="w-3.5 h-3.5" />
                              )}
                              Tạo ảnh
                            </button>
                            
                            <button
                              type="button"
                              onClick={() => handleOpenUploadModal('prop', p.propId)}
                              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold py-1.5 rounded-lg border border-slate-700 transition active:scale-98 cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <UploadCloud className="w-3.5 h-3.5" />
                              Tải lên
                            </button>
                          </div>
                          
                          <div className="space-y-1 mt-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-[8px] text-gray-555 font-bold uppercase tracking-wider">Prompt Sheet (Multi-Angle)</span>
                              <button
                                type="button"
                                onClick={() => handleCopy(p.prompt || '')}
                                className="text-[9px] text-emerald-400 hover:text-emerald-300 font-semibold transition cursor-pointer select-none"
                              >
                                {copiedText ? 'Copied!' : 'Copy'}
                              </button>
                            </div>
                            <textarea
                              value={p.prompt || ''}
                              onChange={(e) => updatePropPrompt(p.propId, e.target.value)}
                              className="w-full bg-slate-950/80 border border-gray-900 rounded p-1.5 text-[9px] font-mono text-slate-350 focus:outline-none focus:border-emerald-500 transition h-14 resize-none leading-relaxed"
                              placeholder="Nhập prompt đạo cụ..."
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fullscreen Lightbox Zoom Overlay */}
      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center cursor-zoom-out p-4 transition-all duration-300 ease-in-out"
        >
          <img
            src={zoomedImage}
            alt="Zoomed Reference"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-transform duration-300 scale-100"
          />
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
                            {item.assetType === 'character' ? 'Nhân vật' : 'Bối cảnh'}
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
                            {item.assetType === 'character' ? 'Nhân vật' : 'Bối cảnh'}
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

      {/* Reference Image Library Modal */}
      {isUploadModalOpen && modalTarget && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-gray-800 rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-scaleUp">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-855 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                  Thư viện ảnh tham chiếu
                </h3>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  Tải lên hoặc chọn ảnh tham chiếu cho {modalTarget.type === 'character' ? 'Nhân vật' : modalTarget.type === 'exterior' ? 'Bối cảnh' : 'Đạo cụ'}: <strong className="text-violet-400">{getCardTitle(modalTarget.id)}</strong>
                </p>
              </div>
              <button
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setModalTarget(null);
                }}
                className="text-gray-555 hover:text-slate-200 transition bg-transparent border-0 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Settings */}
            <div className="px-6 py-3 bg-slate-950/40 border-b border-gray-855 flex flex-wrap items-center justify-between gap-4">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Chế độ tải lên / sử dụng:
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setUploadMode('replace')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer select-none ${
                    uploadMode === 'replace'
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-800 text-gray-405 hover:text-slate-200'
                  }`}
                >
                  Chế độ 1: Thay thế ảnh hiện tại
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode('reference')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer select-none ${
                    uploadMode === 'reference'
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-800 text-gray-405 hover:text-slate-200'
                  }`}
                >
                  Chế độ 2: Làm ảnh tham chiếu để vẽ 3 mặt
                </button>
              </div>
            </div>

            {/* Modal Tabs */}
            <div className="px-6 py-2 bg-slate-955/25 border-b border-gray-855 flex gap-4">
              <button
                type="button"
                onClick={() => setModalTab('character')}
                className={`text-xs font-semibold pb-1.5 border-b-2 cursor-pointer transition ${
                  modalTab === 'character' ? 'border-violet-500 text-violet-400' : 'border-transparent text-gray-400 hover:text-slate-200'
                }`}
              >
                Nhân vật (Dự án)
              </button>
              <button
                type="button"
                onClick={() => setModalTab('exterior')}
                className={`text-xs font-semibold pb-1.5 border-b-2 cursor-pointer transition ${
                  modalTab === 'exterior' ? 'border-fuchsia-500 text-fuchsia-400' : 'border-transparent text-gray-400 hover:text-slate-200'
                }`}
              >
                Bối cảnh (Dự án)
              </button>
              <button
                type="button"
                onClick={() => setModalTab('prop')}
                className={`text-xs font-semibold pb-1.5 border-b-2 cursor-pointer transition ${
                  modalTab === 'prop' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-gray-400 hover:text-slate-200'
                }`}
              >
                Đạo cụ (Dự án)
              </button>
              <button
                type="button"
                onClick={() => setModalTab('pc')}
                className={`text-xs font-semibold pb-1.5 border-b-2 cursor-pointer transition ${
                  modalTab === 'pc' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-slate-200'
                }`}
              >
                Tải lên từ PC
              </button>
            </div>

            {/* Modal Content Area */}
            <div className="flex-1 overflow-y-auto p-6 min-h-[300px] max-h-[50vh]">
              {modalTab === 'pc' ? (
                <div className="h-full flex flex-col items-center justify-center">
                  {isUploading ? (
                    <div className="text-center space-y-3">
                      <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto" />
                      <p className="text-xs text-gray-400 font-semibold animate-pulse">
                        Đang tải ảnh lên API FLOW Google...
                      </p>
                    </div>
                  ) : (
                    <div className="relative border border-dashed border-gray-800 hover:border-blue-500/50 rounded-xl p-8 transition flex flex-col items-center justify-center bg-slate-950/40 cursor-pointer min-h-[200px] w-full max-w-md">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <UploadCloud className="w-12 h-12 text-gray-600 mb-3" />
                      <span className="text-xs font-bold text-slate-200">Kéo thả hoặc nhấn để chọn file ảnh</span>
                      <span className="text-[10px] text-gray-500 mt-1">Hỗ trợ PNG, JPG, WEBP</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Project selector */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-400">Chọn dự án nguồn:</span>
                    <select
                      value={selectedProjId}
                      onChange={(e) => setSelectedProjId(e.target.value)}
                      className="bg-slate-950 border border-gray-805 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-violet-500 cursor-pointer"
                    >
                      {modalProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Grid layout for images */}
                  {getSelectedProjectAssets().filter(asset => asset.image).length === 0 ? (
                    <div className="text-center text-gray-600 text-xs py-16">
                      Không tìm thấy ảnh tham chiếu nào trong dự án này.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3.5">
                      {getSelectedProjectAssets()
                        .filter((asset: any) => asset.image)
                        .map((asset: any, index) => {
                          const assetName = asset.characterId || asset.exteriorId || asset.propId || `Asset #${index + 1}`;
                          return (
                            <div
                              key={`${assetName}_${index}`}
                              onClick={() => handleSelectLibraryImage(asset.image, asset.mediaId, asset.accountId)}
                              className="group bg-slate-950 border border-gray-900 hover:border-violet-500 rounded-lg overflow-hidden relative cursor-pointer aspect-square transition shadow-sm"
                            >
                              <img
                                src={asset.image}
                                alt={assetName}
                                className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                              />
                              <div className="absolute inset-x-0 bottom-0 bg-black/60 p-1.5 text-[9px] text-gray-300 font-bold truncate text-center">
                                {getCardTitle(assetName)}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-gray-855 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setModalTarget(null);
                }}
                className="bg-slate-805 hover:bg-slate-750 text-slate-350 text-xs font-semibold px-4 py-2 rounded-lg transition cursor-pointer"
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
