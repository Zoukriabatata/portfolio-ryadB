# Tools Engine Architecture - Professional Trading Platform

## Vue d'ensemble

Cette architecture implémente un système d'outils de dessin professionnel identique à TradingView, ATAS et NinjaTrader.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ARCHITECTURE TOOLS ENGINE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │   USER INPUT    │    │  TOOLS ENGINE   │    │ TOOLS RENDERER  │         │
│  │  (Mouse/Keys)   │───▶│   (Core Logic)  │───▶│ (Canvas Draw)   │         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│          │                      │                      │                    │
│          │                      │                      │                    │
│          │              ┌───────┴───────┐              │                    │
│          │              │               │              │                    │
│          │        ┌─────▼─────┐   ┌─────▼─────┐       │                    │
│          │        │  HISTORY  │   │  EVENTS   │       │                    │
│          │        │ Undo/Redo │   │ Listeners │       │                    │
│          │        └───────────┘   └───────────┘       │                    │
│          │                                             │                    │
│          │              ┌─────────────────┐           │                    │
│          └─────────────▶│    LAYOUT       │◀──────────┘                    │
│                         │  PERSISTENCE    │                                 │
│                         │ (localStorage)  │                                 │
│                         └─────────────────┘                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Structure d'un Tool (Objet Outil)

Chaque outil est un objet avec la structure suivante :

```typescript
interface BaseTool {
  id: string;              // Unique ID (tool_1234567890_abc123)
  type: ToolType;          // 'trendline' | 'horizontalLine' | 'rectangle' | etc.
  style: ToolStyle;        // Couleur, épaisseur, style de ligne
  text?: ToolText;         // Texte attaché optionnel
  visible: boolean;        // Visibilité
  locked: boolean;         // Verrouillé (non modifiable)
  selected: boolean;       // État de sélection
  zIndex: number;          // Ordre d'affichage
  createdAt: number;       // Timestamp création
  updatedAt: number;       // Timestamp modification
  timeframe?: number;      // Optionnel: n'apparaît que sur ce timeframe
  symbol?: string;         // Optionnel: n'apparaît que sur ce symbol
}

interface ToolStyle {
  color: string;           // Couleur principale (#3b82f6)
  lineWidth: number;       // Épaisseur en pixels (1-5)
  lineStyle: LineStyle;    // 'solid' | 'dashed' | 'dotted'
  fillColor?: string;      // Couleur de remplissage
  fillOpacity?: number;    // Opacité du remplissage (0-1)
  fontSize?: number;       // Taille du texte
  fontColor?: string;      // Couleur du texte
}
```

### Types d'outils supportés

| Type | Description | Points requis |
|------|-------------|---------------|
| `trendline` | Ligne de tendance | 2 points |
| `horizontalLine` | Ligne horizontale | 1 point (prix) |
| `horizontalRay` | Rayon horizontal | 1 point + direction |
| `verticalLine` | Ligne verticale | 1 point (temps) |
| `rectangle` | Rectangle/zone | 2 coins |
| `fibRetracement` | Fibonacci | 2 points |
| `longPosition` | Position Long | Entry + SL + TP |
| `shortPosition` | Position Short | Entry + SL + TP |
| `text` | Annotation texte | 1 point |

---

## 2. Gestion Sélection / Désélection

### Sélection au clic

```typescript
// Dans le handler mouse down
const handleMouseDown = (e: MouseEvent) => {
  const point = { time: xToTime(e.clientX), price: yToPrice(e.clientY) };

  // Hit test pour trouver l'outil sous le curseur
  const hitResult = toolsEngine.hitTest(point, priceToY, timeToX, 10);

  if (hitResult) {
    // Sélectionner l'outil (shift = multi-sélection)
    toolsEngine.selectTool(hitResult.tool.id, e.shiftKey);

    // Démarrer le drag si un handle est touché
    if (hitResult.handle) {
      toolsEngine.startDrag(hitResult.tool.id, hitResult.handle, point);
    }
  } else {
    // Clic dans le vide = désélectionner tout
    toolsEngine.deselectAll();
  }
};
```

### Désélection

```typescript
// Clic en dehors d'un outil
if (!hitResult) {
  toolsEngine.deselectAll();
}

// Touche Escape
if (e.key === 'Escape') {
  toolsEngine.deselectAll();
  toolsEngine.cancelDrawing();
}
```

---

## 3. Suppression via Delete / Backspace

```typescript
const handleKeyDown = (e: KeyboardEvent) => {
  // Vérifier qu'on n'est pas dans un input
  if (document.activeElement?.tagName === 'INPUT') return;

  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();

    if (toolsEngine.hasSelection()) {
      const deletedCount = toolsEngine.deleteSelected();
      console.log(`Deleted ${deletedCount} tools`);
    }
  }
};

window.addEventListener('keydown', handleKeyDown);
```

---

## 4. Drag & Resize avec Handles

### Structure des Handles

```typescript
interface Handle {
  position: HandlePosition;  // 'start' | 'end' | 'top-left' | etc.
  x: number;                 // Position X en pixels
  y: number;                 // Position Y en pixels
  size: number;              // Taille du handle (8px)
  cursor: string;            // Curseur CSS ('move' | 'ns-resize' | etc.)
}

// Handles par type d'outil
// Trendline: 'start', 'end'
// Rectangle: 'top-left', 'top-right', 'bottom-left', 'bottom-right'
// Position: 'start' (entry), 'center' (SL), 'end' (TP)
```

### Logique de Drag

```typescript
// Début du drag
toolsEngine.startDrag(toolId, handle, { time, price });

// Mise à jour pendant le drag
const handleMouseMove = (e: MouseEvent) => {
  if (toolsEngine.isDragging()) {
    const point = { time: xToTime(e.clientX), price: yToPrice(e.clientY) };
    toolsEngine.updateDrag(point);
  }
};

// Fin du drag
const handleMouseUp = () => {
  toolsEngine.endDrag();
};
```

---

## 5. Z-Index et Ordre d'Affichage

```typescript
// Chaque outil a un zIndex unique
// La sélection amène automatiquement l'outil au premier plan
selectTool(id: string): void {
  const tool = this.tools.get(id);
  tool.selected = true;
  tool.zIndex = this.nextZIndex++;  // Incrémente le z-index
}

// Rendu dans l'ordre du z-index
const tools = engine.getAllTools();  // Trié par zIndex croissant
tools.forEach(tool => renderer.renderTool(tool));
```

---

## 6. Layout Fixe (Anti-Scroll Page)

### CSS Global

```css
/* globals.css */
html, body {
  height: 100%;
  width: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;  /* CRITIQUE: Empêche le scroll page */
}

#__next, main {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.chart-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  user-select: none;
  touch-action: none;  /* Mobile: empêche le scroll tactile */
}
```

### Layout React

```tsx
// Dashboard Layout
<div className="h-screen w-screen overflow-hidden flex flex-col">
  <Header className="flex-shrink-0" />
  <main className="flex-1 overflow-hidden">
    <ChartContainer className="h-full w-full" />
  </main>
  <Footer className="flex-shrink-0" />
</div>
```

### Zoom/Pan dans le Chart uniquement

```tsx
// Wheel = Zoom (pas scroll page)
const handleWheel = (e: React.WheelEvent) => {
  e.preventDefault();  // Empêche le scroll navigateur

  if (e.shiftKey) {
    // Shift + Wheel = Scroll horizontal (historique)
    layout.scroll(e.deltaY);
  } else {
    // Wheel = Zoom vertical
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    priceScale.zoomAtPrice(factor, yToPrice(e.clientY));
  }
};
```

---

## 7. Sauvegarde / Restauration Layout

### Structure LayoutData

```typescript
interface LayoutData {
  version: number;           // Version du format
  id: string;               // ID unique
  name: string;             // Nom du layout
  createdAt: number;
  updatedAt: number;

  // Outils de dessin
  tools: Tool[];

  // Paramètres chart
  chart: {
    symbol: string;
    timeframe: number;
    tickSize: number;
  };

  // Apparence
  colors: FootprintColors;
  fonts: FootprintFonts;
  features: FootprintFeatures;

  // Dimensions
  layout: {
    footprintWidth: number;
    rowHeight: number;
    maxVisibleFootprints: number;
    deltaProfilePosition: 'left' | 'right';
  };
}
```

### Sauvegarde

```typescript
// Sauvegarder manuellement
layoutPersistence.saveLayout(
  'Mon Layout',
  { symbol: 'BTCUSDT', timeframe: 60, tickSize: 10 },
  colors, fonts, features, imbalance, layout
);

// Auto-save (toutes les 30 secondes si changements)
layoutPersistence.startAutoSave(() => ({
  chart: { symbol, timeframe, tickSize },
  colors, fonts, features, imbalance, layout
}));
```

### Restauration

```typescript
// Au chargement de la page
useEffect(() => {
  // Essayer de restaurer l'auto-save
  const autoSave = layoutPersistence.loadAutoSave();
  if (autoSave) {
    layoutPersistence.applyLayout(autoSave);
  }
}, []);

// Charger un layout spécifique
const loadLayout = (id: string) => {
  const layout = layoutPersistence.loadLayout(id);
  if (layout) {
    // Appliquer les outils
    toolsEngine.clearAll();
    toolsEngine.importFromJSON(JSON.stringify({ tools: layout.tools }));

    // Appliquer les settings
    setSymbol(layout.chart.symbol);
    setTimeframe(layout.chart.timeframe);
    settings.setColors(layout.colors);
    // etc.
  }
};
```

### Export/Import fichier

```typescript
// Export JSON
layoutPersistence.exportLayoutAsFile(layoutId);

// Import JSON
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.json';
fileInput.onchange = async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    const newId = await layoutPersistence.importLayoutFromFile(file);
    console.log('Imported layout:', newId);
  }
};
fileInput.click();
```

---

## 8. Panneau de Configuration Tool

Le `ToolSettingsPanel` offre :

| Option | Description |
|--------|-------------|
| **Couleur** | 16 presets + input personnalisé |
| **Épaisseur** | 1-5 pixels |
| **Style ligne** | Solid / Dashed / Dotted |
| **Fill Opacity** | 0-100% (rectangles, positions) |
| **Extend** | Gauche/Droite (trendlines) |
| **Visible** | Afficher/masquer |
| **Locked** | Verrouiller les modifications |
| **Actions** | Dupliquer, Supprimer |

---

## 9. Événements Tools Engine

```typescript
type ToolEvent =
  | 'tool:add'
  | 'tool:update'
  | 'tool:delete'
  | 'tool:select'
  | 'tool:deselect'
  | 'drawing:start'
  | 'drawing:update'
  | 'drawing:end'
  | 'drag:start'
  | 'drag:update'
  | 'drag:end';

// S'abonner aux événements
const unsubscribe = toolsEngine.on('tool:select', (tool) => {
  setSelectedTool(tool);
  setShowToolSettings(true);
});

// Nettoyer
useEffect(() => {
  return () => unsubscribe();
}, []);
```

---

## 10. Raccourcis Clavier

| Raccourci | Action |
|-----------|--------|
| `Delete` / `Backspace` | Supprimer les outils sélectionnés |
| `Escape` | Désélectionner / Annuler dessin |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Shift+Click` | Multi-sélection |

---

## Fichiers Clés

```
lib/tools/
├── ToolsEngine.ts        # Core engine (1274 lignes)
├── ToolsRenderer.ts      # Canvas rendering (568 lignes)
└── LayoutPersistence.ts  # Save/restore (472 lignes)

components/tools/
├── ToolSettingsPanel.tsx    # UI configuration outil
└── LayoutManagerPanel.tsx   # UI gestion layouts

app/globals.css              # CSS layout fixe
```

---

## Prêt pour Backend API

La structure `LayoutData` est conçue pour être directement sérialisable et envoyable à une API :

```typescript
// Exemple d'intégration API
async function syncLayout(layout: LayoutData): Promise<void> {
  await fetch('/api/layouts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(layout),
  });
}

async function fetchLayouts(): Promise<LayoutData[]> {
  const response = await fetch('/api/layouts');
  return response.json();
}
```
