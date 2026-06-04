'use client';

import Link from 'next/link';
import { useState } from 'react';

// LEGAL NOTICE / MENTIONS LÉGALES
// ─────────────────────────────────────────────────────────────────
// Required by French law (Loi pour la Confiance dans l'Économie
// Numérique, articles 6-III et 19) for any commercial website
// operated from / targeting France. Absence is punishable by up to
// €75,000 fine + 1 year imprisonment for individual entrepreneurs
// (€375,000 for companies).
//
// !! ACTION REQUIRED !!  Fill in the TODO blocks below with your
// real legal-entity data before going public:
//   - editor name + status (auto-entrepreneur / SARL / SAS …)
//   - SIRET / SIREN
//   - physical address
//   - phone (or "by email" if no phone available)
//   - VAT number if applicable
//
// Hosting block (Vercel) is already pre-filled — it's public info.

const content = {
  fr: {
    back: 'Retour',
    title: 'Mentions Légales',
    updated: 'Dernière mise à jour : Mai 2026',
    sections: [
      {
        title: '1. Éditeur du site',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              <strong className="text-white">SENZOUKRIA — OrderflowV2</strong>
            </p>
            <p className="text-zinc-400 mt-2">
              {/* TODO — REPLACE WITH REAL DATA BEFORE GOING PUBLIC */}
              <strong className="text-white">Forme juridique</strong> : {' '}
              <em className="text-amber-400">Entrepreneur individuel (auto-entrepreneur)</em>
              {' — '}à compléter
            </p>
            <p className="text-zinc-400 mt-2">
              <strong className="text-white">Responsable de publication</strong> : Ryad Bouderga
            </p>
            <p className="text-zinc-400 mt-2">
              <strong className="text-white">Adresse</strong> : {' '}
              <em className="text-amber-400">[Adresse postale complète à compléter]</em>
            </p>
            <p className="text-zinc-400 mt-2">
              <strong className="text-white">SIRET / SIREN</strong> : {' '}
              <em className="text-amber-400">[à compléter — 14 chiffres pour SIRET, 9 pour SIREN]</em>
            </p>
            <p className="text-zinc-400 mt-2">
              <strong className="text-white">Numéro de TVA intracommunautaire</strong> : {' '}
              <em className="text-amber-400">[FR + 11 chiffres si applicable — sinon &laquo; Non assujetti TVA (franchise en base) &raquo;]</em>
            </p>
            <p className="text-zinc-400 mt-2">
              <strong className="text-white">Contact</strong> : ryad.bouderga78@gmail.com
            </p>
          </>
        ),
      },
      {
        title: '2. Hébergeur',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              <strong className="text-white">Vercel Inc.</strong>
            </p>
            <p className="text-zinc-400 mt-2">
              440 N Barranca Ave #4133, Covina, CA 91723, United States
            </p>
            <p className="text-zinc-400 mt-2">
              Site web : <a href="https://vercel.com" target="_blank" rel="noreferrer" className="text-green-400 underline">vercel.com</a>
            </p>
          </>
        ),
      },
      {
        title: '3. Base de données',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              Les données utilisateurs sont stockées sur une base PostgreSQL
              gérée par <strong className="text-white">Prisma Data Platform</strong>{' '}
              (Vercel Postgres), hébergée dans l&apos;Union Européenne
              (région <code className="text-green-400">eu-central-1</code>, Francfort, Allemagne).
            </p>
          </>
        ),
      },
      {
        title: '4. Propriété intellectuelle',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              L&apos;ensemble du site et du logiciel SENZOUKRIA / OrderflowV2
              (code source, design, logos, contenus textuels, algorithmes
              footprint, infrastructure de licence) est la propriété exclusive
              de Ryad Bouderga, ou est utilisé sous licence (dépendances
              open-source citées dans le fichier <code className="text-green-400">LICENSES.md</code> du projet).
            </p>
            <p className="text-zinc-400 mt-2">
              Toute reproduction, représentation, modification ou exploitation,
              totale ou partielle, par quelque procédé que ce soit, sans
              l&apos;autorisation écrite préalable est interdite et constituerait
              une contrefaçon sanctionnée par les articles L335-2 et suivants
              du Code de la propriété intellectuelle.
            </p>
          </>
        ),
      },
      {
        title: '5. Données personnelles (RGPD)',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              Le traitement des données personnelles est régi par notre{' '}
              <Link href="/legal/privacy" className="text-green-400 underline">Politique de Confidentialité</Link>.
            </p>
            <p className="text-zinc-400 mt-2">
              <strong className="text-white">Responsable de traitement</strong> : Ryad Bouderga
              {' (mêmes coordonnées que ci-dessus)'}
            </p>
            <p className="text-zinc-400 mt-2">
              Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès,
              de rectification, d&apos;effacement, d&apos;opposition, de limitation
              du traitement et de portabilité de vos données. Ces droits
              s&apos;exercent par email à <em>ryad.bouderga78@gmail.com</em>.
            </p>
            <p className="text-zinc-400 mt-2">
              Vous pouvez introduire une réclamation auprès de la CNIL :{' '}
              <a href="https://www.cnil.fr" target="_blank" rel="noreferrer" className="text-green-400 underline">cnil.fr</a>.
            </p>
          </>
        ),
      },
      {
        title: '6. Cookies',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              Le site utilise uniquement des cookies techniques strictement
              nécessaires au fonctionnement (session NextAuth, préférences
              UI). Aucun cookie publicitaire, de profilage ou de tracking
              tiers n&apos;est déposé.
            </p>
            <p className="text-zinc-400 mt-2">
              Détails dans la{' '}
              <Link href="/legal/privacy" className="text-green-400 underline">Politique de Confidentialité</Link>.
            </p>
          </>
        ),
      },
      {
        title: '7. Avertissement trading',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              SENZOUKRIA est un outil de visualisation de données de marché
              (footprint, heatmap, journal). Il ne constitue ni un service
              d&apos;investissement, ni une activité de conseiller en
              investissements financiers (CIF) au sens de l&apos;article L541-1
              du Code monétaire et financier.
            </p>
            <p className="text-zinc-400 mt-2">
              SENZOUKRIA ne fournit aucune recommandation personnalisée, ne
              gère aucun portefeuille pour le compte de tiers, et n&apos;exécute
              aucun ordre de marché. L&apos;utilisateur est seul responsable
              de ses décisions de trading et des pertes éventuelles, qui
              peuvent dépasser son investissement initial.
            </p>
            <p className="text-zinc-400 mt-2">
              Le trading de produits dérivés (futures, CFDs, options) comporte
              des risques élevés et n&apos;est pas adapté à tous les profils
              d&apos;investisseurs.
            </p>
          </>
        ),
      },
      {
        title: '8. Droit applicable et juridiction',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              Les présentes mentions légales et l&apos;utilisation du site
              sont régies par le droit français.
            </p>
            <p className="text-zinc-400 mt-2">
              Tout litige relève de la compétence des tribunaux français,
              sous réserve des règles impératives de protection du consommateur
              et des procédures de médiation prévues par notre{' '}
              <Link href="/legal/terms" className="text-green-400 underline">Conditions Générales d&apos;Utilisation</Link>.
            </p>
          </>
        ),
      },
    ],
  },
  en: {
    back: 'Back',
    title: 'Legal Notice',
    updated: 'Last updated: May 2026',
    sections: [
      {
        title: '1. Site editor',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              <strong className="text-white">SENZOUKRIA — OrderflowV2</strong>
            </p>
            <p className="text-zinc-400 mt-2">
              <strong className="text-white">Legal form</strong>:{' '}
              <em className="text-amber-400">Individual entrepreneur (auto-entrepreneur, France)</em>
              {' — '}to be completed
            </p>
            <p className="text-zinc-400 mt-2">
              <strong className="text-white">Editor in charge</strong>: Ryad Bouderga
            </p>
            <p className="text-zinc-400 mt-2">
              <strong className="text-white">Address</strong>:{' '}
              <em className="text-amber-400">[Full postal address to be completed]</em>
            </p>
            <p className="text-zinc-400 mt-2">
              <strong className="text-white">SIRET / SIREN (FR company ID)</strong>:{' '}
              <em className="text-amber-400">[to be completed — 14 digits for SIRET, 9 for SIREN]</em>
            </p>
            <p className="text-zinc-400 mt-2">
              <strong className="text-white">Intra-EU VAT number</strong>:{' '}
              <em className="text-amber-400">[FR + 11 digits if applicable — otherwise &laquo; VAT-exempt (franchise en base) &raquo;]</em>
            </p>
            <p className="text-zinc-400 mt-2">
              <strong className="text-white">Contact</strong>: ryad.bouderga78@gmail.com
            </p>
          </>
        ),
      },
      {
        title: '2. Hosting provider',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              <strong className="text-white">Vercel Inc.</strong>
            </p>
            <p className="text-zinc-400 mt-2">
              440 N Barranca Ave #4133, Covina, CA 91723, United States
            </p>
            <p className="text-zinc-400 mt-2">
              Website: <a href="https://vercel.com" target="_blank" rel="noreferrer" className="text-green-400 underline">vercel.com</a>
            </p>
          </>
        ),
      },
      {
        title: '3. Database',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              User data is stored in a PostgreSQL database managed by{' '}
              <strong className="text-white">Prisma Data Platform</strong>{' '}
              (Vercel Postgres), hosted in the European Union
              (<code className="text-green-400">eu-central-1</code> region, Frankfurt, Germany).
            </p>
          </>
        ),
      },
      {
        title: '4. Intellectual property',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              The entire SENZOUKRIA / OrderflowV2 website and software
              (source code, design, logos, textual content, footprint
              algorithms, licensing infrastructure) is the exclusive
              property of Ryad Bouderga, or is used under licence
              (open-source dependencies listed in the{' '}
              <code className="text-green-400">LICENSES.md</code> file of the project).
            </p>
            <p className="text-zinc-400 mt-2">
              Any reproduction, representation, modification, or exploitation,
              total or partial, by any means whatsoever, without prior
              written authorization is prohibited and would constitute
              infringement under French Articles L335-2 et seq. of the
              Intellectual Property Code.
            </p>
          </>
        ),
      },
      {
        title: '5. Personal data (GDPR)',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              Personal data processing is governed by our{' '}
              <Link href="/legal/privacy" className="text-green-400 underline">Privacy Policy</Link>.
            </p>
            <p className="text-zinc-400 mt-2">
              <strong className="text-white">Data controller</strong>: Ryad Bouderga
              {' (same contact details as above)'}
            </p>
            <p className="text-zinc-400 mt-2">
              Under the GDPR you have rights of access, rectification, erasure,
              objection, restriction of processing, and portability of your
              data. Exercise these rights by emailing{' '}
              <em>ryad.bouderga78@gmail.com</em>.
            </p>
            <p className="text-zinc-400 mt-2">
              You may also lodge a complaint with the French data protection
              authority (CNIL):{' '}
              <a href="https://www.cnil.fr/en" target="_blank" rel="noreferrer" className="text-green-400 underline">cnil.fr</a>.
            </p>
          </>
        ),
      },
      {
        title: '6. Cookies',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              The site only uses strictly necessary technical cookies
              (NextAuth session, UI preferences). No advertising, profiling,
              or third-party tracking cookies are set.
            </p>
            <p className="text-zinc-400 mt-2">
              Details in the{' '}
              <Link href="/legal/privacy" className="text-green-400 underline">Privacy Policy</Link>.
            </p>
          </>
        ),
      },
      {
        title: '7. Trading disclaimer',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              SENZOUKRIA is a market data visualization tool (footprint,
              heatmap, journal). It does not constitute an investment
              service nor a financial-investment-advisor (CIF) activity
              within the meaning of Article L541-1 of the French Monetary
              and Financial Code.
            </p>
            <p className="text-zinc-400 mt-2">
              SENZOUKRIA does not provide personalized recommendations, does
              not manage portfolios on behalf of third parties, and does not
              execute any market orders. The user is solely responsible for
              their trading decisions and any losses, which may exceed their
              initial investment.
            </p>
            <p className="text-zinc-400 mt-2">
              Trading derivative products (futures, CFDs, options) carries
              substantial risk and is not suitable for all investor profiles.
            </p>
          </>
        ),
      },
      {
        title: '8. Governing law & jurisdiction',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">
              This legal notice and the use of the site are governed by
              French law.
            </p>
            <p className="text-zinc-400 mt-2">
              Any dispute falls under the jurisdiction of the competent
              French courts, subject to mandatory consumer protection rules
              and the mediation procedures set out in our{' '}
              <Link href="/legal/terms" className="text-green-400 underline">Terms of Service</Link>.
            </p>
          </>
        ),
      },
    ],
  },
};

export default function LegalNoticePage() {
  const [lang, setLang] = useState<'fr' | 'en'>('fr');
  const t = content[lang];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-6">
          <Link href="/" className="text-green-400 hover:text-green-300 transition">
            &larr; {t.back}
          </Link>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLang('fr')}
              className={`px-3 py-1 text-xs rounded ${
                lang === 'fr'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              FR
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`px-3 py-1 text-xs rounded ${
                lang === 'en'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              EN
            </button>
          </div>
        </div>

        <h1 className="text-3xl font-bold mb-2">{t.title}</h1>
        <p className="text-sm text-zinc-500 mb-10">{t.updated}</p>

        <div className="space-y-8">
          {t.sections.map((section, i) => (
            <section key={i}>
              <h2 className="text-xl font-semibold text-white mb-3">{section.title}</h2>
              {section.body}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
