import { useGexStore } from "../gex/useGexStore";
import { useOptionFlowStore } from "../option_flow/useOptionFlowStore";
import { useAccountStore } from "../account/useAccountStore";
import { useNewsStore } from "../news/useNewsStore";

/** Snapshot of all the live trading state, rendered as Markdown.
 *  Injected into the system prompt so Claude can reason about the
 *  trader's current setup without us teaching it tools.
 *
 *  Section presence is best-effort : if a module hasn't been opened
 *  this session, its store is empty and the section is skipped. */
export function buildLiveContext(): string {
  const parts: string[] = [];
  parts.push("# Live Trading Context\n");
  parts.push(`*(Snapshot at ${new Date().toISOString()})*\n`);

  // ── GEX module ─────────────────────────────────────────────
  const gex = useGexStore.getState();
  if (gex.snapshot) {
    const s = gex.snapshot;
    parts.push(`\n## Gamma Exposure — ${s.symbol}`);
    parts.push(`- Spot: $${s.spot.toFixed(2)}`);
    parts.push(
      `- Zero Gamma: ${s.zeroGamma !== null ? "$" + s.zeroGamma.toFixed(2) : "—"}`,
    );
    parts.push(
      `- Call Wall: ${s.callWall !== null ? "$" + s.callWall.toFixed(2) : "—"}`,
    );
    parts.push(
      `- Put Wall: ${s.putWall !== null ? "$" + s.putWall.toFixed(2) : "—"}`,
    );
    parts.push(`- Total GEX: ${fmtMoney(s.totalGex)}`);
    parts.push(`- Total DEX: ${s.totalDex.toFixed(0)} shares`);
    parts.push(
      `- Put/Call OI ratio: ${
        s.putCallRatio !== null ? s.putCallRatio.toFixed(2) : "—"
      }`,
    );
    parts.push(
      `- 25Δ Skew: ${
        s.skew25Delta !== null ? (s.skew25Delta * 100).toFixed(2) + "%" : "—"
      }`,
    );
    parts.push(
      `- ATM IV front month: ${
        s.atmIvFront !== null ? (s.atmIvFront * 100).toFixed(2) + "%" : "—"
      }`,
    );
  }

  // ── Option Flow ─────────────────────────────────────────────
  const flow = useOptionFlowStore.getState();
  if (flow.trades.length > 0) {
    let callPrem = 0,
      putPrem = 0,
      buyPrem = 0,
      sellPrem = 0,
      mega = 0;
    let biggest = flow.trades[0];
    for (const t of flow.trades) {
      if (t.contractType === "call") callPrem += t.premium;
      else putPrem += t.premium;
      if (t.side === "buy") buyPrem += t.premium;
      else if (t.side === "sell") sellPrem += t.premium;
      if (t.premium >= 500_000) mega++;
      if (t.premium > biggest.premium) biggest = t;
    }
    parts.push(`\n## Option Flow — ${flow.symbol}`);
    parts.push(`- Window: last ${flow.trades.length} trades`);
    parts.push(
      `- Call premium: ${fmtMoney(callPrem)} · Put premium: ${fmtMoney(putPrem)}`,
    );
    parts.push(`- Buy premium: ${fmtMoney(buyPrem)} · Sell premium: ${fmtMoney(sellPrem)}`);
    parts.push(`- Mega trades (≥$500K): ${mega}`);
    parts.push(
      `- Biggest: ${biggest.contractType.toUpperCase()} $${biggest.strike.toFixed(
        2,
      )} ${biggest.expiration} · ${fmtMoney(biggest.premium)} (${biggest.size} @ $${biggest.price.toFixed(2)})`,
    );
  }

  // ── Account ────────────────────────────────────────────────
  const acc = useAccountStore.getState();
  if (acc.stats) {
    const s = acc.stats;
    parts.push(`\n## Account`);
    parts.push(`- Balance: ${fmtMoney(s.balance)}`);
    parts.push(`- Day PnL: ${fmtSigned(s.dailyPnl)}`);
    parts.push(
      `- Day trades: ${acc.dayStats.tradesCount} · Win rate: ${(acc.dayStats.winRate * 100).toFixed(0)}% · Best: ${fmtSigned(acc.dayStats.bestTrade)} · Worst: ${fmtSigned(acc.dayStats.worstTrade)}`,
    );
    if (acc.positions.length > 0) {
      parts.push(`- Open positions: ${acc.positions.length}`);
      for (const p of acc.positions.slice(0, 8)) {
        parts.push(
          `  - ${p.symbol} ${p.side.toUpperCase()} ${Math.abs(p.qty)} @ ${p.avgPrice.toFixed(2)} · Unrealized ${fmtSigned(p.unrealizedPnl)}`,
        );
      }
    }
  }

  // ── News ───────────────────────────────────────────────────
  const news = useNewsStore.getState();
  const recentArticles = news.articles.slice(0, 6);
  if (recentArticles.length > 0) {
    parts.push(`\n## Recent News`);
    for (const a of recentArticles) {
      parts.push(`- [${a.source}] ${a.headline}`);
    }
  }
  const upcoming = news.events.slice(0, 6);
  if (upcoming.length > 0) {
    parts.push(`\n## Upcoming Economic Events`);
    for (const e of upcoming) {
      parts.push(`- [${e.country}/${e.impact}] ${e.event} — ${e.timeUtc}`);
    }
  }

  return parts.join("\n");
}

function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtSigned(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${fmtMoney(n)}`;
}

/** Static instructions appended after the dynamic snapshot. */
export const SYSTEM_PROMPT_BASE = `You are an embedded co-pilot inside a professional orderflow trading desktop app for US futures and options.

The user is a trader. You have read-only access to a live snapshot of their context (see below).

Style: direct, technical French unless the user writes in English. No flattery. State uncertainty explicitly when present. Use markdown : tables for comparative data, code blocks for any tickers / levels / prices in a list, bullet lists for multi-step reasoning. Keep answers proportional to the question — short answer for short question.

Constraints:
- Never invent values that are not in the snapshot or that the user did not provide. If a section is missing from the context, say so and ask.
- Do not give buy/sell signals. Discuss setups, risk, hedging, structure. The trader makes their own decision.
- When citing levels (GEX walls, zero gamma), name them by their role, not just the price.
`;

export function buildSystemPrompt(): string {
  return `${SYSTEM_PROMPT_BASE}\n${buildLiveContext()}`;
}
