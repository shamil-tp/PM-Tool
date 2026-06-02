import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Zap, AlertTriangle, Mail, Lock, User as UserIcon, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { buildOAuthRedirectUrl, setRedirectToAfterAuth } from '../../core/auth/postAuthRedirect';

function getErrorParam(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('error');
}

export function Login() {
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'options' | 'local_login' | 'local_register'>('options');
  const [loading, setLoading] = useState(false);

  // Form states
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');

  useEffect(() => {
    const err = getErrorParam();
    if (err === 'uninvited') {
      setError('Your account is not invited. Ask your admin to invite you.');
      supabase.auth.signOut().catch(console.error);
    }
  }, []);

  const handleGoogleLogin = async () => {
    const returnPath = window.location.pathname === '/login' ? '/overview' : window.location.pathname;
    setRedirectToAfterAuth(returnPath);

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: buildOAuthRedirectUrl(),
      },
    });
    if (signInError) console.error('Auth error:', signInError);
  };

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');

      localStorage.setItem('local_access_token', data.accessToken);
      localStorage.setItem('local_refresh_token', data.refreshToken);
      localStorage.setItem('local_user', JSON.stringify(data.user));
      window.location.href = '/overview';
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLocalRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, full_name: fullName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');

      localStorage.setItem('local_access_token', data.accessToken);
      localStorage.setItem('local_refresh_token', data.refreshToken);
      localStorage.setItem('local_user', JSON.stringify(data.user));
      window.location.href = '/overview';
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6 relative overflow-hidden font-geist">
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px' }}>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md pm-card p-10 relative z-10 bg-[var(--pm-surface)] shadow-2xl border border-[var(--pm-border)] rounded-2xl"
      >
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 bg-[var(--pm-surface-elevated)]/5 border border-border flex items-center justify-center rounded-xl mb-6 p-2 shadow-sm">
            <img src="/logo.png" alt="Resolve PM" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mb-2 text-[var(--pm-on-surface)]">RESOLVE PM</h1>
          <p className="text-xs uppercase tracking-widest text-[var(--pm-primary)]">Standalone Access</p>
        </div>

        {error && mode === 'options' && (
          <div className="flex flex-col gap-4 p-5 rounded-xl border border-red-500/20 bg-red-500/5 text-center mb-6">
            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <h2 className="text-base font-semibold text-white">Access Denied</h2>
            <p className="text-[13px] text-white/70 leading-relaxed">
              {error}
            </p>
          </div>
        )}

        <AnimatePresence mode="wait">
          {mode === 'options' && (
            <motion.div
              key="options"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              <button
                onClick={() => setMode('local_login')}
                className="w-full rounded-xl h-12 flex items-center justify-center gap-3 font-semibold text-sm transition-all active:scale-[0.98] border border-[var(--pm-border)] bg-[var(--pm-surface-elevated)] hover:bg-[var(--pm-surface-hover)] text-white"
              >
                <UserIcon className="w-4 h-4 text-[var(--pm-primary)]" />
                Sign In with Email / Username
              </button>
              
              <button
                onClick={() => setMode('local_register')}
                className="w-full rounded-xl h-12 flex items-center justify-center gap-3 font-semibold text-sm transition-all active:scale-[0.98] border border-[var(--pm-border)] bg-[var(--pm-surface-elevated)] hover:bg-[var(--pm-surface-hover)] text-white"
              >
                <ArrowRight className="w-4 h-4 text-[var(--pm-primary)]" />
                Create Local Account
              </button>

              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[var(--pm-border)]"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-[var(--pm-surface)] px-2 text-[var(--pm-on-surface-variant)] uppercase tracking-wider">OR</span>
                </div>
              </div>

              <button
                onClick={handleGoogleLogin}
                className="w-full rounded-xl h-12 flex items-center justify-center gap-3 font-semibold uppercase tracking-wide text-xs transition-all active:scale-[0.98] shadow-sm hover:shadow-md bg-[var(--pm-primary)] text-white"
              >
                <Zap className="w-4 h-4" />
                Sign In with Google
              </button>
            </motion.div>
          )}

          {mode === 'local_login' && (
            <motion.form
              key="local_login"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              onSubmit={handleLocalLogin}
              className="space-y-4"
            >
              {error && <div className="text-red-400 text-sm text-center bg-red-500/10 p-2 rounded">{error}</div>}
              <div>
                <label className="block text-xs uppercase tracking-wider text-[var(--pm-on-surface-variant)] mb-2">Username or Email</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--pm-on-surface-variant)]" />
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full bg-[var(--pm-surface-lowest)] border border-[var(--pm-border)] rounded-lg py-2.5 pl-10 pr-4 text-white focus:outline-none focus:border-[var(--pm-primary)] transition-colors text-sm"
                    placeholder="Enter your identifier"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-[var(--pm-on-surface-variant)] mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--pm-on-surface-variant)]" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-[var(--pm-surface-lowest)] border border-[var(--pm-border)] rounded-lg py-2.5 pl-10 pr-4 text-white focus:outline-none focus:border-[var(--pm-primary)] transition-colors text-sm"
                    placeholder="Enter your password"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl h-11 mt-2 flex items-center justify-center gap-2 font-semibold text-sm transition-all active:scale-[0.98] shadow-sm bg-[var(--pm-primary)] text-white disabled:opacity-50"
              >
                {loading ? 'Authenticating...' : 'Sign In'}
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => { setMode('options'); setError(null); }}
                className="w-full text-center text-xs text-[var(--pm-on-surface-variant)] hover:text-white transition-colors mt-4"
              >
                &larr; Back to options
              </button>
            </motion.form>
          )}

          {mode === 'local_register' && (
            <motion.form
              key="local_register"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              onSubmit={handleLocalRegister}
              className="space-y-4"
            >
              {error && <div className="text-red-400 text-sm text-center bg-red-500/10 p-2 rounded">{error}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--pm-on-surface-variant)] mb-1.5">Username</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-[var(--pm-surface-lowest)] border border-[var(--pm-border)] rounded-lg py-2 px-3 text-white focus:outline-none focus:border-[var(--pm-primary)] transition-colors text-sm"
                    placeholder="e.g. jdoe"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--pm-on-surface-variant)] mb-1.5">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-[var(--pm-surface-lowest)] border border-[var(--pm-border)] rounded-lg py-2 px-3 text-white focus:outline-none focus:border-[var(--pm-primary)] transition-colors text-sm"
                    placeholder="John Doe"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[var(--pm-on-surface-variant)] mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--pm-on-surface-variant)]" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-[var(--pm-surface-lowest)] border border-[var(--pm-border)] rounded-lg py-2 pl-9 pr-3 text-white focus:outline-none focus:border-[var(--pm-primary)] transition-colors text-sm"
                    placeholder="john@organization.com"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[var(--pm-on-surface-variant)] mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--pm-on-surface-variant)]" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-[var(--pm-surface-lowest)] border border-[var(--pm-border)] rounded-lg py-2 pl-9 pr-3 text-white focus:outline-none focus:border-[var(--pm-primary)] transition-colors text-sm"
                    placeholder="Choose a strong password"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl h-11 mt-4 flex items-center justify-center gap-2 font-semibold text-sm transition-all active:scale-[0.98] shadow-sm bg-[var(--pm-primary)] text-white disabled:opacity-50"
              >
                {loading ? 'Creating Account...' : 'Register'}
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => { setMode('options'); setError(null); }}
                className="w-full text-center text-xs text-[var(--pm-on-surface-variant)] hover:text-white transition-colors mt-3"
              >
                &larr; Back to options
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
