/**
 * WebGL Heatmap Types
 */

import type REGL from 'regl';

// Re-export regl types
export type { REGL };

export interface WebGLRenderConfig {
  width: number;
  height: number;
  devicePixelRatio: number;
  priceRange: { min: number; max: number };
  tickSize: number;
  colors: {
    background: string;
    bidGradient: string[];
    askGradient: string[];
    gridColor: string;
    bestBidColor: string;
    bestAskColor: string;
    buyColor: string;
    sellColor: string;
  };
  contrast: number;
  upperCutoff: number;
}

export interface HeatmapCell {
  price: number;
  timeIndex: number;
  intensity: number;
  side: 'bid' | 'ask';
}

export interface PassiveOrderData {
  price: number;
  size: number;
  side: 'bid' | 'ask';
  intensity: number;
  x: number; // Screen X position
}

export interface TradeData {
  price: number;
  size: number;
  side: 'buy' | 'sell';
  x: number;
  buyRatio: number; // For pie chart: buy / (buy + sell)
  age: number; // 0-1, for fade animation
}

export interface LineData {
  points: { x: number; y: number }[];
  color: [number, number, number, number]; // RGBA normalized
  width: number;
  dashed?: boolean;
}

export interface DirtyFlags {
  heatmap: boolean;
  trades: boolean;
  lines: boolean;
  priceRange: boolean;
  settings: boolean;
}

export interface WebGLBuffers {
  heatmapPositions: Float32Array;
  heatmapIntensities: Float32Array;
  heatmapSides: Float32Array;
  tradePositions: Float32Array;
  tradeSizes: Float32Array;
  tradeBuyRatios: Float32Array;
  tradeAges: Float32Array;
  linePositions: Float32Array;
  lineColors: Float32Array;
}

// Shader uniform types
export interface HeatmapUniforms {
  projection: REGL.Mat4;
  bidGradient: REGL.Texture2D;
  askGradient: REGL.Texture2D;
  contrast: number;
  upperCutoff: number;
  cellWidth: number;
  cellHeight: number;
}

export interface TradeUniforms {
  projection: REGL.Mat4;
  buyColor: [number, number, number];
  sellColor: [number, number, number];
  opacity: number;
  maxSize: number;
}

export interface LineUniforms {
  projection: REGL.Mat4;
  color: [number, number, number, number];
  width: number;
}
