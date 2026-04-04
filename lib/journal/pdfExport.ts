import type { JournalEntry, JournalStats } from '@/types/journal';

function fmt(n: number | null): string {
  if (n === null) return '—';
  return n.toFixed(2);
}

function fmtPnl(n: number | null): string {
  if (n === null) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function exportToPdf(entries: JournalEntry[], stats: JournalStats, filename = 'journal-report') {
  const closedEntries = entries.filter(e => e.pnl !== null);
  const wins = closedEntries.filter(e => e.pnl! > 0);
  const losses = closedEntries.filter(e => e.pnl! < 0);
  const avgWin = wins.length > 0 ? wins.reduce((s, e) => s + e.pnl!, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, e) => s + e.pnl!, 0) / losses.length : 0;
  const grossProfit = wins.reduce((s, e) => s + e.pnl!, 0);
  const grossLoss = Math.abs(losses.reduce((s, e) => s + e.pnl!, 0));
  const profitFactor = grossLoss > 0
    ? (grossProfit / grossLoss).toFixed(2)
    : grossProfit > 0 ? '∞' : '0';

  const rows = entries.map((e) => {
    const pnl = e.pnl;
    const pnlColor = pnl === null ? '#888' : pnl >= 0 ? '#4ade80' : '#f87171';
    return `
      <tr>
        <td>${fmtDate(e.entryTime)}</td>
        <td class="mono">${e.symbol}</td>
        <td class="${e.side === 'LONG' ? 'bull' : 'bear'}">${e.side}</td>
        <td class="mono">${fmt(e.entryPrice)}</td>
        <td class="mono">${e.exitPrice !== null ? fmt(e.exitPrice) : '—'}</td>
        <td class="mono">${e.quantity}</td>
        <td class="mono" style="color:${pnlColor}">${fmtPnl(pnl)}</td>
        <td>${e.setup ?? '—'}</td>
        <td>${e.rating !== null ? '★'.repeat(e.rating) : '—'}</td>
      </tr>`;
  }).join('');

  const totalPnlColor = stats.totalPnl >= 0 ? '#4ade80' : '#f87171';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Senzoukria Trading Journal</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; color: #1a1a1a; background: #fff; }
  .page { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }

  /* Header */
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #111; }
  .brand { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
  .brand span { color: #16a34a; }
  .meta { text-align: right; color: #666; font-size: 11px; line-height: 1.6; }

  /* Stats grid */
  .stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 28px; }
  .stat { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 12px 14px; }
  .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; margin-bottom: 4px; }
  .stat-value { font-size: 18px; font-weight: 700; font-family: 'SF Mono', 'Consolas', monospace; }

  /* Table */
  .section-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #888; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  thead th { background: #111; color: #fff; padding: 8px 10px; text-align: left; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
  thead th:first-child { border-radius: 4px 0 0 4px; }
  thead th:last-child { border-radius: 0 4px 4px 0; }
  tbody tr { border-bottom: 1px solid #f0f0f0; }
  tbody tr:hover { background: #fafafa; }
  tbody td { padding: 7px 10px; color: #333; }
  .mono { font-family: 'SF Mono', 'Consolas', monospace; }
  .bull { color: #16a34a; font-weight: 600; }
  .bear { color: #dc2626; font-weight: 600; }

  /* Footer */
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e9ecef; display: flex; justify-content: space-between; font-size: 10px; color: #aaa; }

  @media print {
    .page { padding: 16px; }
    @page { margin: 0.5in; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="brand">SENZO<span>UKRIA</span></div>
    <div class="meta">
      Trading Journal Export<br>
      Generated ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}<br>
      ${entries.length} trades
    </div>
  </div>

  <div class="stats">
    <div class="stat">
      <div class="stat-label">Total P&amp;L</div>
      <div class="stat-value" style="color:${totalPnlColor}">${fmtPnl(stats.totalPnl)}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Win Rate</div>
      <div class="stat-value">${stats.winRate}%</div>
    </div>
    <div class="stat">
      <div class="stat-label">Trades</div>
      <div class="stat-value">${stats.totalTrades}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Wins / Losses</div>
      <div class="stat-value">${stats.winCount}W / ${stats.lossCount}L</div>
    </div>
    <div class="stat">
      <div class="stat-label">Avg Win</div>
      <div class="stat-value" style="color:#16a34a">${fmtPnl(avgWin)}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Profit Factor</div>
      <div class="stat-value">${profitFactor}</div>
    </div>
  </div>

  <div class="section-title">All Trades</div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Symbol</th>
        <th>Side</th>
        <th>Entry</th>
        <th>Exit</th>
        <th>Qty</th>
        <th>P&amp;L</th>
        <th>Setup</th>
        <th>Rating</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="footer">
    <span>senzoukria.com</span>
    <span>This report is for personal use only. Not financial advice.</span>
  </div>
</div>
<script>window.onload = function(){ window.print(); };</script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) {
    win.onafterprint = () => URL.revokeObjectURL(url);
  } else {
    // Fallback: trigger download of HTML file
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.html`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
