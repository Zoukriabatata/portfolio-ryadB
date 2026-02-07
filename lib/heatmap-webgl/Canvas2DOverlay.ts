/**
 * Canvas 2D Overlay
 * Handles text rendering on top of WebGL canvas
 * Enhanced with dynamic labels and time axis
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
  isSessionMarker?: boolean;
  sessionName?: string;
}

export interface StatItem {
  label: string;
  value: string;
  color?: string;
}

export interface LabelFormatOptions {
  precision: 'auto' | number;
  tickSize: number;
  highlightRoundNumbers: boolean;
  roundNumberInterval: number;
  timeFormat: '12h' | '24h';
  showTimezone: boolean;
  timezone: string;
}

export class Canvas2DOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: OverlayConfig;
  private labelOptions: LabelFormatOptions = {
    precision: 'auto',
    tickSize: 0.01,
    highlightRoundNumbers: true,
    roundNumberInterval: 100,
    timeFormat: '24h',
    showTimezone: false,
    timezone: 'local',
  };

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

  /**
   * Set label formatting options
   */
  setLabelOptions(options: Partial<LabelFormatOptions>): void {
    this.labelOptions = { ...this.labelOptions, ...options };
  }

  /**
   * Format price with auto-precision based on tick size
   */
  formatPrice(price: number): string {
    const { precision, tickSize } = this.labelOptions;

    if (precision === 'auto') {
      // Calculate decimals from tick size
      const tickStr = tickSize.toString();
      const decimalIdx = tickStr.indexOf('.');
      const decimals = decimalIdx === -1 ? 0 : tickStr.length - decimalIdx - 1;
      return price.toFixed(decimals);
    }

    return price.toFixed(precision);
  }

  /**
   * Format time with 12h/24h support
   */
  formatTime(date: Date, includeSeconds: boolean = false): string {
    const { timeFormat, showTimezone, timezone } = this.labelOptions;

    let options: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: timeFormat === '12h',
    };

    if (includeSeconds) {
      options.second = '2-digit';
    }

    if (timezone !== 'local') {
      options.timeZone = timezone;
    }

    let formatted = date.toLocaleTimeString('en-US', options);

    if (showTimezone && timezone !== 'local') {
      const tzAbbr = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'short',
      }).formatToParts(date).find(p => p.type === 'timeZoneName')?.value || '';
      formatted += ` ${tzAbbr}`;
    }

    return formatted;
  }

  /**
   * Check if a price is a "round" number worth highlighting
   */
  isRoundNumber(price: number): boolean {
    const { highlightRoundNumbers, roundNumberInterval } = this.labelOptions;
    if (!highlightRoundNumbers) return false;
    return Math.abs(price % roundNumberInterval) < 0.0001;
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
   * Render price axis labels with dynamic formatting
   */
  renderPriceAxis(labels: PriceLabel[], x: number): void {
    const { ctx } = this;
    const { fontSize, font } = this.config;

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (const label of labels) {
      const isRound = label.highlight || this.isRoundNumber(label.price);
      const priceText = this.formatPrice(label.price);

      if (isRound) {
        // Highlighted (round number) - bold, white, slightly larger
        ctx.font = `bold ${fontSize + 1}px ${font}`;
        ctx.fillStyle = '#ffffff';
      } else {
        // Normal label
        ctx.font = `${fontSize}px ${font}`;
        ctx.fillStyle = '#9ca3af';
      }

      ctx.fillText(priceText, x - 4, label.y);

      // Draw a small tick mark for round numbers
      if (isRound) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - ctx.measureText(priceText).width - 8, label.y);
        ctx.lineTo(x - ctx.measureText(priceText).width - 4, label.y);
        ctx.stroke();
      }
    }
  }

  /**
   * Render time axis labels with session markers
   */
  renderTimeAxis(labels: TimeLabel[], y: number): void {
    const { ctx, config } = this;
    const { fontSize, font } = this.config;

    for (const label of labels) {
      if (label.isSessionMarker) {
        // Session marker - vertical dashed line with label
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)'; // Amber
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        ctx.beginPath();
        ctx.moveTo(label.x, 0);
        ctx.lineTo(label.x, config.height - 20);
        ctx.stroke();

        ctx.setLineDash([]);

        // Session name label
        if (label.sessionName) {
          ctx.font = `bold ${fontSize - 2}px ${font}`;
          ctx.fillStyle = '#fbbf24'; // Amber
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(label.sessionName, label.x, config.height - 22);
        }
      }

      // Time label
      ctx.font = `${fontSize - 1}px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = label.isSessionMarker ? '#fbbf24' : '#6b7280';
      ctx.fillText(label.time, label.x, y + 2);
    }
  }

  /**
   * Render session marker lines (for market open/close times)
   */
  renderSessionMarkers(
    sessions: { name: string; startX: number; endX: number; color: string }[],
    height: number
  ): void {
    const { ctx, config } = this;
    const { fontSize, font } = this.config;

    for (const session of sessions) {
      // Session background
      ctx.fillStyle = `${session.color}10`; // Very transparent
      ctx.fillRect(session.startX, 0, session.endX - session.startX, height);

      // Session border lines
      ctx.strokeStyle = `${session.color}40`;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      // Start line
      ctx.beginPath();
      ctx.moveTo(session.startX, 0);
      ctx.lineTo(session.startX, height - 20);
      ctx.stroke();

      // End line
      ctx.beginPath();
      ctx.moveTo(session.endX, 0);
      ctx.lineTo(session.endX, height - 20);
      ctx.stroke();

      ctx.setLineDash([]);

      // Session name at top
      ctx.font = `${fontSize - 2}px ${font}`;
      ctx.fillStyle = session.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(session.name, (session.startX + session.endX) / 2, 4);
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

    // Price label background - use dynamic formatting
    const priceText = this.formatPrice(price);
    ctx.font = `bold ${config.fontSize}px ${config.font}`;
    const priceWidth = ctx.measureText(priceText).width + 8;
    const labelHeight = config.fontSize + 6;

    // Rounded rectangle for price label
    ctx.fillStyle = '#3b82f6';
    this.roundedRect(priceAxisX, y - labelHeight / 2, priceWidth, labelHeight, 3);
    ctx.fill();

    // Price label text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(priceText, priceAxisX + 4, y);

    // Time label
    ctx.font = `${config.fontSize - 1}px ${config.font}`;
    const timeWidth = ctx.measureText(time).width + 8;

    ctx.fillStyle = '#3b82f6';
    this.roundedRect(x - timeWidth / 2, config.height - labelHeight, timeWidth, labelHeight, 3);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(time, x, config.height - labelHeight / 2);
  }

  /**
   * Helper to draw rounded rectangle
   */
  private roundedRect(x: number, y: number, w: number, h: number, r: number): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
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

    const text = this.formatPrice(price);
    ctx.font = `bold ${config.fontSize}px ${config.font}`;
    const width = ctx.measureText(text).width + 12;
    const height = config.fontSize + 8;

    // Arrow pointer on the left
    const arrowSize = 6;

    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    // Arrow point
    ctx.moveTo(x - arrowSize, y);
    // Top of box
    ctx.lineTo(x, y - height / 2);
    ctx.lineTo(x + width, y - height / 2);
    // Bottom of box
    ctx.lineTo(x + width, y + height / 2);
    ctx.lineTo(x, y + height / 2);
    // Back to arrow point
    ctx.closePath();
    ctx.fill();

    // Text
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 5, y);
  }

  /**
   * Render key level labels (POC, VAH, VAL, VWAP, etc.)
   */
  renderKeyLevelLabels(
    levels: { price: number; y: number; type: string; label?: string; color: string }[],
    x: number
  ): void {
    const { ctx, config } = this;

    for (const level of levels) {
      const text = level.label || level.type.toUpperCase();
      const priceText = this.formatPrice(level.price);

      // Background pill
      ctx.font = `bold ${config.fontSize - 1}px ${config.font}`;
      const labelWidth = ctx.measureText(text).width + 8;
      const priceWidth = ctx.measureText(priceText).width + 6;
      const totalWidth = labelWidth + priceWidth + 4;
      const height = config.fontSize + 4;

      // Background
      ctx.fillStyle = level.color + '30'; // 30% opacity background
      this.roundedRect(x - totalWidth - 4, level.y - height / 2, totalWidth, height, 3);
      ctx.fill();

      // Left border accent
      ctx.fillStyle = level.color;
      ctx.fillRect(x - totalWidth - 4, level.y - height / 2, 2, height);

      // Type label
      ctx.fillStyle = level.color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x - totalWidth, level.y);

      // Price
      ctx.font = `${config.fontSize - 1}px ${config.font}`;
      ctx.fillStyle = '#e5e7eb';
      ctx.fillText(priceText, x - priceWidth - 2, level.y);
    }
  }

  /**
   * Render VWAP line with label
   */
  renderVWAPLine(y: number, price: number, startX: number, endX: number, color: string = '#06b6d4'): void {
    const { ctx, config } = this;

    // Dashed line
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 4]);

    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();

    ctx.setLineDash([]);

    // Label
    const text = `VWAP ${this.formatPrice(price)}`;
    ctx.font = `bold ${config.fontSize - 1}px ${config.font}`;
    const width = ctx.measureText(text).width + 10;
    const height = config.fontSize + 4;

    // Background
    ctx.fillStyle = color + '20';
    this.roundedRect(startX + 4, y - height / 2, width, height, 3);
    ctx.fill();

    // Text
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, startX + 8, y);
  }

  /**
   * Render POC (Point of Control) highlight
   */
  renderPOC(y: number, price: number, startX: number, endX: number, color: string = '#f59e0b'): void {
    const { ctx, config } = this;

    // Thicker solid line
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();

    // Glow effect
    ctx.strokeStyle = color + '40';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();

    // Label with arrow
    const text = `POC ${this.formatPrice(price)}`;
    ctx.font = `bold ${config.fontSize}px ${config.font}`;
    const width = ctx.measureText(text).width + 16;
    const height = config.fontSize + 6;
    const arrowWidth = 6;

    // Arrow background
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(endX + 2, y);
    ctx.lineTo(endX + arrowWidth + 2, y - height / 2);
    ctx.lineTo(endX + width + arrowWidth + 2, y - height / 2);
    ctx.lineTo(endX + width + arrowWidth + 2, y + height / 2);
    ctx.lineTo(endX + arrowWidth + 2, y + height / 2);
    ctx.closePath();
    ctx.fill();

    // Text
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, endX + arrowWidth + 6, y);
  }

  /**
   * Render Value Area (VAH/VAL) zone
   */
  renderValueArea(
    vahY: number,
    valY: number,
    vahPrice: number,
    valPrice: number,
    startX: number,
    endX: number,
    color: string = '#8b5cf6'
  ): void {
    const { ctx, config } = this;

    // Fill area
    ctx.fillStyle = color + '10'; // Very transparent
    ctx.fillRect(startX, vahY, endX - startX, valY - vahY);

    // Border lines
    ctx.strokeStyle = color + '60';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 3]);

    // VAH line
    ctx.beginPath();
    ctx.moveTo(startX, vahY);
    ctx.lineTo(endX, vahY);
    ctx.stroke();

    // VAL line
    ctx.beginPath();
    ctx.moveTo(startX, valY);
    ctx.lineTo(endX, valY);
    ctx.stroke();

    ctx.setLineDash([]);

    // Labels
    ctx.font = `${config.fontSize - 2}px ${config.font}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // VAH label
    ctx.fillText(`VAH ${this.formatPrice(vahPrice)}`, startX + 4, vahY + 8);

    // VAL label
    ctx.fillText(`VAL ${this.formatPrice(valPrice)}`, startX + 4, valY - 8);
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
