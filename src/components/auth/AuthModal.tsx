import React, { useState } from 'react';
import {
  KeyRound,
  Shield,
  User,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowRight,
  Sparkles,
  Lock,
  Copy,
  Check,
  Building2,
  RefreshCw,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { useToast } from '../common/Toast';
import { cloudStore as localDb } from '../../services/cloudStore';

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  isMandatory?: boolean; // When true, prevents dismissing until signed in
}

export function AuthModal({ isOpen, onClose, isMandatory = false }: AuthModalProps) {
  const { login, setupPassword, currentUser } = useAuth();
  const { showToast } = useToast();
  const settings = localDb.getSettings();

  const [mode, setMode] = useState<'signin' | 'first_time_setup'>('signin');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sign in state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // First-time setup state
  const [setupUsername, setSetupUsername] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [codeRequired, setCodeRequired] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verifiedUser, setVerifiedUser] = useState<{
    id: string;
    fullName: string;
    username: string;
    email: string;
    role: string;
  } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  if (!isOpen) return null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!loginUsername.trim() || !loginPassword) {
      setError('Please provide both username and password.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await login(loginUsername.trim(), loginPassword);
      showToast(`Welcome back, ${res.user.fullName}!`, 'success');
      if (onClose) onClose();
    } catch (err: any) {
      const msg = err.message || 'Authentication failed.';
      setError(msg);
      // Check if message indicates account needs first-time setup
      if (msg.toLowerCase().includes('first-time') || msg.toLowerCase().includes('pending')) {
        setSetupUsername(loginUsername.trim());
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyUsername = async () => {
    if (!setupUsername.trim()) {
      setError('Please enter your unique system username.');
      return;
    }

    setError(null);
    setIsVerifying(true);
    try {
      const res = await api.verifySetup(setupUsername.trim());
      if (res.success && res.eligible) {
        setVerifiedUser(res.user);
        setCodeRequired(!!res.requiresActivationCode);
        showToast(`Account found: ${res.user.fullName} (${res.user.role})`, 'info');
      }
    } catch (err: any) {
      setVerifiedUser(null);
      setError(err.message || 'Invalid username for setup.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCompleteSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!setupUsername.trim()) {
      setError('Please enter your unique username.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (codeRequired && !activationCode.trim()) {
      setError('This account requires the activation code your administrator shared with your username.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await setupPassword({
        username: setupUsername.trim(),
        password: newPassword,
        activationCode: activationCode.trim() || undefined,
      });
      showToast(`Account activated! Welcome, ${res.user.fullName}.`, 'success');
      if (onClose) onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to complete password setup.');
    } finally {
      setIsLoading(false);
    }
  };



  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-[var(--color-surface)] text-[var(--color-on-surface)] rounded-3xl border border-[var(--color-outline-variant)] shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with M3 Primary brand styling */}
        <div className="bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-container)] p-6 text-[var(--color-on-primary)] relative overflow-hidden">
          <div className="flex items-center justify-between mb-3 relative z-10">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-[var(--color-on-primary)]/15 border border-[var(--color-on-primary)]/20 flex items-center justify-center shadow-inner">
                <Building2 className="w-5 h-5 text-[var(--color-on-primary)]" />
              </div>
              <div>
                <h3 className="font-extrabold text-base tracking-tight leading-tight">
                  {settings.companyName}
                </h3>
                <p className="text-xs text-[var(--color-on-primary)]/80 font-medium">
                  Enterprise Security & JWT Auth
                </p>
              </div>
            </div>

            {!isMandatory && onClose && (
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-[var(--color-on-primary)]/10 hover:bg-[var(--color-on-primary)]/20 flex items-center justify-center text-[var(--color-on-primary)] transition-all"
                aria-label="Close"
              >
                ✕
              </button>
            )}
          </div>

          <h2 className="text-xl font-bold tracking-tight mb-1 relative z-10">
            {mode === 'signin' ? 'Sign In to Operations' : 'Set Your Password'}
          </h2>
          <p className="text-xs text-[var(--color-on-primary)]/85 relative z-10">
            {mode === 'signin'
              ? 'Access real-time ERP, sales, inventory, and plant dispatch logs.'
              : 'Use your unique generated username to configure your password for the first time.'}
          </p>

          {/* Mode Tabs */}
          <div className="mt-4 flex bg-[var(--color-on-primary)]/15 p-1 rounded-xl relative z-10">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError(null);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                mode === 'signin'
                  ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-xs'
                  : 'text-[var(--color-on-primary)] hover:bg-[var(--color-on-primary)]/10'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('first_time_setup');
                setError(null);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                mode === 'first_time_setup'
                  ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-xs'
                  : 'text-[var(--color-on-primary)] hover:bg-[var(--color-on-primary)]/10'
              }`}
            >
              First-Time Setup
            </button>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto max-h-[75vh]">
          {error && (
            <div className="mb-4 p-3.5 rounded-2xl bg-[var(--color-error-container)] border border-[var(--color-error)]/30 text-[var(--color-on-error-container)] text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-[var(--color-error)] shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold">{error}</span>
                {error.includes('pending') && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('first_time_setup');
                      setSetupUsername(loginUsername);
                    }}
                    className="mt-1 block font-bold underline text-[var(--color-primary)] hover:opacity-80"
                  >
                    Click here to Set Password for {loginUsername}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* MODE 1: SIGN IN */}
          {mode === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--color-on-surface)] mb-1.5">
                  Unique Username or Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--color-on-surface-variant)]">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="e.g. admin or rahul.adm4819"
                    className="w-full pl-10 pr-4 py-2.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-2xl text-xs text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] transition-all font-medium"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-[var(--color-on-surface)]">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('first_time_setup');
                      setSetupUsername(loginUsername);
                    }}
                    className="text-[11px] text-[var(--color-primary)] hover:underline font-semibold"
                  >
                    First time user?
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--color-on-surface-variant)]">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-2xl text-xs text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] transition-all font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-[var(--color-primary)] hover:opacity-95 active:scale-98 text-[var(--color-on-primary)] font-bold text-xs rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to System</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>


            </form>
          )}

          {/* MODE 2: FIRST-TIME PASSWORD SETUP */}
          {mode === 'first_time_setup' && (
            <form onSubmit={handleCompleteSetup} className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-[var(--color-surface-container-high)] border border-[var(--color-outline-variant)]">
                <p className="text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                  🔑 First-Time Account Activation
                </p>
                <p className="text-[11px] text-[var(--color-on-surface-variant)]">
                  When an administrator provisions your account, a unique system username was generated for you (e.g. <span className="font-mono text-[var(--color-primary)] font-bold">username.role1234</span>). Enter it below to unlock and set your password.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-on-surface)] mb-1.5">
                  Unique Username
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--color-on-surface-variant)]">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      required
                      value={setupUsername}
                      onChange={(e) => {
                        setSetupUsername(e.target.value);
                        setVerifiedUser(null);
                        setCodeRequired(false);
                      }}
                      placeholder="e.g. neha.adm5824"
                      className="w-full pl-10 pr-4 py-2.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-2xl text-xs text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleVerifyUsername}
                    disabled={isVerifying || !setupUsername.trim()}
                    className="px-3.5 py-2.5 bg-[var(--color-secondary-container)] hover:bg-[var(--color-secondary-container)]/80 text-[var(--color-on-secondary-container)] font-bold text-xs rounded-2xl transition-all shrink-0 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isVerifying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    <span>Verify</span>
                  </button>
                </div>
              </div>

              {/* Verified Account Badge */}
              {verifiedUser && (
                <div className="p-3 rounded-2xl bg-[var(--color-success-container)] text-[var(--color-on-success-container)] border border-[var(--color-success)]/30 text-xs animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[var(--color-success)] shrink-0" />
                      <div>
                        <p className="font-bold">{verifiedUser.fullName}</p>
                        <p className="text-[11px] opacity-85">Role: <span className="uppercase font-semibold">{verifiedUser.role}</span> • {verifiedUser.email}</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-[var(--color-success)] text-[var(--color-on-success)] text-[10px] font-bold">
                      Ready to Setup
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[var(--color-on-surface)] mb-1.5">
                  {codeRequired ? 'Activation Code *' : 'Activation Code (optional / from admin invite)'}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--color-on-surface-variant)]">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required={codeRequired}
                    value={activationCode}
                    onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
                    placeholder="e.g. ACT-8N3K9W"
                    className={`w-full pl-10 pr-4 py-2 bg-[var(--color-surface-container)] border rounded-2xl text-xs text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] font-mono ${
                      codeRequired ? 'border-[var(--color-primary)]' : 'border-[var(--color-outline-variant)]'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-on-surface)] mb-1.5">
                  New Password (Minimum 6 Characters)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--color-on-surface-variant)]">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter your private password"
                    className="w-full pl-10 pr-10 py-2.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-2xl text-xs text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-on-surface)] mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--color-on-surface-variant)]">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password to verify"
                    className="w-full pl-10 pr-4 py-2.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-2xl text-xs text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] font-medium"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-[var(--color-primary)] hover:opacity-95 active:scale-98 text-[var(--color-on-primary)] font-bold text-xs rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Setting Password...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Set Password & Activate Account</span>
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setMode('signin')}
                  className="text-xs text-[var(--color-primary)] hover:underline font-semibold"
                >
                  ← Back to standard Sign In
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
