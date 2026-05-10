# Lessons (Tauri / IPC, regl, layout, hot-reload)

Leçons accumulées pendant la refonte heatmap (REFONTE-1 à 5). Versionné
ici pour partage équipe (`CLAUDE.md` est gitignored = local seulement).

## §5.A — regl init silent failure

Si l'init regl échoue, aucune erreur n'est levée — le canvas reste juste
noir. Avant de croire qu'un pipeline GL est cassé, dessine une primitive
sanity (red quad fixe en clip-space) hors de toute logique data. Si le
quad s'affiche, regl est OK et le bug est ailleurs (data, axes, uniforms).

Pattern actuel : `engine.enableDevSanity()` dans `HeatmapEngine` active
un quad rouge ~5 % écran haut-gauche. Toujours le 1er check runtime.

## §5.B — Uniforms vec via regl.prop

N'utilise PAS `regl.prop` pour des uniforms `vec2`/`vec4`. Closure directe
sur la valeur depuis le scope de la draw command. `regl.prop` sur des vec
a tendance à se silencer ou à rendre des valeurs invalides selon la
version, et casse en cascade le reste du pipeline. Scalaires (int, float)
en `regl.prop` sont OK — ex. `instances` dans `TradeBubblesLayer`.

## §5.C — serde camelCase et inspection payload

serde Rust avec `#[serde(rename_all = "camelCase")]` sur une struct
renomme les champs multi-mots côté JSON : `timestamp_ns` → `timestampNs`,
`last_update_id` → `lastUpdateId`. Single-word inchangés (`price`,
`symbol`, `quantity`).

**Toujours INSPECTER le payload réel reçu côté JS via
`console.log(event.payload)` avant de coder le validator**, ne pas faire
confiance aux noms Rust ni à la doc `#[derive]`. Bug récurrent : un
validator basé sur `timestamp_ns` rejette tous les payloads, le canvas
reste noir, on debug pendant des heures alors que le payload est valide
mais sous un autre nom.

Vu en REFONTE-3.5 (orderbook) puis REFONTE-4a (trades). Les 2 adapters
ont maintenant des tests anti-régression "rejette payload snake_case".

## §5.D — Précision Number JS sur u64 timestamps

Un `u64` en nanoseconds (depuis UNIX epoch ~1.7e18) dépasse
`Number.MAX_SAFE_INTEGER` (2^53 ≈ 9e15). serde_json sérialise en JSON
number, JS perd ~7 bits (spacing 256 ns à cette échelle). Pour la
granularité ms (`floor(/1e6)`), l'erreur retombe à sub-µs : acceptable
pour un bucket de 100 ms.

Si tu as besoin de la précision ns intégrale, configure serde pour
sérialiser en string et parse via `BigInt` côté JS. Pas implémenté
actuellement (use case absent).

## §5.E — Hot-reload Vite + Tauri WS subscribes

Le hot-reload Vite (HMR) après un commit qui modifie un `useEffect`
contenant des subscribes Tauri (`@tauri-apps/api/event listen`) peut
**casser silencieusement les event listeners** sans erreur visible :
les listeners ne sont pas re-attached après le HMR. Symptôme typique
en cascade :

1. Trades = 0 (event "crypto-tick-update" ne fire pas côté JS).
2. `tradesBuffer.currentPrice()` retourne `null`.
3. `ViewportController.tickAutoFollow()` no-op.
4. Viewport reste à sa valeur initiale hardcodée.
5. BTC réel hors viewport → toutes les données filtrées par `priceIndex=-1`.
6. Canvas apparaît noir, alors que le pipeline GL est OK (sanity quad visible).

**Solution** : restart Tauri complet (Ctrl+C + `npm run tauri dev`)
avant tout diagnostic plus profond. Pas de fix code nécessaire — c'est
un état runtime de l'app Tauri post-HMR. Vérifié REFONTE-4c → 4c.5 (faux
diagnostic) → restart résolu en 30 s.

**Mitigation REFONTE-5** : auto-init viewport depuis le 1er orderbook
snapshot (callback orderbook avec flag `viewportInitialized`). Évite
au moins la cascade #4-#6 si Trades reviennent en retard ou si HMR
casse uniquement le subscribe trades.

## §5.F — `.app-shell` CSS rule manquante (layout collapse)

Symptôme : canvas heatmap rendu en `1920×0`, invisible bien que le
parent semble correct. Cascade :

1. `<div className="app-shell">` dans `Layout.tsx` n'avait **aucune règle CSS**
   (la classe était juste un marker DOM).
2. `.app-shell` collapsait à la hauteur de ses children (AppNavbar 44 px).
3. `<Outlet />` substitue le composant route directement.
4. Le wrapper canvas `height: 100%` retombe à 0 (parent à hauteur indéfinie
   transmis à Tauri WebView2 = 0).

**Solution** (REFONTE-4b.5) : ajouter dans `globals.css` :

```css
html, body, #root { height: 100%; margin: 0; }
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
.app-main {
  flex: 1 1 0;
  min-height: 0;
  position: relative;
}
```

Et wrapper `<Outlet />` dans `<main className="app-main">` côté `Layout.tsx`.

**Toujours vérifier** que les classes CSS référencées dans le DOM ont
des règles correspondantes en CSS — un `className="X"` orphelin compile
en JSX mais ne fait rien runtime. Particulièrement traître quand le
collapse est silencieux (canvas accept tout, just renders 0 px).

## §5.G — ResizeObserver sur le bon parent

Quand un `<canvas>` doit suivre la taille de son conteneur (resize
fenêtre Tauri), le `ResizeObserver` doit observer le **parent direct**
qui détient la dimension réelle, pas un ancêtre lointain.

REFONTE-4b.5 utilise `canvas.parentElement` directement → c'est le
wrapper inline-styled DIV à l'intérieur de `.app-main`. ResizeObserver
fire à chaque resize, callback recalcule `canvas.width = client * dpr`.

REFONTE-5 (CSS Grid 2 colonnes) : le canvas est dans `.heatmap-canvas-zone`
(la 2e colonne du grid). `canvas.parentElement` = `.heatmap-canvas-zone`,
qui est dimensionné par le grid (`1fr`). Le ResizeObserver continue de
fonctionner correctement.

**À NE PAS FAIRE** : observer `.heatmap-route-grid` ou `.app-main`. Ces
ancêtres ne shrink pas avec la taille du canvas-zone interne (le grid
gère sa propre distribution).
