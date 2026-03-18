/**
 * lib/ai/streamAgent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared JS-fallback agent used when the Python FastAPI server is unreachable.
 * Extracted here so both the legacy /api/ai/stream/live route and the new
 * /api/ai/agent/stream proxy route can reuse it without duplication.
 *
 * Architecture:
 *   Python FastAPI (port 8765)  ──primary──▶  /api/ai/agent/stream
 *   StreamAgent + SyntheticFeed ──fallback──▶  /api/ai/agent/stream
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentSignal {
  timestamp:          string;
  bias:               'LONG' | 'SHORT' | 'NEUTRAL';
  confidence:         number;
  gamma_regime:       'LONG_GAMMA' | 'SHORT_GAMMA' | 'NEAR_FLIP';
  volatility_regime:  'EXPANSION' | 'COMPRESSION';
  flow_state:         'BULLISH' | 'BEARISH' | 'NEUTRAL';
  context_state:      'CALM' | 'EVENT_RISK' | 'BREAKOUT_ZONE';
  key_levels: {
    support:    number[];
    resistance: number[];
    gamma_flip: number;
  };
  change_detected: boolean;
  reason:          string;
  events:          { type: string; severity: string; description?: string }[];
  tick:            number;
  // Added by this layer (not in Python output):
  mode?:   'SIGNAL' | 'UPDATE';  // HIGH events = SIGNAL, else UPDATE
  source?: 'python' | 'js_fallback';
}

// ─── Stateful mini-agent (mirrors Python TradingAgent logic) ─────────────────

export class StreamAgent {
  private emaGex  = 0;
  private emaOfi  = 0;
  private emaRr25 = 0;
  private emaIv   = 0.20;
  private prevBias  = 'NEUTRAL';
  private prevGamma = 'LONG_GAMMA';
  private prevFlow  = 'NEUTRAL';
  private prevVol   = 'COMPRESSION';
  private ofiStreak = 0;
  private ofiDir    = 0;
  private tickN     = 0;

  process(t: Record<string, number | number[]>): AgentSignal | null {
    this.tickN++;
    this.emaGex  = 0.10 * +t.net_gex              + 0.90 * this.emaGex;
    this.emaOfi  = 0.20 * +t.order_flow_imbalance  + 0.80 * this.emaOfi;
    this.emaRr25 = 0.10 * +t.risk_reversal_25d     + 0.90 * this.emaRr25;
    this.emaIv   = 0.05 * +(t.iv_atm ?? 0.20)      + 0.95 * this.emaIv;

    const distFlip    = +t.distance_to_flip;
    const gammaRegime = Math.abs(distFlip) < 0.005
      ? 'NEAR_FLIP'
      : this.emaGex > 0 ? 'LONG_GAMMA' : 'SHORT_GAMMA';

    const rawDir = this.emaOfi > 0.15 ? 1 : this.emaOfi < -0.15 ? -1 : 0;
    this.ofiStreak = rawDir === this.ofiDir && rawDir !== 0
      ? this.ofiStreak + 1
      : (rawDir !== 0 ? 1 : 0);
    this.ofiDir = rawDir;
    const flowState = this.ofiStreak >= 3
      ? (this.ofiDir > 0 ? 'BULLISH' : 'BEARISH')
      : 'NEUTRAL';

    const gs    = Math.sign(this.emaGex);
    const fp    = 0.7 * this.emaOfi + 0.3 * (+(t.aggressive_flow ?? 0.5) - 0.5) * 2;
    const gf    = gs < 0 ? fp * 1.4 : fp * 0.7;
    const score = Math.max(-1, Math.min(1,
      0.50 * gf +
      0.25 * Math.max(-0.6, Math.min(0.6, this.emaRr25 / 8)) +
      0.10 * gs * 0.3,
    ));
    const conf = Math.max(0.25, Math.min(0.95,
      Math.min(Math.abs(score) * 1.6, 0.90) *
      (Math.abs(distFlip) < 0.005 ? 0.6 : 1),
    ));
    const bias  = score > 0.15 && conf >= 0.40 ? 'LONG'
                : score < -0.15 && conf >= 0.40 ? 'SHORT'
                : 'NEUTRAL';
    const volR  = +(t.iv_rank ?? 50) > 65 ? 'EXPANSION' : 'COMPRESSION';
    const ctx   = Math.abs(distFlip) < 0.005 ? 'BREAKOUT_ZONE' : 'CALM';

    const events: { type: string; severity: string; description?: string }[] = [];
    if (gammaRegime !== this.prevGamma)
      events.push({ type: 'GAMMA_REGIME_CHANGE', severity: 'HIGH' });
    if (bias !== this.prevBias)
      events.push({ type: 'BIAS_CHANGE', severity: bias !== 'NEUTRAL' && this.prevBias !== 'NEUTRAL' ? 'HIGH' : 'MEDIUM' });
    if (flowState !== this.prevFlow && flowState !== 'NEUTRAL')
      events.push({ type: 'FLOW_FLIP', severity: 'MEDIUM' });
    if (volR !== this.prevVol)
      events.push({ type: 'VOL_REGIME_CHANGE', severity: 'MEDIUM' });
    if (+t.gamma_flip_level > 0 && Math.abs(+t.spot_price - +t.gamma_flip_level) / +t.spot_price < 0.003)
      events.push({ type: 'NEAR_GAMMA_FLIP', severity: 'HIGH' });

    this.prevBias  = bias;
    this.prevGamma = gammaRegime;
    this.prevFlow  = flowState;
    this.prevVol   = volR;

    // Tick 1: always emit with an AGENT_STARTED event so the UI isn't empty
    if (this.tickN === 1) {
      events.push({ type: 'AGENT_STARTED', severity: 'MEDIUM', description: `Engine JS actif · Bias ${bias} · Gamma ${gammaRegime}` });
    } else if (!events.some(e => e.severity === 'HIGH' || e.severity === 'MEDIUM')) {
      return null;
    }

    const hasHigh = events.some(e => e.severity === 'HIGH');

    return {
      timestamp:          new Date().toISOString(),
      bias:               bias as AgentSignal['bias'],
      confidence:         Math.round(conf * 10000) / 10000,
      gamma_regime:       gammaRegime as AgentSignal['gamma_regime'],
      volatility_regime:  volR as AgentSignal['volatility_regime'],
      flow_state:         flowState as AgentSignal['flow_state'],
      context_state:      ctx as AgentSignal['context_state'],
      key_levels: {
        support:    (t.support_levels    as number[]) ?? [],
        resistance: (t.resistance_levels as number[]) ?? [],
        gamma_flip: +t.gamma_flip_level,
      },
      change_detected: events.length > 0,
      reason:  events.map(e => e.type).join(' | ') || 'Initial signal',
      events,
      tick:    this.tickN,
      mode:    hasHigh ? 'SIGNAL' : 'UPDATE',
      source:  'js_fallback',
    };
  }
}

// ─── Synthetic market data feed ───────────────────────────────────────────────

export class SyntheticFeed {
  private price = 500;
  private gex   = 1.5;
  private rr25  = -2.0;
  private ofi   = 0.0;
  private iv    = 0.18;
  private flip  = 498;

  next(): Record<string, number | number[]> {
    const ret   = (Math.random() - 0.5) * 0.003 * (1 + (this.gex < 0 ? 0.5 : 0));
    this.price *= (1 + ret);
    this.gex   += (Math.random() - 0.5) * 0.3 - 0.03 * this.gex;
    this.gex    = Math.max(-6, Math.min(6, this.gex));
    if (Math.random() < 0.01) this.gex = -this.gex;
    this.flip   = this.flip * 0.999 + this.price * 0.001 * Math.sign(this.gex);
    this.rr25  += (Math.random() - 0.5) * 0.8 - 0.05 * this.rr25 - ret * 50;
    this.rr25   = Math.max(-12, Math.min(8, this.rr25));
    const ofiShock = (Math.random() - 0.5) * 0.3;
    this.ofi    = 0.7 * this.ofi + 0.3 * ofiShock + ret * 20;
    this.ofi    = Math.max(-1, Math.min(1, this.ofi));
    this.iv     = Math.max(0.10, this.iv + (Math.random() - 0.5) * 0.005);
    const callVol = Math.round(5000 * (1 + Math.abs(this.ofi)) * Math.max(0.2, 0.5 + this.ofi * 0.5));
    const putVol  = Math.round(5000 * (1 + Math.abs(this.ofi)) * Math.max(0.2, 0.5 - this.ofi * 0.5));
    return {
      spot_price:           +this.price.toFixed(2),
      net_gex:              +this.gex.toFixed(3),
      gamma_flip_level:     +this.flip.toFixed(2),
      distance_to_flip:     +((this.price - this.flip) / this.price).toFixed(6),
      risk_reversal_25d:    +this.rr25.toFixed(3),
      iv_atm:               +this.iv.toFixed(4),
      iv_rank:              +Math.max(0, Math.min(100, (this.iv - 0.12) / 0.18 * 100)).toFixed(1),
      order_flow_imbalance: +this.ofi.toFixed(4),
      aggressive_flow:      +Math.max(0, Math.min(1, 0.5 + this.ofi * 0.4)).toFixed(4),
      call_volume:          callVol,
      put_volume:           putVol,
      sweep_net:            Math.random() > 0.95 ? Math.round((Math.random() - 0.5) * 6) : 0,
      liquidity:            +Math.max(0.2, 0.8 - Math.abs(this.ofi) * 0.3).toFixed(3),
      spread:               +(0.001 * (1 + (1 - this.gex / 6) * 0.3)).toFixed(5),
      support_levels:       [+(this.price * 0.97).toFixed(2), +(this.price * 0.94).toFixed(2)],
      resistance_levels:    [+(this.price * 1.03).toFixed(2), +(this.price * 1.06).toFixed(2)],
    };
  }
}
