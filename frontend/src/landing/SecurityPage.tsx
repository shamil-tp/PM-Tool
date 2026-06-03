import React from 'react';

export function SecurityPage() {
  return (
    <div className="min-h-screen bg-surface-container-lowest text-on-surface font-sans">
      <header className="w-full h-16 flex items-center px-6 lg:px-12 border-b border-[var(--pm-border)] dark:border-white/10 sticky top-0 bg-surface-container-lowest/80 backdrop-blur-md z-50">
        <a href="/" className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
            <span className="text-on-primary font-bold text-xs">R</span>
          </div>
          <span className="font-semibold tracking-tight">Resolve PM</span>
        </a>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 lg:py-24 space-y-8">
        <div>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Security Overview</h1>
          <p className="text-on-surface-variant font-mono text-sm opacity-80">Effective Date: May 28, 2026</p>
        </div>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Encryption in Transit</h2>
          <p className="text-on-surface-variant leading-relaxed">
            All data moving between your browser, our Vercel-hosted infrastructure{import.meta.env.VITE_ENABLE_GOOGLE_OAUTH !== 'false' && ', and Google APIs'} is encrypted using industry-standard TLS.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Identity Isolation</h2>
          <p className="text-on-surface-variant leading-relaxed">
            We use strict identity-first security boundaries; a user's calendar data is only accessible to their own authenticated session.
          </p>
        </section>

        {import.meta.env.VITE_ENABLE_GOOGLE_OAUTH !== 'false' && (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">OAuth Protection</h2>
            <p className="text-on-surface-variant leading-relaxed">
              We never store your Google password. Access is managed through secure OAuth 2.0 tokens which can be revoked by the user at any time.
            </p>
          </section>
        )}

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Minimalist Data Retention</h2>
          <p className="text-on-surface-variant leading-relaxed">
            We only retain the minimum necessary metadata required to maintain your project sync, reducing the surface area for potential data risks.
          </p>
        </section>
      </main>

      <footer className="w-full py-8 px-6 lg:px-12 flex flex-col md:flex-row justify-between items-center border-t border-[var(--pm-border)] dark:border-white/5 mt-12">
        <div className="flex flex-col items-center md:items-start gap-2 mb-6 md:mb-0">
          <span className="font-semibold text-on-surface">Resolve PM</span>
          <p className="text-sm text-on-surface-variant opacity-60">© 2026 Resolve PM. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
