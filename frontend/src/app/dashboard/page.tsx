'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import './dashboard.css';

interface StudentProfile {
  id: string;
  fullName: string;
  university: string;
  gradingScale: string;
  onboardedAt: string;
}

// Grading scale display names
const SCALE_LABELS: Record<string, string> = {
  '5.0_WITH_E': '5.0 (A–F with E)',
  '5.0_NO_E': '5.0 (A–F, no E)',
  '4.0_NUC': '4.0 NUC',
  '7.0_UI': '7.0 UI Legacy',
};

// Navigation items
const NAV_ITEMS = [
  { icon: '📊', label: 'Dashboard', href: '/dashboard', active: true },
  { icon: '🎯', label: 'CGPA Engine', href: '/cgpa', active: false },
  { icon: '📚', label: 'Study Planner', href: '/dashboard', active: false },
  { icon: '🃏', label: 'Flashcards', href: '/dashboard', active: false },
  { icon: '📅', label: 'Semester', href: '/dashboard', active: false },
  { icon: '⚡', label: 'Strike Mode', href: '/dashboard', active: false },
];

// Quick stat cards data
const getQuickStats = () => [
  {
    label: 'Current CGPA',
    value: '—',
    subtitle: 'Add courses to calculate',
    icon: '🎓',
    color: '#6366F1',
    bgGlow: 'rgba(99, 102, 241, 0.12)',
  },
  {
    label: 'Study Streak',
    value: '0 days',
    subtitle: 'Start reviewing cards',
    icon: '🔥',
    color: '#F59E0B',
    bgGlow: 'rgba(245, 158, 11, 0.12)',
  },
  {
    label: 'Active Courses',
    value: '0',
    subtitle: 'No courses yet',
    icon: '📖',
    color: '#10B981',
    bgGlow: 'rgba(16, 185, 129, 0.12)',
  },
  {
    label: 'Cards Due Today',
    value: '0',
    subtitle: 'All caught up!',
    icon: '🃏',
    color: '#3B82F6',
    bgGlow: 'rgba(59, 130, 246, 0.12)',
  },
];

export default function DashboardPage() {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [currentTime, setCurrentTime] = useState('');
  const [greeting, setGreeting] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    // Load profile from localStorage
    const stored = localStorage.getItem('smarthub_profile');
    if (stored) {
      try {
        setProfile(JSON.parse(stored));
      } catch {
        // If corrupted, ignore
      }
    }

    // Set greeting based on time of day
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 17) setGreeting('Good afternoon');
    else setGreeting('Good evening');

    // Update clock
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
  }, []);

  const firstName = profile?.fullName?.split(' ')[0] || 'Student';
  const stats = getQuickStats();

  return (
    <div className="dashboard-layout">
      {/* Mobile sidebar toggle */}
      <button
        className="sidebar-toggle"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        aria-label="Toggle navigation"
      >
        <span className="toggle-bar" />
        <span className="toggle-bar" />
        <span className="toggle-bar" />
      </button>

      {/* Sidebar overlay for mobile */}
      {isSidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`dashboard-sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <span className="brand-icon">🎓</span>
          <span className="brand-text">SmartHub</span>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`nav-item ${item.active ? 'nav-active' : ''}`}
              onClick={() => setIsSidebarOpen(false)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Profile card at bottom */}
        <div className="sidebar-profile">
          <div className="profile-avatar">
            {firstName.charAt(0).toUpperCase()}
          </div>
          <div className="profile-info">
            <span className="profile-name">{profile?.fullName || 'Student'}</span>
            <span className="profile-uni">{profile?.university || '—'}</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="dashboard-main">
        {/* Top Header */}
        <header className="dashboard-header">
          <div className="header-left">
            <h1 className="header-greeting">
              {greeting}, <span className="header-name">{firstName}</span> 👋
            </h1>
            <p className="header-date">{currentTime}</p>
          </div>
          <div className="header-right">
            <div className="header-badge">
              <span className="badge-dot" />
              <span className="badge-text">Offline Ready</span>
            </div>
            {profile?.gradingScale && (
              <div className="header-scale">
                {SCALE_LABELS[profile.gradingScale] || profile.gradingScale}
              </div>
            )}
          </div>
        </header>

        {/* Quick Stats Grid */}
        <section className="stats-grid">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="stat-card"
              style={{
                '--card-color': stat.color,
                '--card-glow': stat.bgGlow,
              } as React.CSSProperties}
            >
              <div className="stat-icon-ring">
                <span className="stat-icon">{stat.icon}</span>
              </div>
              <div className="stat-content">
                <span className="stat-value">{stat.value}</span>
                <span className="stat-label">{stat.label}</span>
                <span className="stat-subtitle">{stat.subtitle}</span>
              </div>
            </div>
          ))}
        </section>

        {/* Two Column Layout */}
        <div className="dashboard-grid">
          {/* Semester Overview */}
          <section className="panel semester-panel">
            <div className="panel-header">
              <h2 className="panel-title">📅 Semester Overview</h2>
              <span className="panel-badge">No Active Semester</span>
            </div>
            <div className="panel-empty">
              <div className="empty-illustration">📋</div>
              <p className="empty-title">Set up your first semester</p>
              <p className="empty-desc">
                Add your current semester courses and start tracking your academic progress.
              </p>
              <button className="empty-cta">
                + Add Semester
              </button>
            </div>
          </section>

          {/* Study Planner */}
          <section className="panel study-panel">
            <div className="panel-header">
              <h2 className="panel-title">📚 Study Planner</h2>
              <span className="panel-badge">Spaced Repetition</span>
            </div>
            <div className="panel-empty">
              <div className="empty-illustration">🧠</div>
              <p className="empty-title">No flashcards yet</p>
              <p className="empty-desc">
                Create your first study deck or import one from a friend via WhatsApp share.
              </p>
              <button className="empty-cta">
                + Create Deck
              </button>
            </div>
          </section>
        </div>

        {/* CGPA Projection */}
        <section className="panel cgpa-panel">
          <div className="panel-header">
            <h2 className="panel-title">🎯 CGPA Projection</h2>
            <Link href="/cgpa" className="panel-link">
              Open CGPA Engine →
            </Link>
          </div>
          <div className="cgpa-chart-area">
            <div className="cgpa-empty-chart">
              <div className="chart-bars">
                {[40, 55, 70, 60, 80, 75, 90].map((h, i) => (
                  <div
                    key={i}
                    className="chart-bar"
                    style={{
                      height: `${h}%`,
                      animationDelay: `${i * 80}ms`,
                    }}
                  />
                ))}
              </div>
              <p className="chart-label">
                Add semester courses to see your CGPA trend
              </p>
            </div>
          </div>
        </section>

        {/* Quick Actions Footer */}
        <section className="quick-actions">
          <Link href="/cgpa" className="action-card">
            <span className="action-icon">🧮</span>
            <span className="action-label">Calculate CGPA</span>
          </Link>
          <button className="action-card">
            <span className="action-icon">📝</span>
            <span className="action-label">Add Course</span>
          </button>
          <button className="action-card">
            <span className="action-icon">🃏</span>
            <span className="action-label">Create Flashcard</span>
          </button>
          <button className="action-card">
            <span className="action-icon">📤</span>
            <span className="action-label">Share via WhatsApp</span>
          </button>
        </section>
      </main>
    </div>
  );
}
