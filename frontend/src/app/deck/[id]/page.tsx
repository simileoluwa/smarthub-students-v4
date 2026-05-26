'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  BookOpen, 
  Download, 
  CheckCircle, 
  AlertTriangle, 
  Sparkles, 
  HelpCircle, 
  Eye, 
  EyeOff, 
  Layers 
} from 'lucide-react';
import { decodeDeckPayload, importSharedDeck, SharedDeckPayload } from '../../../lib/whatsapp';
import { useAcademicStore } from '../../../store/useAcademicStore';

export default function DeckImportPage() {
  const params = useParams();
  const router = useRouter();
  const { initializeStore } = useAcademicStore();
  
  // States
  const [deck, setDeck] = useState<SharedDeckPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLightMode, setIsLightMode] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const [flippedCards, setFlippedCards] = useState<Record<number, boolean>>({});

  // 1. Hydrate theme preferences
  useEffect(() => {
    const isLight = document.documentElement.classList.contains('light-mode');
    setTimeout(() => {
      setIsLightMode(isLight);
    }, 0);
  }, []);

  const toggleTheme = () => {
    const nextMode = !isLightMode;
    setIsLightMode(nextMode);
    if (nextMode) {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
  };

  // 2. Decode the Base64 dynamic payload on mount
  useEffect(() => {
    const hash = params?.id as string;
    if (!hash) {
      setError('No shared deck key was provided in the link.');
      return;
    }

    try {
      const decoded = decodeDeckPayload(hash);
      if (!decoded || !decoded.courseCode || !Array.isArray(decoded.cards)) {
        setError('The shared deck payload appears to be corrupted or invalid.');
        return;
      }
      setDeck(decoded);
    } catch (err) {
      console.error('Decoding shared deck failed:', err);
      setError('Unable to decode the shared deck link. Please ensure you copied the entire URL.');
    }
  }, [params]);

  // 3. Handle Deck Import Trigger
  const handleImport = async () => {
    if (!deck) return;
    setImporting(true);
    
    try {
      // Transactional IndexedDB & WAL outbox write
      await importSharedDeck(deck);
      
      // Hydrate local Zustand store in-memory arrays immediately
      await initializeStore();
      
      setImportSuccess(true);
      
      // Elegant delayed navigation to landing dashboard for micro-animations to settle
      setTimeout(() => {
        router.push('/');
      }, 2000);
    } catch (err) {
      console.error('Import failed:', err);
      setError('An unexpected storage error occurred during importing. Please try again.');
      setImporting(false);
    }
  };

  // Toggle card flip visual
  const toggleFlip = (index: number) => {
    setFlippedCards(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  // Helper to color diff labels
  const getDifficultyColor = (diff: 'easy' | 'medium' | 'hard') => {
    switch (diff) {
      case 'easy': return 'text-emerald-400 border-emerald-500/20 bg-emerald-950/20';
      case 'medium': return 'text-blue-400 border-blue-500/20 bg-blue-950/20';
      case 'hard': return 'text-red-400 border-red-500/20 bg-red-950/20';
    }
  };

  // Error layout fallback
  if (error) {
    return (
      <div className="flex-1 w-full flex flex-col justify-center items-center max-w-md mx-auto px-6 py-16 text-center">
        <div className="p-4 border border-red-500/20 bg-red-950/10 rounded-full mb-6">
          <AlertTriangle className="w-12 h-12 text-red-400 animate-pulse" />
        </div>
        <h1 className="text-xl font-bold tracking-tight mb-2">Import Link Invalid</h1>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-8">
          {error}
        </p>
        <Link 
          href="/" 
          className="w-full py-3 bg-[var(--surface)] border border-[var(--border)] text-sm font-semibold rounded-xl text-[var(--text)] hover:text-white hover:border-neutral-500 transition-colors text-center focus-visible:outline-none"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  // Loading state
  if (!deck) {
    return (
      <div className="flex-1 w-full flex flex-col justify-center items-center py-24 text-center">
        <div className="w-12 h-12 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin mb-4" />
        <p className="text-sm text-[var(--text-secondary)] font-semibold tracking-wider uppercase">
          Rehydrating Study Brief...
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full flex flex-col max-w-5xl mx-auto px-4 py-8 relative">
      {/* Top Header */}
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <Link 
            href="/"
            className="p-2 border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors hover:bg-[var(--surface)] focus-visible:outline-none"
            aria-label="Back to home"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <span className="text-[10px] text-indigo-400 font-extrabold uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> Shared Study Deck
            </span>
            <h1 className="text-xl font-bold tracking-tight mt-0.5" style={{ fontFamily: 'var(--font-heading)' }}>
              Peer-to-Peer Import
            </h1>
          </div>
        </div>

        <button
          onClick={toggleTheme}
          className="p-2.5 border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors hover:bg-[var(--surface)] cursor-pointer focus-visible:outline-none"
          aria-label="Toggle Theme"
        >
          {isLightMode ? '🌙' : '☀️'}
        </button>
      </header>

      {/* Main Preview Container */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Left Side: Deck info and import actions */}
        <section className="lg:col-span-1 p-6 border border-[var(--border)] bg-[var(--surface)] rounded-2xl flex flex-col relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-indigo-400" />
          
          <div className="flex items-center gap-2 mb-4">
            <span className="p-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-lg">
              <Layers className="w-5 h-5" />
            </span>
            <div>
              <span className="block text-xs font-semibold text-[var(--text-secondary)]">Course Code</span>
              <h2 className="text-xl font-extrabold tracking-tight text-white uppercase">{deck.courseCode}</h2>
            </div>
          </div>

          <div className="space-y-4 mb-8">
            <div>
              <span className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Course Title</span>
              <p className="text-sm font-medium leading-snug">{deck.courseTitle}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-[var(--border)] pt-4">
              <div>
                <span className="block text-xs font-semibold text-[var(--text-secondary)]">Total Cards</span>
                <span className="text-lg font-bold">{deck.cards.length} Cards</span>
              </div>
              <div>
                <span className="block text-xs font-semibold text-[var(--text-secondary)]">Credit Units</span>
                <span className="text-lg font-bold">{deck.creditUnits} Units</span>
              </div>
            </div>
          </div>

          {/* Import Button */}
          {importSuccess ? (
            <div className="w-full py-4 border border-emerald-500/20 bg-emerald-950/20 text-emerald-400 font-bold rounded-xl flex items-center justify-center gap-2.5 text-sm animate-bounce">
              <CheckCircle className="w-5 h-5 animate-spin" />
              <span>Imported Successfully! Redirecting...</span>
            </div>
          ) : (
            <button
              onClick={handleImport}
              disabled={importing}
              className={`w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all duration-300 flex items-center justify-center gap-2.5 cursor-pointer shadow-lg shadow-indigo-600/15 focus-visible:outline-none ${
                importing ? 'opacity-85 cursor-not-allowed' : ''
              }`}
            >
              {importing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Writing to IndexedDB...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Import Deck to Workspace</span>
                </>
              )}
            </button>
          )}

          <p className="text-[10px] text-[var(--text-secondary)] text-center mt-3 leading-normal">
            No internet required. Importing is completed 100% locally and written instantly to your browser storage outbox queue.
          </p>
        </section>

        {/* Right Side: Flashcard interactive previews */}
        <main className="lg:col-span-2 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              <span>Flashcard Preview ({deck.cards.length})</span>
            </h3>
            <span className="text-xs text-[var(--text-secondary)] font-semibold">
              Click cards to flip and preview back contents
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {deck.cards.map((card, idx) => {
              const isFlipped = !!flippedCards[idx];

              return (
                <div 
                  key={idx}
                  onClick={() => toggleFlip(idx)}
                  className="min-h-[160px] border border-[var(--border)] bg-[var(--surface)] rounded-xl p-5 flex flex-col justify-between cursor-pointer transition-all duration-300 hover:border-neutral-700 hover:shadow-xl relative overflow-hidden select-none"
                >
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-xs font-semibold text-[var(--text-secondary)]">
                      Card #{idx + 1}
                    </span>
                    <span className={`px-2 py-0.5 border text-[10px] font-bold rounded-full uppercase ${getDifficultyColor(card.difficulty)}`}>
                      {card.difficulty}
                    </span>
                  </div>

                  {/* Card Content display */}
                  <div className="flex-1 flex items-center justify-center text-center px-2 py-2">
                    <p className="text-sm font-medium leading-relaxed">
                      {isFlipped ? card.backContent : card.frontContent}
                    </p>
                  </div>

                  <div className="flex justify-between items-center mt-3 border-t border-[var(--border)]/40 pt-2.5 text-[10px] text-[var(--text-secondary)] font-semibold">
                    <span className="flex items-center gap-1 text-indigo-400">
                      {isFlipped ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>Showing Answer</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>Showing Question</span>
                        </>
                      )}
                    </span>
                    <span>Click to flip</span>
                  </div>
                </div>
              );
            })}
          </div>
        </main>

      </div>
    </div>
  );
}
