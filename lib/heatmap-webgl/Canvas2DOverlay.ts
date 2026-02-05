/**
 * Canvas 2D Overlay
 * Handles text rendering on top of WebGL canvas
 */

export interface OverlayConfig {
  width: number;
  height: number;
  dpr: number;
  priceAxisWidth: number;
  deltaProfileWidth: number;
  font: string;
  fontSize: number;
}

export interface PriceLabel {
  price: number;
  y: number;
  highlight?: boolean;
}

export interface TimeLabel {
  time: string;
  x: number;
}

export interface StatItem {
  label: string;
  value: string;
  color?: string;
}

export class Canvas2DOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: OverlayConfig;

  constructor(config: OverlayConfig) {
    this.config = config;

    // Create overlay canvas
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.pointerEvents = 'none';

    this.ctx = this.canvas.getContext('2d')!;
    this.resize(config.width, config.height, config.dpr);
  }

  get element(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Resize the overlay canvas
   */
  resize(width: number, height: number, dpr: number = 1): void {
    this.config.width = width;
    this.config.height = height;
    this.config.dpr = dpr;

    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    // Scale context for DPR
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * Clear the overlay
   */
  clear(): void {
    this.ctx.clearRect(0, 0, this.config.width, this.config.height);
  }

  /**
   * Render price axis labels
   */
  renderPriceAxis(labels: PriceLabel[], x: number): void {
    const { ctx } = this;
    const { fontSize, font } = this.config;

    ctx.font = `${fontSize}px ${font}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (const label of labels) {
      ctx.fillStyle = label.highlight ? '#ffffff' : '#9ca3af';
      ctx.fillText(label.price.toFixed(2), x - 4, label.y);
    }
  }

  /**
   * Render time axis labels
   */
  renderTimeAxis(labels: TimeLabel[], y: number): void {
    const { ctx } = this;
    const { fontSize, font } = this.config;

    ctx.font = `${fontSize - 1}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#6b7280';

    for (const label of labels) {
      ctx.fillText(label.time, label.x, y + 2);
    }
  }

  /**
   * Render crosshair with price/time labels
   */
  renderCrosshair(
    x: number,
    y: number,
    price: number,
    time: string,
    priceAxisX: number
  ): void {
    const { ctx, config } = this;

    // Crosshair lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(config.deltaProfileWidth, y);
    ctx.lineTo(priceAxisX, y);
    ctx.stroke();

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, config.height);
    ctx.stroke();

    ctx.setLineDash([]);

    // Price label background
    const priceText = price.toFixed(2);
    ctx.font = `bold ${config.fontSize}px ${config.font}`;
    const priceWidth = ctx.measureText(priceText).width + 8;
    const labelHeight = config.fontSize + 6;

    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(priceAxisX, y - labelHeight / 2, priceWidth, labelHeight);

    // Price label text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(priceText, priceAxisX + 4, y);

    // Time label
    ctx.font = `${config.fontSize - 1}px ${config.font}`;
    const timeWidth = ctx.measureText(time).width + 8;

    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(x - timeWidth / 2, config.height - labelHeight, timeWidth, labelHeight);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(time, x, config.height - labelHeight / 2);
  }

  /**
   * Render stats bar at bottom
   */
  renderStatsBar(stats: StatItem[], y: number): void {
    const { ctx, config } = this;

    ctx.font = `${config.fontSize - 1}px ${config.font}`;
    ctx.textBaseline = 'middle';

    let x = config.deltaProfileWidth + 8;
    const gap = 16;

    for (const stat of stats) {
      // Label
      ctx.fillStyle = '#6b7280';
      ctx.textAlign = 'left';
      ctx.fillText(stat.label + ':', x, y);
      x += ctx.measureText(stat.label + ':').width + 4;

      // Value
      ctx.fillStyle = stat.color || '#ffffff';
      ctx.fillText(stat.value, x, y);
      x += ctx.measureText(stat.value).width + gap;
    }
  }

  /**
   * Render current price line label
   */
  renderCurrentPriceLabel(price: number, y: number, x: number): void {
    const { ctx, config } = this;

    const text = price.toFixed(2);
    ctx.font = `bold ${config.fontSize}px ${config.font}`;
    const width = ctx.measureText(text).width + 10;
    const height = config.fontSize + 6;

    // Background
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(x, y - height / 2, width, height);

    // Text
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 5, y);
  }

  /**
   * Render delta profile labels
   */
  renderDeltaLabels(
    labels: { y: number; bid: number; ask: number; delta: number }[]
  ): void {
    const { ctx, config } = this;

    ctx.font = `${config.fontSize - 2}px ${config.font}`;
    ctx.textBaseline = 'middle';

    for (const label of labels) {
      // Bid volume (left)
      ctx.fillStyle = '#22c55e';
      ctx.textAlign = 'right';
      ctx.fillText(label.bid.toFixed(0), config.deltaProfileWidth / 2 - 2, label.y);

      // Ask volume (right)
      ctx.fillStyle = '#ef4444';
      ctx.textAlign = 'left';
      ctx.fillText(label.ask.toFixed(0), config.deltaProfileWidth / 2 + 2, label.y);
    }
  }

  /**
   * Render tooltip
   */
  renderTooltip(x: number, y: number, lines: string[]): void {
    const { ctx, config } = this;

    ctx.font = `${config.fontSize}px ${config.font}`;
    const padding = 8;
    const lineHeight = config.fontSize + 4;

    // Calculate dimensions
    let maxWidth = 0;
    for (const line of lines) {
      maxWidth = Math.max(maxWidth, ctx.measureText(line).width);
    }
    const width = maxWidth + padding * 2;
    const height = lines.length * lineHeight + padding * 2;

    // Position (avoid going off screen)
    let tooltipX = x + 12;
    let tooltipY = y - height / 2;
    if (tooltipX + width > config.width) tooltipX = x - width - 12;
    if (tooltipY < 0) tooltipY = 0;
    if (tooltipY + height > config.height) tooltipY = config.height - height;

    // Background
    ctx.fillStyle = 'rgba(24, 24, 27, 0.95)';
    ctx.strokeStyle = '#3f3f46';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.roundRect(tooltipX, tooltipY, width, height, 4);
    ctx.fill();
    ctx.stroke();

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    let textY = tooltipY + padding;
    for (const line of lines) {
      ctx.fillText(line, tooltipX + padding, textY);
      textY += lineHeight;
    }
  }

  /**
   * Destroy the overlay
   */
  destroy(): void {
    this.canvas.remove();
  }
}
