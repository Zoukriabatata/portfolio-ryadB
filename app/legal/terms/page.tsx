'use client';

import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-zinc-500 hover:text-white text-sm mb-6 inline-block">
          &larr; Retour
        </Link>

        <h1 className="text-3xl font-bold text-white mb-2">Conditions Generales d&apos;Utilisation</h1>
        <p className="text-zinc-500 mb-8">Derniere mise a jour : Fevrier 2026</p>

        <div className="prose prose-invert prose-zinc max-w-none space-y-8">
          {/* 1. OBJET */}
          <section>
            <h2 className="text-xl font-semibold text-white border-b border-zinc-800 pb-2">1. Objet du service</h2>
            <p className="text-zinc-400 leading-relaxed">
              SENZOUKRIA est un <strong className="text-white">logiciel d&apos;analyse graphique</strong> accessible via navigateur web.
              Il fournit des outils de visualisation (Footprint, Heatmap, Delta Profile, Volume Profile)
              permettant aux traders de futures CME d&apos;analyser leurs propres flux de donnees de marche.
            </p>
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg mt-4">
              <p className="text-amber-400 font-semibold mb-2">IMPORTANT - Donnees de marche</p>
              <p className="text-zinc-400">
                SENZOUKRIA <strong className="text-white">ne fournit pas, ne stocke pas et ne redistribue aucune donnee de marche CME</strong>.
                Chaque utilisateur doit souscrire a son propre abonnement de donnees futures aupres de son broker
                (par exemple : Interactive Brokers, US Futures Value Bundle).
                L&apos;application se connecte uniquement au flux personnel de donnees de chaque utilisateur.
              </p>
            </div>
          </section>

          {/* 2. LICENCE */}
          <section>
            <h2 className="text-xl font-semibold text-white border-b border-zinc-800 pb-2">2. Licence d&apos;utilisation</h2>
            <p className="text-zinc-400 leading-relaxed">
              L&apos;abonnement confere une licence personnelle, non-transferable et non-exclusive
              d&apos;utilisation du logiciel SENZOUKRIA. Cette licence est strictement limitee a :
            </p>
            <ul className="list-disc list-inside text-zinc-400 space-y-1 mt-2">
              <li>Un seul compte par personne physique</li>
              <li>Un seul appareil connecte simultanement</li>
              <li>Usage personnel uniquement (pas de revente, sous-licence ou partage)</li>
            </ul>
          </section>

          {/* 3. ANTI-PARTAGE */}
          <section>
            <h2 className="text-xl font-semibold text-white border-b border-zinc-800 pb-2">3. Anti-partage et securite</h2>
            <p className="text-zinc-400 leading-relaxed">
              Pour proteger l&apos;integrite du service, les mesures suivantes sont appliquees :
            </p>
            <ul className="list-disc list-inside text-zinc-400 space-y-1 mt-2">
              <li>Une seule session active par compte a tout moment</li>
              <li>Detection automatique des connexions simultanees</li>
              <li>Empreinte numerique de l&apos;appareil (device fingerprinting)</li>
              <li>Surveillance des adresses IP</li>
            </ul>
            <p className="text-zinc-400 mt-2">
              Toute tentative de partage de compte entraine la <strong className="text-red-400">suspension immediate</strong> du compte
              sans remboursement.
            </p>
          </section>

          {/* 4. PAIEMENT */}
          <section>
            <h2 className="text-xl font-semibold text-white border-b border-zinc-800 pb-2">4. Abonnement et paiement</h2>
            <p className="text-zinc-400 leading-relaxed">
              L&apos;abonnement est mensuel et facturable via PayPal. Le paiement est du au debut de chaque periode.
              L&apos;acces au logiciel est active apres reception et confirmation du paiement.
            </p>
            <ul className="list-disc list-inside text-zinc-400 space-y-1 mt-2">
              <li>Paiement mensuel par PayPal</li>
              <li>Pas de remboursement une fois la periode entamee</li>
              <li>L&apos;abonnement ne couvre QUE le logiciel, pas les donnees de marche</li>
            </ul>
          </section>

          {/* 5. RESPONSABILITE */}
          <section>
            <h2 className="text-xl font-semibold text-white border-b border-zinc-800 pb-2">5. Limitation de responsabilite</h2>
            <p className="text-zinc-400 leading-relaxed">
              SENZOUKRIA est un outil de visualisation. Il ne constitue en aucun cas un conseil en investissement,
              une recommandation de trading ou une incitation a acheter ou vendre des instruments financiers.
            </p>
            <p className="text-zinc-400 mt-2">
              L&apos;utilisateur est seul responsable de ses decisions de trading et des pertes eventuelles.
              SENZOUKRIA ne peut etre tenu responsable des pertes financieres liees a l&apos;utilisation du logiciel.
            </p>
          </section>

          {/* 6. PROPRIETE INTELLECTUELLE */}
          <section>
            <h2 className="text-xl font-semibold text-white border-b border-zinc-800 pb-2">6. Propriete intellectuelle</h2>
            <p className="text-zinc-400 leading-relaxed">
              Le code source, l&apos;interface, les algorithmes et le design de SENZOUKRIA sont proteges par le droit d&apos;auteur.
              Toute copie, reverse engineering, decompilation ou extraction du code est strictement interdite.
            </p>
          </section>

          {/* 7. DONNEES CME */}
          <section>
            <h2 className="text-xl font-semibold text-white border-b border-zinc-800 pb-2">7. Conformite CME Group</h2>
            <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
              <ul className="text-zinc-400 space-y-2">
                <li>SENZOUKRIA agit en tant que <strong className="text-white">Software Vendor</strong> et non en tant que distributeur de donnees</li>
                <li>Aucune donnee brute CME (ticks, quotes, depth) n&apos;est stockee, redistribuee ou mutualisee sur nos serveurs</li>
                <li>Chaque utilisateur accede a son propre flux via son propre compte broker</li>
                <li>1 utilisateur = 1 flux personnel = 1 abonnement data individuel</li>
                <li>Les analyses derivees (profils, heatmaps, footprints) sont generees en temps reel cote client</li>
              </ul>
            </div>
          </section>

          {/* 8. RESILIATION */}
          <section>
            <h2 className="text-xl font-semibold text-white border-b border-zinc-800 pb-2">8. Resiliation</h2>
            <p className="text-zinc-400 leading-relaxed">
              L&apos;utilisateur peut resilier son abonnement a tout moment. L&apos;acces reste actif jusqu&apos;a la fin
              de la periode payee. SENZOUKRIA se reserve le droit de suspendre ou resilier un compte en cas de
              violation des presentes conditions.
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
