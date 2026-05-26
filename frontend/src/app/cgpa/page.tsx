'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { BookOpen, Plus, Trash2, ArrowLeft, RefreshCw, Sparkles, AlertTriangle, ShieldCheck } from 'lucide-react';
import { calculateSemesterGPA, calculateCGPA, GRADE_VALUES, GradingScale, CGPAPolicy } from '../../lib/cgpa';

interface DemoCourse {
  id: string;
  courseCode: string;
  creditUnits: number;
  gradeAchieved: string; // 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | ''
}

interface DemoSemester {
  id: string;
  level: number;
  term: number;
  courses: DemoCourse[];
}

export default function CGPAPage() {
  const [scale, setScale] = useState<GradingScale>('5.0_WITH_E');
  const [policy, setPolicy] = useState<CGPAPolicy>('accumulative');
  const [semesters, setSemesters] = useState<DemoSemester[]>([]);
  const [isLightMode, setIsLightMode] = useState(false);

  // Initialize with some blank state on load
  useEffect(() => {
    // Check local storage or document theme
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

  // Helper to load realistic Nigerian academic transcript demo
  const loadDemoData = () => {
    setScale('5.0_WITH_E');
    setPolicy('accumulative');
    setSemesters([
      {
        id: 'sem-1',
        level: 100,
        term: 1,
        courses: [
          { id: 'c-1-1', courseCode: 'MTH101', creditUnits: 3, gradeAchieved: 'F' }, // Failed
          { id: 'c-1-2', courseCode: 'PHY101', creditUnits: 4, gradeAchieved: 'C' }, // 4 CU * 3 GP = 12 GP
          { id: 'c-1-3', courseCode: 'CHM101', creditUnits: 3, gradeAchieved: 'B' }, // 3 CU * 4 GP = 12 GP
        ],
      },
      {
        id: 'sem-2',
        level: 100,
        term: 2,
        courses: [
          { id: 'c-2-1', courseCode: 'MTH102', creditUnits: 3, gradeAchieved: 'B' },
          { id: 'c-2-2', courseCode: 'PHY102', creditUnits: 4, gradeAchieved: 'A' },
          { id: 'c-2-3', courseCode: 'GST102', creditUnits: 2, gradeAchieved: 'C' },
        ],
      },
      {
        id: 'sem-3',
        level: 200,
        term: 1,
        courses: [
          { id: 'c-3-1', courseCode: 'MTH101', creditUnits: 3, gradeAchieved: 'A' }, // Repeated MTH101 and cleared!
          { id: 'c-3-2', courseCode: 'MTH201', creditUnits: 3, gradeAchieved: 'C' },
          { id: 'c-3-3', courseCode: 'PHY201', creditUnits: 4, gradeAchieved: 'B' },
        ],
      },
    ]);
  };

  const addSemester = () => {
    const nextNum = semesters.length + 1;
    const level = Math.ceil(nextNum / 2) * 100;
    const term = nextNum % 2 === 1 ? 1 : 2;

    const newSem: DemoSemester = {
      id: `sem-${Date.now()}`,
      level,
      term,
      courses: [
        { id: `c-${Date.now()}-1`, courseCode: '', creditUnits: 3, gradeAchieved: '' }
      ]
    };
    setSemesters([...semesters, newSem]);
  };

  const removeSemester = (semId: string) => {
    setSemesters(semesters.filter(s => s.id !== semId));
  };

  const addCourse = (semId: string) => {
    setSemesters(semesters.map(sem => {
      if (sem.id === semId) {
        return {
          ...sem,
          courses: [
            ...sem.courses,
            { id: `c-${Date.now()}`, courseCode: '', creditUnits: 3, gradeAchieved: '' }
          ]
        };
      }
      return sem;
    }));
  };

  const removeCourse = (semId: string, courseId: string) => {
    setSemesters(semesters.map(sem => {
      if (sem.id === semId) {
        return {
          ...sem,
          courses: sem.courses.filter(c => c.id !== courseId)
        };
      }
      return sem;
    }));
  };

  const updateCourse = (semId: string, courseId: string, updates: Partial<DemoCourse>) => {
    setSemesters(semesters.map(sem => {
      if (sem.id === semId) {
        return {
          ...sem,
          courses: sem.courses.map(c => {
            if (c.id === courseId) {
              return { ...c, ...updates };
            }
            return c;
          })
        };
      }
      return sem;
    }));
  };

  // Convert current UI state courses to the CourseInput type expected by the core tools engine
  const getCalculatedData = () => {
    const semestersInput = semesters.map(sem =>
      sem.courses.map(c => ({
        courseCode: c.courseCode,
        creditUnits: Number(c.creditUnits),
        gradeAchieved: c.gradeAchieved || null
      }))
    );

    const calculatedCGPA = calculateCGPA(semestersInput, scale, policy);

    // Calculate details for active list
    let totalCU = 0;
    let totalGP = 0;
    
    // Map tracking replacement status for visual feedback
    const courseStatusMap = new Map<string, { status: 'active' | 'replaced'; semIndex: number }>();
    const flatList: { code: string; cu: number; grade: string; semId: string; semName: string }[] = [];

    semesters.forEach((sem) => {
      sem.courses.forEach(c => {
        if (c.gradeAchieved) {
          flatList.push({
            code: c.courseCode.trim().toUpperCase(),
            cu: Number(c.creditUnits),
            grade: c.gradeAchieved,
            semId: sem.id,
            semName: `${sem.level}L S${sem.term}`
          });
        }
      });
    });

    if (policy === 'replacement') {
      const latestIdx = new Map<string, number>();
      flatList.forEach((item, idx) => {
        if (latestIdx.has(item.code)) {
          const prev = latestIdx.get(item.code)!;
          flatList[prev] = { ...flatList[prev] }; // copy
          courseStatusMap.set(`${flatList[prev].semId}-${flatList[prev].code}`, { status: 'replaced', semIndex: semIdxFromId(flatList[prev].semId) });
        }
        latestIdx.set(item.code, idx);
        courseStatusMap.set(`${item.semId}-${item.code}`, { status: 'active', semIndex: semIdxFromId(item.semId) });
      });
    } else {
      flatList.forEach(item => {
        courseStatusMap.set(`${item.semId}-${item.code}`, { status: 'active', semIndex: semIdxFromId(item.semId) });
      });
    }

    function semIdxFromId(id: string) {
      return semesters.findIndex(s => s.id === id);
    }

    flatList.forEach((item) => {
      const statusKey = `${item.semId}-${item.code}`;
      const status = courseStatusMap.get(statusKey)?.status;
      if (status !== 'replaced') {
        const val = GRADE_VALUES[scale][item.grade.toUpperCase()] || 0;
        totalGP += item.cu * val;
        totalCU += item.cu;
      }
    });

    return {
      cgpa: calculatedCGPA,
      totalCU,
      totalGP,
      courseStatusMap
    };
  };

  const { cgpa, totalCU, totalGP, courseStatusMap } = getCalculatedData();

  // Get Degree Class labels
  const getDegreeClass = (cgpaVal: number, currentScale: GradingScale) => {
    if (totalCU === 0) return { label: 'No Records', color: 'text-neutral-400 border-neutral-800 bg-neutral-900/50' };

    if (currentScale === '5.0_WITH_E' || currentScale === '5.0_NO_E') {
      if (cgpaVal >= 4.50) return { label: 'First Class Honours', color: 'text-emerald-400 border-emerald-500/20 bg-emerald-950/20' };
      if (cgpaVal >= 3.50) return { label: 'Second Class Upper (2:1)', color: 'text-blue-400 border-blue-500/20 bg-blue-950/20' };
      if (cgpaVal >= 2.40) return { label: 'Second Class Lower (2:2)', color: 'text-amber-400 border-amber-500/20 bg-amber-950/20' };
      if (cgpaVal >= 1.50) return { label: 'Third Class', color: 'text-orange-400 border-orange-500/20 bg-orange-950/20' };
      return { label: 'Pass / Fail', color: 'text-red-400 border-red-500/20 bg-red-950/20' };
    }
    if (currentScale === '4.0_NUC') {
      if (cgpaVal >= 3.50) return { label: 'First Class', color: 'text-emerald-400 border-emerald-500/20 bg-emerald-950/20' };
      if (cgpaVal >= 3.00) return { label: 'Second Class Upper (2:1)', color: 'text-blue-400 border-blue-500/20 bg-blue-950/20' };
      if (cgpaVal >= 2.00) return { label: 'Second Class Lower (2:2)', color: 'text-amber-400 border-amber-500/20 bg-amber-950/20' };
      if (cgpaVal >= 1.00) return { label: 'Third Class', color: 'text-orange-400 border-orange-500/20 bg-orange-950/20' };
      return { label: 'Pass / Fail', color: 'text-red-400 border-red-500/20 bg-red-950/20' };
    }
    if (currentScale === '7.0_UI') {
      if (cgpaVal >= 6.00) return { label: 'First Class', color: 'text-emerald-400 border-emerald-500/20 bg-emerald-950/20' };
      if (cgpaVal >= 4.60) return { label: 'Second Class Upper (2:1)', color: 'text-blue-400 border-blue-500/20 bg-blue-950/20' };
      if (cgpaVal >= 2.60) return { label: 'Second Class Lower (2:2)', color: 'text-amber-400 border-amber-500/20 bg-amber-950/20' };
      if (cgpaVal >= 1.60) return { label: 'Third Class', color: 'text-orange-400 border-orange-500/20 bg-orange-950/20' };
      return { label: 'Pass / Fail', color: 'text-red-400 border-red-500/20 bg-red-950/20' };
    }

    return { label: 'Graduated', color: 'text-indigo-400 border-indigo-500/20 bg-indigo-950/20' };
  };

  const degreeClass = getDegreeClass(cgpa, scale);

  return (
    <div className="flex-1 w-full flex flex-col max-w-6xl mx-auto px-4 py-8 relative">
      {/* Header Panel */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div className="flex items-center gap-3">
          <Link 
            href="/dashboard"
            className="p-2 border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors hover:bg-[var(--surface)] focus-visible:outline-none"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>
                Deterministic CGPA Sandbox
              </h1>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">
              Verify real-time academic grading calculations with exact decimal scaling.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch md:self-auto">
          <button
            onClick={loadDemoData}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 border border-indigo-500/20 bg-indigo-550/10 text-indigo-400 text-sm font-semibold rounded-lg hover:bg-indigo-550/20 transition-all cursor-pointer focus-visible:outline-none"
          >
            <RefreshCw className="w-4 h-4" />
            Load Demo Transcript
          </button>
          
          <button
            onClick={toggleTheme}
            className="p-2.5 border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors hover:bg-[var(--surface)] cursor-pointer focus-visible:outline-none"
            aria-label="Toggle Theme"
          >
            {isLightMode ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Left Columns - Calculator Inputs */}
        <main className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Controls Bar */}
          <section className="p-5 border border-[var(--border)] bg-[var(--surface)] rounded-xl grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="scale-select" className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                Grading Scale Multiplier
              </label>
              <select
                id="scale-select"
                value={scale}
                onChange={(e) => setScale(e.target.value as GradingScale)}
                className="w-full px-3 py-2 border border-[var(--border)] bg-[var(--background)] rounded-lg text-sm text-[var(--text)] focus:border-indigo-500 focus-visible:outline-none transition-colors"
              >
                <option value="5.0_WITH_E">5.0 Scale (Standard) — A, B, C, D, E, F</option>
                <option value="5.0_NO_E">5.0 Scale (Modern) — A, B, C, D, F</option>
                <option value="4.0_NUC">4.0 Scale (NUC standard) — A, B, C, D, F</option>
                <option value="7.0_UI">7.0 Scale (Legacy UI) — A, B, C, D, E, F</option>
              </select>
            </div>

            <div>
              <label htmlFor="policy-select" className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                Carry-Over Policy
              </label>
              <select
                id="policy-select"
                value={policy}
                onChange={(e) => setPolicy(e.target.value as CGPAPolicy)}
                className="w-full px-3 py-2 border border-[var(--border)] bg-[var(--background)] rounded-lg text-sm text-[var(--text)] focus:border-indigo-500 focus-visible:outline-none transition-colors"
              >
                <option value="accumulative">Accumulative (Failed attempts count forever)</option>
                <option value="replacement">Replacement (Saves CGPA by overwriting fails)</option>
              </select>
            </div>
          </section>

          {/* Semesters Loop */}
          {semesters.length === 0 ? (
            <div className="border border-dashed border-[var(--border)] rounded-xl p-10 text-center flex flex-col items-center justify-center gap-4">
              <BookOpen className="w-12 h-12 text-[var(--text-secondary)] opacity-40" />
              <div>
                <h3 className="text-lg font-semibold">No Academic Records</h3>
                <p className="text-sm text-[var(--text-secondary)] max-w-sm mt-1 mx-auto">
                  Click &ldquo;Load Demo Transcript&rdquo; above to inspect carry-over calculations instantly, or start building semesters manually.
                </p>
              </div>
              <button
                onClick={addSemester}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-semibold text-sm rounded-lg hover:bg-indigo-500 cursor-pointer transition-colors focus-visible:outline-none"
              >
                <Plus className="w-4 h-4" />
                Add Semester
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {semesters.map((sem) => {
                const semGPA = calculateSemesterGPA(
                  sem.courses.map(c => ({
                    courseCode: c.courseCode,
                    creditUnits: Number(c.creditUnits),
                    gradeAchieved: c.gradeAchieved || null
                  })),
                  scale
                );

                return (
                  <section 
                    key={sem.id}
                    className="border border-[var(--border)] bg-[var(--surface)] rounded-xl overflow-hidden transition-all duration-300"
                  >
                    {/* Semester Header */}
                    <div className="px-5 py-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--background)]/20">
                      <div>
                        <h2 className="text-base font-bold tracking-tight">
                          {sem.level} Level — {sem.term === 1 ? 'First' : 'Second'} Semester
                        </h2>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                          Calculated Semester GPA: <span className="font-semibold text-[var(--text)]">{semGPA.gpa.toFixed(2)}</span>
                        </p>
                      </div>
                      <button
                        onClick={() => removeSemester(sem.id)}
                        className="p-1.5 border border-[var(--border)] rounded text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors focus-visible:outline-none"
                        title="Delete Semester"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Courses List */}
                    <div className="p-5 flex flex-col gap-3">
                      {sem.courses.map((course) => {
                        const statusKey = `${sem.id}-${course.courseCode.trim().toUpperCase()}`;
                        const statusInfo = courseStatusMap.get(statusKey);
                        const isReplaced = statusInfo?.status === 'replaced';

                        return (
                          <div 
                            key={course.id}
                            className={`grid grid-cols-12 gap-3 items-center p-3 border rounded-lg transition-all duration-300 ${
                              isReplaced 
                                ? 'bg-red-950/10 border-red-500/20 opacity-60' 
                                : 'bg-[var(--background)]/40 border-[var(--border)] hover:border-neutral-700'
                            }`}
                          >
                            {/* Course Code */}
                            <div className="col-span-4">
                              <input
                                type="text"
                                value={course.courseCode}
                                onChange={(e) => updateCourse(sem.id, course.id, { courseCode: e.target.value })}
                                placeholder="Course Code (e.g. MTH101)"
                                className="w-full px-3 py-1.5 border border-[var(--border)] bg-[var(--background)] rounded-lg text-sm text-[var(--text)] uppercase tracking-wider focus:border-indigo-500 focus-visible:outline-none transition-colors"
                              />
                            </div>

                            {/* Credit Units */}
                            <div className="col-span-3">
                              <select
                                value={course.creditUnits}
                                onChange={(e) => updateCourse(sem.id, course.id, { creditUnits: Number(e.target.value) })}
                                className="w-full px-3 py-1.5 border border-[var(--border)] bg-[var(--background)] rounded-lg text-sm text-[var(--text)] focus:border-indigo-500 focus-visible:outline-none transition-colors"
                              >
                                <option value="1">1 Unit</option>
                                <option value="2">2 Units</option>
                                <option value="3">3 Units</option>
                                <option value="4">4 Units</option>
                                <option value="5">5 Units</option>
                                <option value="6">6 Units</option>
                              </select>
                            </div>

                            {/* Grade Achieved */}
                            <div className="col-span-3">
                              <select
                                value={course.gradeAchieved}
                                onChange={(e) => updateCourse(sem.id, course.id, { gradeAchieved: e.target.value })}
                                className="w-full px-3 py-1.5 border border-[var(--border)] bg-[var(--background)] rounded-lg text-sm text-[var(--text)] focus:border-indigo-500 focus-visible:outline-none transition-colors"
                              >
                                <option value="">Grade</option>
                                {Object.keys(GRADE_VALUES[scale]).map(g => (
                                  <option key={g} value={g}>{g}</option>
                                ))}
                              </select>
                            </div>

                            {/* Actions / Feedback */}
                            <div className="col-span-2 flex items-center justify-end gap-2">
                              {isReplaced && (
                                <span title="Replaced by a newer attempt of this course code under current policy!">
                                  <AlertTriangle className="w-4 h-4 text-red-400" />
                                </span>
                              )}
                              <button
                                onClick={() => removeCourse(sem.id, course.id)}
                                className="p-1.5 text-[var(--text-secondary)] hover:text-red-400 hover:bg-neutral-800/20 cursor-pointer rounded transition-colors focus-visible:outline-none"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {/* Add Course Button */}
                      <button
                        onClick={() => addCourse(sem.id)}
                        className="mt-2 flex items-center justify-center gap-2 p-2 border border-dashed border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)] hover:border-neutral-600 font-semibold text-xs rounded-lg cursor-pointer transition-colors focus-visible:outline-none"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Course
                      </button>
                    </div>
                  </section>
                );
              })}

              <button
                onClick={addSemester}
                className="flex items-center justify-center gap-2 p-3 border border-dashed border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)] hover:border-neutral-600 font-semibold text-sm rounded-xl cursor-pointer transition-colors focus-visible:outline-none"
              >
                <Plus className="w-4 h-4" />
                Add Another Semester
              </button>
            </div>
          )}
        </main>

        {/* Right Side - Real-time CGPA Displays */}
        <aside className="flex flex-col gap-6 lg:sticky lg:top-8">
          
          {/* CGPA Scorecard */}
          <section className="p-6 border border-[var(--border)] bg-[var(--surface)] rounded-xl flex flex-col items-center justify-center text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 to-emerald-500" />

            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-widest mb-4">
              Real-time CGPA
            </span>

            {/* Score Ring */}
            <div className="w-36 h-36 rounded-full border-4 border-indigo-500/10 flex flex-col items-center justify-center bg-[var(--background)] shadow-2xl relative mb-4">
              <span className="text-4xl font-extrabold tracking-tight">
                {cgpa.toFixed(2)}
              </span>
              <span className="text-[10px] text-[var(--text-secondary)] font-semibold mt-1">
                OUT OF {scale.startsWith('5.0') ? '5.00' : scale.startsWith('4.0') ? '4.00' : '7.00'}
              </span>
            </div>

            {/* Degree classification banner */}
            <div className={`px-4 py-1.5 border text-xs font-bold rounded-full mb-6 ${degreeClass.color}`}>
              {degreeClass.label}
            </div>

            {/* Minor calculations details */}
            <div className="w-full grid grid-cols-2 gap-4 border-t border-[var(--border)] pt-4 text-left">
              <div>
                <span className="block text-[10px] text-[var(--text-secondary)] font-semibold uppercase tracking-wider">
                  Total Credits
                </span>
                <span className="text-lg font-bold text-[var(--text)]">
                  {totalCU} Units
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-[var(--text-secondary)] font-semibold uppercase tracking-wider">
                  Weighted Points
                </span>
                <span className="text-lg font-bold text-[var(--text)]">
                  {totalGP} Points
                </span>
              </div>
            </div>
          </section>

          {/* Academic Policy Status Card */}
          <section className="p-5 border border-[var(--border)] bg-[var(--surface)] rounded-xl flex flex-col gap-4">
            <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
              <ShieldCheck className="w-4 h-4" />
              <span>AI Governance Status</span>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              This sandbox is actively linked to the isolated deterministic layer `/tools/cgpa.ts`. Zero heuristics are utilized to compile these grades.
            </p>

            {policy === 'replacement' ? (
              <div className="p-3 border border-red-500/20 bg-red-950/10 text-red-400 rounded-lg text-xs flex gap-2">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>
                  <strong>Replacement Policy Active</strong>: Overwriting historical F scores can improve a student&apos;s CGPA significantly, but must match their university senate policy.
                </span>
              </div>
            ) : (
              <div className="p-3 border border-blue-500/20 bg-blue-950/10 text-blue-400 rounded-lg text-xs flex gap-2">
                <ShieldCheck className="w-5 h-5 shrink-0" />
                <span>
                  <strong>Accumulative Policy Active</strong>: Failed attempts are permanently recorded alongside repeat attempts, matching Federal University guidelines.
                </span>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
