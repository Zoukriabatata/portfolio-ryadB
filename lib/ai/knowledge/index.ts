/**
 * KNOWLEDGE BASE LOADER
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads markdown knowledge files at build/runtime.
 * In Next.js, we use fs.readFileSync (server-side only).
 *
 * To add new knowledge: create a .md file in this directory,
 * then add it to the `sections` array below.
 */

import fs from 'fs';
import path from 'path';

const KNOWLEDGE_DIR = path.join(process.cwd(), 'lib', 'ai', 'knowledge');

interface KnowledgeSection {
  title: string;
  file: string;
  content?: string;
}

const sections: KnowledgeSection[] = [
  { title: 'GEX (Gamma Exposure)',       file: 'gex.md'        },
  { title: 'Volatility Skew',            file: 'skew.md'       },
  { title: 'Option Flow',                file: 'optionFlow.md' },
  { title: 'Footprint Chart',            file: 'footprint.md'  },
  { title: 'Indicateurs & Overlays',     file: 'indicators.md' },
  { title: 'Guide Plateforme OrderFlow', file: 'platform.md'   },
];

let _cache: string | null = null;

/**
 * Returns the full knowledge base as a single string.
 * Cached after first load to avoid repeated disk reads.
 */
export function loadKnowledge(): string {
  if (_cache) return _cache;

  const parts: string[] = ['# BASE DE CONNAISSANCES TRADING\n'];

  for (const section of sections) {
    try {
      const filePath = path.join(KNOWLEDGE_DIR, section.file);
      const content  = fs.readFileSync(filePath, 'utf-8');
      parts.push(`\n---\n${content}`);
    } catch {
      console.warn(`[Knowledge] Could not load ${section.file}`);
    }
  }

  _cache = parts.join('\n');
  return _cache;
}

/** Invalidate cache (useful during development) */
export function invalidateKnowledgeCache(): void {
  _cache = null;
}
