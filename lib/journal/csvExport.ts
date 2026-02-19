import type { JournalEntry } from '@/types/journal';

export function exportToCsv(entries: JournalEntry[], filename = 'journal-export.csv') {
  const headers = [
    'Date', 'Symbol', 'Side', 'Entry Price', 'Exit Price',
    'Quantity', 'P&L', 'Setup', 'Emotions', 'Rating',
    'Timeframe', 'Notes', 'Tags',
  ];

  const rows = entries.map((e) => [
    new Date(e.entryTime).toISOString(),
    e.symbol,
    e.side,
    e.entryPrice,
    e.exitPrice ?? '',
    e.quantity,
    e.pnl ?? '',
    e.setup ?? '',
    e.emotions ?? '',
    e.rating ?? '',
    e.timeframe ?? '',
    (e.notes ?? '').replace(/"/g, '""'),
    e.tags ?? '',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell) => {
        const s = String(cell);
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s}"`
          : s;
      }).join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
