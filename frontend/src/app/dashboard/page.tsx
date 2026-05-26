'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAcademicStore } from '../../store/useAcademicStore';
import { db, LocalSemester, LocalCourse, LocalSpacedRepCard } from '../../lib/db';
import { computeSM2, calculatePSRInterval, calculateNextReviewDue } from '../../lib/spaced_rep';
import { calculateSemesterGPA, calculateCGPA } from '../../lib/cgpa';
import { encodeDeckPayload, decodeDeckPayload, importSharedDeck, generateWhatsAppDigest } from '../../lib/whatsapp';
import './dashboard.css';

// Scale descriptions for display
const SCALE_LABELS: Record<string, string> = {
  '5.0_WITH_E': '5.0 (A–F with E)',
  '5.0_NO_E': '5.0 (A–F, no E)',
  '4.0_NUC': '4.0 NUC',
  '7.0_UI': '7.0 UI Legacy',
};

export default function DashboardPage() {
  const router = useRouter();
  
  // Zustand Academic Store Actions & State
  const {
    profile,
    semesters,
    courses,
    cards,
    initializeStore,
    addSemester,
    addCourse,
    updateCourseGrade,
    toggleStrikeMode
  } = useAcademicStore();

  // Tab navigation state
  const [activeTab, setActiveTab] = useState<'dashboard' | 'planner' | 'flashcards' | 'semester' | 'strike'>('dashboard');
  
  // Visual states
  const [currentTime, setCurrentTime] = useState('');
  const [greeting, setGreeting] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Form inputs for semester
  const [semLevel, setSemLevel] = useState<number>(100);
  const [semTerm, setSemTerm] = useState<number>(1);

  // Form inputs for course
  const [courseCode, setCourseCode] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [courseUnits, setCourseUnits] = useState<number>(3);
  const [courseGrade, setCourseGrade] = useState('');
  const [targetSemesterId, setTargetSemesterId] = useState('');

  // Form inputs for flashcard
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [cardFront, setCardFront] = useState('');
  const [cardBack, setCardBack] = useState('');
  const [cardDiff, setCardDiff] = useState<'easy' | 'medium' | 'hard'>('medium');

  // WhatsApp sync state
  const [importCode, setImportCode] = useState('');
  const [exportCourseId, setExportCourseId] = useState('');
  const [generatedShareText, setGeneratedShareText] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');

  // Review Session state
  const [reviewDeck, setReviewDeck] = useState<LocalSpacedRepCard[]>([]);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);

  // Initialize Store on load
  useEffect(() => {
    initializeStore();
    
    // Greeting by hour
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 17) setGreeting('Good afternoon');
    else setGreeting('Good evening');

    // Live clock update
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleDateString('en-NG', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [initializeStore]);

  // Set default semester selector once semesters load
  useEffect(() => {
    if (semesters.length > 0 && !targetSemesterId) {
      setTargetSemesterId(semesters[0].id);
    }
  }, [semesters, targetSemesterId]);

  // Set default course selector once courses load
  useEffect(() => {
    if (courses.length > 0 && !selectedCourseId) {
      setSelectedCourseId(courses[0].id);
    }
    if (courses.length > 0 && !exportCourseId) {
      setExportCourseId(courses[0].id);
    }
  }, [courses, selectedCourseId, exportCourseId]);

  // Helper: Trigger custom in-app notifications
  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // Onboarding Profile validation
  const firstName = profile?.fullName?.split(' ')[0] || 'Student';

  // 1. Semester Actions
  const handleAddSemester = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate overlap
    const exists = semesters.some(s => s.level === semLevel && s.term === semTerm);
    if (exists) {
      showToast('error', `A semester for Level ${semLevel} Term ${semTerm} already exists.`);
      return;
    }

    try {
      await addSemester({
        level: semLevel,
        term: semTerm,
        status: 'active',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 15 * 7 * 24 * 60 * 60 * 1000).toISOString(),
        compressedMode: false,
        originalDurationWeeks: 15,
        currentDurationWeeks: 15
      });
      showToast('success', `Level ${semLevel} Semester created successfully.`);
      initializeStore(); // reload store sync
    } catch (err) {
      showToast('error', 'Failed to create semester.');
    }
  };

  // 2. Course Actions
  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetSemesterId) {
      showToast('error', 'Please set up a semester first.');
      return;
    }

    try {
      await addCourse({
        semesterId: targetSemesterId,
        courseCode: courseCode.trim().toUpperCase(),
        courseTitle: courseTitle.trim(),
        creditUnits: Number(courseUnits),
        gradeAchieved: courseGrade || undefined,
        isPrerequisiteFor: []
      });
      showToast('success', `Course ${courseCode.toUpperCase()} added successfully.`);
      setCourseCode('');
      setCourseTitle('');
      setCourseUnits(3);
      setCourseGrade('');
      initializeStore(); // reload store sync
    } catch (err) {
      showToast('error', 'Failed to add course.');
    }
  };

  const handleUpdateGrade = async (courseId: string, grade: string) => {
    try {
      await updateCourseGrade(courseId, grade);
      showToast('success', 'Course grade updated successfully.');
      initializeStore();
    } catch (err) {
      showToast('error', 'Failed to update grade.');
    }
  };

  // 3. Flashcard Actions
  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId) {
      showToast('error', 'Please select or add a course first.');
      return;
    }

    try {
      const cardId = crypto.randomUUID?.() || Math.random().toString(36).substring(2);
      const newCard: LocalSpacedRepCard = {
        id: cardId,
        courseId: selectedCourseId,
        frontContent: cardFront.trim(),
        backContent: cardBack.trim(),
        difficulty: cardDiff,
        boxNumber: 1,
        nextReviewDue: new Date().toISOString(),
        proportionalFactor: 1.0,
        localCreatedAt: new Date().toISOString(),
        localUpdatedAt: new Date().toISOString(),
        syncStatus: 'pending_insert',
        clientVersion: 1
      };

      await db.spacedRepetitionCards.put(newCard);
      await db.reconciliationQueue.put({
        id: crypto.randomUUID?.() || Math.random().toString(36).substring(2),
        tableName: 'spaced_repetition_cards',
        recordId: cardId,
        action: 'INSERT',
        payload: newCard,
        timestamp: Date.now(),
        retryCount: 0
      });

      showToast('success', 'Flashcard created successfully!');
      setCardFront('');
      setCardBack('');
      initializeStore();
    } catch (err) {
      showToast('error', 'Failed to add flashcard.');
    }
  };

  // 4. WhatsApp Coordinator Import
  const handleImportDeck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importCode.trim()) {
      showToast('error', 'Please paste a valid shared deck string.');
      return;
    }

    try {
      const payload = decodeDeckPayload(importCode.trim());
      const result = await importSharedDeck(payload);
      showToast('success', `Imported deck ${payload.courseCode} with ${payload.cards.length} cards successfully!`);
      setImportCode('');
      initializeStore();
    } catch (err) {
      showToast('error', 'Failed to decode deck. Make sure code is correct.');
    }
  };

  // 5. WhatsApp Coordinator Export
  const handleGenerateExport = () => {
    const course = courses.find(c => c.id === exportCourseId);
    if (!course) {
      showToast('error', 'Selected course not found.');
      return;
    }

    const courseCards = cards.filter(c => c.courseId === exportCourseId);
    if (courseCards.length === 0) {
      showToast('error', 'This deck has 0 cards to share. Please add cards first.');
      return;
    }

    try {
      const payload = {
        courseCode: course.courseCode,
        courseTitle: course.courseTitle,
        creditUnits: course.creditUnits,
        cards: courseCards.map(c => ({
          frontContent: c.frontContent,
          backContent: c.backContent,
          difficulty: c.difficulty
        }))
      };

      const hash = encodeDeckPayload(payload);
      const deepLink = `https://smarthub-students-v4.vercel.app/deck/${hash}`;
      const digest = generateWhatsAppDigest(
        course.courseCode,
        course.courseTitle,
        courseCards.length,
        'Active Spaced Session',
        profile?.fullName || 'Academic Mate',
        deepLink
      );

      setGeneratedShareText(digest);
      setGeneratedLink(`https://api.whatsapp.com/send?text=${encodeURIComponent(digest)}`);
      showToast('success', 'Shared deck generated successfully!');
    } catch (err) {
      showToast('error', 'Failed to construct share deck.');
    }
  };

  // 6. Review Session Spaced Repetition Engine
  const startReviewSession = () => {
    const dueCards = cards.filter(c => new Date(c.nextReviewDue) <= new Date());
    if (dueCards.length === 0) {
      showToast('info', 'No flashcards are due for review today!');
      return;
    }
    setReviewDeck(dueCards);
    setCurrentReviewIndex(0);
    setIsCardFlipped(false);
    setIsReviewing(true);
  };

  const handleReviewAnswer = async (rating: 1 | 2 | 3 | 4) => {
    const currentCard = reviewDeck[currentReviewIndex];
    const course = courses.find(c => c.id === currentCard.courseId);
    const creditUnits = course?.creditUnits || 3;

    // 1. Calculate Base SM-2 Card State
    const baseState = {
      easinessFactor: currentCard.proportionalFactor > 0 ? currentCard.proportionalFactor : 2.5,
      repetitions: currentCard.boxNumber > 1 ? currentCard.boxNumber - 1 : 0,
      intervalDays: 1
    };
    
    const nextSM2 = computeSM2(rating, baseState);

    // 2. Adjust with academic proximity & strike proportional logic
    let daysUntilExam: number | null = null;
    let totalSemesterDays: number | null = null;
    
    const activeSemester = semesters.find(s => s.id === course?.semesterId);
    if (activeSemester && activeSemester.endDate) {
      const total = new Date(activeSemester.endDate).getTime() - new Date(activeSemester.startDate).getTime();
      const remaining = new Date(activeSemester.endDate).getTime() - Date.now();
      totalSemesterDays = Math.ceil(total / (24 * 60 * 60 * 1000));
      daysUntilExam = Math.ceil(remaining / (24 * 60 * 60 * 1000));
    }

    const finalInterval = calculatePSRInterval(nextSM2.intervalDays, {
      creditUnits,
      daysUntilExam,
      totalSemesterDays,
      strikeActive: profile?.strikeModeActive || false
    });

    const nextDueDate = calculateNextReviewDue(finalInterval);

    // 3. Persist to Dexie and reconciliation WAL outbox
    const updatedCard: LocalSpacedRepCard = {
      ...currentCard,
      boxNumber: nextSM2.repetitions + 1,
      proportionalFactor: nextSM2.easinessFactor,
      lastReviewedAt: new Date().toISOString(),
      nextReviewDue: nextDueDate,
      localUpdatedAt: new Date().toISOString(),
      syncStatus: 'pending_update',
      clientVersion: currentCard.clientVersion + 1
    };

    try {
      await db.spacedRepetitionCards.put(updatedCard);
      await db.reconciliationQueue.put({
        id: crypto.randomUUID?.() || Math.random().toString(36).substring(2),
        tableName: 'spaced_repetition_cards',
        recordId: currentCard.id,
        action: 'UPDATE',
        payload: updatedCard,
        timestamp: Date.now(),
        retryCount: 0
      });
    } catch (err) {
      console.warn("Failed to write spaced repetition card review locally:", err);
    }

    // 4. Progress or complete
    if (currentReviewIndex + 1 < reviewDeck.length) {
      setIsCardFlipped(false);
      setCurrentReviewIndex(prev => prev + 1);
    } else {
      setIsReviewing(false);
      showToast('success', 'Review session completed! Outstanding job!');
      initializeStore();
    }
  };

  // 7. Interactive Strike Toggle Action
  const handleToggleStrike = async () => {
    try {
      await toggleStrikeMode();
      showToast('success', profile?.strikeModeActive ? 'Semester paused. Academic calendar frozen.' : 'Academic calendar resumed. Active timeline running.');
      initializeStore();
    } catch (err) {
      showToast('error', 'Failed to toggle strike mode.');
    }
  };

  // Computations
  // Group courses by semesterId to compute CGPA
  const dueCardsCount = cards.filter(c => new Date(c.nextReviewDue) <= new Date()).length;
  const semestersCourses = semesters.map(s => courses.filter(c => c.semesterId === s.id));
  const currentCGPA = calculateCGPA(semestersCourses, profile?.gradingScale || '5.0_WITH_E', 'accumulative');

  return (
    <div className="dashboard-layout">
      {/* Toast Alert Notifications */}
      {notification && (
        <div className={`toast-notification border border-white/10 shadow-2xl z-[1000] p-4 rounded-xl flex items-center justify-between text-sm ${
          notification.type === 'success' ? 'bg-[#10B981]/20 text-[#10B981] border-[#10B981]/30' :
          notification.type === 'error' ? 'bg-[#EF4444]/20 text-[#EF4444] border-[#EF4444]/30' :
          'bg-[#3B82F6]/20 text-[#3B82F6] border-[#3B82F6]/30'
        }`}>
          <span>{notification.message}</span>
        </div>
      )}

      {/* Mobile Toggle Navigation Button */}
      <button
        className="sidebar-toggle flex md:hidden"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        aria-label="Toggle Navigation"
      >
        <span className="toggle-bar" />
        <span className="toggle-bar" />
        <span className="toggle-bar" />
      </button>

      {/* Sidebar Mobile Overlay Background */}
      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Left Sidebar Navigation Drawer */}
      <aside className={`dashboard-sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <span className="brand-icon">🎓</span>
          <span className="brand-text">SmartHub</span>
        </div>

        <nav className="sidebar-nav">
          <button
            onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }}
            className={`nav-item ${activeTab === 'dashboard' ? 'nav-active' : ''}`}
          >
            <span className="nav-icon">📊</span>
            <span className="nav-label">Dashboard</span>
          </button>
          
          <Link href="/cgpa" className="nav-item">
            <span className="nav-icon">🎯</span>
            <span className="nav-label">CGPA Engine</span>
          </Link>

          <button
            onClick={() => { setActiveTab('planner'); setIsSidebarOpen(false); }}
            className={`nav-item ${activeTab === 'planner' ? 'nav-active' : ''}`}
          >
            <span className="nav-icon">📚</span>
            <span className="nav-label">Study Planner</span>
          </button>

          <button
            onClick={() => { setActiveTab('flashcards'); setIsSidebarOpen(false); }}
            className={`nav-item ${activeTab === 'flashcards' ? 'nav-active' : ''}`}
          >
            <span className="nav-icon">🃏</span>
            <span className="nav-label">Flashcards</span>
          </button>

          <button
            onClick={() => { setActiveTab('semester'); setIsSidebarOpen(false); }}
            className={`nav-item ${activeTab === 'semester' ? 'nav-active' : ''}`}
          >
            <span className="nav-icon">📅</span>
            <span className="nav-label">Semester</span>
          </button>

          <button
            onClick={() => { setActiveTab('strike'); setIsSidebarOpen(false); }}
            className={`nav-item ${activeTab === 'strike' ? 'nav-active' : ''}`}
          >
            <span className="nav-icon">⚡</span>
            <span className="nav-label">Strike Mode</span>
          </button>
        </nav>

        <div className="sidebar-profile">
          <div className="profile-avatar">{firstName.charAt(0).toUpperCase()}</div>
          <div className="profile-info">
            <span className="profile-name">{profile?.fullName || 'Guest Profile'}</span>
            <span className="profile-uni">{profile?.universityName || 'FUOYE Sandbox'}</span>
          </div>
        </div>
      </aside>

      {/* Main Panel Content Area */}
      <main className="dashboard-main flex-1 max-w-6xl">
        <header className="dashboard-header flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="header-greeting font-extrabold text-white text-3xl">
              {greeting}, <span className="header-name">{firstName}</span> 👋
            </h1>
            <p className="header-date text-xs text-[#737373]">{currentTime}</p>
          </div>

          <div className="header-right flex items-center gap-3">
            <div className="header-badge">
              <span className="badge-dot" />
              <span className="badge-text">IndexedDB Authority</span>
            </div>
            {profile?.gradingScale && (
              <div className="header-scale">
                Scale: {SCALE_LABELS[profile.gradingScale] || profile.gradingScale}
              </div>
            )}
            {profile?.strikeModeActive && (
              <div className="bg-[#EF4444]/20 border border-[#EF4444]/30 px-3.5 py-1.5 rounded-full text-xs font-bold text-[#EF4444] animate-pulse">
                Strike Freeze Active
              </div>
            )}
          </div>
        </header>

        {/* ────────────────────────────────────────────────────────── */}
        {/* VIEW 1: MAIN DASHBOARD SUMMARY OVERVIEW */}
        {/* ────────────────────────────────────────────────────────── */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <section className="stats-grid">
              <div className="stat-card" style={{ '--card-color': '#6366F1', '--card-glow': 'rgba(99,102,241,0.12)' } as any}>
                <div className="stat-icon-ring"><span className="stat-icon">🎓</span></div>
                <div className="stat-content">
                  <span className="stat-value">{currentCGPA > 0 ? currentCGPA.toFixed(2) : '—'}</span>
                  <span className="stat-label">Calculated CGPA</span>
                  <span className="stat-subtitle">{courses.length > 0 ? `${courses.length} courses total` : 'Add courses to calculate'}</span>
                </div>
              </div>

              <div className="stat-card" style={{ '--card-color': '#F59E0B', '--card-glow': 'rgba(245,158,11,0.12)' } as any}>
                <div className="stat-icon-ring"><span className="stat-icon">🔥</span></div>
                <div className="stat-content">
                  <span className="stat-value">{profile?.strikeModeActive ? 'PAUSED' : '1 day'}</span>
                  <span className="stat-label">Study Streak</span>
                  <span className="stat-subtitle">{profile?.strikeModeActive ? 'Strike Mode is active' : 'Keep flashcards cleared'}</span>
                </div>
              </div>

              <div className="stat-card" style={{ '--card-color': '#10B981', '--card-glow': 'rgba(16,185,129,0.12)' } as any}>
                <div className="stat-icon-ring"><span className="stat-icon">📖</span></div>
                <div className="stat-content">
                  <span className="stat-value">{courses.length}</span>
                  <span className="stat-label">Registered Courses</span>
                  <span className="stat-subtitle">{semesters.length} semesters active</span>
                </div>
              </div>

              <div className="stat-card" style={{ '--card-color': '#3B82F6', '--card-glow': 'rgba(59,130,246,0.12)' } as any}>
                <div className="stat-icon-ring"><span className="stat-icon">🃏</span></div>
                <div className="stat-content">
                  <span className="stat-value">{dueCardsCount}</span>
                  <span className="stat-label">Due Flashcards</span>
                  <span className="stat-subtitle">{cards.length} total in system</span>
                </div>
              </div>
            </section>

            <div className="dashboard-grid">
              <section className="panel">
                <div className="panel-header">
                  <h2 className="panel-title">📅 Semester Coordinator</h2>
                  <span className="panel-badge">{semesters.length} Semesters</span>
                </div>
                {semesters.length === 0 ? (
                  <div className="panel-empty">
                    <div className="empty-illustration">📋</div>
                    <p className="empty-title">Setup your academic schedule</p>
                    <p className="empty-desc">Create your level semester blocks, register course credit units, and see your cumulative GPA.</p>
                    <button className="empty-cta" onClick={() => setActiveTab('semester')}>+ Set Up Semesters</button>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[280px] overflow-y-auto pr-2">
                    {semesters.map(s => {
                      const semCourses = courses.filter(c => c.semesterId === s.id);
                      const gpaResult = calculateSemesterGPA(semCourses, profile?.gradingScale || '5.0_WITH_E');
                      const gpa = gpaResult.gpa;
                      return (
                        <div key={s.id} className="flex justify-between items-center p-4 bg-black/40 border border-[#1A1A1A] rounded-xl hover:border-[#333] transition-all">
                          <div>
                            <span className="block text-sm font-bold text-white">{s.level} Level — Semester {s.term}</span>
                            <span className="text-xs text-[#737373]">{semCourses.length} Registered Courses</span>
                          </div>
                          <div className="text-right">
                            <span className="block text-sm font-extrabold text-[#10B981]">{gpa > 0 ? `GPA: ${gpa.toFixed(2)}` : 'GPA: —'}</span>
                            <span className="text-[10px] text-[#525252] tracking-wider uppercase">{s.status}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="panel">
                <div className="panel-header">
                  <h2 className="panel-title">📚 Study Spaced Repetition</h2>
                  {dueCardsCount > 0 && <span className="panel-badge bg-[#3B82F6]/10 text-[#3B82F6]">{dueCardsCount} due</span>}
                </div>
                {cards.length === 0 ? (
                  <div className="panel-empty">
                    <div className="empty-illustration">🧠</div>
                    <p className="empty-title">Build your first memory deck</p>
                    <p className="empty-desc">Add manual flashcards or coordinate imports via friend's WhatsApp share code strings.</p>
                    <button className="empty-cta bg-[#3B82F6] hover:bg-[#2563EB]" onClick={() => setActiveTab('flashcards')}>+ Create Flashcards</button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 text-center">
                    <div className="text-4xl mb-3">🃏</div>
                    <p className="text-white font-bold text-sm mb-1">{dueCardsCount} Memory Cards Due</p>
                    <p className="text-xs text-[#737373] max-w-[280px] mb-4">Practice with proportional weight algorithms calculated dynamically for your exams.</p>
                    {dueCardsCount > 0 ? (
                      <button className="empty-cta bg-[#10B981] hover:bg-[#059669] px-6 py-2.5" onClick={startReviewSession}>Start Review Session</button>
                    ) : (
                      <span className="px-4 py-2 rounded-xl bg-green-500/10 border border-green-500/20 text-xs font-semibold text-green-400">All cleared for today! 🎉</span>
                    )}
                  </div>
                )}
              </section>
            </div>

            {/* CGPA Sandbox Trigger Panel */}
            <section className="panel">
              <div className="panel-header">
                <h2 className="panel-title">📈 Academic CGPA Trend Projection</h2>
                <Link href="/cgpa" className="panel-link">Launch sandbox solver →</Link>
              </div>
              <div className="cgpa-chart-area">
                <div className="cgpa-empty-chart py-4">
                  <div className="chart-bars flex items-end gap-3 h-[100px] mb-4">
                    {courses.map((c, i) => (
                      <div
                        key={c.id}
                        className="chart-bar"
                        style={{
                          height: c.gradeAchieved === 'A' ? '100%' : c.gradeAchieved === 'B' ? '80%' : c.gradeAchieved === 'C' ? '60%' : c.gradeAchieved === 'D' ? '40%' : '20%',
                          width: '28px',
                          background: 'linear-gradient(to top, rgba(99,102,241,0.15), rgba(99,102,241,0.5))',
                          border: '1px solid rgba(99,102,241,0.3)',
                          borderRadius: '4px 4px 0 0'
                        }}
                        title={`${c.courseCode}: Grade ${c.gradeAchieved || '—'}`}
                      />
                    ))}
                    {courses.length === 0 && [40, 55, 70, 60, 85].map((h, i) => (
                      <div
                        key={i}
                        className="chart-bar"
                        style={{ height: `${h}%`, width: '28px', background: 'linear-gradient(to top, rgba(255,255,255,0.02), rgba(255,255,255,0.1))', border: '1px solid #1A1A1A', borderRadius: '4px 4px 0 0' }}
                      />
                    ))}
                  </div>
                  <p className="chart-label text-xs text-[#737373]">
                    {courses.length > 0 ? 'Course visual grades distribution representation.' : 'Add graded courses in the semester tab to populate graph indicators.'}
                  </p>
                </div>
              </div>
            </section>

            {/* Bottom Quick-Action Shortcut Cards */}
            <section className="quick-actions grid grid-cols-2 md:grid-cols-4 gap-4">
              <Link href="/cgpa" className="action-card">
                <span className="action-icon">🧮</span>
                <span className="action-label text-white font-bold">CGPA Sandbox</span>
              </Link>
              <button className="action-card text-left" onClick={() => setActiveTab('semester')}>
                <span className="action-icon">📝</span>
                <span className="action-label text-white font-bold">Add Sem / Course</span>
              </button>
              <button className="action-card text-left" onClick={() => setActiveTab('flashcards')}>
                <span className="action-icon">🃏</span>
                <span className="action-label text-white font-bold">Sync Deck Codes</span>
              </button>
              <button className="action-card text-left" onClick={() => setActiveTab('strike')}>
                <span className="action-icon">⚡</span>
                <span className="action-label text-white font-bold">ASUU Strike Switch</span>
              </button>
            </section>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────── */}
        {/* VIEW 2: STUDY PLANNER (SPACED REPETITION REVIEW PANEL) */}
        {/* ────────────────────────────────────────────────────────── */}
        {activeTab === 'planner' && (
          <div className="space-y-6">
            <header className="flex justify-between items-center border-b border-[#1A1A1A] pb-4">
              <div>
                <h2 className="text-xl font-extrabold text-white">📚 Proportional Study Planner</h2>
                <p className="text-xs text-[#737373] mt-0.5">Adapt memory intervals dynamically to course credit units and exam proximities.</p>
              </div>
              {!isReviewing && dueCardsCount > 0 && (
                <button className="empty-cta bg-[#10B981] hover:bg-[#059669]" onClick={startReviewSession}>Review Due Cards ({dueCardsCount})</button>
              )}
            </header>

            {/* Spaced Repetition Session active */}
            {isReviewing && reviewDeck.length > 0 ? (
              <div className="max-w-xl mx-auto p-6 bg-black/40 border border-[#1A1A1A] rounded-2xl flex flex-col items-center">
                <div className="w-full flex justify-between text-xs text-[#737373] mb-6">
                  <span>Due Card {currentReviewIndex + 1} of {reviewDeck.length}</span>
                  <span className="text-[#10B981] font-semibold">Active Review Session</span>
                </div>

                {/* Flip Card Mockup */}
                <div 
                  className={`relative w-full min-h-[220px] rounded-xl border border-[#333] p-8 flex items-center justify-center text-center cursor-pointer transition-all duration-300 ${
                    isCardFlipped ? 'bg-[#1e1b4b]/20 border-[#6366F1]/30 shadow-[0_0_30px_rgba(99,102,241,0.05)]' : 'bg-[#0E0E0E]'
                  }`}
                  onClick={() => setIsCardFlipped(!isCardFlipped)}
                >
                  <div className="absolute top-4 left-4 text-[10px] tracking-wider uppercase text-[#737373]">
                    {isCardFlipped ? 'Answer Back' : 'Question Front'}
                  </div>
                  
                  <p className="text-lg font-bold text-white max-w-[80%] break-words">
                    {isCardFlipped ? reviewDeck[currentReviewIndex].backContent : reviewDeck[currentReviewIndex].frontContent}
                  </p>
                  
                  <div className="absolute bottom-4 text-[10px] text-[#525252]">
                    Click card body to flip over
                  </div>
                </div>

                {/* Action Grading Responses */}
                <div className="w-full mt-8 space-y-4">
                  {!isCardFlipped ? (
                    <button 
                      className="w-full py-3.5 bg-[#6366F1] hover:bg-[#4F46E5] text-white font-bold rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.2)]"
                      onClick={() => setIsCardFlipped(true)}
                    >
                      Reveal Correct Answer
                    </button>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <button 
                        className="py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500/50 text-red-400 font-bold rounded-lg text-xs transition-colors"
                        onClick={() => handleReviewAnswer(1)}
                      >
                        ❌ Forgot (1d)
                      </button>
                      <button 
                        className="py-3 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 hover:border-orange-500/50 text-orange-400 font-bold rounded-lg text-xs transition-colors"
                        onClick={() => handleReviewAnswer(2)}
                      >
                        ⚠️ Hard
                      </button>
                      <button 
                        className="py-3 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 hover:border-blue-500/50 text-blue-400 font-bold rounded-lg text-xs transition-colors"
                        onClick={() => handleReviewAnswer(3)}
                      >
                        👍 Good
                      </button>
                      <button 
                        className="py-3 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 hover:border-green-500/50 text-green-400 font-bold rounded-lg text-xs transition-colors"
                        onClick={() => handleReviewAnswer(4)}
                      >
                        🚀 Easy
                      </button>
                    </div>
                  )}
                  
                  <button 
                    className="w-full text-center text-xs text-[#525252] hover:text-[#737373] mt-2 block"
                    onClick={() => setIsReviewing(false)}
                  >
                    Abort Study Session
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Active Parameters Multipliers Summary Panel */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-black/40 border border-[#1A1A1A] rounded-xl text-center">
                    <span className="block text-2xl font-bold text-[#6366F1]">PSR Credit Weight</span>
                    <span className="block text-xs text-[#737373] mt-1">High units (e.g. 4 CUs) speed reviews proportionally.</span>
                  </div>
                  <div className="p-4 bg-black/40 border border-[#1A1A1A] rounded-xl text-center">
                    <span className="block text-2xl font-bold text-[#F59E0B]">Exam Compression</span>
                    <span className="block text-xs text-[#737373] mt-1">Timeline spacing shrinks proportionally as examination dates close.</span>
                  </div>
                  <div className="p-4 bg-black/40 border border-[#1A1A1A] rounded-xl text-center">
                    <span className="block text-2xl font-bold text-[#10B981]">Strike Safety Cushion</span>
                    <span className="block text-xs text-[#737373] mt-1">Strikes scale interval sizes to 1.5x with absolute 21-day ceiling limit.</span>
                  </div>
                </div>

                {/* List of outstanding reviews */}
                <div className="panel">
                  <h3 className="panel-title mb-4">⚡ Scheduled Memory Deck Items</h3>
                  {cards.length === 0 ? (
                    <div className="text-center py-10 text-[#737373] text-sm">
                      No cards found. Go to the <button className="text-[#6366F1] font-bold" onClick={() => setActiveTab('flashcards')}>Flashcards tab</button> to add your courses and questions.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cards.map(c => {
                        const course = courses.find(cr => cr.id === c.courseId);
                        const isDue = new Date(c.nextReviewDue) <= new Date();
                        return (
                          <div key={c.id} className="flex justify-between items-center p-4 bg-black/20 border border-[#1A1A1A] rounded-xl hover:border-[#333] transition-all">
                            <div className="max-w-[70%]">
                              <span className="text-xs text-[#6366F1] font-bold block">{course?.courseCode || 'GENERAL'}</span>
                              <span className="text-sm font-bold text-white block truncate">{c.frontContent}</span>
                              <span className="text-[10px] text-[#525252] block truncate">Answer: {c.backContent}</span>
                            </div>
                            <div className="text-right">
                              <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase ${
                                isDue ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'
                              }`}>
                                {isDue ? 'Due Now' : 'Scheduled'}
                              </span>
                              <span className="block text-[10px] text-[#737373] mt-2">Box Level: {c.boxNumber}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ────────────────────────────────────────────────────────── */}
        {/* VIEW 3: FLASHCARDS MANAGER (WHATSAPP EXCHANGE PANEL) */}
        {/* ────────────────────────────────────────────────────────── */}
        {activeTab === 'flashcards' && (
          <div className="space-y-6">
            <header className="border-b border-[#1A1A1A] pb-4">
              <h2 className="text-xl font-extrabold text-white">🃏 Deck Coordinator</h2>
              <p className="text-xs text-[#737373] mt-0.5">Author flashcard items or coordinate sync sharing codes using WhatsApp digests.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Add New Flashcard */}
              <section className="panel space-y-4">
                <h3 className="panel-title">📝 Create New Flashcard</h3>
                {courses.length === 0 ? (
                  <div className="text-center py-8 text-xs text-[#737373]">
                    Please set up semesters and add a course before compiling decks.
                  </div>
                ) : (
                  <form onSubmit={handleAddCard} className="space-y-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-[#A3A3A3] font-bold">Course Parent</label>
                      <select 
                        className="bg-black border border-[#262626] rounded-xl px-4 py-3 text-white text-sm"
                        value={selectedCourseId}
                        onChange={(e) => setSelectedCourseId(e.target.value)}
                        required
                      >
                        {courses.map(c => (
                          <option key={c.id} value={c.id}>{c.courseCode} — {c.courseTitle}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-[#A3A3A3] font-bold">Front Content (Question/Prompt)</label>
                      <textarea
                        className="bg-black border border-[#262626] rounded-xl px-4 py-3 text-white text-sm min-h-[80px]"
                        value={cardFront}
                        onChange={(e) => setCardFront(e.target.value)}
                        placeholder="e.g. What is the derivative of x^2?"
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-[#A3A3A3] font-bold">Back Content (Answer/Explanation)</label>
                      <textarea
                        className="bg-black border border-[#262626] rounded-xl px-4 py-3 text-white text-sm min-h-[80px]"
                        value={cardBack}
                        onChange={(e) => setCardBack(e.target.value)}
                        placeholder="e.g. 2x using the power rule."
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-[#A3A3A3] font-bold">Card Core Difficulty</label>
                      <select 
                        className="bg-black border border-[#262626] rounded-xl px-4 py-3 text-white text-sm"
                        value={cardDiff}
                        onChange={(e) => setCardDiff(e.target.value as any)}
                        required
                      >
                        <option value="easy">Easy (scales wider intervals)</option>
                        <option value="medium">Medium (standard sm-2 interval)</option>
                        <option value="hard">Hard (shrunk intervals for repeated review)</option>
                      </select>
                    </div>

                    <button className="empty-cta w-full py-3.5 bg-[#10B981] hover:bg-[#059669] text-white font-bold" type="submit">
                      Create Flashcard
                    </button>
                  </form>
                )}
              </section>

              {/* WhatsApp Coordinator Import/Export Integration */}
              <div className="space-y-6">
                {/* Import via Base64 Hash */}
                <section className="panel space-y-4">
                  <h3 className="panel-title">📥 Import Deck via WhatsApp Code</h3>
                  <p className="text-xs text-[#737373]">Paste the encoded study link coordinates received from a classmate to load their card database.</p>
                  
                  <form onSubmit={handleImportDeck} className="space-y-3">
                    <textarea 
                      className="w-full bg-black border border-[#262626] rounded-xl px-4 py-3 text-white text-sm min-h-[60px]"
                      value={importCode}
                      onChange={(e) => setImportCode(e.target.value)}
                      placeholder="Paste the shared Base64 deck package code..."
                      required
                    />
                    <button className="empty-cta w-full py-2 bg-[#6366F1] hover:bg-[#4F46E5] text-white font-bold text-xs" type="submit">
                      Import Shared Deck Package
                    </button>
                  </form>
                </section>

                {/* Export via Base64 Hash */}
                <section className="panel space-y-4">
                  <h3 className="panel-title">📤 Share Deck to WhatsApp</h3>
                  <p className="text-xs text-[#737373]">Bundle questions for a course and generate an evolutionary Base64 link template for peer sync.</p>
                  
                  {courses.length === 0 ? (
                    <div className="text-center text-xs text-[#737373] py-4">
                      Add graded courses to export packages.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-col gap-1.5">
                        <select 
                          className="bg-black border border-[#262626] rounded-xl px-4 py-2.5 text-white text-xs"
                          value={exportCourseId}
                          onChange={(e) => setExportCourseId(e.target.value)}
                        >
                          {courses.map(c => (
                            <option key={c.id} value={c.id}>{c.courseCode} ({cards.filter(cd => cd.courseId === c.id).length} cards)</option>
                          ))}
                        </select>
                        <button className="empty-cta bg-[#3B82F6] hover:bg-[#2563EB] text-xs py-2 mt-1" onClick={handleGenerateExport}>
                          Compile Share Package
                        </button>
                      </div>

                      {generatedShareText && (
                        <div className="space-y-3 pt-2">
                          <textarea 
                            className="w-full bg-black/60 border border-[#262626] rounded-xl px-3 py-2 text-[#A3A3A3] text-[10px] min-h-[100px] font-mono"
                            value={generatedShareText}
                            readOnly
                          />
                          <a 
                            href={generatedLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="empty-cta w-full block py-2.5 text-center bg-[#10B981] hover:bg-[#059669] text-white font-bold text-xs no-underline"
                          >
                            💬 Forward to WhatsApp Classmate
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────── */}
        {/* VIEW 4: SEMESTER AND COURSE MANAGER PANEL */}
        {/* ────────────────────────────────────────────────────────── */}
        {activeTab === 'semester' && (
          <div className="space-y-6">
            <header className="border-b border-[#1A1A1A] pb-4">
              <h2 className="text-xl font-extrabold text-white">📅 Academic Schedule Coordinator</h2>
              <p className="text-xs text-[#737373] mt-0.5">Organize semester timelines, credit values, and achieves grading variables.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Set up a new Semester */}
              <section className="panel space-y-4">
                <h3 className="panel-title">➕ Create Academic Semester Block</h3>
                <form onSubmit={handleAddSemester} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-[#A3A3A3] font-bold">Academic Level</label>
                      <select 
                        className="bg-black border border-[#262626] rounded-xl px-4 py-3 text-white text-sm"
                        value={semLevel}
                        onChange={(e) => setSemLevel(Number(e.target.value))}
                      >
                        {[100, 200, 300, 400, 500, 600].map(l => (
                          <option key={l} value={l}>{l} Level</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-[#A3A3A3] font-bold">Semester Term</label>
                      <select 
                        className="bg-black border border-[#262626] rounded-xl px-4 py-3 text-white text-sm"
                        value={semTerm}
                        onChange={(e) => setSemTerm(Number(e.target.value))}
                      >
                        <option value={1}>1st Semester</option>
                        <option value={2}>2nd Semester</option>
                      </select>
                    </div>
                  </div>

                  <button className="empty-cta w-full py-3.5 bg-[#6366F1] hover:bg-[#4F46E5] text-white font-bold" type="submit">
                    Initialize Semester Period
                  </button>
                </form>
              </section>

              {/* Add Course to Semester */}
              <section className="panel space-y-4">
                <h3 className="panel-title">📖 Register Course Credits</h3>
                {semesters.length === 0 ? (
                  <div className="text-center py-8 text-xs text-[#737373]">
                    Please initialize an academic semester first before adding course structures.
                  </div>
                ) : (
                  <form onSubmit={handleAddCourse} className="space-y-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-[#A3A3A3] font-bold">Target Semester</label>
                      <select 
                        className="bg-black border border-[#262626] rounded-xl px-4 py-3 text-white text-sm"
                        value={targetSemesterId}
                        onChange={(e) => setTargetSemesterId(e.target.value)}
                        required
                      >
                        {semesters.map(s => (
                          <option key={s.id} value={s.id}>{s.level} Level — Sem {s.term}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-[#A3A3A3] font-bold">Course Code</label>
                        <input 
                          type="text"
                          className="bg-black border border-[#262626] rounded-xl px-4 py-3 text-white text-sm"
                          value={courseCode}
                          onChange={(e) => setCourseCode(e.target.value)}
                          placeholder="e.g. MTH101"
                          required
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-[#A3A3A3] font-bold">Credit Units</label>
                        <input 
                          type="number"
                          min={1}
                          max={6}
                          className="bg-black border border-[#262626] rounded-xl px-4 py-3 text-white text-sm"
                          value={courseUnits}
                          onChange={(e) => setCourseUnits(Number(e.target.value))}
                          required
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-[#A3A3A3] font-bold">Course Full Name</label>
                      <input 
                        type="text"
                        className="bg-black border border-[#262626] rounded-xl px-4 py-3 text-white text-sm"
                        value={courseTitle}
                        onChange={(e) => setCourseTitle(e.target.value)}
                        placeholder="e.g. Elementary Mathematics I"
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-[#A3A3A3] font-bold">Achieved Grade (Leave blank if ongoing)</label>
                      <select 
                        className="bg-black border border-[#262626] rounded-xl px-4 py-3 text-white text-sm"
                        value={courseGrade}
                        onChange={(e) => setCourseGrade(e.target.value)}
                      >
                        <option value="">Ongoing (Study Phase)</option>
                        <option value="A">Grade A (Excellent)</option>
                        <option value="B">Grade B (Very Good)</option>
                        <option value="C">Grade C (Good)</option>
                        <option value="D">Grade D (Pass)</option>
                        <option value="E">Grade E (Conditional)</option>
                        <option value="F">Grade F (Fail)</option>
                      </select>
                    </div>

                    <button className="empty-cta w-full py-3.5 bg-[#10B981] hover:bg-[#059669] text-white font-bold" type="submit">
                      Register Course Credits
                    </button>
                  </form>
                )}
              </section>
            </div>

            {/* List semesters and courses registered */}
            <div className="panel space-y-6">
              <h3 className="panel-title">📊 Academic Transcripts Coordinator</h3>
              {semesters.length === 0 ? (
                <div className="text-center text-[#737373] text-xs py-8">
                  No courses compiled yet. Setup active semester blocks.
                </div>
              ) : (
                <div className="space-y-6">
                  {semesters.map(s => {
                    const semCourses = courses.filter(c => c.semesterId === s.id);
                    const gpaResult = calculateSemesterGPA(semCourses, profile?.gradingScale || '5.0_WITH_E');
                    const gpa = gpaResult.gpa;
                    return (
                      <div key={s.id} className="border border-[#1A1A1A] p-6 rounded-2xl bg-black/40 space-y-4">
                        <div className="flex justify-between items-center border-b border-[#1A1A1A] pb-3">
                          <div>
                            <span className="text-lg font-bold text-white block">{s.level} Level — Semester {s.term}</span>
                            <span className="text-xs text-[#737373]">Status: {s.status === 'strike_paused' ? ' strike paused freeze' : s.status}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-lg font-extrabold text-[#10B981] block">{gpa > 0 ? `GPA: ${gpa.toFixed(2)}` : 'GPA: —'}</span>
                          </div>
                        </div>

                        {semCourses.length === 0 ? (
                          <p className="text-xs text-[#525252] text-center py-4">No registered courses in this semester block.</p>
                        ) : (
                          <div className="space-y-3">
                            {semCourses.map(c => (
                              <div key={c.id} className="flex justify-between items-center p-3 bg-black/30 border border-[#1A1A1A] rounded-xl text-xs">
                                <div>
                                  <span className="font-extrabold text-white block">{c.courseCode} ({c.creditUnits} CUs)</span>
                                  <span className="text-[#737373] block">{c.courseTitle}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <select 
                                    className="bg-black border border-[#262626] rounded-lg px-2 py-1 text-white text-[10px]"
                                    value={c.gradeAchieved || ''}
                                    onChange={(e) => handleUpdateGrade(c.id, e.target.value)}
                                  >
                                    <option value="">Ongoing</option>
                                    <option value="A">Grade A</option>
                                    <option value="B">Grade B</option>
                                    <option value="C">Grade C</option>
                                    <option value="D">Grade D</option>
                                    <option value="E">Grade E</option>
                                    <option value="F">Grade F</option>
                                  </select>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────── */}
        {/* VIEW 5: ASUU STRIKE MODE INTERACTIVE SWITCH */}
        {/* ────────────────────────────────────────────────────────── */}
        {activeTab === 'strike' && (
          <div className="space-y-6">
            <header className="border-b border-[#1A1A1A] pb-4">
              <h2 className="text-xl font-extrabold text-white">⚡ ASUU Strike Coordinator Mode</h2>
              <p className="text-xs text-[#737373] mt-0.5">Adapt memory schedules to proportional strike breaks to avoid mental exhaustion.</p>
            </header>

            <section className="panel flex flex-col items-center justify-center p-12 text-center max-w-xl mx-auto space-y-6">
              <div className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl border transition-all duration-500 ${
                profile?.strikeModeActive ? 'bg-red-500/10 border-red-500/40 text-red-500 shadow-[0_0_40px_rgba(239,68,68,0.2)]' : 'bg-green-500/10 border-green-500/40 text-green-500'
              }`}>
                ⚡
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-bold text-white">
                  Strike Mode Status: {profile?.strikeModeActive ? 'PAUSED CALENDAR (ACTIVE)' : 'NORMAL ACADEMIC TIMELINE'}
                </h3>
                <p className="text-xs text-[#737373] leading-relaxed max-w-md mx-auto">
                  When a strike occurs, activate the Strike toggle. This pauses all regular semester duration calculations on Dexie and sets flashcard interval algorithms to a safe 1.5x relaxation spacing, bounded by a 21-day ceiling to prevent memory dump.
                </p>
              </div>

              <button 
                onClick={handleToggleStrike}
                className={`px-8 py-4 rounded-xl font-bold text-sm tracking-wider uppercase transition-all duration-300 shadow-xl border ${
                  profile?.strikeModeActive 
                    ? 'bg-[#10B981] hover:bg-[#059669] text-white border-[#10B981]/30 hover:scale-[1.02]' 
                    : 'bg-red-500 hover:bg-red-600 text-white border-red-500/30 hover:scale-[1.02] shadow-[0_0_30px_rgba(239,68,68,0.15)]'
                }`}
              >
                {profile?.strikeModeActive ? 'Resume Academic Timelines' : 'Trigger ASUU Strike Pause'}
              </button>

              <div className="w-full text-left pt-6 border-t border-[#1A1A1A] space-y-3">
                <h4 className="text-xs font-bold text-[#E5E5E5] uppercase tracking-wider">Algorithmic Adaptations Enabled:</h4>
                <ul className="space-y-2 text-xs text-[#737373] list-disc list-inside">
                  <li>Active Semester calendar duration counter pauses dynamically.</li>
                  <li>Spaced repetition next due spacing expands safely by <span className="text-white font-bold">1.50x factor</span>.</li>
                  <li>Prevents student anxiety and guilt during prolonged strike interruptions.</li>
                  <li>Ensures absolute <span className="text-white font-bold">21-day maximum boundary clamp</span> so critical test materials stay fresh.</li>
                </ul>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
