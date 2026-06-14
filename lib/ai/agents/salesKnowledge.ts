/**
 * SALES KNOWLEDGE LOADER
 * Loads the curated sales KB (lib/ai/knowledge/sales.md), server-side only.
 * Mirrors lib/ai/knowledge/index.ts. Cached after first read.
 */
import fs from 'fs';
import path from 'path';

const SALES_KB_PATH = path.join(process.cwd(), 'lib', 'ai', 'knowledge', 'sales.md');

let _cache: string | null = null;

export function loadSalesKnowledge(): string {
  if (_cache) return _cache;
  try {
    _cache = fs.readFileSync(SALES_KB_PATH, 'utf-8');
  } catch {
    console.warn('[SalesKnowledge] Could not load sales.md');
    _cache = '# BASE DE CONNAISSANCE — VENTE\n(indisponible)';
  }
  return _cache;
}

export function invalidateSalesKnowledgeCache(): void {
  _cache = null;
}
