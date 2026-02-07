/**
 * Lines Rendering Command
 * Renders grid lines and best bid/ask staircase lines with enhanced visuals
 */

import type { RenderContext } from '../core/RenderContext';
import type { LineData } from '../types';
import { gridVert, gridFrag, tickMarkVert, tickMarkFrag, staircaseVert, staircaseFrag, fillAreaVert, fillAreaFrag } from '../shaders/heatmap';
import { TextureManager } from '../core/TextureManager';

export interface GridLine {
  position: number;  // Y for horizontal, X for vertical
  isMajor: boolean;
}

export interface GridRenderProps {
  horizontalLines: GridLine[]; // Y positions with major/minor
  verticalLines: GridLine[]; // X positions with major/minor
  majorColor: string;
  minorColor: string;
  majorOpacity: number;
  minorOpacity: number;
  gridStyle: 'solid' | 'dashed' | 'dotted';
}

export interface TickMarkRenderProps {
  ticks: { y: number; isHighlight: boolean }[];
  x: number;          // X position of tick marks
  tickSize: number;   // Length of tick mark
  normalColor: string;
  highlightColor: string;
  opacity: number;
}

export interface StaircaseRenderProps {
  bidPoints: { x: number; y: number }[];
  askPoints: { x: number; y: number }[];
  bidColor: string;
  askColor: string;
  lineWidth: number;
  opacity: number;
  glowIntensity?: number;
  showFill?: boolean;
  // Trail animation
  showTrail?: boolean;
  trailFadeSpeed?: number;
  animationTime?: number; // 0-1 cycling animation time
}

export class LinesCommand {
  private ctx: RenderContext;
  private gridCommand: ReturnType<RenderContext['regl']> | null = null;
  private tickMarkCommand: ReturnType<RenderContext['regl']> | null = null;
  private staircaseCommand: ReturnType<RenderContext['regl']> | null = null;
  private fillCommand: ReturnType<RenderContext['regl']> | null = null;

  // Reusable buffers
  private gridBuffer: Float32Array;
  private gridLineTypeBuffer: Float32Array; // 0 = minor, 1 = major
  // Tick mark buffers
  private tickBuffer: Float32Array;
  private tickHighlightBuffer: Float32Array;
  // Thick line buffers (2 triangles per segment = 6 vertices)
  private staircasePositionBuffer: Float32Array;
  private staircaseNormalBuffer: Float32Array;
  private staircaseSideBuffer: Float32Array;
  private staircaseProgressBuffer: Float32Array;
  private staircaseEdgeBuffer: Float32Array;
  // Fill area buffers
  private fillPositionBuffer: Float32Array;
  private fillSideBuffer: Float32Array;

  private maxGridLines: number;
  private maxStaircaseVertices: number;

  constructor(ctx: RenderContext, maxGridLines: number = 500, maxStaircaseVertices: number = 12000) {
    this.ctx = ctx;
    this.maxGridLines = maxGridLines;
    this.maxStaircaseVertices = maxStaircaseVertices;

    // Pre-allocate buffers
    // Grid: each line needs 2 points * 2 components = 4 floats + 1 lineType per vertex
    this.gridBuffer = new Float32Array(maxGridLines * 4);
    this.gridLineTypeBuffer = new Float32Array(maxGridLines * 2); // 2 vertices per line

    // Tick marks: each tick needs 2 points * 2 components = 4 floats
    this.tickBuffer = new Float32Array(maxGridLines * 4);
    this.tickHighlightBuffer = new Float32Array(maxGridLines * 2);

    // Thick staircase line: 6 vertices per segment (2 triangles)
    // Each vertex: position (2), normal (2), side (1), progress (1), edge (1)
    this.staircasePositionBuffer = new Float32Array(maxStaircaseVertices * 2);
    this.staircaseNormalBuffer = new Float32Array(maxStaircaseVertices * 2);
    this.staircaseSideBuffer = new Float32Array(maxStaircaseVertices);
    this.staircaseProgressBuffer = new Float32Array(maxStaircaseVertices);
    this.staircaseEdgeBuffer = new Float32Array(maxStaircaseVertices);

    // Fill area buffers
    this.fillPositionBuffer = new Float32Array(maxStaircaseVertices * 2);
    this.fillSideBuffer = new Float32Array(maxStaircaseVertices);

    this.createGridCommand();
    this.createTickMarkCommand();
    this.createStaircaseCommand();
    this.createFillCommand();
  }

  private createGridCommand(): void {
    const { regl } = this.ctx;

    const positionBuf = regl.buffer({
      data: this.gridBuffer,
      usage: 'dynamic',
    });

    const lineTypeBuf = regl.buffer({
      data: this.gridLineTypeBuffer,
      usage: 'dynamic',
    });

    this.gridCommand = regl({
      vert: gridVert,
      frag: gridFrag,

      attributes: {
        position: {
          buffer: positionBuf,
          size: 2,
        },
        lineType: {
          buffer: lineTypeBuf,
          size: 1,
        },
      },

      uniforms: {
        projection: regl.prop<{ projection: number[] }, 'projection'>('projection'),
        majorColor: regl.prop<{ majorColor: [number, number, number, number] }, 'majorColor'>('majorColor'),
        minorColor: regl.prop<{ minorColor: [number, number, number, number] }, 'minorColor'>('minorColor'),
        dashSize: regl.prop<{ dashSize: number }, 'dashSize'>('dashSize'),
        gapSize: regl.prop<{ gapSize: number }, 'gapSize'>('gapSize'),
        lineStart: regl.prop<{ lineStart: [number, number] }, 'lineStart'>('lineStart'),
        lineEnd: regl.prop<{ lineEnd: [number, number] }, 'lineEnd'>('lineEnd'),
      },

      primitive: 'lines',
      count: regl.prop<{ count: number }, 'count'>('count'),

      blend: {
        enable: true,
        func: {
          srcRGB: 'src alpha',
          srcAlpha: 1,
          dstRGB: 'one minus src alpha',
          dstAlpha: 1,
        },
      },

      depth: { enable: false },
      lineWidth: 1,
    });

    (this.gridCommand as any)._positionBuf = positionBuf;
    (this.gridCommand as any)._lineTypeBuf = lineTypeBuf;
  }

  private createTickMarkCommand(): void {
    const { regl } = this.ctx;

    const positionBuf = regl.buffer({ data: this.tickBuffer, usage: 'dynamic' });
    const highlightBuf = regl.buffer({ data: this.tickHighlightBuffer, usage: 'dynamic' });

    this.tickMarkCommand = regl({
      vert: tickMarkVert,
      frag: tickMarkFrag,

      attributes: {
        position: { buffer: positionBuf, size: 2 },
        highlight: { buffer: highlightBuf, size: 1 },
      },

      uniforms: {
        projection: regl.prop<{ projection: number[] }, 'projection'>('projection'),
        normalColor: regl.prop<{ normalColor: [number, number, number] }, 'normalColor'>('normalColor'),
        highlightColor: regl.prop<{ highlightColor: [number, number, number] }, 'highlightColor'>('highlightColor'),
        opacity: regl.prop<{ opacity: number }, 'opacity'>('opacity'),
      },

      primitive: 'lines',
      count: regl.prop<{ count: number }, 'count'>('count'),

      blend: {
        enable: true,
        func: {
          srcRGB: 'src alpha',
          srcAlpha: 1,
          dstRGB: 'one minus src alpha',
          dstAlpha: 1,
        },
      },

      depth: { enable: false },
      lineWidth: 1,
    });

    (this.tickMarkCommand as any)._positionBuf = positionBuf;
    (this.tickMarkCommand as any)._highlightBuf = highlightBuf;
  }

  private createStaircaseCommand(): void {
    const { regl } = this.ctx;

    const positionBuf = regl.buffer({ data: this.staircasePositionBuffer, usage: 'dynamic' });
    const normalBuf = regl.buffer({ data: this.staircaseNormalBuffer, usage: 'dynamic' });
    const sideBuf = regl.buffer({ data: this.staircaseSideBuffer, usage: 'dynamic' });
    const progressBuf = regl.buffer({ data: this.staircaseProgressBuffer, usage: 'dynamic' });
    const edgeBuf = regl.buffer({ data: this.staircaseEdgeBuffer, usage: 'dynamic' });

    this.staircaseCommand = regl({
      vert: staircaseVert,
      frag: staircaseFrag,

      attributes: {
        position: { buffer: positionBuf, size: 2 },
        normal: { buffer: normalBuf, size: 2 },
        side: { buffer: sideBuf, size: 1 },
        progress: { buffer: progressBuf, size: 1 },
        edge: { buffer: edgeBuf, size: 1 },
      },

      uniforms: {
        projection: regl.prop<{ projection: number[] }, 'projection'>('projection'),
        bidColor: regl.prop<{ bidColor: [number, number, number] }, 'bidColor'>('bidColor'),
        askColor: regl.prop<{ askColor: [number, number, number] }, 'askColor'>('askColor'),
        lineWidth: regl.prop<{ lineWidth: number }, 'lineWidth'>('lineWidth'),
        opacity: regl.prop<{ opacity: number }, 'opacity'>('opacity'),
        glowIntensity: regl.prop<{ glowIntensity: number }, 'glowIntensity'>('glowIntensity'),
        time: regl.prop<{ time: number }, 'time'>('time'),
        trailEnabled: regl.prop<{ trailEnabled: number }, 'trailEnabled'>('trailEnabled'),
        trailFadeSpeed: regl.prop<{ trailFadeSpeed: number }, 'trailFadeSpeed'>('trailFadeSpeed'),
      },

      primitive: 'triangles',
      count: regl.prop<{ count: number }, 'count'>('count'),

      blend: {
        enable: true,
        func: {
          srcRGB: 'src alpha',
          srcAlpha: 'one',
          dstRGB: 'one minus src alpha',
          dstAlpha: 'one',
        },
      },

      depth: { enable: false },
    });

    (this.staircaseCommand as any)._positionBuf = positionBuf;
    (this.staircaseCommand as any)._normalBuf = normalBuf;
    (this.staircaseCommand as any)._sideBuf = sideBuf;
    (this.staircaseCommand as any)._progressBuf = progressBuf;
    (this.staircaseCommand as any)._edgeBuf = edgeBuf;
  }

  private createFillCommand(): void {
    const { regl } = this.ctx;

    const positionBuf = regl.buffer({ data: this.fillPositionBuffer, usage: 'dynamic' });
    const sideBuf = regl.buffer({ data: this.fillSideBuffer, usage: 'dynamic' });

    this.fillCommand = regl({
      vert: fillAreaVert,
      frag: fillAreaFrag,

      attributes: {
        position: { buffer: positionBuf, size: 2 },
        side: { buffer: sideBuf, size: 1 },
      },

      uniforms: {
        projection: regl.prop<{ projection: number[] }, 'projection'>('projection'),
        bidColor: regl.prop<{ bidColor: [number, number, number] }, 'bidColor'>('bidColor'),
        askColor: regl.prop<{ askColor: [number, number, number] }, 'askColor'>('askColor'),
        opacity: regl.prop<{ opacity: number }, 'opacity'>('opacity'),
        viewportWidth: regl.prop<{ viewportWidth: number }, 'viewportWidth'>('viewportWidth'),
      },

      primitive: 'triangles',
      count: regl.prop<{ count: number }, 'count'>('count'),

      blend: {
        enable: true,
        func: {
          srcRGB: 'src alpha',
          srcAlpha: 'one',
          dstRGB: 'one minus src alpha',
          dstAlpha: 'one',
        },
      },

      depth: { enable: false },
    });

    (this.fillCommand as any)._positionBuf = positionBuf;
    (this.fillCommand as any)._sideBuf = sideBuf;
  }

  /**
   * Render grid lines with major/minor distinction
   */
  renderGrid(props: GridRenderProps, projection: number[], width: number, height: number): void {
    if (!this.gridCommand) return;

    const { horizontalLines, verticalLines, majorColor, minorColor, majorOpacity, minorOpacity, gridStyle } = props;
    const totalLines = horizontalLines.length + verticalLines.length;

    if (totalLines === 0) return;
    if (totalLines > this.maxGridLines) {
      console.warn(`[LinesCommand] Too many grid lines: ${totalLines}, max: ${this.maxGridLines}`);
    }

    const count = Math.min(totalLines, this.maxGridLines);
    let idx = 0;

    // Horizontal lines
    for (let i = 0; i < horizontalLines.length && idx < count; i++) {
      const line = horizontalLines[i];
      this.gridBuffer[idx * 4] = 0; // x1
      this.gridBuffer[idx * 4 + 1] = line.position; // y1
      this.gridBuffer[idx * 4 + 2] = width; // x2
      this.gridBuffer[idx * 4 + 3] = line.position; // y2
      // Both vertices get same line type
      this.gridLineTypeBuffer[idx * 2] = line.isMajor ? 1 : 0;
      this.gridLineTypeBuffer[idx * 2 + 1] = line.isMajor ? 1 : 0;
      idx++;
    }

    // Vertical lines
    for (let i = 0; i < verticalLines.length && idx < count; i++) {
      const line = verticalLines[i];
      this.gridBuffer[idx * 4] = line.position;
      this.gridBuffer[idx * 4 + 1] = 0;
      this.gridBuffer[idx * 4 + 2] = line.position;
      this.gridBuffer[idx * 4 + 3] = height;
      this.gridLineTypeBuffer[idx * 2] = line.isMajor ? 1 : 0;
      this.gridLineTypeBuffer[idx * 2 + 1] = line.isMajor ? 1 : 0;
      idx++;
    }

    // Upload buffers
    const cmd = this.gridCommand as any;
    cmd._positionBuf.subdata(this.gridBuffer.subarray(0, idx * 4));
    cmd._lineTypeBuf.subdata(this.gridLineTypeBuffer.subarray(0, idx * 2));

    // Parse colors
    const majorRgba = TextureManager.parseColor(majorColor);
    majorRgba[3] *= majorOpacity;
    const minorRgba = TextureManager.parseColor(minorColor);
    minorRgba[3] *= minorOpacity;

    // Dash settings based on style
    let dashSize = 0;
    let gapSize = 0;
    if (gridStyle === 'dashed') {
      dashSize = 8;
      gapSize = 4;
    } else if (gridStyle === 'dotted') {
      dashSize = 2;
      gapSize = 4;
    }

    this.gridCommand({
      projection,
      majorColor: majorRgba,
      minorColor: minorRgba,
      dashSize,
      gapSize,
      lineStart: [0, 0],
      lineEnd: [width, height],
      count: idx * 2, // 2 vertices per line
    });
  }

  /**
   * Render tick marks on price axis
   */
  renderTickMarks(props: TickMarkRenderProps, projection: number[]): void {
    if (!this.tickMarkCommand) return;

    const { ticks, x, tickSize, normalColor, highlightColor, opacity } = props;

    if (ticks.length === 0) return;

    const count = Math.min(ticks.length, this.maxGridLines);
    let idx = 0;

    for (let i = 0; i < count; i++) {
      const tick = ticks[i];
      // Tick line from x to x + tickSize
      this.tickBuffer[idx * 4] = x;
      this.tickBuffer[idx * 4 + 1] = tick.y;
      this.tickBuffer[idx * 4 + 2] = x + tickSize;
      this.tickBuffer[idx * 4 + 3] = tick.y;
      this.tickHighlightBuffer[idx * 2] = tick.isHighlight ? 1 : 0;
      this.tickHighlightBuffer[idx * 2 + 1] = tick.isHighlight ? 1 : 0;
      idx++;
    }

    // Upload buffers
    const cmd = this.tickMarkCommand as any;
    cmd._positionBuf.subdata(this.tickBuffer.subarray(0, idx * 4));
    cmd._highlightBuf.subdata(this.tickHighlightBuffer.subarray(0, idx * 2));

    this.tickMarkCommand({
      projection,
      normalColor: TextureManager.parseColorRGB(normalColor),
      highlightColor: TextureManager.parseColorRGB(highlightColor),
      opacity,
      count: idx * 2, // 2 vertices per tick
    });
  }

  /**
   * Render staircase lines for best bid/ask with enhanced visuals
   */
  renderStaircase(props: StaircaseRenderProps, projection: number[], viewportWidth?: number): void {
    if (!this.staircaseCommand) return;

    const {
      bidPoints,
      askPoints,
      bidColor,
      askColor,
      lineWidth,
      opacity,
      glowIntensity = 0.6,
      showFill = false,
      showTrail = false,
      trailFadeSpeed = 1.0,
      animationTime = 0,
    } = props;

    const bidColorRGB = TextureManager.parseColorRGB(bidColor);
    const askColorRGB = TextureManager.parseColorRGB(askColor);

    // Optionally render fill between bid and ask
    if (showFill && this.fillCommand && bidPoints.length > 1 && askPoints.length > 1 && viewportWidth) {
      this.renderFillArea(bidPoints, askPoints, bidColorRGB, askColorRGB, opacity * 0.3, viewportWidth, projection);
    }

    // Trail animation parameters
    const trailParams = {
      enabled: showTrail ? 1.0 : 0.0,
      fadeSpeed: trailFadeSpeed,
      time: animationTime,
    };

    // Render bid line (below - green)
    if (bidPoints.length > 1) {
      this.renderThickStaircaseLine(bidPoints, 0, bidColorRGB, askColorRGB, lineWidth, opacity, glowIntensity, projection, trailParams);
    }

    // Render ask line (above - red)
    if (askPoints.length > 1) {
      this.renderThickStaircaseLine(askPoints, 1, bidColorRGB, askColorRGB, lineWidth, opacity, glowIntensity, projection, trailParams);
    }
  }

  /**
   * Generate thick line geometry using triangle strips
   */
  private renderThickStaircaseLine(
    points: { x: number; y: number }[],
    side: number,
    bidColorRGB: [number, number, number],
    askColorRGB: [number, number, number],
    lineWidth: number,
    opacity: number,
    glowIntensity: number,
    projection: number[],
    trailParams: { enabled: number; fadeSpeed: number; time: number } = { enabled: 0, fadeSpeed: 1, time: 0 }
  ): void {
    if (!this.staircaseCommand || points.length < 2) return;

    // Generate staircase pattern: for each point, create horizontal then vertical segments
    const staircasePoints: { x: number; y: number }[] = [];

    for (let i = 0; i < points.length; i++) {
      const pt = points[i];

      if (i > 0) {
        // Add horizontal segment (from previous x to current x at previous y)
        const prev = points[i - 1];
        staircasePoints.push({ x: pt.x, y: prev.y });
      }

      staircasePoints.push(pt);
    }

    if (staircasePoints.length < 2) return;

    // Generate thick line geometry (2 triangles = 6 vertices per segment)
    let vertexCount = 0;
    const totalPoints = staircasePoints.length;

    for (let i = 0; i < totalPoints - 1; i++) {
      const p0 = staircasePoints[i];
      const p1 = staircasePoints[i + 1];

      // Calculate direction and perpendicular normal
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.sqrt(dx * dx + dy * dy);

      if (len < 0.001) continue; // Skip zero-length segments

      // Normalized perpendicular (90 degrees rotated)
      const nx = -dy / len;
      const ny = dx / len;

      // Progress for time-based fade (0 = oldest, 1 = newest)
      const progress0 = i / (totalPoints - 1);
      const progress1 = (i + 1) / (totalPoints - 1);

      // Check buffer capacity
      if (vertexCount + 6 > this.maxStaircaseVertices) break;

      // Generate 2 triangles (6 vertices) for this segment
      // Triangle 1: p0-bottom, p0-top, p1-top
      // Triangle 2: p0-bottom, p1-top, p1-bottom

      const verts = [
        // Triangle 1
        { pos: p0, edge: -1, progress: progress0 },
        { pos: p0, edge: 1, progress: progress0 },
        { pos: p1, edge: 1, progress: progress1 },
        // Triangle 2
        { pos: p0, edge: -1, progress: progress0 },
        { pos: p1, edge: 1, progress: progress1 },
        { pos: p1, edge: -1, progress: progress1 },
      ];

      for (const v of verts) {
        this.staircasePositionBuffer[vertexCount * 2] = v.pos.x;
        this.staircasePositionBuffer[vertexCount * 2 + 1] = v.pos.y;
        this.staircaseNormalBuffer[vertexCount * 2] = nx;
        this.staircaseNormalBuffer[vertexCount * 2 + 1] = ny;
        this.staircaseSideBuffer[vertexCount] = side;
        this.staircaseProgressBuffer[vertexCount] = v.progress;
        this.staircaseEdgeBuffer[vertexCount] = v.edge;
        vertexCount++;
      }
    }

    if (vertexCount === 0) return;

    // Upload buffers
    const cmd = this.staircaseCommand as any;
    cmd._positionBuf.subdata(this.staircasePositionBuffer.subarray(0, vertexCount * 2));
    cmd._normalBuf.subdata(this.staircaseNormalBuffer.subarray(0, vertexCount * 2));
    cmd._sideBuf.subdata(this.staircaseSideBuffer.subarray(0, vertexCount));
    cmd._progressBuf.subdata(this.staircaseProgressBuffer.subarray(0, vertexCount));
    cmd._edgeBuf.subdata(this.staircaseEdgeBuffer.subarray(0, vertexCount));

    // Draw
    this.staircaseCommand({
      projection,
      bidColor: bidColorRGB,
      askColor: askColorRGB,
      lineWidth,
      opacity,
      glowIntensity,
      time: trailParams.time,
      trailEnabled: trailParams.enabled,
      trailFadeSpeed: trailParams.fadeSpeed,
      count: vertexCount,
    });
  }

  /**
   * Render semi-transparent fill area between bid and ask lines
   */
  private renderFillArea(
    bidPoints: { x: number; y: number }[],
    askPoints: { x: number; y: number }[],
    bidColorRGB: [number, number, number],
    askColorRGB: [number, number, number],
    opacity: number,
    viewportWidth: number,
    projection: number[]
  ): void {
    if (!this.fillCommand) return;

    // For simplicity, create vertical strips between bid and ask at each X position
    // This creates a "spread" visualization

    let vertexCount = 0;
    const numPoints = Math.min(bidPoints.length, askPoints.length);

    for (let i = 0; i < numPoints - 1; i++) {
      const bidP0 = bidPoints[i];
      const bidP1 = bidPoints[i + 1];
      const askP0 = askPoints[i];
      const askP1 = askPoints[i + 1];

      if (vertexCount + 6 > this.maxStaircaseVertices) break;

      // Create quad between bid and ask (2 triangles)
      // Triangle 1: bid0, ask0, ask1
      // Triangle 2: bid0, ask1, bid1
      const verts = [
        { x: bidP0.x, y: bidP0.y, side: 0 },
        { x: askP0.x, y: askP0.y, side: 1 },
        { x: askP1.x, y: askP1.y, side: 1 },
        { x: bidP0.x, y: bidP0.y, side: 0 },
        { x: askP1.x, y: askP1.y, side: 1 },
        { x: bidP1.x, y: bidP1.y, side: 0 },
      ];

      for (const v of verts) {
        this.fillPositionBuffer[vertexCount * 2] = v.x;
        this.fillPositionBuffer[vertexCount * 2 + 1] = v.y;
        this.fillSideBuffer[vertexCount] = v.side;
        vertexCount++;
      }
    }

    if (vertexCount === 0) return;

    // Upload
    const cmd = this.fillCommand as any;
    cmd._positionBuf.subdata(this.fillPositionBuffer.subarray(0, vertexCount * 2));
    cmd._sideBuf.subdata(this.fillSideBuffer.subarray(0, vertexCount));

    // Draw
    this.fillCommand({
      projection,
      bidColor: bidColorRGB,
      askColor: askColorRGB,
      opacity,
      viewportWidth,
      count: vertexCount,
    });
  }

  /**
   * Destroy commands and release resources
   */
  destroy(): void {
    if (this.gridCommand) {
      (this.gridCommand as any)._positionBuf?.destroy();
      (this.gridCommand as any)._lineTypeBuf?.destroy();
    }
    if (this.tickMarkCommand) {
      (this.tickMarkCommand as any)._positionBuf?.destroy();
      (this.tickMarkCommand as any)._highlightBuf?.destroy();
    }
    if (this.staircaseCommand) {
      (this.staircaseCommand as any)._positionBuf?.destroy();
      (this.staircaseCommand as any)._normalBuf?.destroy();
      (this.staircaseCommand as any)._sideBuf?.destroy();
      (this.staircaseCommand as any)._progressBuf?.destroy();
      (this.staircaseCommand as any)._edgeBuf?.destroy();
    }
    if (this.fillCommand) {
      (this.fillCommand as any)._positionBuf?.destroy();
      (this.fillCommand as any)._sideBuf?.destroy();
    }
    this.gridCommand = null;
    this.tickMarkCommand = null;
    this.staircaseCommand = null;
    this.fillCommand = null;
  }
}
