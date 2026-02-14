'use client';

import Link from 'next/link';
import { useState } from 'react';

const content = {
  fr: {
    back: 'Retour',
    title: 'Politique de Confidentialité',
    updated: 'Dernière mise à jour : Février 2026',
    sections: [
      {
        title: '1. Données collectées',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">Nous collectons uniquement :</p>
            <ul className="list-disc list-inside text-zinc-400 space-y-1 mt-2">
              <li><strong className="text-white">Compte</strong> : email, nom (optionnel), mot de passe (chiffré bcrypt)</li>
              <li><strong className="text-white">Sécurité</strong> : adresse IP, user-agent, empreinte appareil (pour anti-partage)</li>
              <li><strong className="text-white">Paiement</strong> : identifiant de transaction PayPal (pas de données bancaires)</li>
              <li><strong className="text-white">Usage</strong> : timestamps de connexion, pages visitées</li>
            </ul>
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
                <li>Données de marché CME (ticks, quotes, depth, trades)</li>
                <li>Identifiants de compte broker (login IB, mot de passe broker)</li>
                <li>Positions de trading, ordres, solde du compte</li>
                <li>Données financières personnelles</li>
              </ul>
            </div>
            <p className="text-zinc-400 mt-3">
              Les données de marché transitent directement entre le broker de l&apos;utilisateur et son navigateur.
              Elles ne sont ni stockées ni traitées sur nos serveurs.
            </p>
          </>
        ),
      },
      {
        title: '3. Utilisation des données',
        body: (
          <ul className="list-disc list-inside text-zinc-400 space-y-1">
            <li>Authentification et gestion des sessions</li>
            <li>Prévention du partage de compte (détection multi-appareil)</li>
            <li>Gestion des abonnements et facturation</li>
            <li>Amélioration du service</li>
          </ul>
        ),
      },
      {
        title: '4. Stockage et sécurité',
        body: (
          <ul className="list-disc list-inside text-zinc-400 space-y-1">
            <li>Mots de passe chiffrés avec bcrypt (12 rounds)</li>
            <li>Sessions JWT avec expiration 24h</li>
            <li>Base de données PostgreSQL chiffrée en transit (TLS)</li>
            <li>Connexions HTTPS uniquement</li>
          </ul>
        ),
      },
      {
        title: '5. Partage des données',
        body: (
          <p className="text-zinc-400 leading-relaxed">
            Nous ne vendons, ne partageons et ne transférons aucune donnée personnelle à des tiers,
            sauf obligation légale. PayPal reçoit uniquement les informations nécessaires au traitement du paiement.
          </p>
        ),
      },
      {
        title: '6. Vos droits',
        body: (
          <p className="text-zinc-400 leading-relaxed">
            Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès, de rectification, de suppression
            et de portabilité de vos données. Pour exercer ces droits, contactez : ryad.bouderga78@gmail.com
          </p>
        ),
      },
      {
        title: '7. Cookies',
        body: (
          <p className="text-zinc-400 leading-relaxed">
            Nous utilisons uniquement des cookies techniques nécessaires au fonctionnement du service
            (session d&apos;authentification). Aucun cookie publicitaire ou de tracking tiers n&apos;est utilisé.
          </p>
        ),
      },
    ],
  },
  en: {
    back: 'Back',
    title: 'Privacy Policy',
    updated: 'Last updated: February 2026',
    sections: [
      {
        title: '1. Data We Collect',
        body: (
          <>
            <p className="text-zinc-400 leading-relaxed">We only collect:</p>
            <ul className="list-disc list-inside text-zinc-400 space-y-1 mt-2">
              <li><strong className="text-white">Account</strong>: email, name (optional), password (bcrypt-hashed)</li>
              <li><strong className="text-white">Security</strong>: IP address, user-agent, device fingerprint (for anti-sharing)</li>
              <li><strong className="text-white">Payment</strong>: PayPal transaction ID (no banking data)</li>
              <li><strong className="text-white">Usage</strong>: login timestamps, pages visited</li>
            </ul>
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
                <li>CME market data (ticks, quotes, depth, trades)</li>
                <li>Broker account credentials (IB login, broker password)</li>
                <li>Trading positions, orders, account balance</li>
                <li>Personal financial data</li>
              </ul>
            </div>
            <p className="text-zinc-400 mt-3">
              Market data flows directly between the user&apos;s broker and their browser.
              It is never stored or processed on our servers.
            </p>
          </>
        ),
      },
      {
        title: '3. How We Use Your Data',
        body: (
          <ul className="list-disc list-inside text-zinc-400 space-y-1">
            <li>Authentication and session management</li>
            <li>Account sharing prevention (multi-device detection)</li>
            <li>Subscription management and billing</li>
            <li>Service improvement</li>
          </ul>
        ),
      },
      {
        title: '4. Storage & Security',
        body: (
          <ul className="list-disc list-inside text-zinc-400 space-y-1">
            <li>Passwords hashed with bcrypt (12 rounds)</li>
            <li>JWT sessions with 24h expiration</li>
            <li>PostgreSQL database encrypted in transit (TLS)</li>
            <li>HTTPS connections only</li>
          </ul>
        ),
      },
      {
        title: '5. Data Sharing',
        body: (
          <p className="text-zinc-400 leading-relaxed">
            We do not sell, share, or transfer any personal data to third parties,
            except as required by law. PayPal only receives the information necessary to process payments.
          </p>
        ),
      },
      {
        title: '6. Your Rights',
        body: (
          <p className="text-zinc-400 leading-relaxed">
            Under GDPR, you have the right to access, rectify, delete,
            and port your data. To exercise these rights, contact: ryad.bouderga78@gmail.com
          </p>
        ),
      },
      {
        title: '7. Cookies',
        body: (
          <p className="text-zinc-400 leading-relaxed">
            We only use essential technical cookies required for the service to function
            (authentication session). No advertising or third-party tracking cookies are used.
          </p>
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
