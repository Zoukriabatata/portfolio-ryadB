# Discord Release Announcement v0.2.0

## EN version

🚀 **OrderflowV2 v0.2.0 is live**

Big update — we now support **Rithmic R|Protocol** for **live CME futures data**.

What's new:
- ✅ Live MNQ/ES/NQ/CL/GC futures data via Rithmic
- ✅ Multi-broker support: Apex Trader Funding, Topstep, MFFU, BluSky, Bulenox, 4PropTrader, Earn2Trade, Tradeify, Rithmic Paper Trading, Rithmic 01, and more
- ✅ Multi-timeframe footprint (5s, 15s, 1m, 5m) with per-level buy/sell volume
- ✅ Secure credential storage via OS keyring (Windows Credential Manager)
- ✅ Streamlined navigation: Welcome / Footprint / Live / Account

How to use:
1. Download v0.2.0: https://orderflow-v2.vercel.app/download
2. Click "Edit broker settings" in the navbar
3. Pick your prop firm preset (Apex, Topstep, MFFU, etc.)
4. Enter your Rithmic credentials → Save
5. Subscribe to your symbol (e.g. MNQM6.CME) → live footprint streams instantly

⚠️ Note: auto-updater is currently disabled (Tauri plugin bug).
Please re-download manually from /download even if you have a previous version.

Questions? Drop them here. Thanks for being early adopters 🙏

---

## FR version

🚀 **OrderflowV2 v0.2.0 est dispo**

Grosse mise à jour — on supporte maintenant **Rithmic R|Protocol** pour les **données futures CME en temps réel**.

Nouveautés :
- ✅ Data live MNQ/ES/NQ/CL/GC via Rithmic
- ✅ Multi-broker : Apex, Topstep, MFFU, BluSky, Bulenox, 4PropTrader, Earn2Trade, Tradeify, Rithmic Paper Trading, Rithmic 01, etc.
- ✅ Footprint multi-timeframe (5s, 15s, 1m, 5m) avec volume buy/sell par niveau de prix
- ✅ Credentials chiffrés via Windows Credential Manager
- ✅ Navigation propre : Welcome / Footprint / Live / Account

Comment l'utiliser :
1. Download v0.2.0 : https://orderflow-v2.vercel.app/download
2. Click "Edit broker settings" dans la navbar
3. Choisis ton preset prop firm
4. Entre tes credentials Rithmic → Save
5. Subscribe à ton symbole (ex. MNQM6.CME) → footprint live instantané

⚠️ Note : auto-updater actuellement désactivé (bug plugin Tauri).
Re-download manuel depuis /download même si tu as une version antérieure.

Vos questions bienvenues. Merci d'être early adopters 🙏

---

## Posting checklist

Avant de poster sur Discord :

- [ ] Confirmer que la GitHub release v0.2.0 est publiée et que le `.msi` est uploadé
- [ ] Tester le download depuis `/download` sur une machine fresh (ou VM)
- [ ] Login + setup Apex (ou autre preset) + footprint stream confirmé OK
- [ ] Screenshot/screencast du footprint live pour accompagner le post
- [ ] Choisir le canal Discord (#announcements ? #releases ?)
- [ ] Pinger les @PRO members ou @everyone selon convention serveur

## Variations post

### Court (Twitter / annonce rapide)

> 🚀 OrderflowV2 v0.2.0 ships — live CME futures footprint via Rithmic R|Protocol. Multi-broker (Apex, Topstep, MFFU, BluSky, etc). Encrypted credentials. Download: https://orderflow-v2.vercel.app/download

### Long (post blog / changelog page)

Voir doc README desktop ou changelog GitHub release notes — la TLDR est dans `docs/RITHMIC_DATA_INVESTIGATION_2026-05-08.md` pour le contexte technique.

## Réponses pré-rédigées aux questions probables

**Q: Mac when?**
> macOS build en Q3 2026. Windows en priorité parce que c'est la majorité de la base utilisateurs prop firm + R|Trader Pro est Windows-only.

**Q: I don't have a prop firm account, can I still try it?**
> Oui — preset "Rithmic Test" est en mode UAT (gratuit, 15min delayed-ish). Pas usable en live trading mais permet de tester le pipeline. Pour de la vraie data live tu as besoin d'Apex / Topstep / Rithmic 01 avec un compte actif.

**Q: Auto-update why broken?**
> Bug interne du plugin `tauri-plugin-updater` v2 — `check()` retourne `null` même quand le serveur sert un manifest valide (200 + signature). On a investigué 9 versions (v0.1.3 → v0.1.12) sans trouver le root cause côté plugin. TODO P1 pour v0.2.x — en attendant, manual re-download.

**Q: Source code open source ?**
> Pas pour le moment. Le repo est privé. Décision à reconsidérer post-v1 selon traction.
