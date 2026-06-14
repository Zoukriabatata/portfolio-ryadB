# Spec — Chat de vente intelligent (« Sales Copilot »)

**Date :** 2026-06-14
**Statut :** Design validé, prêt pour plan d'implémentation
**Périmètre :** Site web (Next.js), landing page. N'affecte pas l'app desktop.

---

## 1. Contexte & objectif

Le site vitrine pousse les visiteurs vers le **Download** de l'app desktop (puis checkout
Stripe post-preview). L'IA actuelle de la landing (`FloatingChat` → `/api/ai/support`,
agent `supportAgent.ts`) est un **chat de support pédagogique**, pas un outil de conversion.

Le produit est à **forte considération** (orderflow futures, Apex/Rithmic, technique). Le
principal bloqueur de conversion est **l'objection non répondue au moment où le visiteur
l'a** (« ça marche avec mon Apex ? », « la data est réelle ? », « vs ATAS/Bookmap ? »,
« pourquoi ce prix ? »).

**Objectif :** un agent de vente « soft-sell expert » qui répond juste à ces objections
depuis une base de connaissance curée, lit la température du visiteur, et déclenche la
bonne action de conversion (Download / capture email / checkout / handoff humain).

**Objectif business mesuré :** taux `session chat engagée → action déclenchée`, et volume
de leads / Downloads / checkouts attribuables au chat.

---

## 2. Périmètre

### v1 (cette spec)
- Agent de vente dédié (`salesAgent.ts`) + base de connaissance curée (`sales.md`).
- Route SSE `/api/ai/sales` (clone de `/api/ai/support`, même cascade de modèles).
- `FloatingChat` (landing) basculé vers l'agent vente + rendu de **CTA cliquables**.
- **Next-best-action déterministe** côté serveur (pas généré par le LLM).
- **Capture de lead** : modèle Prisma `Lead`, endpoint `/api/leads`, **notif email admin**
  (via SMTP existant, vers `ADMIN_EMAILS`). Pas d'emails automatiques au prospect.
- **Event-log de mesure** : modèle Prisma `ChatEvent`.

### Hors périmètre (phase 2, différé — nécessite du volume de trafic)
- Séquences d'emails de nurture automatiques vers le prospect.
- Scoring de lead par un modèle ML entraîné.
- Personnalisation du contenu de page selon le visiteur.
- A/B testing des prompts / CTA.

Raison du différé : ces leviers ont besoin de données comportementales et de volume qu'on
n'a pas au lancement. Le v1 produit précisément la donnée (objections réelles, segments,
événements) qui les débloquera.

---

## 3. Infra existante réutilisée (ne pas réinventer)

| Existant | Réutilisé pour |
|---|---|
| `app/api/ai/support/route.ts` | Patron du endpoint SSE : cascade Claude Haiku → Groq Llama 3.3 → Gemini → Ollama, rate-limit, validation, shortcut déterministe |
| `lib/ai/agents/supportAgent.ts` | Patron de construction de prompt (intent → instructions → KB) |
| `loadKnowledge()` (`lib/ai/knowledge`) | Patron de chargement de KB curée |
| `FloatingChat` (`components/landing/`) | Widget déjà monté sur la landing (`LandingClientShell.tsx`) |
| Shortcut Discord déterministe (route support, l.61-82) | Patron d'injection de fait à risque sans LLM |
| Mailer SMTP de `app/api/contact/route.ts` | Notif email admin sur nouveau lead |
| `DISCORD_INVITE_URL`, `/download`, `/pricing` (+ Stripe checkout) | Cibles des CTA déterministes |

---

## 4. Architecture & composants

| Composant | Statut | Rôle |
|---|---|---|
| `lib/ai/agents/salesAgent.ts` | **neuf** | Prompt système « soft-sell expert » + chargement de `sales.md` |
| `lib/ai/knowledge/sales.md` | **neuf** | Source de vérité curée (features, brokers, prix, vs concurrents, objections) |
| `lib/ai/sales/nextBestAction.ts` | **neuf** | Couche déterministe : détecte la température → renvoie les CTA |
| `app/api/ai/sales/route.ts` | **neuf** | Endpoint SSE, clone de support, + frame CTA en fin de stream |
| `components/landing/FloatingChat.tsx` | **modifié** | Pointe `/api/ai/sales`, rend les CTA en boutons, déclenche capture email |
| `app/api/leads/route.ts` | **neuf** | POST : crée un `Lead`, envoie la notif email admin |
| Modèle Prisma `Lead` | **neuf** | Stockage des leads capturés |
| Modèle Prisma `ChatEvent` | **neuf** | Event-log de mesure |
| `app/api/events/route.ts` | **neuf** | POST : enregistre un `ChatEvent` (best-effort, non bloquant) |

**Principe de séparation :** le **LLM gère la conversation** (texte), le **code gère les
actions** (CTA déterministes) et les **faits à risque** (prix, liens, compat broker injectés
en dur). Le LLM ne décide jamais d'un prix ni d'un lien.

---

## 5. Flux de données

```
Visiteur ↔ FloatingChat (landing)
   │  POST /api/ai/sales { message, history, page }
   ▼
/api/ai/sales
   ├─ buildSalesMessages() → system(salesAgent + sales.md) + history + message
   ├─ stream LLM (Claude Haiku → Groq → Gemini → Ollama)  ──SSE token──▶ widget
   ├─ nextBestAction(message, history) → [CTA...]          ──SSE {cta}──▶ widget (avant [DONE])
   └─ [DONE]
   │
FloatingChat rend les CTA en boutons :
   ├─ « Télécharger »  → /download           (+ POST /api/events cta_clicked:download)
   ├─ « Voir les offres » → /pricing          (+ event cta_clicked:checkout)
   ├─ « Rester informé » → mini-form email    → POST /api/leads → Lead + email admin
   └─ « Parler à l'équipe » → DISCORD_INVITE_URL (+ event cta_clicked:discord)
```

Événements émis (best-effort) : `opened`, `engaged` (1er message), `cta_shown`,
`cta_clicked`, `lead_captured`.

---

## 6. Agent de vente : ton & comportement

### Ton : soft-sell expert
L'agent est **un expert orderflow qui conseille**, pas un commercial agressif. Il répond
d'abord à la question/objection avec précision et honnêteté, **puis** oriente naturellement
vers l'action pertinente. Il n'insiste pas, ne relance pas en boucle, n'exagère pas. Une
réponse utile qui finit par une ouverture, pas un pitch.

### Lecture de température → next-best-action (déterministe, `nextBestAction.ts`)
Heuristique sur le dernier message + historique (mots-clés + signaux), sans modèle ML :

| Température | Signaux | CTA injecté |
|---|---|---|
| **Froid / découverte** | « c'est quoi », « comment ça marche », 1ʳᵉ question | **Download** |
| **Tiède / hésitant** | objection (prix, compat, data), comparaison, « mais » | Traiter l'objection + **capture email** en filet |
| **Chaud / informé** | « comment je m'abonne », « combien », « offre », parle plan | **Checkout** (/pricing) |
| **Gros prospect / bloqué** | cas complexe, demande humaine, frustration, B2B | **Handoff Discord/humain** |

Plusieurs CTA peuvent coexister (ex : Download + capture email). Le LLM ne choisit pas le
CTA ; il est calculé par le code et attaché en fin de stream.

---

## 7. Anti-hallucination (point dur — produit financier)

1. **KB-only** : l'agent répond uniquement depuis `sales.md`. Hors scope → « je vérifie ce
   point avec l'équipe » + handoff. Jamais d'invention.
2. **Faits à risque injectés en dur**, jamais générés : prix/plans, compatibilité brokers,
   lien Download, lien checkout, lien Discord. Repris de config/KB comme le shortcut Discord
   actuel. Si l'utilisateur demande un prix → la valeur vient de la config, pas du LLM.
3. **Règles héritées du support** (réaffirmées dans le prompt) : pas de conseil
   d'investissement, pas de promesse de performance/gains, ne pas se prétendre un autre IA,
   pas de réponse hors trading/plateforme.
4. **Honnêteté sur les limites** : si une feature n'existe pas, le dire (« pas encore
   disponible ») plutôt que de la promettre.

---

## 8. Base de connaissance curée — structure de `sales.md`

Document maintenu à la main (responsabilité produit), sections :
- **Pitch & positionnement** : ce que c'est, pour qui, la promesse (« The Science of
  Orderflow »).
- **Features** par module : footprint/heatmap, GEX, gamma/smile, journal, account, news.
- **Compatibilité brokers** : Apex (preview, entitlements data), Rithmic, ponts NinjaTrader/
  ATAS/Quantower, crypto. **Faits exacts uniquement.**
- **Plans & prix** : offres, période preview, ce qui est inclus. (Valeurs aussi en config
  pour injection déterministe.)
- **Vs concurrents** : ATAS, Bookmap, Sierra Chart, Quantower — différenciateurs honnêtes.
- **Objections fréquentes → réponses** : data réelle ?, prix, courbe d'apprentissage,
  Mac/Windows, sécurité credentials, etc.
- **Liens d'action** : Download, pricing, Discord (les valeurs canoniques).

---

## 9. Capture de lead

### Modèle Prisma `Lead`
```
model Lead {
  id          String   @id @default(cuid())
  email       String
  temperature String   // "cold" | "warm" | "hot"
  topic       String?  // intent/objection détecté au moment de la capture
  transcript  String?  // extrait court de la conversation (contexte)
  page        String?  // page d'origine
  source      String   @default("sales_chat")
  status      String   @default("new") // "new" | "contacted"
  notified    Boolean  @default(false)
  createdAt   DateTime @default(now())
  @@index([createdAt])
  @@index([status])
}
```

### `POST /api/leads`
- Valide l'email (format) + longueur des champs.
- Crée le `Lead`.
- Envoie une **notif email** vers `ADMIN_EMAILS` via le mailer SMTP existant (sujet :
  nouveau lead chaud + email + objection + extrait). Marque `notified=true` si OK.
- Rate-limit (anti-spam) sur l'IP.
- Best-effort sur l'email : si l'envoi échoue, le `Lead` reste enregistré (pas de perte).

---

## 10. Mesure

### Modèle Prisma `ChatEvent`
```
model ChatEvent {
  id        String   @id @default(cuid())
  sessionId String   // id anonyme généré côté client (pas de PII)
  type      String   // "opened" | "engaged" | "cta_shown" | "cta_clicked" | "lead_captured"
  ctaType   String?  // "download" | "checkout" | "email" | "discord"
  page      String?
  createdAt DateTime @default(now())
  @@index([type, createdAt])
}
```

### `POST /api/events`
Best-effort, non bloquant, jamais d'erreur visible côté UX. Rate-limit IP léger.

### Métrique de succès
- **Taux de conversion chat** = sessions avec ≥1 `cta_clicked` / sessions `engaged`.
- Répartition des CTA cliqués (download vs checkout vs email vs discord).
- Nombre de leads capturés / semaine.
Lecture initiale : requête SQL simple sur `ChatEvent` (pas de dashboard en v1).

---

## 11. Gestion d'erreurs

- **LLM indisponible** (toute la cascade échoue) : message de repli + CTA Discord/contact
  (ne jamais laisser le visiteur dans le vide).
- **`/api/leads` échoue** : afficher « réessaie » dans le mini-form ; ne pas perdre l'email
  saisi côté widget.
- **`/api/events` échoue** : silencieux (best-effort), ne casse jamais l'UX.
- **Input** : mêmes garde-fous que la route support (taille message ≤ 4000, history bornée,
  validation JSON).

---

## 12. Tests

- **`nextBestAction.ts`** : tests unitaires sur la classification température → CTA
  (froid/tiède/chaud/handoff), cas limites (message vide, objection + question mêlées).
- **`salesAgent.ts`** : test que le prompt inclut bien la KB + les règles anti-hallucination ;
  test que les faits à risque (prix/liens) ne dépendent pas du LLM (présents en config).
- **`/api/leads`** : email invalide rejeté ; lead créé ; notif appelée ; lead conservé si la
  notif échoue.
- **`/api/sales`** : stream renvoie des tokens + un frame `{cta}` avant `[DONE]` ; validation
  d'input ; repli si cascade LLM échoue.
- **Anti-régression** : la route support existante reste inchangée.

---

## 13. Config requise (env)

Existantes réutilisées : `ANTHROPIC_API_KEY` / `GROQ_API_KEY` / `GEMINI_API_KEY`,
`SMTP_*`, `ADMIN_EMAILS`, `DISCORD_INVITE_URL`.
À confirmer/ajouter (valeurs canoniques pour injection déterministe) :
- `NEXT_PUBLIC_DOWNLOAD_URL` (ou route `/download`) — lien Download canonique.
- `NEXT_PUBLIC_PRICING_URL` (`/pricing`) — entrée checkout.
- Les prix/plans : source unique (config ou section dédiée de `sales.md`) pour éviter
  toute divergence entre l'affichage et ce que dit l'agent.

---

## 14. Risques & décisions ouvertes

- **Qualité de `sales.md`** = qualité de l'agent. Le doc doit être exact et tenu à jour ;
  c'est le vrai travail de fond (pas le code).
- **Faible trafic au lancement** : la mesure mettra du temps à être significative. Accepté —
  on instrumente quand même pour capitaliser dès le début.
- **Décision tranchée** : pas de modèle ML en v1 (température = heuristique). À réévaluer en
  phase 2 avec du volume.
- **Décision tranchée** : ton soft-sell expert, capture email = stockage + notif admin
  uniquement (pas d'emails auto au prospect en v1).
