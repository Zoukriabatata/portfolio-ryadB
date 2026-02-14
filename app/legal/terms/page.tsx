'use client';

import Link from 'next/link';
import { useState } from 'react';

const content = {
  fr: {
    back: 'Retour',
    title: "Conditions Générales d'Utilisation",
    updated: 'Dernière mise à jour : Février 2026',
    sections: [
      {
        title: '1. Objet du service',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              SENZOUKRIA est un <strong className="text-white">logiciel d&apos;analyse graphique</strong> accessible via navigateur web.
              Il fournit des outils de visualisation (Footprint, Heatmap, Delta Profile, Volume Profile)
              permettant aux traders de futures CME d&apos;analyser leurs propres flux de données de marché.
            </p>
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg mt-4">
              <p className="text-amber-400 font-semibold mb-2">IMPORTANT - Données de marché</p>
              <p className="text-zinc-400">
                SENZOUKRIA <strong className="text-white">ne fournit pas, ne stocke pas et ne redistribue aucune donnée de marché CME</strong>.
                Chaque utilisateur doit souscrire à son propre abonnement de données futures auprès de son broker
                (par exemple : Interactive Brokers, US Futures Value Bundle).
                L&apos;application se connecte uniquement au flux personnel de données de chaque utilisateur.
              </p>
            </div>
          </>
        ),
      },
      {
        title: "2. Licence d'utilisation",
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              L&apos;abonnement confère une licence personnelle, non-transférable et non-exclusive
              d&apos;utilisation du logiciel SENZOUKRIA. Cette licence est strictement limitée à :
            </p>
            <ul className="list-disc list-inside text-zinc-400 space-y-1 mt-2">
              <li>Un seul compte par personne physique</li>
              <li>Un seul appareil connecté simultanément</li>
              <li>Usage personnel uniquement (pas de revente, sous-licence ou partage)</li>
            </ul>
          </>
        ),
      },
      {
        title: '3. Anti-partage et sécurité',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              Pour protéger l&apos;intégrité du service, les mesures suivantes sont appliquées :
            </p>
            <ul className="list-disc list-inside text-zinc-400 space-y-1 mt-2">
              <li>Une seule session active par compte à tout moment</li>
              <li>Détection automatique des connexions simultanées</li>
              <li>Empreinte numérique de l&apos;appareil (device fingerprinting)</li>
              <li>Surveillance des adresses IP</li>
            </ul>
            <p className="text-zinc-400 mt-2">
              Toute tentative de partage de compte entraîne la <strong className="text-red-400">suspension immédiate</strong> du compte
              sans remboursement.
            </p>
          </>
        ),
      },
      {
        title: '4. Abonnement et paiement',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              L&apos;abonnement est mensuel et facturable via PayPal. Le paiement est dû au début de chaque période.
              L&apos;accès au logiciel est activé après réception et confirmation du paiement.
            </p>
            <ul className="list-disc list-inside text-zinc-400 space-y-1 mt-2">
              <li>Paiement mensuel par PayPal</li>
              <li>Pas de remboursement une fois la période entamée</li>
              <li>L&apos;abonnement ne couvre QUE le logiciel, pas les données de marché</li>
            </ul>
          </>
        ),
      },
      {
        title: '5. Limitation de responsabilité',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              SENZOUKRIA est un outil de visualisation. Il ne constitue en aucun cas un conseil en investissement,
              une recommandation de trading ou une incitation à acheter ou vendre des instruments financiers.
            </p>
            <p className="text-zinc-400 mt-2">
              L&apos;utilisateur est seul responsable de ses décisions de trading et des pertes éventuelles.
              SENZOUKRIA ne peut être tenu responsable des pertes financières liées à l&apos;utilisation du logiciel.
            </p>
          </>
        ),
      },
      {
        title: '6. Propriété intellectuelle',
        body: (
          <p className="text-zinc-400 leading-relaxed">
            Le code source, l&apos;interface, les algorithmes et le design de SENZOUKRIA sont protégés par le droit d&apos;auteur.
            Toute copie, reverse engineering, décompilation ou extraction du code est strictement interdite.
          </p>
        ),
      },
      {
        title: '7. Conformité CME Group',
        body: (
          <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
            <ul className="text-zinc-400 space-y-2">
              <li>SENZOUKRIA agit en tant que <strong className="text-white">Software Vendor</strong> et non en tant que distributeur de données</li>
              <li>Aucune donnée brute CME (ticks, quotes, depth) n&apos;est stockée, redistribuée ou mutualisée sur nos serveurs</li>
              <li>Chaque utilisateur accède à son propre flux via son propre compte broker</li>
              <li>1 utilisateur = 1 flux personnel = 1 abonnement data individuel</li>
              <li>Les analyses dérivées (profils, heatmaps, footprints) sont générées en temps réel côté client</li>
            </ul>
          </div>
        ),
      },
      {
        title: '8. Résiliation',
        body: (
          <p className="text-zinc-400 leading-relaxed">
            L&apos;utilisateur peut résilier son abonnement à tout moment. L&apos;accès reste actif jusqu&apos;à la fin
            de la période payée. SENZOUKRIA se réserve le droit de suspendre ou résilier un compte en cas de
            violation des présentes conditions.
          </p>
        ),
      },
    ],
  },
  en: {
    back: 'Back',
    title: 'Terms of Service',
    updated: 'Last updated: February 2026',
    sections: [
      {
        title: '1. Service Description',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              SENZOUKRIA is a <strong className="text-white">charting and analysis software</strong> accessible via web browser.
              It provides visualization tools (Footprint, Heatmap, Delta Profile, Volume Profile)
              enabling CME futures traders to analyze their own market data feeds.
            </p>
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg mt-4">
              <p className="text-amber-400 font-semibold mb-2">IMPORTANT - Market Data</p>
              <p className="text-zinc-400">
                SENZOUKRIA <strong className="text-white">does not provide, store, or redistribute any CME market data</strong>.
                Each user must subscribe to their own futures data feed through their broker
                (e.g., Interactive Brokers, US Futures Value Bundle).
                The application only connects to each user&apos;s personal data feed.
              </p>
            </div>
          </>
        ),
      },
      {
        title: '2. License',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              The subscription grants a personal, non-transferable, and non-exclusive license
              to use the SENZOUKRIA software. This license is strictly limited to:
            </p>
            <ul className="list-disc list-inside text-zinc-400 space-y-1 mt-2">
              <li>One account per individual</li>
              <li>One device connected at a time</li>
              <li>Personal use only (no resale, sublicensing, or sharing)</li>
            </ul>
          </>
        ),
      },
      {
        title: '3. Anti-Sharing & Security',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              To protect the integrity of the service, the following measures are enforced:
            </p>
            <ul className="list-disc list-inside text-zinc-400 space-y-1 mt-2">
              <li>Only one active session per account at any time</li>
              <li>Automatic detection of simultaneous connections</li>
              <li>Device fingerprinting</li>
              <li>IP address monitoring</li>
            </ul>
            <p className="text-zinc-400 mt-2">
              Any attempt to share an account will result in <strong className="text-red-400">immediate suspension</strong> of the account
              without refund.
            </p>
          </>
        ),
      },
      {
        title: '4. Subscription & Payment',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              The subscription is billed monthly via PayPal. Payment is due at the beginning of each billing period.
              Access to the software is activated upon receipt and confirmation of payment.
            </p>
            <ul className="list-disc list-inside text-zinc-400 space-y-1 mt-2">
              <li>Monthly payment via PayPal</li>
              <li>No refunds once a billing period has started</li>
              <li>The subscription covers ONLY the software, not market data</li>
            </ul>
          </>
        ),
      },
      {
        title: '5. Limitation of Liability',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              SENZOUKRIA is a visualization tool. It does not constitute investment advice,
              trading recommendations, or an incentive to buy or sell financial instruments.
            </p>
            <p className="text-zinc-400 mt-2">
              The user is solely responsible for their trading decisions and any resulting losses.
              SENZOUKRIA cannot be held liable for financial losses related to the use of the software.
            </p>
          </>
        ),
      },
      {
        title: '6. Intellectual Property',
        body: (
          <p className="text-zinc-400 leading-relaxed">
            The source code, interface, algorithms, and design of SENZOUKRIA are protected by copyright.
            Any copying, reverse engineering, decompilation, or code extraction is strictly prohibited.
          </p>
        ),
      },
      {
        title: '7. CME Group Compliance',
        body: (
          <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
            <ul className="text-zinc-400 space-y-2">
              <li>SENZOUKRIA operates as a <strong className="text-white">Software Vendor</strong>, not as a data distributor</li>
              <li>No raw CME data (ticks, quotes, depth) is stored, redistributed, or pooled on our servers</li>
              <li>Each user accesses their own feed through their own broker account</li>
              <li>1 user = 1 personal feed = 1 individual data subscription</li>
              <li>Derived analytics (profiles, heatmaps, footprints) are generated in real-time on the client side</li>
            </ul>
          </div>
        ),
      },
      {
        title: '8. Termination',
        body: (
          <p className="text-zinc-400 leading-relaxed">
            The user may cancel their subscription at any time. Access remains active until the end
            of the paid period. SENZOUKRIA reserves the right to suspend or terminate an account in case of
            violation of these terms.
          </p>
        ),
      },
    ],
  },
};

export default function TermsPage() {
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
        <p className="text-zinc-500 mb-8">{t.updated}</p>

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
            Contact : ryad.bouderga78@gmail.com
          </p>
        </div>
      </div>
    </div>
  );
}
