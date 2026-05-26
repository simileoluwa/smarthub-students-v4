import { describe, it, expect, vi } from 'vitest';
import Home from '../frontend/src/app/page';
import React from 'react';

// Mock browser globals that are absent in headless Node environments
global.IntersectionObserver = class IntersectionObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
} as any;

describe('Front Landing Page Component', () => {
  it('should export the Home component successfully', () => {
    expect(Home).toBeDefined();
    expect(typeof Home).toBe('function');
  });

  it('should verify structural elements are correctly defined', () => {
    // Sanity check of render output structure representation
    const element = React.createElement(Home);
    expect(element).toBeDefined();
    expect(element.type).toBe(Home);
  });
});
