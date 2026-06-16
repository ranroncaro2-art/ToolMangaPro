import React, { useState, useEffect, useRef } from 'react';

interface MenuBarProps {
  onSave: () => void;
  onExport: () => void;
}

interface MenuItem {
  label?: string;
  shortcut?: string;
  action?: () => void;
  role?: string;
  isSeparator?: boolean;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

export default function MenuBar({ onSave, onExport }: MenuBarProps) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const triggerWindowAction = (action: string) => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.sendWindowAction) {
      electronAPI.sendWindowAction(action);
    } else {
      console.warn(`Window action "${action}" is not supported in this environment.`);
    }
  };

  const menuSections: MenuSection[] = [
    {
      title: 'File',
      items: [
        {
          label: 'Lưu dự án (Save Project)',
          shortcut: 'Ctrl+S',
          action: onSave
        },
        {
          label: 'Xuất dự án (Export Project)',
          shortcut: 'Ctrl+E',
          action: onExport
        },
        { isSeparator: true },
        {
          label: 'Thoát (Exit)',
          shortcut: 'Alt+F4',
          action: () => triggerWindowAction('exit')
        }
      ]
    },
    {
      title: 'Edit',
      items: [
        {
          label: 'Hoàn tác (Undo)',
          shortcut: 'Ctrl+Z',
          action: () => {
            document.execCommand('undo');
          }
        },
        {
          label: 'Làm lại (Redo)',
          shortcut: 'Ctrl+Y',
          action: () => {
            document.execCommand('redo');
          }
        },
        { isSeparator: true },
        {
          label: 'Cắt (Cut)',
          shortcut: 'Ctrl+X',
          action: () => {
            document.execCommand('cut');
          }
        },
        {
          label: 'Sao chép (Copy)',
          shortcut: 'Ctrl+C',
          action: () => {
            document.execCommand('copy');
          }
        },
        {
          label: 'Dán (Paste)',
          shortcut: 'Ctrl+V',
          action: () => {
            navigator.clipboard.readText().then(text => {
              // Standard paste handled by focused element naturally,
              // but we provide visual feedback or execution.
            }).catch(() => {});
          }
        },
        {
          label: 'Chọn tất cả (Select All)',
          shortcut: 'Ctrl+A',
          action: () => {
            const activeEl = document.activeElement;
            if (activeEl && (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement)) {
              activeEl.select();
            }
          }
        }
      ]
    },
    {
      title: 'View',
      items: [
        {
          label: 'Reload',
          shortcut: 'Ctrl+R',
          action: () => triggerWindowAction('reload')
        },
        {
          label: 'Force Reload',
          shortcut: 'Ctrl+Shift+R',
          action: () => triggerWindowAction('reload')
        },
        {
          label: 'Toggle Developer Tools',
          shortcut: 'Ctrl+Shift+I',
          action: () => triggerWindowAction('toggle-devtools')
        },
        { isSeparator: true },
        {
          label: 'Actual Size',
          shortcut: 'Ctrl+0',
          action: () => {
            const webFrame = (window as any).webFrame;
            if (webFrame) webFrame.setZoomLevel(0);
          }
        },
        {
          label: 'Zoom In',
          shortcut: 'Ctrl++',
          action: () => {
            const webFrame = (window as any).webFrame;
            if (webFrame) {
              const current = webFrame.getZoomLevel();
              webFrame.setZoomLevel(current + 1);
            }
          }
        },
        {
          label: 'Zoom Out',
          shortcut: 'Ctrl+-',
          action: () => {
            const webFrame = (window as any).webFrame;
            if (webFrame) {
              const current = webFrame.getZoomLevel();
              webFrame.setZoomLevel(current - 1);
            }
          }
        },
        { isSeparator: true },
        {
          label: 'Toggle Full Screen',
          shortcut: 'F11',
          action: () => triggerWindowAction('toggle-fullscreen')
        }
      ]
    },
    {
      title: 'Window',
      items: [
        {
          label: 'Minimize',
          shortcut: 'Ctrl+M',
          action: () => triggerWindowAction('minimize')
        },
        {
          label: 'Close',
          shortcut: 'Ctrl+W',
          action: () => triggerWindowAction('close')
        }
      ]
    }
  ];

  const handleMenuHeaderClick = (title: string) => {
    if (activeMenu === title) {
      setActiveMenu(null);
    } else {
      setActiveMenu(title);
    }
  };

  const handleMenuHeaderMouseEnter = (title: string) => {
    if (activeMenu !== null) {
      setActiveMenu(title);
    }
  };

  return (
    <div
      ref={containerRef}
      className="bg-[#18181b] border-b border-[#27272a] h-9 px-4 flex items-center select-none text-xs font-medium text-slate-350 relative z-[9999] shrink-0"
    >
      <div className="flex items-center gap-1">
        {menuSections.map((section) => {
          const isOpen = activeMenu === section.title;
          return (
            <div key={section.title} className="relative">
              <button
                type="button"
                onClick={() => handleMenuHeaderClick(section.title)}
                onMouseEnter={() => handleMenuHeaderMouseEnter(section.title)}
                className={`px-3 py-1 rounded transition-colors duration-150 cursor-pointer ${
                  isOpen
                    ? 'bg-[#27272a] text-slate-100'
                    : 'hover:bg-[#27272a]/70 hover:text-slate-200'
                }`}
              >
                {section.title}
              </button>

              {isOpen && (
                <div className="absolute left-0 mt-1.5 w-64 bg-[#1f1f23] border border-[#2d2d30] rounded-lg shadow-2xl p-1 z-[10000] animate-in fade-in duration-100">
                  {section.items.map((item, index) => {
                    if (item.isSeparator) {
                      return <div key={`sep-${index}`} className="h-px bg-[#2d2d30] my-1" />;
                    }

                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          if (item.action) item.action();
                          setActiveMenu(null);
                        }}
                        className="w-full flex items-center justify-between px-3 py-1.5 text-left text-slate-300 hover:bg-[#2d2d30] hover:text-white rounded-md transition-colors duration-100 cursor-pointer"
                      >
                        <span className="text-[12px]">{item.label}</span>
                        {item.shortcut && (
                          <span className="text-[11px] text-zinc-500 font-mono tracking-wide pl-4">
                            {item.shortcut}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
