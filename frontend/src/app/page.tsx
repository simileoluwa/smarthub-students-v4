'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '../lib/db';

// Testimonials Data
const TESTIMONIALS = [
  {
    quote: "During the last 5-month strike, I froze my semester on the app. When we resumed, the engine compressed my spaced repetition items into a 6-week sprint. Ended up clearing PHY201 with an A.",
    avatar: "EO",
    name: "Emmanuel O.",
    meta: "Computer Science, UNILAG"
  },
  {
    quote: "Calculating CGPA with carry-overs was a complete nightmare because my faculty counts both the failed unit and the repeated unit. This engine computed it mathematically down to two decimal places.",
    avatar: "CA",
    name: "Chidinma A.",
    meta: "Mechanical Engineering, UI"
  },
  {
    quote: "Offline capability is the killer feature here. We have extreme electricity cuts in my hostel, so I study in total isolation. Everything registers instantly on IndexedDB, and syncs to Supabase when I get network.",
    avatar: "TB",
    name: "Tunde B.",
    meta: "Medicine, OAU"
  }
];

export default function Home() {
  const router = useRouter();
  const [isLightMode, setIsLightMode] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isModalActive, setIsModalActive] = useState(false);
  const [scrollWidth, setScrollWidth] = useState('0%');
  const [isStickyCtaActive, setIsStickyCtaActive] = useState(false);

  // Form State
  const [fullName, setFullName] = useState('');
  const [university, setUniversity] = useState('');
  const [gradingScale, setGradingScale] = useState('5.0_WITH_E');

  // Ref to handle focus restore
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  // 1. Handle Scrolling Effects (Throttled for Performance)
  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout | null = null;
    
    const handleScroll = () => {
      if (!scrollTimeout) {
        scrollTimeout = setTimeout(() => {
          const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
          const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
          const scrolled = (winScroll / height) * 100;
          setScrollWidth(`${scrolled}%`);

          // Toggle sticky CTA bar
          if (winScroll > 300) {
            setIsStickyCtaActive(true);
          } else {
            setIsStickyCtaActive(false);
          }
          scrollTimeout = null;
        }, 15);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 2. Handle Scroll Reveals via IntersectionObserver
  useEffect(() => {
    const revealElements = document.querySelectorAll('.reveal-on-scroll');
    
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setTimeout(() => {
              entry.target.classList.add('visible');
            }, 50);
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15 });

      revealElements.forEach(el => observer.observe(el));
      return () => observer.disconnect();
    } else {
      revealElements.forEach(el => el.classList.add('visible'));
    }
  }, []);

  // 3. Theme Toggling Handler
  const toggleTheme = () => {
    const nextMode = !isLightMode;
    setIsLightMode(nextMode);
    if (nextMode) {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
  };

  // 4. Modal Open/Close handlers
  const openModal = (e: React.MouseEvent<HTMLButtonElement>) => {
    triggerButtonRef.current = e.currentTarget; // Save trigger button
    setIsModalActive(true);
    document.body.style.overflow = 'hidden'; // Lock body scroll
    setTimeout(() => {
      if (firstInputRef.current) firstInputRef.current.focus();
    }, 100);
  };

  const closeModal = () => {
    setIsModalActive(false);
    document.body.style.overflow = 'auto'; // Unlock body scroll
    if (triggerButtonRef.current) triggerButtonRef.current.focus(); // Restore focus
  };

  // Close modal on Escape Key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalActive) {
        closeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalActive]);

  // Testimonials navigation helpers
  const nextSlide = () => {
    setCurrentSlide((prev) => (prev === TESTIMONIALS.length - 1 ? 0 : prev + 1));
  };
  const prevSlide = () => {
    setCurrentSlide((prev) => (prev === 0 ? TESTIMONIALS.length - 1 : prev - 1));
  };

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const profileId = crypto.randomUUID?.() || Math.random().toString(36).substring(2);
    const profileData = {
      id: profileId,
      email: 'guest@smarthub.io',
      fullName,
      universityName: university,
      gradingScale: gradingScale as any,
      currentLevel: 100,
      strikeModeActive: false,
      localCreatedAt: new Date().toISOString(),
      localUpdatedAt: new Date().toISOString(),
      syncStatus: 'pending_insert' as const,
      clientVersion: 1
    };

    // Save to localStorage for synchronous header/greetings reading
    localStorage.setItem('smarthub_profile', JSON.stringify({
      id: profileId,
      fullName,
      university,
      gradingScale,
      onboardedAt: new Date().toISOString()
    }));

    try {
      // Save to Dexie IndexedDB
      await db.profiles.put(profileData);
    } catch (err) {
      console.warn("Could not save to Dexie database, using localStorage fallback:", err);
    }

    closeModal();
    router.push('/dashboard');
  };

  return (
    <>
      {/* Scroll Reading Progress Indicator */}
      <div 
        className="reading-progress-bar" 
        style={{ width: scrollWidth }} 
        aria-hidden="true"
      ></div>

      {/* Header Sticky Navigation */}
      <header className="sticky top-0 bg-[#0A0A0A]/85 backdrop-blur-md border-b border-[#333] z-50 transition-colors duration-300 light-mode:bg-white/85 light-mode:border-[#E2E8F0] dark:bg-black/85">
        <div className="flex justify-between items-center max-w-[1200px] mx-auto px-8 py-4">
          <a href="#" className="flex items-center gap-2 text-xl font-bold tracking-tight text-white dark:text-white light-mode:text-[#1E293B]" aria-label="Smart Student Hub Logo Home">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: '#10B981' }}>
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
              <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/>
            </svg>
            <span>SmartStudent<span style={{ color: '#10B981' }}>Hub</span></span>
          </a>
          
          <nav className="flex items-center gap-8" aria-label="Main Navigation">
            <a href="#features" className="text-[0.95rem] font-medium text-[#A3A3A3] hover:text-white transition-colors light-mode:text-[#64748B] light-mode:hover:text-[#1E293B]">Features</a>
            <a href="#testimonials" className="text-[0.95rem] font-medium text-[#A3A3A3] hover:text-white transition-colors light-mode:text-[#64748B] light-mode:hover:text-[#1E293B]">Reviews</a>
            <a href="#shimmer-demo" className="text-[0.95rem] font-medium text-[#A3A3A3] hover:text-white transition-colors light-mode:text-[#64748B] light-mode:hover:text-[#1E293B]">PWA Cache</a>
            
            <button 
              onClick={toggleTheme} 
              className="flex items-center justify-center w-11 h-11 bg-[#1A1A1A] border border-[#333] rounded-lg cursor-pointer transition-all hover:border-[#A3A3A3] hover:scale-105 light-mode:bg-[#F8FAFC] light-mode:border-[#E2E8F0] light-mode:hover:border-[#64748B]"
              aria-label="Toggle light or dark interface theme"
            >
              {isLightMode ? (
                <svg className="text-[#F59E0B]" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4"/>
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
                </svg>
              ) : (
                <svg className="text-white" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
                </svg>
              )}
            </button>
            
            <button 
              onClick={openModal} 
              className="px-5 py-2.5 bg-[#6366F1] text-white font-semibold rounded-lg cursor-pointer hover:bg-[#4F46E5] hover:-translate-y-0.5 transition-all min-h-[44px]"
            >
              Open Hub
            </button>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="max-w-[1200px] mx-auto px-8 py-24 grid grid-cols-1 md:grid-cols-[1.2fr_1fr] gap-16 items-center" aria-label="Introduction hero section">
          <div className="flex flex-col gap-6">
            <div className="self-start px-3.5 py-1.5 bg-[#6366F1]/15 border border-[#6366F1] text-[#6366F1] text-xs font-semibold tracking-wider uppercase rounded-full">PWA Version 4.0</div>
            <h1 className="text-5xl leading-tight font-extrabold text-white light-mode:text-[#1E293B]">
              The Academic OS for <span className="bg-gradient-to-r from-[#6366F1] to-[#10B981] bg-clip-text text-transparent">Nigerian Students</span>.
            </h1>
            <p className="text-lg text-[#A3A3A3] max-w-[550px] light-mode:text-[#64748B]">
              An offline-first operating companion built for student environments. Deterministic CGPA modeling, proportional spaced repetition, and real-time ASUU strike adaptations.
            </p>
            <div className="flex gap-4 items-center mt-4">
              <button 
                onClick={openModal} 
                className="px-8 py-3.5 bg-[#10B981] hover:bg-[#059669] text-white font-bold text-lg rounded-lg cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] hover:scale-[1.02] active:scale-[0.98] transition-all min-h-[48px]"
              >
                Access Workspace
              </button>
              <button 
                onClick={openModal} 
                className="beam-btn px-8 py-3.5 text-white font-bold text-lg rounded-lg border border-[#333] cursor-pointer hover:border-[#3B82F6] hover:shadow-[0_0_12px_rgba(59,130,246,0.2)] active:scale-[0.98] transition-all min-h-[48px]"
              >
                View Engine Demo
              </button>
            </div>
          </div>
          <div className="flex justify-center items-center">
            {/* SVG Native Representation */}
            <svg className="w-full max-w-[480px] drop-shadow-[0_25px_50px_rgba(0,0,0,0.6)]" viewBox="0 0 400 360" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Smart Student Dashboard Preview Mockup">
              <rect width="400" height="360" rx="16" fill="#151515" stroke="#333" strokeWidth="2"/>
              <rect x="20" y="20" width="360" height="40" rx="8" fill="#222"/>
              <circle cx="40" cy="40" r="6" fill="#EF4444"/>
              <circle cx="56" cy="40" r="6" fill="#F59E0B"/>
              <circle cx="72" cy="40" r="6" fill="#10B981"/>
              <rect x="100" y="32" width="120" height="16" rx="4" fill="#333"/>
              <rect x="330" y="30" width="30" height="20" rx="4" fill="#10B981" fillOpacity="0.2" stroke="#10B981" strokeWidth="1"/>
              {/* CGPA card */}
              <rect x="20" y="80" width="170" height="120" rx="12" fill="#1e1e1e" stroke="#333" strokeWidth="1.5"/>
              <text x="40" y="115" fill="#A3A3A3" style={{ fontFamily: 'Inter', fontSize: '12px', fontWeight: 600 }}>GPA CALCULATOR</text>
              <text x="40" y="160" fill="#FFFFFF" style={{ fontFamily: 'Inter', fontSize: '32px', fontWeight: 800 }}>4.78</text>
              <rect x="120" y="135" width="50" height="22" rx="11" fill="rgba(16,185,129,0.15)"/>
              <text x="130" y="149" fill="#10B981" style={{ fontFamily: 'Inter', fontSize: '10px', fontWeight: 700 }}>1ST CLS</text>
              {/* Spaced card */}
              <rect x="210" y="80" width="170" height="120" rx="12" fill="#1e1e1e" stroke="#333" strokeWidth="1.5"/>
              <text x="230" y="115" fill="#A3A3A3" style={{ fontFamily: 'Inter', fontSize: '12px', fontWeight: 600 }}>PSR INTERVAL</text>
              <text x="230" y="155" fill="#3B82F6" style={{ fontFamily: 'JetBrains Mono', fontSize: '18px', fontWeight: 700 }}>PHY111: 2 DAYS</text>
              <rect x="230" y="170" width="100" height="6" rx="3" fill="#333"/>
              <rect x="230" y="170" width="70" height="6" rx="3" fill="#3B82F6"/>
              {/* Strike bar */}
              <rect x="20" y="220" width="360" height="50" rx="8" fill="rgba(16,185,129,0.08)" stroke="#10B981" strokeDasharray="4 4" strokeWidth="1.5"/>
              <circle cx="45" cy="245" r="8" fill="#10B981"/>
              <text x="65" y="249" fill="#FFFFFF" style={{ fontFamily: 'Inter', fontSize: '13px', fontWeight: 700 }}>Strike Adaptation: Elastic Plan Active</text>
              <text x="310" y="249" fill="#10B981" style={{ fontFamily: 'Inter', fontSize: '11px', fontWeight: 700 }}>CONSERVE</text>
              <rect x="20" y="290" width="100" height="50" rx="6" fill="#222"/>
              <rect x="140" y="290" width="110" height="50" rx="6" fill="#222"/>
              <rect x="270" y="290" width="110" height="50" rx="6" fill="#222"/>
            </svg>
          </div>
        </section>

        {/* Features Section */}
        <section className="max-w-[1200px] mx-auto px-8 py-24" id="features" aria-label="Core application features">
          <div className="section-header reveal-on-scroll text-center mb-16 flex flex-col gap-4">
            <h2 className="text-4xl font-extrabold text-white light-mode:text-[#1E293B]">Engineered for Tough Environments</h2>
            <p className="text-lg text-[#A3A3A3] max-w-[600px] mx-auto light-mode:text-[#64748B]">A high-fidelity academic system built to withstand strikes, electricity blackouts, and limited mobile data bandwidth.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="feature-card reveal-on-scroll p-10 rounded-xl flex flex-col gap-5" tabIndex={0}>
              <div className="w-12 h-12 bg-[#6366F1]/10 border border-[#6366F1]/20 rounded-lg flex items-center justify-center text-[#6366F1]" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <line x1="9" y1="3" x2="9" y2="21"/>
                  <line x1="15" y1="3" x2="15" y2="21"/>
                  <line x1="3" y1="9" x2="21" y2="9"/>
                  <line x1="3" y1="15" x2="21" y2="15"/>
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white light-mode:text-[#1E293B]">Deterministic CGPA Engine</h3>
              <p className="text-sm leading-relaxed text-[#A3A3A3] light-mode:text-[#64748B]">100% precise GPA calculations covering multi-scale systems (5.0, 4.0, 7.0). Implements strict Nigerian carry-over policies where failed records persist alongside repeats.</p>
              <div className="feature-card-tag mt-auto font-mono text-[0.8rem] font-bold text-[#10B981] tracking-wider uppercase">A.N.T Layer 3 Tool</div>
            </div>
            {/* Feature 2 */}
            <div className="feature-card reveal-on-scroll p-10 rounded-xl flex flex-col gap-5" tabIndex={0}>
              <div className="w-12 h-12 bg-[#6366F1]/10 border border-[#6366F1]/20 rounded-lg flex items-center justify-center text-[#6366F1]" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white light-mode:text-[#1E293B]">Proportional Spaced Repetition</h3>
              <p className="text-sm leading-relaxed text-[#A3A3A3] light-mode:text-[#64748B]">Review schedules compress dynamically based on Course Credit Units and Exam Proximity. Heavy 4 & 6 credit courses schedule more frequent reviews to boost cumulative aggregates.</p>
              <div className="feature-card-tag mt-auto font-mono text-[0.8rem] font-bold text-[#10B981] tracking-wider uppercase">Dynamic Multipliers</div>
            </div>
            {/* Feature 3 */}
            <div className="feature-card reveal-on-scroll p-10 rounded-xl flex flex-col gap-5" tabIndex={0}>
              <div className="w-12 h-12 bg-[#6366F1]/10 border border-[#6366F1]/20 rounded-lg flex items-center justify-center text-[#6366F1]" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4.5 16.5c-1.5 1.26-2.5 3.19-2.5 5.5h20c0-2.31-1-4.24-2.5-5.5"/>
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white light-mode:text-[#1E293B]">ASUU Strike Adapter</h3>
              <p className="text-sm leading-relaxed text-[#A3A3A3] light-mode:text-[#64748B]">Activate Strike Mode to freeze deadlines and shift UI to a low-pressure retention theme. Resuming semesters automatically recalculates compression ratios to pack schedules smoothly.</p>
              <div className="feature-card-tag mt-auto font-mono text-[0.8rem] font-bold text-[#10B981] tracking-wider uppercase">Elastic Timelines</div>
            </div>
          </div>
        </section>

        {/* Testimonials Section */}
        <section className="testimonials-section bg-[#0E0E0E] border-y border-[#333] py-24 px-8" id="testimonials" aria-label="Student testimonials">
          <div className="section-header reveal-on-scroll text-center mb-16 flex flex-col gap-4">
            <h2 className="text-4xl font-extrabold text-white light-mode:text-[#1E293B]">Tested by Real Students</h2>
            <p className="text-lg text-[#A3A3A3] max-w-[600px] mx-auto light-mode:text-[#64748B]">Read how students across major institutions are leveraging Smart Student Hub to secure their academic records.</p>
          </div>
          
          <div className="testimonials-container reveal-on-scroll max-w-[800px] mx-auto relative overflow-hidden">
            <button 
              onClick={prevSlide}
              className="carousel-btn carousel-btn-prev absolute top-1/2 -translate-y-1/2 left-0 bg-[#1A1A1A] border border-[#333] text-white w-12 h-12 rounded-full cursor-pointer flex items-center justify-center z-10 hover:border-[#6366F1] hover:scale-105" 
              aria-label="Previous testimonial slide"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <button 
              onClick={nextSlide}
              className="carousel-btn carousel-btn-next absolute top-1/2 -translate-y-1/2 right-0 bg-[#1A1A1A] border border-[#333] text-white w-12 h-12 rounded-full cursor-pointer flex items-center justify-center z-10 hover:border-[#6366F1] hover:scale-105" 
              aria-label="Next testimonial slide"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>

            <div 
              className="testimonial-carousel-track flex transition-transform duration-600 ease-out" 
              style={{ transform: `translateX(-${currentSlide * 100}%)` }}
              role="region" 
              aria-live="polite"
            >
              {TESTIMONIALS.map((item, idx) => (
                <div key={idx} className="testimonial-slide min-w-full p-4 flex flex-col items-center text-center gap-8" role="group" aria-roledescription="slide" aria-label={`${idx + 1} of 3`}>
                  <p className="testimonial-quote text-2xl font-medium italic text-white leading-relaxed light-mode:text-[#1E293B]">&ldquo;{item.quote}&rdquo;</p>
                  <div className="testimonial-profile flex flex-col items-center gap-2">
                    <div className="testimonial-avatar w-16 h-16 rounded-full border-2 border-[#10B981] flex items-center justify-center font-bold text-[#10B981] bg-[#10B981]/10" aria-hidden="true">{item.avatar}</div>
                    <span className="testimonial-name text-lg font-bold text-white light-mode:text-[#1E293B]">{item.name}</span>
                    <span className="testimonial-meta text-xs text-[#A3A3A3] font-mono light-mode:text-[#64748B]">{item.meta}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="carousel-controls-mobile flex justify-center gap-6 mt-4 md:hidden">
              <button onClick={prevSlide} className="carousel-btn px-4 py-2 border border-[#333] rounded-lg text-white" aria-label="Previous testimonial">Prev</button>
              <button onClick={nextSlide} className="carousel-btn px-4 py-2 border border-[#333] rounded-lg text-white" aria-label="Next testimonial">Next</button>
            </div>
          </div>
        </section>

        {/* Skeleton Shimmer Demonstration Section */}
        <section className="max-w-[1200px] mx-auto px-8 py-24 grid grid-cols-1 md:grid-cols-2 gap-16 items-center" id="shimmer-demo" aria-label="Demonstration of loading performance">
          <div className="reveal-on-scroll">
            <h2 className="text-4xl font-extrabold text-white light-mode:text-[#1E293B]">Zero-Latency PWA Hydration</h2>
            <p className="text-lg text-[#A3A3A3] mt-4 light-mode:text-[#64748B]">
              Smart Student Hub uses an optimized skeleton shimmer layout. Static assets load instantly from local service worker caches, loading cards within 150ms while data synchronizes in the background.
            </p>
            <button onClick={openModal} className="premium-cta-btn px-6 py-3 mt-6 bg-[#10B981] text-white font-bold rounded-lg cursor-pointer">Verify Local Cache</button>
          </div>
          
          <div className="skeleton-demo-card reveal-on-scroll bg-[#1A1A1A] border border-[#333] rounded-xl p-10 flex flex-col gap-6 shadow-[0_10px_30px_rgba(0,0,0,0.4)]">
            <div className="flex items-center gap-5">
              <div className="shimmer-element shimmer-avatar w-14 h-14 rounded-full" aria-hidden="true"></div>
              <div className="grow flex flex-col gap-2">
                <div className="shimmer-element shimmer-title w-3/5 h-5" aria-hidden="true"></div>
                <div className="shimmer-element shimmer-subtitle w-1/3 h-3.5" aria-hidden="true"></div>
              </div>
            </div>
            <div className="flex flex-col gap-3 mt-2">
              <div className="shimmer-element shimmer-line w-full h-3.5" aria-hidden="true"></div>
              <div className="shimmer-element shimmer-line w-full h-3.5" aria-hidden="true"></div>
              <div className="shimmer-element shimmer-line-short w-4/5 h-3.5" aria-hidden="true"></div>
            </div>
          </div>
        </section>
      </main>

      {/* Sticky Bottom CTA Bar */}
      <div 
        className={`sticky-cta-bar fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1A1A1A]/95 border border-[#333] px-8 py-3 rounded-full flex items-center gap-8 shadow-[0_10px_40px_rgba(0,0,0,0.8)] z-40 transition-transform duration-300 light-mode:bg-[#F8FAFC]/95 light-mode:shadow-[0_10px_40px_rgba(0,0,0,0.1)] ${isStickyCtaActive ? 'translate-y-0' : 'translate-y-36'}`} 
        role="complementary" 
        aria-label="Quick Access CTA"
      >
        <span className="sticky-bar-text text-[0.95rem] font-semibold text-white light-mode:text-[#1E293B]">Smart Student Hub v4</span>
        <button onClick={openModal} className="sticky-bar-btn bg-[#6366F1] text-white px-5 py-2 rounded-full font-bold text-xs cursor-pointer hover:bg-[#4F46E5] hover:scale-103 transition-all min-h-[44px]">Access Hub</button>
      </div>

      {/* Interactive Onboarding Modal Dialog */}
      <div 
        className={`modal-overlay fixed top-0 left-0 w-full h-full bg-black/85 z-[100] flex items-center justify-center p-6 transition-opacity duration-150 ${isModalActive ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} 
        onClick={(e) => e.target === e.currentTarget && closeModal()}
        role="dialog" 
        aria-modal="true" 
        aria-labelledby="modalTitleId" 
        aria-describedby="modalDescId"
      >
        <div className={`modal-container bg-[#1A1A1A] border border-[#333] rounded-xl w-full max-w-[500px] p-10 relative transition-all duration-300 ${isModalActive ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}>
          <button 
            onClick={closeModal} 
            className="modal-close-btn absolute top-6 right-6 bg-transparent border-none text-[#A3A3A3] text-2xl cursor-pointer w-11 h-11 flex items-center justify-center rounded-full hover:bg-white/5 hover:text-white" 
            aria-label="Close modal dialog"
          >
            &times;
          </button>
          
          <h2 className="modal-title text-3xl font-extrabold mb-4 text-white" id="modalTitleId">Get Started Today</h2>
          <p className="modal-desc text-sm text-[#A3A3A3] mb-8" id="modalDescId">Initialize your local offline workspace. Enter your academic parameters below to construct your dashboard.</p>
          
          <form id="onboardingForm" onSubmit={handleOnboardingSubmit}>
            <div className="form-group flex flex-col gap-2 mb-6">
              <label className="form-label text-xs font-semibold text-white" htmlFor="studentNameInput">Full Name</label>
              <input 
                ref={firstInputRef}
                className="form-input bg-black border border-[#333] rounded-md px-4 py-3 text-white text-sm w-full min-h-[44px] focus:border-[#6366F1]" 
                id="studentNameInput" 
                type="text" 
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Oluwaseun Adesina" 
                required
              />
            </div>
            
            <div className="form-group flex flex-col gap-2 mb-6">
              <label className="form-label text-xs font-semibold text-white" htmlFor="universitySelectorInput">University</label>
              <input 
                className="form-input bg-black border border-[#333] rounded-md px-4 py-3 text-white text-sm w-full min-h-[44px] focus:border-[#6366F1]" 
                id="universitySelectorInput" 
                type="text" 
                value={university}
                onChange={(e) => setUniversity(e.target.value)}
                placeholder="e.g. Obafemi Awolowo University (OAU)" 
                required
              />
            </div>
            
            <div className="form-group flex flex-col gap-2 mb-6">
              <label className="form-label text-xs font-semibold text-white" htmlFor="gradingScaleSelector">University Grading Scale</label>
              <select 
                className="form-input bg-black border border-[#333] rounded-md px-4 py-3 text-white text-sm w-full min-h-[44px] focus:border-[#6366F1]" 
                id="gradingScaleSelector" 
                value={gradingScale}
                onChange={(e) => setGradingScale(e.target.value)}
                required
              >
                <option value="5.0_WITH_E">5.0 Scale (A, B, C, D, E, F) - Standard</option>
                <option value="5.0_NO_E">5.0 Scale (A, B, C, D, F) - Modern</option>
                <option value="4.0_NUC">4.0 Scale (NUC standard)</option>
                <option value="7.0_UI">7.0 Scale (Legacy UI standard)</option>
              </select>
            </div>

            <button className="modal-submit-btn bg-[#10B981] hover:bg-[#059669] text-white font-bold py-3.5 rounded-md cursor-pointer w-full min-h-[44px] mt-4" type="submit">Initialize Workspace</button>
          </form>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#333] py-16 px-8 text-center bg-black text-sm text-[#A3A3A3]">
        <div className="flex justify-center gap-8 mb-6">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#testimonials" className="hover:text-white transition-colors">Reviews</a>
          <a href="#shimmer-demo" className="hover:text-white transition-colors">PWA Cache</a>
        </div>
        <p>© 2026 Smart Student Hub. Built exclusively for Nigerian University Students. All Rights Reserved.</p>
      </footer>
    </>
  );
}
