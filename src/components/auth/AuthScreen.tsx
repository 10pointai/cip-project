import React, { useState } from 'react';
import {
  Building2,
  Shield,
  KeyRound,
  Sparkles,
  Lock,
  User,
  ArrowRight,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Check,
  Copy,
  RefreshCw,
  Fuel,
  Truck,
  Layers,
  Palette,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { useToast } from '../common/Toast';
import { useM3Theme } from '../../design-system';
import { cloudStore as localDb } from '../../services/cloudStore';

export function AuthScreen() {
  const { login, setupPassword } = useAuth();
  const { showToast } = useToast();
  const { mode, toggleMode } = useM3Theme();
  const settings = localDb.getSettings();

  const [authMode, setAuthMode] = useState<'signin' | 'first_time_setup'>('signin');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sign In fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Setup fields
  const [setupUsername, setSetupUsername] = useState('');
  const [activationCode, setActivationCode] = useState('');
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

  // Copy helper
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast('Credentials copied to clipboard', 'info');
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError('Please provide your username and password.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await login(username.trim(), password);
      showToast(`Welcome back, ${res.user.fullName}!`, 'success');
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyUsername = async () => {
    if (!setupUsername.trim()) {
      setError('Please enter your unique system username (e.g., neha.adm5824).');
      return;
    }

    setIsVerifying(true);
    setError(null);
    try {
      const res = await api.verifySetup(setupUsername.trim());
      if (res.eligible && res.user) {
        setVerifiedUser(res.user);
        showToast(`Account verified for ${res.user.fullName}`, 'success');
      } else {
        setError('Account not found or already activated.');
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please check username.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSetupPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!setupUsername.trim()) {
      setError('System username is required.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-type carefully.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await setupPassword({
        username: setupUsername.trim(),
        password: newPassword,
        activationCode: activationCode.trim() || undefined,
      });
      showToast(`Password created! Welcome, ${res.user.fullName}.`, 'success');
    } catch (err: any) {
      setError(err.message || 'Account activation failed.');
    } finally {
      setIsLoading(false);
    }
  };



  return (
    <div className="min-h-screen w-full bg-[var(--color-surface)] text-[var(--color-on-surface)] flex flex-col justify-between relative overflow-x-hidden selection:bg-[var(--color-primary-container)] selection:text-[var(--color-on-primary-container)]">
      {/* Background Decorative Ambient Gradients (M3 Tone-aligned) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-35 dark:opacity-20">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-[var(--color-primary)] blur-3xl" />
        <div className="absolute top-1/2 -right-32 w-96 h-96 rounded-full bg-[var(--color-tertiary)] blur-3xl" />
        <div className="absolute -bottom-32 left-1/3 w-96 h-96 rounded-full bg-[var(--color-secondary)] blur-3xl" />
      </div>

      {/* Top Bar with Brand & Theme controls */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] flex items-center justify-center shadow-sm">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black tracking-tight text-base sm:text-lg text-[var(--color-on-surface)]">
                {settings.companyName}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]">
                ERP v2.4
              </span>
            </div>
            <p className="text-xs text-[var(--color-on-surface-variant)] hidden sm:block">
              {settings.tagline}
            </p>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-2 bg-[var(--color-surface-container-high)] border border-[var(--color-outline-variant)] rounded-full p-1.5 shadow-2xs">
          <button
            onClick={toggleMode}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-highest)] transition-colors"
            title="Toggle Dark / Light Theme"
          >
            {mode === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[11px]">Light Mode</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-slate-700" />
                <span className="text-[11px]">Dark Mode</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Center Card Stage */}
      <main className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 flex flex-col items-center justify-center flex-1">
        <div className="w-full max-w-md">
          {/* M3 Card Container */}
          <div className="bg-[var(--color-surface-container-lowest)] rounded-3xl border border-[var(--color-outline-variant)] shadow-xl overflow-hidden backdrop-blur-xs transition-all">
            {/* Header / Tabs */}
            <div className="p-6 sm:p-7 pb-4 text-center border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)]">
              <div className="inline-flex p-2 rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] mb-3">
                <Shield className="w-6 h-6 text-[var(--color-primary)]" />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-[var(--color-on-surface)] tracking-tight">
                Enterprise Operations Portal
              </h1>
              <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">
                Authorized access required for Plant, Fleet, & Ledger Management
              </p>

              {/* Mode Switcher Segmented Control */}
              <div className="mt-5 grid grid-cols-2 p-1 bg-[var(--color-surface-container)] rounded-full border border-[var(--color-outline-variant)]">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signin');
                    setError(null);
                  }}
                  className={`py-2 px-3 text-xs font-bold rounded-full transition-all flex items-center justify-center gap-1.5 ${
                    authMode === 'signin'
                      ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-xs'
                      : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('first_time_setup');
                    setError(null);
                  }}
                  className={`py-2 px-3 text-xs font-bold rounded-full transition-all flex items-center justify-center gap-1.5 ${
                    authMode === 'first_time_setup'
                      ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-xs'
                      : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>First-Time Setup</span>
                </button>
              </div>
            </div>

            {/* Error Notification */}
            {error && (
              <div className="mx-6 mt-5 p-3 rounded-2xl bg-[var(--color-error-container)]/80 border border-[var(--color-error)] text-[var(--color-on-error-container)] flex items-start gap-2.5 text-xs animate-fadeIn">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[var(--color-error)]" />
                <div className="flex-1">
                  <p className="font-semibold">{error}</p>
                </div>
              </div>
            )}

            {/* Tab 1: SIGN IN */}
            {authMode === 'signin' && (
              <form onSubmit={handleSignIn} className="p-6 sm:p-7 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface)] mb-1.5 uppercase tracking-wider">
                    System Username or Email
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-[var(--color-on-surface-variant)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. admin"
                      className="w-full pl-10 pr-3.5 py-2.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] rounded-xl text-sm text-[var(--color-on-surface)] outline-none transition-all font-mono"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setAuthMode('first_time_setup')}
                      className="text-[11px] font-semibold text-[var(--color-primary)] hover:underline"
                    >
                      New user? Setup password
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[var(--color-on-surface-variant)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-10 pr-10 py-2.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] rounded-xl text-sm text-[var(--color-on-surface)] outline-none transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-4 bg-[var(--color-primary)] hover:opacity-95 text-[var(--color-on-primary)] font-bold text-sm rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Authenticating with JWT...</span>
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

            {/* Tab 2: FIRST-TIME SETUP */}
            {authMode === 'first_time_setup' && (
              <form onSubmit={handleSetupPassword} className="p-6 sm:p-7 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface)] mb-1.5 uppercase tracking-wider">
                    Assigned System Username
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <User className="w-4 h-4 text-[var(--color-on-surface-variant)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        required
                        value={setupUsername}
                        onChange={(e) => {
                          setSetupUsername(e.target.value);
                          setVerifiedUser(null);
                        }}
                        placeholder="e.g. your username"
                        className="w-full pl-10 pr-3.5 py-2.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] rounded-xl text-sm text-[var(--color-on-surface)] outline-none font-mono"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleVerifyUsername}
                      disabled={isVerifying || !setupUsername.trim()}
                      className="px-3.5 py-2.5 bg-[var(--color-surface-container-high)] hover:bg-[var(--color-surface-container-highest)] border border-[var(--color-outline-variant)] text-xs font-bold text-[var(--color-on-surface)] rounded-xl transition-all disabled:opacity-50"
                    >
                      {isVerifying ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Verify'}
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-1">
                    Enter the unique username given to you by your Administrator.
                  </p>
                </div>

                {verifiedUser && (
                  <div className="p-3 rounded-xl bg-[var(--color-surface-container-high)] border border-[var(--color-outline-variant)] flex items-center justify-between gap-2 animate-fadeIn">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[var(--color-primary)]" />
                      <div>
                        <p className="text-xs font-bold text-[var(--color-on-surface)]">{verifiedUser.fullName}</p>
                        <p className="text-[10px] text-[var(--color-on-surface-variant)]">{verifiedUser.email}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]">
                      {verifiedUser.role}
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-[var(--color-on-surface)] mb-1.5 uppercase tracking-wider">
                    Activation Code (Optional)
                  </label>
                  <input
                    type="text"
                    value={activationCode}
                    onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
                    placeholder="e.g. ACT-8N3K9W"
                    className="w-full px-3.5 py-2.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] rounded-xl text-sm text-[var(--color-on-surface)] outline-none font-mono tracking-widest uppercase"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[var(--color-on-surface)] mb-1.5 uppercase tracking-wider">
                      Create Password
                    </label>
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min 8 chars"
                      className="w-full px-3.5 py-2.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] rounded-xl text-sm text-[var(--color-on-surface)] outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[var(--color-on-surface)] mb-1.5 uppercase tracking-wider">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-type password"
                      className="w-full px-3.5 py-2.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] rounded-xl text-sm text-[var(--color-on-surface)] outline-none font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-4 bg-[var(--color-primary)] hover:opacity-95 text-[var(--color-on-primary)] font-bold text-sm rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Activating Profile...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Activate & Sign In</span>
                    </>
                  )}
                </button>


              </form>
            )}

            {/* Card Footer Note */}
            <div className="px-6 py-3.5 bg-[var(--color-surface-container-low)] border-t border-[var(--color-outline-variant)] flex items-center justify-between text-[11px] text-[var(--color-on-surface-variant)]">
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                256-Bit Encrypted JWT Session
              </span>
              <span>Enterprise Operations Cloud Engine</span>
            </div>
          </div>
        </div>

        {/* Feature Highlights Grid Below Main Card */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl text-center">
          <div className="p-3 rounded-2xl bg-[var(--color-surface-container-low)] border border-[var(--color-outline-variant)]">
            <Fuel className="w-4 h-4 mx-auto mb-1 text-[var(--color-primary)]" />
            <p className="text-xs font-bold text-[var(--color-on-surface)]">Batching & Production</p>
            <p className="text-[10px] text-[var(--color-on-surface-variant)]">Real-time aggregate & bitumen consumption</p>
          </div>
          <div className="p-3 rounded-2xl bg-[var(--color-surface-container-low)] border border-[var(--color-outline-variant)]">
            <Truck className="w-4 h-4 mx-auto mb-1 text-[var(--color-secondary)]" />
            <p className="text-xs font-bold text-[var(--color-on-surface)]">Fleet & Trip Logistics</p>
            <p className="text-[10px] text-[var(--color-on-surface-variant)]">Dumpers, transit mixers & driver payroll</p>
          </div>
          <div className="p-3 rounded-2xl bg-[var(--color-surface-container-low)] border border-[var(--color-outline-variant)]">
            <Layers className="w-4 h-4 mx-auto mb-1 text-[var(--color-tertiary)]" />
            <p className="text-xs font-bold text-[var(--color-on-surface)]">Audited General Ledger</p>
            <p className="text-[10px] text-[var(--color-on-surface-variant)]">Cash/bank transfers & GST evidence repository</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full py-4 text-center text-xs text-[var(--color-on-surface-variant)] border-t border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)]">
        <p>© 2026 {settings.companyName}. All enterprise rights reserved.</p>
      </footer>
    </div>
  );
}
