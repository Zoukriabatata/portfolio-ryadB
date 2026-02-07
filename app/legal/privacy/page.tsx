'use client';

import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-zinc-500 hover:text-white text-sm mb-6 inline-block">
          &larr; Retour
        </Link>

        <h1 className="text-3xl font-bold text-white mb-2">Politique de Confidentialite</h1>
        <p className="text-zinc-500 mb-8">Derniere mise a jour : Fevrier 2026</p>

        <div className="prose prose-invert prose-zinc max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-white border-b border-zinc-800 pb-2">1. Donnees collectees</h2>
            <p className="text-zinc-400 leading-relaxed">Nous collectons uniquement :</p>
            <ul className="list-disc list-inside text-zinc-400 space-y-1 mt-2">
              <li><strong className="text-white">Compte</strong> : email, nom (optionnel), mot de passe (chiffre bcrypt)</li>
              <li><strong className="text-white">Securite</strong> : adresse IP, user-agent, empreinte appareil (pour anti-partage)</li>
              <li><strong className="text-white">Paiement</strong> : identifiant de transaction PayPal (pas de donnees bancaires)</li>
              <li><strong className="text-white">Usage</strong> : timestamps de connexion, pages visitees</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white border-b border-zinc-800 pb-2">2. Donnees NON collectees</h2>
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
              <p className="text-green-400 font-semibold mb-2">Nous ne collectons JAMAIS :</p>
              <ul className="list-disc list-inside text-zinc-400 space-y-1">
                <li>Donnees de marche CME (ticks, quotes, depth, trades)</li>
                <li>Identifiants de compte broker (login IB, mot de passe broker)</li>
                <li>Positions de trading, ordres, solde du compte</li>
                <li>Donnees financieres personnelles</li>
              </ul>
            </div>
            <p className="text-zinc-400 mt-3">
              Les donnees de marche transitent directement entre le broker de l&apos;utilisateur et son navigateur.
              Elles ne sont ni stockees ni traitees sur nos serveurs.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white border-b border-zinc-800 pb-2">3. Utilisation des donnees</h2>
            <ul className="list-disc list-inside text-zinc-400 space-y-1">
              <li>Authentification et gestion des sessions</li>
              <li>Prevention du partage de compte (detection multi-appareil)</li>
              <li>Gestion des abonnements et facturation</li>
              <li>Amelioration du service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white border-b border-zinc-800 pb-2">4. Stockage et securite</h2>
            <ul className="list-disc list-inside text-zinc-400 space-y-1">
              <li>Mots de passe chiffres avec bcrypt (12 rounds)</li>
              <li>Sessions JWT avec expiration 24h</li>
              <li>Base de donnees PostgreSQL chiffree en transit (TLS)</li>
              <li>Connexions HTTPS uniquement</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white border-b border-zinc-800 pb-2">5. Partage des donnees</h2>
            <p className="text-zinc-400 leading-relaxed">
              Nous ne vendons, ne partageons et ne transferons aucune donnee personnelle a des tiers,
              sauf obligation legale. PayPal recoit uniquement les informations necessaires au traitement du paiement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white border-b border-zinc-800 pb-2">6. Vos droits</h2>
            <p className="text-zinc-400 leading-relaxed">
              Conformement au RGPD, vous disposez d&apos;un droit d&apos;acces, de rectification, de suppression
              et de portabilite de vos donnees. Pour exercer ces droits, contactez : ryad.bouderga78@gmail.com
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white border-b border-zinc-800 pb-2">7. Cookies</h2>
            <p className="text-zinc-400 leading-relaxed">
              Nous utilisons uniquement des cookies techniques necessaires au fonctionnement du service
              (session d&apos;authentification). Aucun cookie publicitaire ou de tracking tiers n&apos;est utilise.
            </p>
          </section>
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
