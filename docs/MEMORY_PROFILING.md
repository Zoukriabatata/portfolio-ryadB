# 🧠 Memory Profiling Guide

Guide complet pour détecter et corriger les fuites mémoire (memory leaks) dans l'application.

---

## 🎯 Objectif

Vérifier que l'application:
- ✅ Ne consomme pas plus de **200 MB** de RAM après 10 min d'utilisation
- ✅ Ne croît pas indéfiniment (pas de memory leak)
- ✅ Nettoie correctement les WebSockets, intervals, listeners

---

## 🛠️ Outils Utilisés

### 1. Chrome DevTools Memory Profiler
### 2. React DevTools Profiler
### 3. Performance Monitor (intégré Chrome)

---

## 📊 Méthode: Heap Snapshot Comparison

### Étape 1: Ouvrir Chrome DevTools

```
1. F12 ou Ctrl+Shift+I
2. Onglet "Memory"
3. Sélectionner "Heap snapshot"
```

### Étape 2: Prendre un Snapshot Initial

```
1. Charger la page /live
2. Attendre 10 secondes (chargement complet)
3. Cliquer "Take snapshot" (cercle plein)
4. Nommer: "Snapshot 1 - Initial"
```

### Étape 3: Simuler une Utilisation Intensive

**Scénario de test (2 minutes):**

```javascript
// Actions à effectuer
1. Changer de symbole 5x (BTC → ETH → SOL → XRP → BTC)
   └─ Attendre 5s entre chaque changement

2. Changer de layout 3x (1x1 → 2x2 → 1x1)
   └─ Attendre 3s entre chaque changement

3. Ouvrir/fermer Watchlist 5x
   └─ Attendre 2s entre chaque toggle

4. Scroll dans le chart (10x zoom in/out)
   └─ Utiliser molette souris

5. Changer timeframe 5x (1m → 5m → 15m → 1h → 1m)
```

### Étape 4: Prendre un Snapshot Final

```
1. Attendre 10 secondes (garbage collection)
2. Cliquer "Take snapshot"
3. Nommer: "Snapshot 2 - After actions"
```

### Étape 5: Comparer les Snapshots

```
1. Sélectionner "Snapshot 2"
2. Changer le dropdown de "Summary" à "Comparison"
3. Sélectionner "Snapshot 1" comme baseline
4. Trier par "Size Delta" (décroissant)
```

---

## 🚨 Ce qu'il Faut Chercher

### ✅ BON (Normal)

```
Delta Size: +5 MB (acceptable, cache normal)
Objects:
  ✅ Array: +200 (données de marché)
  ✅ Object: +500 (state Zustand)
  ✅ String: +1000 (prix formatés)
```

### ❌ PROBLÈME (Memory Leak)

```
❌ Delta Size: +50 MB (GROS problème!)
❌ Detached DOM nodes: > 100 (pas nettoyés)
❌ Event listeners: +500 (pas unsubscribed)
❌ Timers (setInterval): Alloc > Free
```

---

## 🔍 Identifier les Leaks Communs

### Leak 1: WebSocket Non Fermé

**Symptôme:**
```
WebSocket: +5 instances
BinanceLiveWS: +3 instances
```

**Solution:**
```typescript
// Vérifier dans BinanceLiveWS.ts
disconnect() {
  if (this.ws) {
    this.ws.close(); // ✅ Fermer explicitement
    this.ws = null;
  }
  if (this.reconnectTimer) {
    clearTimeout(this.reconnectTimer); // ✅ Clear timers
  }
}
```

**Vérifier dans le composant:**
```typescript
useEffect(() => {
  const ws = new BinanceLiveWS(...);
  return () => ws.disconnect(); // ✅ Cleanup
}, []);
```

### Leak 2: Event Listeners Non Retirés

**Symptôme:**
```
EventListener: +200 instances
addEventListener: Alloc >> Free
```

**Solution:**
```typescript
useEffect(() => {
  const handleResize = () => { ... };
  window.addEventListener('resize', handleResize);

  return () => {
    window.removeEventListener('resize', handleResize); // ✅
  };
}, []);
```

### Leak 3: Intervals/Timeouts Non Clearés

**Symptôme:**
```
Timeout: +50 active
setInterval: Running count increasing
```

**Solution:**
```typescript
useEffect(() => {
  const interval = setInterval(() => { ... }, 1000);

  return () => {
    clearInterval(interval); // ✅
  };
}, []);
```

### Leak 4: Canvas/WebGL Context Non Libéré

**Symptôme:**
```
HTMLCanvasElement: +10 instances
WebGLRenderingContext: +5 instances
```

**Solution:**
```typescript
// Dans HybridRenderer.ts ou CanvasChartEngine.ts
cleanup() {
  if (this.gl) {
    const ext = this.gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext(); // ✅ Libérer WebGL
  }

  this.canvas.width = 0; // ✅ Force GC
  this.canvas.height = 0;
}
```

### Leak 5: Zustand Store Subscribers

**Symptôme:**
```
Function: +500 instances (subscribe callbacks)
```

**Solution:**
```typescript
useEffect(() => {
  const unsubscribe = useTradingStore.subscribe((state) => {
    // ...
  });

  return () => unsubscribe(); // ✅
}, []);
```

---

## 📈 Performance Monitor (Real-Time)

### Étape 1: Ouvrir Performance Monitor

```
1. F12 → Performance Tab
2. Cliquer sur l'icône "..." (3 points)
3. Sélectionner "Performance monitor"
4. Panel s'ouvre en bas
```

### Étape 2: Métriques à Surveiller

**Pendant 5 minutes d'utilisation:**

| Métrique | Cible | Alerte Si |
|----------|-------|-----------|
| **JS heap size** | < 200 MB | Croissance continue > 50 MB |
| **DOM Nodes** | < 5000 | > 10,000 |
| **JS event listeners** | < 500 | > 2000 |
| **Layouts / sec** | < 5 | > 30 (thrashing) |
| **Style recalcs / sec** | < 10 | > 50 |

### Graphique Normal vs Problématique

```
✅ NORMAL (sawtooth pattern):
Heap Size
200 MB │    ╱╲    ╱╲    ╱╲
       │   ╱  ╲  ╱  ╲  ╱  ╲
100 MB │  ╱    ╲╱    ╲╱    ╲
       └──────────────────────►
        GC  GC  GC  GC   Time

❌ LEAK (continuous growth):
Heap Size
300 MB │              ╱╱╱╱╱
       │          ╱╱╱╱
200 MB │      ╱╱╱╱
       │  ╱╱╱╱
100 MB │╱╱
       └──────────────────────►
                          Time
```

---

## 🧹 Memory Leak Checklist

Vérifier dans le code:

### WebSocket & Network
- [ ] `ws.close()` dans cleanup
- [ ] `clearTimeout(reconnectTimer)`
- [ ] Unsubscribe de tous les streams

### Event Listeners
- [ ] `removeEventListener` pour chaque `addEventListener`
- [ ] Cleanup des observers (ResizeObserver, IntersectionObserver)
- [ ] Cleanup des mutation observers

### Timers
- [ ] `clearInterval` pour chaque `setInterval`
- [ ] `clearTimeout` pour chaque `setTimeout`
- [ ] `cancelAnimationFrame` pour chaque `requestAnimationFrame`

### Canvas & WebGL
- [ ] `canvas.width = 0` dans cleanup
- [ ] `gl.loseContext()` si WebGL utilisé
- [ ] Détruire regl instance

### React
- [ ] Retourner cleanup function dans tous les `useEffect`
- [ ] Unsubscribe des stores Zustand
- [ ] Cleanup des refs (`chartEngineRef.current = null`)

### Zustand Stores
- [ ] Pas de listeners orphelins
- [ ] Reset des stores au unmount si nécessaire

---

## 🛠️ Outils Automatiques

### Script de Test Memory (Manuel)

Créer `tests/memory/leak-test.ts`:

```typescript
/**
 * TEST MEMORY LEAK
 * À lancer manuellement pour détecter les fuites
 */

import { test } from '@playwright/test';

test('should not leak memory after 100 symbol changes', async ({ page }) => {
  await page.goto('http://localhost:3000/live');

  // Snapshot initial
  const initialMemory = await page.evaluate(() => {
    return (performance as any).memory?.usedJSHeapSize || 0;
  });

  // Changer de symbole 100 fois
  for (let i = 0; i < 100; i++) {
    await page.click('[data-testid="symbol-BTC"]');
    await page.waitForTimeout(100);
    await page.click('[data-testid="symbol-ETH"]');
    await page.waitForTimeout(100);
  }

  // Force GC (si activé dans Chrome)
  await page.evaluate(() => {
    if ((window as any).gc) {
      (window as any).gc();
    }
  });

  await page.waitForTimeout(2000);

  // Snapshot final
  const finalMemory = await page.evaluate(() => {
    return (performance as any).memory?.usedJSHeapSize || 0;
  });

  const delta = finalMemory - initialMemory;
  const deltaMB = (delta / 1024 / 1024).toFixed(2);

  console.log(`Memory delta: ${deltaMB} MB`);

  // Alerte si croissance > 50 MB
  if (delta > 50 * 1024 * 1024) {
    console.error(`⚠️ MEMORY LEAK DETECTED: +${deltaMB} MB`);
  }
});
```

**Lancer avec:**
```bash
# Chrome avec flag --expose-gc pour forcer GC
npx playwright test tests/memory/leak-test.ts --headed
```

---

## 🎯 Objectifs de Performance

| Durée d'Utilisation | RAM Attendue | RAM Maximum |
|---------------------|--------------|-------------|
| **Initial Load** | 80-120 MB | 150 MB |
| **Après 5 min** | 100-150 MB | 200 MB |
| **Après 30 min** | 120-180 MB | 250 MB |
| **Après 1 heure** | Stable (~150 MB) | 300 MB |

**Si > 300 MB après 1h → Memory leak confirmé**

---

## 🐛 Debugging Avancé

### Trouver Quel Fichier Leak

```
1. Dans Heap Snapshot "Comparison"
2. Trier par "Alloc Size" (décroissant)
3. Expand les objets qui ont grandi
4. Cliquer sur une instance
5. En bas: "Retainers" → Voir qui retient la référence
```

**Exemple:**
```
BinanceLiveWS @123456
  ├─ ws: WebSocket
  ├─ reconnectTimer: Timeout #42 ❌ (pas clearé!)
  └─ Retainers:
      └─ Window / global ❌ (encore référencé!)
```

→ **Problème:** Le timer n'est pas clearé, donc l'objet entier reste en mémoire.

---

## ✅ Validation Finale

**Checklist:**

- [ ] Heap size stable après 10 min (± 50 MB)
- [ ] Pas de croissance linéaire dans Performance Monitor
- [ ] Detached DOM nodes < 50
- [ ] Event listeners stable (pas de croissance)
- [ ] WebSocket count = 1 (pas de duplication)
- [ ] Canvas elements = nombre de charts visibles
- [ ] Tous les cleanups implémentés dans useEffect
- [ ] Zustand subscribers < 20

---

## 📚 Ressources

- **Chrome DevTools Memory:** https://developer.chrome.com/docs/devtools/memory-problems/
- **Memory Leak Patterns:** https://web.dev/articles/detached-window-memory-leaks
- **React Memory Leaks:** https://react.dev/learn/synchronizing-with-effects#how-to-handle-the-effect-firing-twice-in-development

---

**Temps estimé:** 30-45 minutes
**Résultat attendu:** Zéro memory leak, RAM stable < 200 MB 🎯
