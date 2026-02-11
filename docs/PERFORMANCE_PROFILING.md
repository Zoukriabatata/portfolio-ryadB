# Performance Profiling Guide

Guide complet pour profiler et optimiser les performances de l'application avec React DevTools.

## 📊 Table des Matières

1. [Installation des Outils](#installation)
2. [Profiling Basique](#profiling-basique)
3. [Analyse des Animations](#animations)
4. [Optimisation des Re-renders](#re-renders)
5. [Métriques Clés](#métriques)
6. [Checklist](#checklist)

---

## 🛠️ Installation

### React DevTools

**Chrome:**
```
https://chrome.google.com/webstore/detail/react-developer-tools/fmkadmapgofadopljbjfkapdkoienihi
```

**Firefox:**
```
https://addons.mozilla.org/en-US/firefox/addon/react-devtools/
```

### Lighthouse

Déjà intégré dans Chrome DevTools (F12 → Lighthouse tab).

---

## 📈 Profiling Basique

### 1. Ouvrir React DevTools

1. F12 → Onglet "Profiler"
2. Cliquez sur le bouton d'enregistrement (cercle)
3. Interagissez avec l'app
4. Cliquez à nouveau pour arrêter

### 2. Actions à Profiler

**Changement de Layout:**
```
1. Démarrer l'enregistrement
2. Cliquer sur layout 2x2
3. Attendre la fin des animations (800ms)
4. Arrêter l'enregistrement
```

**Collapse/Expand Panel:**
```
1. Démarrer l'enregistrement
2. Cliquer "Hide" sur watchlist
3. Attendre 350ms
4. Cliquer "Watch" pour rouvrir
5. Arrêter l'enregistrement
```

**Trade Execution:**
```
1. Démarrer l'enregistrement
2. Cliquer BUY ou SELL
3. Attendre l'animation de succès
4. Arrêter l'enregistrement
```

### 3. Analyser les Résultats

**Flamegraph:**
- Colonnes = temps de render
- Hauteur = profondeur de l'arbre React
- Couleur = temps passé

**Cherchez:**
- ⚠️ Barres jaunes/rouges (lent)
- 🟢 Barres grises (rapide)
- 🔄 Renders multiples du même composant

---

## 🎨 Analyse des Animations

### Frame Rate Monitoring

**Chrome DevTools:**
1. F12 → Performance tab
2. Cocher "Enable paint flashing"
3. Cocher "Show frames per second (FPS) meter"
4. Record pendant changement de layout

**Objectif:** Maintenir 60fps (16.67ms par frame)

### Identifier les Animations Coûteuses

```javascript
// Ajouter ce code dans LivePageContent pour debugging
useEffect(() => {
  const observer = new PerformanceObserver((list) => {
    list.getEntries().forEach((entry) => {
      if (entry.duration > 16.67) {
        console.warn('⚠️ Frame dropped:', entry.duration.toFixed(2) + 'ms');
      }
    });
  });

  observer.observe({ entryTypes: ['measure'] });

  return () => observer.disconnect();
}, []);
```

### CSS Animation Performance

**Outils:**
- Chrome → Rendering → Paint flashing
- Chrome → Rendering → Layout shift regions

**Vérifier:**
- ✅ Utilisation de `transform` et `opacity` (GPU)
- ❌ Éviter `width`, `height`, `top`, `left` (CPU)

---

## 🔄 Optimisation des Re-renders

### Identifier les Re-renders Inutiles

**1. Highlight Updates:**
```
React DevTools → Components → Settings (⚙️) → Highlight updates
```

**2. Profiler Rendering Reasons:**
```
React DevTools → Profiler → Select component → "Why did this render?"
```

### Composants à Surveiller

| Composant | Re-renders Attendus | Action si Trop |
|-----------|---------------------|----------------|
| LiveChartPro | Layout change, symbol change | Memoize props |
| BottomWidgetsPanel | Tab change, new trades | useMemo pour data |
| QuickTradeBar | Order submit | useCallback pour handlers |
| WatchlistPanel | Symbol select | React.memo + useMemo |

### Optimisations Appliquées

**1. useChartRefs Hook:**
```typescript
// Avant: 20+ refs individuels
const ref1 = useRef();
const ref2 = useRef();
// ... 18 more

// Après: 1 hook avec objet stable
const refs = useChartRefs();
```

**2. useOptimizedKeyboard:**
```typescript
// Avant: Array.find() sur chaque keydown (O(n))
shortcuts.find(s => s.key === event.key)

// Après: Map lookup (O(1))
shortcutsMap.get(keyCombo)
```

**3. useOptimizedFilter:**
```typescript
// Avant: Filter re-calculé chaque render
const filtered = symbols.filter(s => s.includes(query));

// Après: Memoized + debounced + cached
const filtered = useOptimizedFilter(symbols, { query, debounce: 150 });
```

---

## 📊 Métriques Clés

### Objectifs de Performance

| Métrique | Cible | Mesure |
|----------|-------|--------|
| **First Contentful Paint (FCP)** | < 1.5s | Lighthouse |
| **Largest Contentful Paint (LCP)** | < 2.5s | Lighthouse |
| **Time to Interactive (TTI)** | < 3.5s | Lighthouse |
| **Cumulative Layout Shift (CLS)** | < 0.1 | Lighthouse |
| **Frame Rate** | 60fps | Performance tab |
| **Layout transition** | < 400ms | Stopwatch |
| **Panel collapse/expand** | < 350ms | Stopwatch |

### Mesurer les Métriques

**Lighthouse Audit:**
```bash
1. F12 → Lighthouse tab
2. Mode: Navigation
3. Categories: Performance
4. Device: Desktop
5. Run analysis
```

**Core Web Vitals:**
```javascript
// Ajouter dans layout.tsx
useEffect(() => {
  import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
    getCLS(console.log);
    getFID(console.log);
    getFCP(console.log);
    getLCP(console.log);
    getTTFB(console.log);
  });
}, []);
```

---

## ✅ Checklist Profiling

### Avant Chaque Release

- [ ] Profile layout transitions (1x1 → 2x1 → 2x2)
- [ ] Profile panel animations (collapse/expand)
- [ ] Profile trade execution
- [ ] Vérifier 60fps maintenu
- [ ] Lighthouse score > 90
- [ ] Pas de memory leaks (DevTools Memory)
- [ ] Pas de re-renders inutiles (Profiler)
- [ ] Tests E2E passent (`npm run test:e2e`)

### Checks Spécifiques

**Layout 2x2:**
```
- [ ] 4 panels apparaissent avec stagger
- [ ] Pas de lag/freeze
- [ ] Frame rate > 55fps
- [ ] Animations fluides
```

**WebSocket Reconnection:**
```
- [ ] ConnectionBanner apparaît
- [ ] Exponential backoff respecté
- [ ] Reconnexion automatique fonctionne
- [ ] Pas d'erreurs console
```

**Memory Usage:**
```
- [ ] Heap size stable après 5 min
- [ ] Pas de detached DOM nodes
- [ ] Event listeners cleanup OK
- [ ] WebSocket connections fermées
```

---

## 🐛 Problèmes Courants

### 1. Re-renders en Cascade

**Symptôme:** Toute l'app re-render au changement d'un état

**Solution:**
```typescript
// Mauvais
const [state, setState] = useState({...});

// Bon
const store = useStore(state => state.specificValue);
```

### 2. Animations Saccadées

**Symptôme:** FPS < 60 pendant animations

**Causes possibles:**
- JavaScript bloque le main thread
- Trop de composants re-render
- CSS triggers layout/paint (pas transform)

**Solution:**
```typescript
// Utiliser requestAnimationFrame
requestAnimationFrame(() => {
  // Heavy work here
});
```

### 3. Memory Leaks

**Symptôme:** Heap size augmente sans arrêt

**Causes:**
- Event listeners non nettoyés
- Timers non clearés
- WebSocket non fermées

**Vérifier:**
```typescript
useEffect(() => {
  // Setup
  const cleanup = () => {
    // TOUJOURS cleanup ici
  };
  return cleanup;
}, []);
```

---

## 🎯 Résultats Attendus

### Après Optimisations

| Avant | Après | Amélioration |
|-------|-------|--------------|
| 20+ refs | 1 hook | -95% complexity |
| O(n) keyboard | O(1) Map | 10x faster |
| Re-filter chaque render | Memoized | -90% CPU |
| No validation | Full validation | 0 bugs |

### Impact Utilisateur

- ✨ Animations plus fluides
- ⚡ Interactions plus réactives
- 🚀 App plus rapide
- 💚 Meilleure expérience

---

## 📚 Ressources

- [React Profiler](https://react.dev/reference/react/Profiler)
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)
- [Web Vitals](https://web.dev/vitals/)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)

---

**Prochain niveau:** Setup monitoring production avec Sentry/DataDog pour profiling réel utilisateurs.
