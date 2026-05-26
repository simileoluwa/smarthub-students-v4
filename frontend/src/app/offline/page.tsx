'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { WifiOff, Database, ShieldAlert, CheckCircle, RefreshCw, ArrowLeft } from 'lucide-react';

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(false);
  const [recheckCount, setRecheckCount] = useState(0);

  useEffect(() => {
    // Set initial state
    setTimeout(() => {
      setIsOnline(navigator.onLine);
    }, 0);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleManualRecheck = () => {
    setRecheckCount(prev => prev + 1);
    setIsOnline(navigator.onLine);
    if (navigator.onLine) {
      window.location.href = '/';
    }
  };

  return (
    <div className="flex-1 w-full min-h-screen flex flex-col justify-center items-center px-6 py-12 relative bg-[#0A0A0A] text-white">
      {/* Background soft glowing accent */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full bg-indigo-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-[300px] h-[300px] rounded-full bg-amber-500/5 blur-[100px] pointer-events-none" />

      <div className="w-full max-w-lg flex flex-col items-center text-center z-10">
        
        {/* Animated Pulsing WifiOff Icon */}
        <div className="relative mb-8">
          <div className="w-24 h-24 rounded-full border border-neutral-800 bg-neutral-900/40 flex items-center justify-center relative shadow-2xl">
            <WifiOff className="w-10 h-10 text-amber-400 animate-pulse" />
          </div>
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500"></span>
          </span>
        </div>

        {/* Reassuring Headings */}
        <h1 
          className="text-2xl md:text-3xl font-extrabold tracking-tight mb-3 bg-gradient-to-r from-neutral-100 via-neutral-200 to-neutral-400 bg-clip-text text-transparent"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          Offline-First Resilience Active
        </h1>
        
        <p className="text-sm text-neutral-400 leading-relaxed max-w-md mb-8">
          Smart Student Hub has detected that your device is currently disconnected from the internet. **Do not panic!** This application was engineered specifically to survive Nigeria&apos;s electricity cutouts and data limits.
        </p>

        {/* Feature status grid */}
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 text-left">
          
          <div className="p-4 border border-neutral-900 bg-neutral-950/40 rounded-xl flex gap-3 hover:border-neutral-800 transition-colors">
            <Database className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-200">Local Persistence</h3>
              <p className="text-[11px] text-neutral-400 mt-1">
                Your grades, target credits, and profiles continue to save securely in local IndexedDB.
              </p>
            </div>
          </div>

          <div className="p-4 border border-neutral-900 bg-neutral-950/40 rounded-xl flex gap-3 hover:border-neutral-800 transition-colors">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-200">Reviews & Decks</h3>
              <p className="text-[11px] text-neutral-400 mt-1">
                You can practice your flashcard review decks. Intervals continue scheduling with zero issues.
              </p>
            </div>
          </div>

          <div className="p-4 border border-neutral-900 bg-neutral-950/40 rounded-xl flex gap-3 hover:border-neutral-800 transition-colors md:col-span-2">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-200">Reconciliation Outbox Queued</h3>
              <p className="text-[11px] text-neutral-400 mt-1">
                All modifications are logged locally in a secure Write-Ahead Log outbox. Your device will automatically synchronize everything to Supabase as soon as cellular data or internet connection is restored.
              </p>
            </div>
          </div>

        </div>

        {/* Live Network Status Indicator */}
        <div className="flex items-center gap-3 px-4 py-2 border border-neutral-900 bg-neutral-950/60 rounded-full text-xs font-semibold text-neutral-300 mb-8 select-none">
          <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          <span>Status: {isOnline ? 'Internet connection detected!' : 'Isolated / Disconnected'}</span>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row gap-3 w-full self-stretch justify-center">
          
          <button
            onClick={handleManualRecheck}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 text-white font-semibold text-sm rounded-lg hover:bg-indigo-500 cursor-pointer transition-colors focus-visible:outline-none"
          >
            <RefreshCw className={`w-4 h-4 ${recheckCount > 0 ? 'animate-spin' : ''}`} />
            Check Connection Again
          </button>

          <Link
            href="/cgpa"
            className="flex items-center justify-center gap-2 px-6 py-2.5 border border-neutral-850 hover:border-neutral-700 bg-neutral-900/40 text-neutral-300 font-semibold text-sm rounded-lg hover:text-white transition-all focus-visible:outline-none"
          >
            <ArrowLeft className="w-4 h-4" />
            Go to CGPA Sandbox
          </Link>
          
        </div>

      </div>
    </div>
  );
}
