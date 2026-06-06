'use client';

import Link from 'next/link';
import { useState } from 'react';

/* ─────────────────────────────────────────────────────────────────────────────
 * Conformité RGPD — articles 13 & 14 (information des personnes concernées)
 * Mise à jour : juin 2026  —  D1 paiements manuels coupés / Sentry retiré
 * ───────────────────────────────────────────────────────────────────────────── */

const content = {
  fr: {
    back: 'Retour',
    title: 'Politique de Confidentialité',
    updated: 'Dernière mise à jour : juin 2026',
    intro: 'Cette politique décrit les données personnelles collectées par SENZOUKRIA (éditeur : Ryad Bouderga, contact : ryad.bouderga78@gmail.com), les finalités de leur traitement, les destinataires, vos droits et la façon de les exercer.',
    sections: [
      {
        title: '1. Données collectées et bases légales',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed mb-3">
              Nous collectons uniquement les données nécessaires au fonctionnement du service.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-zinc-700">
                    <th className="text-left py-2 pr-4 text-zinc-300 font-semibold">Catégorie</th>
                    <th className="text-left py-2 pr-4 text-zinc-300 font-semibold">Données</th>
                    <th className="text-left py-2 text-zinc-300 font-semibold">Base légale (art. 6 RGPD)</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 text-white font-medium align-top">Compte</td>
                    <td className="py-2 pr-4 align-top">Email, nom (optionnel), pseudo, avatar, mot de passe (haché bcrypt-12)</td>
                    <td className="py-2 align-top">Exécution du contrat</td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 text-white font-medium align-top">OAuth Google</td>
                    <td className="py-2 pr-4 align-top">Identifiant Google, access_token, refresh_token, id_token</td>
                    <td className="py-2 align-top">Exécution du contrat (authentification déléguée)</td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 text-white font-medium align-top">Sécurité</td>
                    <td className="py-2 pr-4 align-top">Adresse IP, user-agent, empreinte appareil (anti-partage de compte), tentatives de connexion échouées</td>
                    <td className="py-2 align-top">Intérêt légitime (sécurité / lutte contre la fraude)</td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 text-white font-medium align-top">Paiement</td>
                    <td className="py-2 pr-4 align-top">Identifiant Stripe customer, identifiant d'abonnement Stripe (pas de numéro de carte)</td>
                    <td className="py-2 align-top">Exécution du contrat / obligation légale (facturation)</td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 text-white font-medium align-top">Journal de trading</td>
                    <td className="py-2 pr-4 align-top">Symbole, sens (LONG/SHORT), prix d'entrée/sortie, quantité, PnL, screenshots — <strong className="text-zinc-300">saisis volontairement par l'utilisateur</strong></td>
                    <td className="py-2 align-top">Exécution du contrat (fonctionnalité Journal)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 text-white font-medium align-top">Assistant IA</td>
                    <td className="py-2 pr-4 align-top">Messages texte et images envoyés à l'assistant — transmis à un fournisseur LLM tiers (voir §5)</td>
                    <td className="py-2 align-top">Exécution du contrat (fonctionnalité IA)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ),
      },
      {
        title: '2. Données NON collectées',
        body: (
          <>
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
              <p className="text-green-400 font-semibold mb-2">Nous ne collectons JAMAIS :</p>
              <ul className="list-disc list-inside text-zinc-400 space-y-1">
                <li>Données de marché CME en temps réel (ticks, quotes, DOM, trades)</li>
                <li>Identifiants de compte broker (login/mot de passe Rithmic, Apex, IBKR…)</li>
                <li>Numéros de carte bancaire ni données de paiement brutes</li>
                <li>Positions ouvertes ou ordres transmis via l'app desktop (transitent directement broker ↔ client)</li>
              </ul>
            </div>
            <p className="text-zinc-400 mt-3 text-sm">
              Les données du journal de trading (entrée/sortie, PnL) sont saisies
              <em> volontairement</em> par l'utilisateur dans le module Journal — elles ne
              sont pas capturées automatiquement depuis le broker.
            </p>
          </>
        ),
      },
      {
        title: '3. Finalités du traitement',
        body: (
          <ul className="list-disc list-inside text-zinc-400 space-y-1">
            <li>Authentification et gestion des sessions (JWT 6h)</li>
            <li>Prévention du partage de compte (anti-sharing, détection multi-appareils)</li>
            <li>Gestion de l'abonnement et de la facturation (Stripe)</li>
            <li>Fourniture des fonctionnalités : Footprint, Heatmap, GEX, Journal, Assistant IA</li>
            <li>Sécurité du service (détection d'attaques, blocage de comptes compromis)</li>
            <li>Support et assistance technique</li>
          </ul>
        ),
      },
      {
        title: '4. Durées de conservation',
        body: (
          <ul className="list-disc list-inside text-zinc-400 space-y-1">
            <li><strong className="text-zinc-300">Sessions</strong> : supprimées à l'expiration (6h) ou à la déconnexion, purge automatique des sessions expirées</li>
            <li><strong className="text-zinc-300">Données de compte</strong> : conservées pendant la durée de l'abonnement + 30 jours après résiliation (délai de réactivation), puis supprimées sur demande ou automatiquement</li>
            <li><strong className="text-zinc-300">Logs IP / journaux de sécurité</strong> : 12 mois maximum</li>
            <li><strong className="text-zinc-300">Données de paiement (Stripe)</strong> : 10 ans (obligation comptable légale, art. L123-22 C.com.)</li>
            <li><strong className="text-zinc-300">Journal de trading</strong> : conservé tant que le compte est actif ; supprimé avec le compte sur demande (hors contrainte légale)</li>
          </ul>
        ),
      },
      {
        title: '5. Sous-traitants et transferts hors UE',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed mb-3">
              Nous faisons appel aux sous-traitants suivants. Certains sont établis aux États-Unis
              (transferts encadrés par les Clauses Contractuelles Types UE ou le Data Privacy Framework UE-USA) :
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-zinc-700">
                    <th className="text-left py-2 pr-4 text-zinc-300 font-semibold">Sous-traitant</th>
                    <th className="text-left py-2 pr-4 text-zinc-300 font-semibold">Rôle</th>
                    <th className="text-left py-2 pr-4 text-zinc-300 font-semibold">Pays</th>
                    <th className="text-left py-2 text-zinc-300 font-semibold">Garantie</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 font-medium text-zinc-300">Vercel Inc.</td>
                    <td className="py-2 pr-4">Hébergement de l'application web</td>
                    <td className="py-2 pr-4">États-Unis</td>
                    <td className="py-2">DPF UE-USA + SCC</td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 font-medium text-zinc-300">Stripe Inc.</td>
                    <td className="py-2 pr-4">Traitement des paiements</td>
                    <td className="py-2 pr-4">États-Unis</td>
                    <td className="py-2">DPF UE-USA + SCC</td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 font-medium text-zinc-300">Anthropic PBC</td>
                    <td className="py-2 pr-4">LLM assistant IA (Claude) — reçoit vos messages et images</td>
                    <td className="py-2 pr-4">États-Unis</td>
                    <td className="py-2">SCC</td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 font-medium text-zinc-300">Groq Inc.</td>
                    <td className="py-2 pr-4">LLM assistant IA (Llama) — reçoit vos messages et images</td>
                    <td className="py-2 pr-4">États-Unis</td>
                    <td className="py-2">SCC</td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 font-medium text-zinc-300">Google LLC</td>
                    <td className="py-2 pr-4">OAuth (connexion Google) + LLM Gemini (assistant IA)</td>
                    <td className="py-2 pr-4">États-Unis</td>
                    <td className="py-2">DPF UE-USA + SCC</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium text-zinc-300">Fournisseur SMTP</td>
                    <td className="py-2 pr-4">Envoi des emails de vérification et notifications</td>
                    <td className="py-2 pr-4">Variable</td>
                    <td className="py-2">SCC si hors UE</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-zinc-400 mt-3 text-sm">
              Concernant l'assistant IA : vos messages texte et images de charts envoyés à l'assistant
              sont transmis à ces fournisseurs pour générer une réponse. Ils ne sont pas utilisés pour
              l'entraînement de leurs modèles (clauses contractuelles en vigueur). Aucune donnée de marché
              broker (identifiants, positions, ordres) ne transite par l'IA.
            </p>
          </>
        ),
      },
      {
        title: '6. Vos droits',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed mb-3">
              Conformément au RGPD (articles 15 à 22), vous disposez des droits suivants :
            </p>
            <ul className="list-disc list-inside text-zinc-400 space-y-1">
              <li><strong className="text-zinc-300">Accès</strong> : obtenir une copie de vos données</li>
              <li><strong className="text-zinc-300">Rectification</strong> : corriger des données inexactes</li>
              <li><strong className="text-zinc-300">Suppression</strong> : demander l'effacement — accessible directement depuis <a href="/account/danger" className="text-green-400 underline">Compte → Zone Danger → Supprimer le compte</a></li>
              <li><strong className="text-zinc-300">Portabilité</strong> : recevoir vos données dans un format structuré — accessible depuis <a href="/api/account/export" className="text-green-400 underline">Compte → Exporter mes données</a></li>
              <li><strong className="text-zinc-300">Opposition / limitation</strong> : vous opposer à certains traitements fondés sur l'intérêt légitime</li>
            </ul>
            <p className="text-zinc-400 mt-3">
              Pour exercer ces droits : <a href="mailto:ryad.bouderga78@gmail.com" className="text-green-400 underline">ryad.bouderga78@gmail.com</a>.
              Réponse sous 30 jours. En cas de réclamation non résolue, vous pouvez saisir la <a href="https://www.cnil.fr" target="_blank" rel="noreferrer" className="text-green-400 underline">CNIL</a>.
            </p>
          </>
        ),
      },
      {
        title: '7. Cookies',
        body: (
          <p className="text-zinc-400 leading-relaxed">
            Nous utilisons <strong className="text-zinc-300">uniquement des cookies techniques strictement nécessaires</strong> au
            fonctionnement du service (cookie de session NextAuth, cookie CSRF). Aucun cookie publicitaire,
            de profilage ou de tracking tiers n'est déposé. Aucun outil d'analytics tiers n'est actif.
          </p>
        ),
      },
      {
        title: '8. Sécurité',
        body: (
          <ul className="list-disc list-inside text-zinc-400 space-y-1">
            <li>Mots de passe hachés avec bcrypt (12 rounds) — jamais stockés en clair</li>
            <li>Identifiants broker (Rithmic, Apex…) stockés exclusivement dans le trousseau OS local de l'utilisateur (DPAPI Windows / Keychain macOS) — jamais transmis à nos serveurs</li>
            <li>Sessions avec expiration 6h et révocation immédiate possible</li>
            <li>Base de données PostgreSQL chiffrée en transit (TLS 1.2+)</li>
            <li>Communications HTTPS uniquement</li>
          </ul>
        ),
      },
    ],
  },
  en: {
    back: 'Back',
    title: 'Privacy Policy',
    updated: 'Last updated: June 2026',
    intro: 'This policy describes the personal data collected by SENZOUKRIA (publisher: Ryad Bouderga, contact: ryad.bouderga78@gmail.com), the purposes of processing, recipients, your rights and how to exercise them.',
    sections: [
      {
        title: '1. Data Collected & Legal Bases',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed mb-3">
              We collect only the data necessary for the service to function.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-zinc-700">
                    <th className="text-left py-2 pr-4 text-zinc-300 font-semibold">Category</th>
                    <th className="text-left py-2 pr-4 text-zinc-300 font-semibold">Data</th>
                    <th className="text-left py-2 text-zinc-300 font-semibold">Legal basis (GDPR art. 6)</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 text-white font-medium align-top">Account</td>
                    <td className="py-2 pr-4 align-top">Email, name (optional), display name, avatar, password (bcrypt-12 hash)</td>
                    <td className="py-2 align-top">Contract performance</td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 text-white font-medium align-top">Google OAuth</td>
                    <td className="py-2 pr-4 align-top">Google ID, access_token, refresh_token, id_token</td>
                    <td className="py-2 align-top">Contract performance (delegated auth)</td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 text-white font-medium align-top">Security</td>
                    <td className="py-2 pr-4 align-top">IP address, user-agent, device fingerprint (anti-sharing), failed login attempts</td>
                    <td className="py-2 align-top">Legitimate interest (security / fraud prevention)</td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 text-white font-medium align-top">Payment</td>
                    <td className="py-2 pr-4 align-top">Stripe customer ID, Stripe subscription ID (no card numbers)</td>
                    <td className="py-2 align-top">Contract performance / legal obligation (billing)</td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 text-white font-medium align-top">Trade Journal</td>
                    <td className="py-2 pr-4 align-top">Symbol, direction (LONG/SHORT), entry/exit price, quantity, P&L, screenshots — <strong className="text-zinc-300">voluntarily entered by the user</strong></td>
                    <td className="py-2 align-top">Contract performance (Journal feature)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 text-white font-medium align-top">AI Assistant</td>
                    <td className="py-2 pr-4 align-top">Text messages and images sent to the assistant — forwarded to a third-party LLM provider (see §5)</td>
                    <td className="py-2 align-top">Contract performance (AI feature)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ),
      },
      {
        title: '2. Data We NEVER Collect',
        body: (
          <>
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
              <p className="text-green-400 font-semibold mb-2">We NEVER collect:</p>
              <ul className="list-disc list-inside text-zinc-400 space-y-1">
                <li>Live CME market data (ticks, quotes, DOM, trades)</li>
                <li>Broker account credentials (Rithmic, Apex, IBKR logins or passwords)</li>
                <li>Card numbers or raw payment data</li>
                <li>Open positions or orders routed through the desktop app (these flow directly broker ↔ client)</li>
              </ul>
            </div>
            <p className="text-zinc-400 mt-3 text-sm">
              Trade journal data (entry/exit, P&L) is <em>voluntarily</em> entered by
              the user in the Journal module — it is not captured automatically from the broker.
            </p>
          </>
        ),
      },
      {
        title: '3. Purposes of Processing',
        body: (
          <ul className="list-disc list-inside text-zinc-400 space-y-1">
            <li>Authentication and session management (JWT 6h)</li>
            <li>Account sharing prevention (anti-sharing, multi-device detection)</li>
            <li>Subscription management and billing (Stripe)</li>
            <li>Providing features: Footprint, Heatmap, GEX, Journal, AI Assistant</li>
            <li>Service security (attack detection, account lockout)</li>
            <li>Technical support</li>
          </ul>
        ),
      },
      {
        title: '4. Retention Periods',
        body: (
          <ul className="list-disc list-inside text-zinc-400 space-y-1">
            <li><strong className="text-zinc-300">Sessions</strong>: deleted on expiry (6h) or sign-out, expired sessions purged automatically</li>
            <li><strong className="text-zinc-300">Account data</strong>: retained for the subscription duration + 30 days after cancellation, then deleted on request or automatically</li>
            <li><strong className="text-zinc-300">IP logs / security logs</strong>: 12 months maximum</li>
            <li><strong className="text-zinc-300">Payment data (Stripe)</strong>: 10 years (French accounting legal obligation)</li>
            <li><strong className="text-zinc-300">Trade journal</strong>: retained while the account is active; deleted with the account on request</li>
          </ul>
        ),
      },
      {
        title: '5. Sub-processors & International Transfers',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed mb-3">
              We use the following sub-processors. Some are based in the United States
              (transfers covered by EU Standard Contractual Clauses or the EU-US Data Privacy Framework):
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-zinc-700">
                    <th className="text-left py-2 pr-4 text-zinc-300 font-semibold">Sub-processor</th>
                    <th className="text-left py-2 pr-4 text-zinc-300 font-semibold">Role</th>
                    <th className="text-left py-2 pr-4 text-zinc-300 font-semibold">Country</th>
                    <th className="text-left py-2 text-zinc-300 font-semibold">Safeguard</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 font-medium text-zinc-300">Vercel Inc.</td>
                    <td className="py-2 pr-4">Web app hosting</td>
                    <td className="py-2 pr-4">USA</td>
                    <td className="py-2">DPF + SCC</td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 font-medium text-zinc-300">Stripe Inc.</td>
                    <td className="py-2 pr-4">Payment processing</td>
                    <td className="py-2 pr-4">USA</td>
                    <td className="py-2">DPF + SCC</td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 font-medium text-zinc-300">Anthropic PBC</td>
                    <td className="py-2 pr-4">AI assistant LLM (Claude) — receives your messages and images</td>
                    <td className="py-2 pr-4">USA</td>
                    <td className="py-2">SCC</td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 font-medium text-zinc-300">Groq Inc.</td>
                    <td className="py-2 pr-4">AI assistant LLM (Llama) — receives your messages and images</td>
                    <td className="py-2 pr-4">USA</td>
                    <td className="py-2">SCC</td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 font-medium text-zinc-300">Google LLC</td>
                    <td className="py-2 pr-4">Google OAuth (sign-in) + Gemini LLM (AI assistant)</td>
                    <td className="py-2 pr-4">USA</td>
                    <td className="py-2">DPF + SCC</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium text-zinc-300">SMTP provider</td>
                    <td className="py-2 pr-4">Sending verification emails and notifications</td>
                    <td className="py-2 pr-4">Variable</td>
                    <td className="py-2">SCC if outside EU</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-zinc-400 mt-3 text-sm">
              Regarding the AI assistant: your text messages and chart images sent to the assistant
              are forwarded to these providers to generate a response. They are not used to train
              their models (contractual clauses in force). No broker market data (credentials,
              positions, orders) passes through the AI.
            </p>
          </>
        ),
      },
      {
        title: '6. Your Rights',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed mb-3">
              Under GDPR (articles 15–22), you have the following rights:
            </p>
            <ul className="list-disc list-inside text-zinc-400 space-y-1">
              <li><strong className="text-zinc-300">Access</strong>: obtain a copy of your data</li>
              <li><strong className="text-zinc-300">Rectification</strong>: correct inaccurate data</li>
              <li><strong className="text-zinc-300">Erasure</strong>: request deletion — available directly from <a href="/account/danger" className="text-green-400 underline">Account → Danger Zone → Delete account</a></li>
              <li><strong className="text-zinc-300">Portability</strong>: receive your data in a structured format — available from <a href="/api/account/export" className="text-green-400 underline">Account → Export my data</a></li>
              <li><strong className="text-zinc-300">Objection / restriction</strong>: object to processing based on legitimate interest</li>
            </ul>
            <p className="text-zinc-400 mt-3">
              To exercise these rights: <a href="mailto:ryad.bouderga78@gmail.com" className="text-green-400 underline">ryad.bouderga78@gmail.com</a>.
              Response within 30 days. If your request is not resolved, you may lodge a complaint with your local data protection authority (in France: <a href="https://www.cnil.fr" target="_blank" rel="noreferrer" className="text-green-400 underline">CNIL</a>).
            </p>
          </>
        ),
      },
      {
        title: '7. Cookies',
        body: (
          <p className="text-zinc-400 leading-relaxed">
            We use <strong className="text-zinc-300">only strictly necessary technical cookies</strong> required for the service
            to function (NextAuth session cookie, CSRF cookie). No advertising, profiling, or third-party
            tracking cookies are set. No third-party analytics tool is active.
          </p>
        ),
      },
      {
        title: '8. Security',
        body: (
          <ul className="list-disc list-inside text-zinc-400 space-y-1">
            <li>Passwords hashed with bcrypt (12 rounds) — never stored in plain text</li>
            <li>Broker credentials (Rithmic, Apex…) stored exclusively in the user's local OS keychain (Windows DPAPI / macOS Keychain) — never transmitted to our servers</li>
            <li>Sessions with 6h expiry and immediate revocation capability</li>
            <li>PostgreSQL database encrypted in transit (TLS 1.2+)</li>
            <li>HTTPS-only communications</li>
          </ul>
        ),
      },
    ],
  },
};

export default function PrivacyPage() {
  const [lang, setLang] = useState<'fr' | 'en'>('en');
  const t = content[lang];

  return (
    <div className="min-h-screen bg-[#0a0a0f] py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link href="/" className="text-zinc-500 hover:text-white text-sm">
            &larr; {t.back}
          </Link>
          <div className="flex gap-1 bg-zinc-800/50 rounded-lg p-0.5 border border-zinc-700/50">
            <button
              onClick={() => setLang('fr')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${lang === 'fr' ? 'bg-green-500/20 text-green-400' : 'text-zinc-500 hover:text-white'}`}
            >
              FR
            </button>
            <button
              onClick={() => setLang('en')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${lang === 'en' ? 'bg-green-500/20 text-green-400' : 'text-zinc-500 hover:text-white'}`}
            >
              EN
            </button>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-white mb-2">{t.title}</h1>
        <p className="text-zinc-500 mb-2">{t.updated}</p>
        <p className="text-zinc-400 text-sm mb-8 leading-relaxed">{t.intro}</p>

        <div className="prose prose-invert prose-zinc max-w-none space-y-8">
          {t.sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold text-white border-b border-zinc-800 pb-2">{section.title}</h2>
              {section.body}
            </section>
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-zinc-800 text-center">
          <p className="text-zinc-600 text-sm">
            Contact DPO / données personnelles : <a href="mailto:ryad.bouderga78@gmail.com" className="text-zinc-400 hover:text-white">ryad.bouderga78@gmail.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}
