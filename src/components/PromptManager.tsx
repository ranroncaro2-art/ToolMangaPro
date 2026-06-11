import React, { useState } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { Save, RotateCcw, Copy, Check } from 'lucide-react';

export default function PromptManager() {
  const {
    sceneMappingPrompt,
    imagePromptPrompt,
    updatePromptTemplate,
    resetPromptTemplates
  } = useProjectStore();

  const [localScenePrompt, setLocalScenePrompt] = useState(sceneMappingPrompt);
  const [localImagePrompt, setLocalImagePrompt] = useState(imagePromptPrompt);
  
  const [copiedScene, setCopiedScene] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);

  React.useEffect(() => {
    setLocalScenePrompt(sceneMappingPrompt);
  }, [sceneMappingPrompt]);

  React.useEffect(() => {
    setLocalImagePrompt(imagePromptPrompt);
  }, [imagePromptPrompt]);

  const handleSaveScene = () => {
    updatePromptTemplate('scene', localScenePrompt);
    alert('Scene Mapping Prompt saved successfully!');
  };

  const handleSaveImage = () => {
    updatePromptTemplate('image', localImagePrompt);
    alert('Image Prompt Prompt saved successfully!');
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset both templates to system defaults?')) {
      resetPromptTemplates();
    }
  };

  const handleCopy = (text: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDuplicate = (type: 'scene' | 'image') => {
    if (type === 'scene') {
      const duplicated = `${localScenePrompt}\n\n# DUPLICATE COPY\n[Add adjustments here]`;
      setLocalScenePrompt(duplicated);
      updatePromptTemplate('scene', duplicated);
      alert('Scene Mapping Prompt duplicated (modified clone appended)!');
    } else {
      const duplicated = `${localImagePrompt}\n\n# DUPLICATE COPY\n[Add adjustments here]`;
      setLocalImagePrompt(duplicated);
      updatePromptTemplate('image', duplicated);
      alert('Image Prompt Prompt duplicated (modified clone appended)!');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Controls */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-900">
        <div>
          <h2 className="text-xl font-bold text-slate-200">System Prompt Manager</h2>
          <p className="text-xs text-gray-500 mt-1">
            Customize the system instructions sent to AI models for Scene Mapping and Image Prompt generation.
          </p>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 text-xs bg-slate-900 hover:bg-slate-800 border border-gray-800 hover:border-gray-700 text-gray-400 hover:text-slate-200 px-3 py-1.5 rounded-lg transition cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset All Defaults
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scene Mapping Prompt Card */}
        <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 flex flex-col h-[550px]">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div>
              <span className="text-xs font-semibold text-violet-400 uppercase tracking-widest">Step 1 Template</span>
              <h3 className="font-semibold text-slate-200 text-sm mt-0.5">Scene Mapping Prompt</h3>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleCopy(localScenePrompt, setCopiedScene)}
                className="p-2 rounded bg-slate-950 border border-slate-900 hover:border-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                title="Copy Prompt"
              >
                {copiedScene ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                onClick={() => handleDuplicate('scene')}
                className="px-2.5 py-1.5 rounded bg-slate-950 border border-slate-900 hover:border-slate-800 text-xs text-slate-400 hover:text-slate-200 transition cursor-pointer"
                title="Duplicate Template"
              >
                Duplicate
              </button>
            </div>
          </div>

          <textarea
            value={localScenePrompt}
            onChange={(e) => setLocalScenePrompt(e.target.value)}
            className="flex-1 w-full bg-slate-950/80 border border-slate-900 rounded-lg p-4 text-xs font-mono text-slate-300 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition resize-none leading-relaxed"
          />

          <div className="mt-4 pt-3 border-t border-slate-950 flex justify-end shrink-0">
            <button
              onClick={handleSaveScene}
              className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white font-medium px-4 py-2 rounded-lg text-xs transition cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              Save Scene Prompt
            </button>
          </div>
        </div>

        {/* Image Prompt Prompt Card */}
        <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 flex flex-col h-[550px]">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div>
              <span className="text-xs font-semibold text-fuchsia-400 uppercase tracking-widest">Step 2 Template</span>
              <h3 className="font-semibold text-slate-200 text-sm mt-0.5">Image & Motion Prompt Prompt</h3>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleCopy(localImagePrompt, setCopiedImage)}
                className="p-2 rounded bg-slate-950 border border-slate-900 hover:border-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                title="Copy Prompt"
              >
                {copiedImage ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                onClick={() => handleDuplicate('image')}
                className="px-2.5 py-1.5 rounded bg-slate-950 border border-slate-900 hover:border-slate-800 text-xs text-slate-400 hover:text-slate-200 transition cursor-pointer"
                title="Duplicate Template"
              >
                Duplicate
              </button>
            </div>
          </div>

          <textarea
            value={localImagePrompt}
            onChange={(e) => setLocalImagePrompt(e.target.value)}
            className="flex-1 w-full bg-slate-950/80 border border-slate-900 rounded-lg p-4 text-xs font-mono text-slate-300 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition resize-none leading-relaxed"
          />

          <div className="mt-4 pt-3 border-t border-slate-950 flex justify-end shrink-0">
            <button
              onClick={handleSaveImage}
              className="flex items-center gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-505 text-white font-medium px-4 py-2 rounded-lg text-xs transition cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              Save Image Prompt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
