import React from 'react';
import { Layers, Database, ShieldCheck, Cpu, CheckCircle2 } from 'lucide-react';

export const HomePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">Weekly Report Generator</h1>
              <p className="text-xs text-slate-400">Team Dashboard &amp; Review Workflow</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
              Step 1: Scaffolding Ready
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-12 flex flex-col justify-center">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-4">
            System Initialized
          </div>
          <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-4">
            Weekly Report Generator &amp; <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Team Dashboard</span>
          </h2>
          <p className="text-slate-400 text-lg leading-relaxed">
            Full-stack polyglot architecture powered by React, Express, PostgreSQL, MongoDB, and Redis.
          </p>
        </div>

        {/* Architecture Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto w-full">
          {/* PostgreSQL Card */}
          <div className="glass-card p-6 rounded-2xl relative overflow-hidden group hover:border-indigo-500/40 transition-all duration-300">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-4">
              <Database className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">PostgreSQL 16</h3>
            <p className="text-xs text-indigo-400 font-mono mb-2">Relational Core</p>
            <p className="text-sm text-slate-400">
              Source of truth for identity, RBAC, project memberships, report headers, and review audit trail.
            </p>
          </div>

          {/* MongoDB Card */}
          <div className="glass-card p-6 rounded-2xl relative overflow-hidden group hover:border-emerald-500/40 transition-all duration-300">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4">
              <Cpu className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">MongoDB 7</h3>
            <p className="text-xs text-emerald-400 font-mono mb-2">Document Store</p>
            <p className="text-sm text-slate-400">
              Flexible report content, tasks, blockers, deliverables, and immutable version snapshots linked via UUID.
            </p>
          </div>

          {/* Redis Card */}
          <div className="glass-card p-6 rounded-2xl relative overflow-hidden group hover:border-rose-500/40 transition-all duration-300">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">Redis 7</h3>
            <p className="text-xs text-rose-400 font-mono mb-2">In-Memory Cache</p>
            <p className="text-sm text-slate-400">
              Ephemeral refresh token session storage and distributed login rate limiting.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        Weekly Report Generator &amp; Team Dashboard &bull; Scaffolded Phase 1
      </footer>
    </div>
  );
};
export default HomePage;
