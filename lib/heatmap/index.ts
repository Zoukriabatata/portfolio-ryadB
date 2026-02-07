/**
 * LIQUIDITY HEATMAP MODULE
 *
 * Professional-grade liquidity visualization system.
 * Features:
 * - Core engine with history buffer
 * - Analytics (wall detection, spoof detection, absorption tracking)
 * - Professional rendering with proper visual hierarchy
 * - High-fidelity market simulation
 */

// Legacy exports (kept for compatibility)
export { HeatmapColorEngine, getHeatmapColorEngine, resetHeatmapColorEngine } from './HeatmapColorEngine';
export { HeatmapZoomController, type ZoomState } from './HeatmapZoomController';
export { HeatmapRenderer, type HeatmapRenderConfig } from './HeatmapRenderer';

// Core exports (new institutional-grade system)
export * from './core';

// Analytics exports
export * from './analytics';

// Rendering exports
export * from './rendering';

// Simulation exports
export * from './simulation';
