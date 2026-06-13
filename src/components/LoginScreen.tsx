"use client";

import React, { useState, useEffect } from 'react';
import { Mail, Lock, Cpu, ShieldAlert, CheckCircle, ArrowRight, Loader2, Info, Eye, EyeOff, Copy, Check } from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: (deployLink: string) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [macAddress, setMacAddress] = useState('Đang lấy MAC...');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [copied, setCopied] = useState(false);

  // Hardcoded secure API endpoint
  const apiEndpoint = 'https://script.google.com/macros/s/AKfycbx0hbnhKtbENSTCO5qUOj02vcf4qy8Z7LFKXvsYUpbE9p-pg1zF9_n6GRZuMLgRwQk/exec';

  // States
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load MAC Address and saved configs on mount
  useEffect(() => {
    const savedUsername = localStorage.getItem('login_saved_username');
    if (savedUsername) {
      setUsername(savedUsername);
    }

    const fetchMac = async () => {
      try {
        if (typeof window !== 'undefined' && (window as any).electronAPI?.getMacAddress) {
          const mac = await (window as any).electronAPI.getMacAddress();
          setMacAddress(mac);
        } else {
          // Fallback for development inside web browsers
          setMacAddress('DEV-MOCK-MAC-ADDRESS');
        }
      } catch (err) {
        console.error('Failed to get MAC address:', err);
        setMacAddress('ERROR-FETCHING-MAC');
      }
    };

    fetchMac();
  }, []);

  const copyToClipboard = () => {
    if (macAddress === 'Đang lấy MAC...' || macAddress === 'ERROR-FETCHING-MAC') return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(macAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMsg('Vui lòng nhập đầy đủ Tài khoản/Gmail và Mật khẩu.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // Build the request payload
      const payload = {
        username: username.trim(),
        password: password.trim(),
        mac: macAddress
      };

      // Call Google Apps Script Web App directly (CORS is bypassed via Electron webSecurity: false)
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8', // Prevents preflight request block
        },
        body: JSON.stringify(payload),
        redirect: 'follow'
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        setSuccessMsg(result.message || 'Đăng nhập thành công!');
        
        // Remember username if checked
        if (rememberMe) {
          localStorage.setItem('login_saved_username', username);
        } else {
          localStorage.removeItem('login_saved_username');
        }

        const isValidAbsoluteUrl = (url: any): boolean => {
          if (!url) return false;
          const cleaned = String(url).trim().toLowerCase();
          if (cleaned === '' || cleaned === 'undefined' || cleaned === 'null' || cleaned === '/') return false;
          return cleaned.startsWith('http://') || cleaned.startsWith('https://');
        };

        // Save session credentials
        localStorage.setItem('login_session_active', 'true');
        localStorage.setItem('login_session_user', username);
        localStorage.setItem('login_session_mac', macAddress);
        if (result.deploy_link && isValidAbsoluteUrl(result.deploy_link)) {
          localStorage.setItem('login_deploy_link', result.deploy_link);
        } else {
          localStorage.removeItem('login_deploy_link');
        }

        // Delay slightly for transition animation
        setTimeout(() => {
          onLoginSuccess(result.deploy_link && isValidAbsoluteUrl(result.deploy_link) ? result.deploy_link : '');
        }, 1200);
      } else {
        setErrorMsg(result.message || 'Sai thông tin tài khoản hoặc thiết bị chưa được cấp quyền.');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setErrorMsg(`Không thể kết nối đến máy chủ xác thực. Chi tiết: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#070b13] relative overflow-hidden px-4 select-none">
      {/* Background neon glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-violet-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-pink-600/10 blur-[120px] pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md glass-panel rounded-2xl border border-slate-800/80 shadow-2xl relative z-10 overflow-hidden transition-all duration-300">
        
        {/* Content Box */}
        <div className="p-8">
          
          {/* Header Branding */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-violet-600 to-fuchsia-600 shadow-lg shadow-violet-500/20 mb-4 animate-pulse-soft">
              <Cpu className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent tracking-wide">
              TOOL MANGA ANIME PRO
            </h2>
            <p className="text-xs text-slate-400 mt-1.5 uppercase tracking-widest font-semibold">
              Hệ thống kích hoạt thiết bị
            </p>
          </div>

          {/* Main Login Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            
            {/* Alert Status Info */}
            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex gap-3 items-start animate-shake">
                <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <span className="text-xs text-red-200/90 leading-relaxed">{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex gap-3 items-start animate-fadeIn">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-xs text-emerald-200/90 leading-relaxed">{successMsg}</span>
              </div>
            )}

            {/* Username Input */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Tài khoản / Gmail
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-4.5 h-4.5" />
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                  className="w-full bg-slate-900/60 border border-slate-800/80 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/50 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-200 outline-none transition-all placeholder:text-slate-600 disabled:opacity-50"
                  placeholder="nguyenvan@gmail.com"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Mật khẩu đăng nhập
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4.5 h-4.5" />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="w-full bg-slate-900/60 border border-slate-800/80 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/50 rounded-xl pl-10 pr-10 py-3 text-sm text-slate-200 outline-none transition-all placeholder:text-slate-600 disabled:opacity-50"
                  placeholder="••••••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors duration-150 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* MAC Address Display (Read-only Device Verification with Copy button) */}
            <div className="bg-slate-950/60 border border-slate-850/80 rounded-xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center border border-slate-800 text-violet-400">
                  <Cpu className="w-4.5 h-4.5" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Mã thiết bị (MAC Address)
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-xs font-mono text-slate-300 font-semibold tracking-wide">
                      {macAddress}
                    </p>
                    {macAddress !== 'Đang lấy MAC...' && macAddress !== 'ERROR-FETCHING-MAC' && (
                      <button
                        type="button"
                        onClick={copyToClipboard}
                        className="p-1 text-slate-500 hover:text-violet-400 hover:bg-slate-900/50 rounded transition-all duration-150 cursor-pointer"
                        title="Sao chép mã thiết bị"
                      >
                        {copied ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400 animate-pulse-soft" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 font-semibold uppercase tracking-wider">
                Locked
              </div>
            </div>

            {/* Remember and extra controls */}
            <div className="flex items-center justify-between py-1 text-xs">
              <label className="flex items-center gap-2 text-slate-400 hover:text-slate-300 transition-colors cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={loading}
                  className="rounded border-slate-800 bg-slate-900 text-violet-600 focus:ring-violet-500 focus:ring-offset-slate-950 cursor-pointer"
                />
                Ghi nhớ tài khoản
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white rounded-xl py-3.5 font-bold text-sm tracking-wide shadow-lg shadow-violet-600/15 hover:shadow-violet-600/25 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  Đang xác thực hệ thống...
                </>
              ) : (
                <>
                  Đăng nhập hệ thống
                  <ArrowRight className="w-4.5 h-4.5" />
                </>
              )}
            </button>
          </form>

          {/* Footer Info / Support */}
          <div className="mt-8 pt-5 border-t border-slate-900 text-center">
            <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5 leading-normal">
              <Info className="w-3.5 h-3.5 shrink-0 text-slate-600" />
              Thiết bị của bạn sẽ tự động liên kết khi đăng nhập lần đầu.
            </p>
          </div>

        </div>
      </div>
      
      {/* Visual Animation Styles */}
      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-4px); }
          40%, 80% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
