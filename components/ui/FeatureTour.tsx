'use client';

import { useState, useEffect, useCallback } from 'react';

interface TourStep {
  target: string; // CSS selector
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const TOUR_STEPS: TourStep[] = [
  {
    target: '[aria-label="Main navigation"]',
    title: 'Navigation Bar',
    description: 'Switch between all tools using these pills. Use Alt+1 through Alt+0 for keyboard shortcuts.',
    position: 'bottom',
  },
  {
    target: 'a[href="/live"]',
    title: 'Live Charts',
    description: 'Real-time candlestick charts with order flow data from multiple exchanges.',
    position: 'bottom',
  },
  {
    target: 'a[href="/footprint"]',
    title: 'Footprint Chart',
    description: 'Analyze delta profiles, volume clusters, and trade imbalances at each price level.',
    position: 'bottom',
  },
  {
    target: 'a[href="/liquidity"]',
    title: 'Liquidity Heatmap',
    description: 'GPU-accelerated visualization of orderbook depth. See where liquidity sits in real-time.',
    position: 'bottom',
  },
  {
    target: '[aria-label="Change theme"]',
    title: 'Theme Picker',
    description: 'Customize the interface with multiple color themes. Press Ctrl+T for quick access.',
    position: 'bottom',
  },
  {
    target: '[aria-label="Account settings"]',
    title: 'Account & Settings',
    description: 'Manage your profile, configure brokers, set preferences, and connect data feeds.',
    position: 'bottom',
  },
];

const TOUR_STORAGE_KEY = 'senzoukria-tour-completed';

export default function FeatureTour() {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Check if tour should auto-start
  useEffect(() => {
    const completed = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!completed) {
      // Delay to let the UI settle
      const timer = setTimeout(() => setIsActive(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const measureTarget = useCallback((stepIndex: number) => {
    const step = TOUR_STEPS[stepIndex];
    if (!step) return;

    const el = document.querySelector(step.target);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    setSpotlightRect(rect);

    // Calculate tooltip position
    const padding = 16;
    const tooltipWidth = 320;
    const tooltipHeight = 120;
    let top = 0;
    let left = 0;

    switch (step.position) {
      case 'bottom':
        top = rect.bottom + padding;
        left = Math.max(padding, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding));
        break;
      case 'top':
        top = rect.top - tooltipHeight - padding;
        left = Math.max(padding, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding));
        break;
      case 'right':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.right + padding;
        break;
      case 'left':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.left - tooltipWidth - padding;
        break;
      default:
        top = rect.bottom + padding;
        left = Math.max(padding, rect.left);
    }

    setTooltipPos({ top, left });
  }, []);

  useEffect(() => {
    if (!isActive) return;
    measureTarget(currentStep);

    const handleResize = () => measureTarget(currentStep);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isActive, currentStep, measureTarget]);

  const handleNext = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  }, [currentStep]);

  const handleComplete = useCallback(() => {
    setIsActive(false);
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleComplete();
      if (e.key === 'ArrowRight' || e.key === 'Enter') handleNext();
      if (e.key === 'ArrowLeft' && currentStep > 0) setCurrentStep(prev => prev - 1);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isActive, handleNext, handleComplete, currentStep]);

  if (!isActive || !spotlightRect) return null;

  const step = TOUR_STEPS[currentStep];
  const isLastStep = currentStep === TOUR_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[9999]" style={{ pointerEvents: 'auto' }}>
      {/* Overlay with spotlight cutout using CSS clip-path */}
      <div
        className="absolute inset-0"
        onClick={handleComplete}
        style={{
          background: 'rgba(0, 0, 0, 0.75)',
          clipPath: `polygon(
            0% 0%, 0% 100%,
            ${spotlightRect.left - 8}px 100%,
            ${spotlightRect.left - 8}px ${spotlightRect.top - 8}px,
            ${spotlightRect.right + 8}px ${spotlightRect.top - 8}px,
            ${spotlightRect.right + 8}px ${spotlightRect.bottom + 8}px,
            ${spotlightRect.left - 8}px ${spotlightRect.bottom + 8}px,
            ${spotlightRect.left - 8}px 100%,
            100% 100%, 100% 0%
          )`,
        }}
      />

      {/* Spotlight ring glow */}
      <div
        className="absolute rounded-xl pointer-events-none"
        style={{
          left: spotlightRect.left - 8,
          top: spotlightRect.top - 8,
          width: spotlightRect.width + 16,
          height: spotlightRect.height + 16,
          boxShadow: '0 0 0 2px rgba(16,185,129,0.5), 0 0 30px rgba(16,185,129,0.2)',
          transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      />

      {/* Tooltip */}
      <div
        className="absolute animate-slideUp"
        style={{
          top: tooltipPos.top,
          left: tooltipPos.left,
          width: 320,
          transition: 'top 0.3s ease, left 0.3s ease',
        }}
      >
        <div
          className="rounded-xl p-5 shadow-2xl"
          style={{
            background: 'var(--surface, #141419)',
            border: '1px solid rgba(74,222,128,0.25)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}
        >
          {/* Step counter */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#86efac' }}>
              Step {currentStep + 1} of {TOUR_STEPS.length}
            </span>
            <button
              onClick={handleComplete}
              className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
            >
              Skip tour
            </button>
          </div>

          <h3 className="text-sm font-semibold text-white/90 mb-1.5">{step.title}</h3>
          <p className="text-xs text-white/50 leading-relaxed mb-4">{step.description}</p>

          {/* Progress dots + Next button */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                  style={{
                    background: i === currentStep ? '#4ade80' : i < currentStep ? '#4ade8066' : 'rgba(255,255,255,0.1)',
                    width: i === currentStep ? 12 : 6,
                  }}
                />
              ))}
            </div>

            <div className="flex gap-2">
              {currentStep > 0 && (
                <button
                  onClick={() => setCurrentStep(prev => prev - 1)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
                >
                  Back
                </button>
              )}
              <button
                onClick={handleNext}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 hover:brightness-110"
                style={{
                  background: 'linear-gradient(135deg, #16a34a, #4ade80)',
                  color: '#fff',
                }}
              >
                {isLastStep ? 'Done' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
