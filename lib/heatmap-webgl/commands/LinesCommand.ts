/**
 * Lines Rendering Command
 * Renders grid lines and best bid/ask staircase lines
 */

import type { RenderContext } from '../core/RenderContext';
import type { LineData } from '../types';
import { gridVert, gridFrag, staircaseVert, staircaseFrag } from '../shaders/heatmap';
import { TextureManager } from '../core/TextureManager';

export interface GridRenderProps {
  horizontalLines: number[]; // Y positions
  verticalLines: number[]; // X positions
  color: string;
  opacity: number;
}

export interface StaircaseRenderProps {
  bidPoints: { x: number; y: number }[];
  askPoints: { x: number; y: number }[];
  bidColor: string;
  askColor: string;
  lineWidth: number;
  opacity: number;
}

export class LinesCommand {
  private ctx: RenderContext;
  private gridCommand: ReturnType<RenderContext['regl']> | null = null;
  private staircaseCommand: ReturnType<RenderContext['regl']> | null = null;

  // Reusable buffers
  private gridBuffer: Float32Array;
  private staircaseBuffer: Float32Array;
  private staircaseSideBuffer: Float32Array;
  private maxGridLines: number;
  private maxStaircasePoints: number;

  constructor(ctx: RenderContext, maxGridLines: number = 500, maxStaircasePoints: number = 2000) {
    this.ctx = ctx;
    this.maxGridLines = maxGridLines;
    this.maxStaircasePoints = maxStaircasePoints;

    // Pre-allocate buffers
    // Grid: each line needs 2 points * 2 components = 4 floats
    this.gridBuffer = new Float32Array(maxGridLines * 4);
    // Staircase: x, y pairs
    this.staircaseBuffer = new Float32Array(maxStaircasePoints * 2);
    this.staircaseSideBuffer = new Float32Array(maxStaircasePoints);

    this.createGridCommand();
    this.createStaircaseCommand();
  }

  private createGridCommand(): void {
    const { regl } = this.ctx;

    const positionBuf = regl.buffer({
      data: this.gridBuffer,
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
      },

      uniforms: {
        projection: regl.prop<{ projection: number[] }, 'projection'>('projection'),
        color: regl.prop<{ color: [number, number, number, number] }, 'color'>('color'),
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
  }

  private createStaircaseCommand(): void {
    const { regl } = this.ctx;

    const positionBuf = regl.buffer({
      data: this.staircaseBuffer,
      usage: 'dynamic',
    });

    const sideBuf = regl.buffer({
      data: this.staircaseSideBuffer,
      usage: 'dynamic',
    });

    this.staircaseCommand = regl({
      vert: staircaseVert,
      frag: staircaseFrag,

      attributes: {
        position: {
          buffer: positionBuf,
          size: 2,
        },
        side: {
          buffer: sideBuf,
          size: 1,
        },
      },

      uniforms: {
        projection: regl.prop<{ projection: number[] }, 'projection'>('projection'),
        bidColor: regl.prop<{ bidColor: [number, number, number] }, 'bidColor'>('bidColor'),
        askColor: regl.prop<{ askColor: [number, number, number] }, 'askColor'>('askColor'),
        lineWidth: regl.prop<{ lineWidth: number }, 'lineWidth'>('lineWidth'),
        opacity: regl.prop<{ opacity: number }, 'opacity'>('opacity'),
      },

      primitive: 'line strip',
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

    (this.staircaseCommand as any)._positionBuf = positionBuf;
    (this.staircaseCommand as any)._sideBuf = sideBuf;
  }

  /**
   * Render grid lines
   */
  renderGrid(props: GridRenderProps, projection: number[], width: number, height: number): void {
    if (!this.gridCommand) return;

    const { horizontalLines, verticalLines, color, opacity } = props;
    const totalLines = horizontalLines.length + verticalLines.length;

    if (totalLines === 0) return;
    if (totalLines > this.maxGridLines) {
      console.warn(`[LinesCommand] Too many grid lines: ${totalLines}, max: ${this.maxGridLines}`);
    }

    const count = Math.min(totalLines, this.maxGridLines);
    let idx = 0;

    // Horizontal lines
    for (let i = 0; i < horizontalLines.length && idx < count; i++) {
      const y = horizontalLines[i];
      this.gridBuffer[idx * 4] = 0; // x1
      this.gridBuffer[idx * 4 + 1] = y; // y1
      this.gridBuffer[idx * 4 + 2] = width; // x2
      this.gridBuffer[idx * 4 + 3] = y; // y2
      idx++;
    }

    // Vertical lines
    for (let i = 0; i < verticalLines.length && idx < count; i++) {
      const x = verticalLines[i];
      this.gridBuffer[idx * 4] = x;
      this.gridBuffer[idx * 4 + 1] = 0;
      this.gridBuffer[idx * 4 + 2] = x;
      this.gridBuffer[idx * 4 + 3] = height;
      idx++;
    }

    // Upload and draw
    const cmd = this.gridCommand as any;
    cmd._positionBuf.subdata(this.gridBuffer.subarray(0, idx * 4));

    const rgba = TextureManager.parseColor(color);
    rgba[3] *= opacity;

    this.gridCommand({
      projection,
      color: rgba,
      count: idx * 2, // 2 vertices per line
    });
  }

  /**
   * Render staircase lines for best bid/ask
   */
  renderStaircase(props: StaircaseRenderProps, projection: number[]): void {
    if (!this.staircaseCommand) return;

    const { bidPoints, askPoints, bidColor, askColor, lineWidth, opacity } = props;

    // Render bid line
    if (bidPoints.length > 1) {
      this.renderStaircaseLine(bidPoints, 0, bidColor, askColor, lineWidth, opacity, projection);
    }

    // Render ask line
    if (askPoints.length > 1) {
      this.renderStaircaseLine(askPoints, 1, bidColor, askColor, lineWidth, opacity, projection);
    }
  }

  private renderStaircaseLine(
    points: { x: number; y: number }[],
    side: number,
    bidColor: string,
    askColor: string,
    lineWidth: number,
    opacity: number,
    projection: number[]
  ): void {
    if (!this.staircaseCommand) return;

    // Generate staircase pattern: for each point, we create horizontal then vertical segments
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

    const count = Math.min(staircasePoints.length, this.maxStaircasePoints);

    // Update buffers
    for (let i = 0; i < count; i++) {
      this.staircaseBuffer[i * 2] = staircasePoints[i].x;
      this.staircaseBuffer[i * 2 + 1] = staircasePoints[i].y;
      this.staircaseSideBuffer[i] = side;
    }

    // Upload
    const cmd = this.staircaseCommand as any;
    cmd._positionBuf.subdata(this.staircaseBuffer.subarray(0, count * 2));
    cmd._sideBuf.subdata(this.staircaseSideBuffer.subarray(0, count));

    // Draw
    this.staircaseCommand({
      projection,
      bidColor: TextureManager.parseColorRGB(bidColor),
      askColor: TextureManager.parseColorRGB(askColor),
      lineWidth,
      opacity,
      count,
    });
  }

  /**
   * Destroy commands and release resources
   */
  destroy(): void {
    if (this.gridCommand) {
      (this.gridCommand as any)._positionBuf?.destroy();
    }
    if (this.staircaseCommand) {
      (this.staircaseCommand as any)._positionBuf?.destroy();
      (this.staircaseCommand as any)._sideBuf?.destroy();
    }
    this.gridCommand = null;
    this.staircaseCommand = null;
  }
}
