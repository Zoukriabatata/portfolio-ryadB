'use client';

import Link from 'next/link';
import { useState } from 'react';
import MarketingShell from '@/components/marketing/MarketingShell';

const content = {
  fr: {
    back: 'Retour',
    title: "Conditions Générales d'Utilisation",
    updated: 'Dernière mise à jour : juin 2026',
    sections: [
      {
        title: '1. Objet du service',
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              SENZOUKRIA est un <strong className="text-[var(--text-primary)]">logiciel d&apos;analyse graphique</strong> accessible via navigateur web.
              Il fournit des outils de visualisation (Footprint, Heatmap, Delta Profile, Volume Profile)
              permettant aux traders de futures CME d&apos;analyser leurs propres flux de données de marché.
            </p>
            <div className="p-4 bg-[rgb(var(--warning-rgb)/0.1)] border border-[rgb(var(--warning-rgb)/0.2)] rounded-lg mt-4">
              <p className="text-[var(--warning)] font-semibold mb-2">IMPORTANT - Données de marché</p>
              <p className="text-[var(--text-muted)]">
                SENZOUKRIA <strong className="text-[var(--text-primary)]">ne fournit pas, ne stocke pas et ne redistribue aucune donnée de marché CME</strong>.
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
            <p className="text-[var(--text-muted)] leading-relaxed">
              L&apos;abonnement confère une licence personnelle, non-transférable et non-exclusive
              d&apos;utilisation du logiciel SENZOUKRIA, incluant <strong className="text-[var(--text-primary)]">l&apos;application web</strong> (accessible via navigateur)
              et <strong className="text-[var(--text-primary)]">l&apos;application desktop</strong> (binaire Windows distribué via GitHub Releases et mis à jour automatiquement).
              Cette licence est strictement limitée à :
            </p>
            <ul className="list-disc list-inside text-[var(--text-muted)] space-y-1 mt-2">
              <li>Un seul compte par personne physique</li>
              <li>Un seul appareil connecté simultanément</li>
              <li>Usage personnel uniquement (pas de revente, sous-licence ou partage)</li>
              <li>Toute copie, reverse engineering, décompilation ou extraction du code — web ou desktop — est strictement interdite</li>
            </ul>
          </>
        ),
      },
      {
        title: '3. Anti-partage et sécurité',
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              Pour protéger l&apos;intégrité du service, les mesures suivantes sont appliquées :
            </p>
            <ul className="list-disc list-inside text-[var(--text-muted)] space-y-1 mt-2">
              <li>Une seule session active par compte à tout moment</li>
              <li>Détection automatique des connexions simultanées</li>
              <li>Empreinte numérique de l&apos;appareil (device fingerprinting)</li>
              <li>Surveillance des adresses IP</li>
            </ul>
            <p className="text-[var(--text-muted)] mt-2">
              Toute tentative de partage de compte entraîne la <strong className="text-[var(--bear)]">suspension immédiate</strong> du compte
              sans remboursement.
            </p>
          </>
        ),
      },
      {
        title: '4. Abonnement et paiement',
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              L&apos;abonnement est mensuel et facturable via Stripe. Le paiement est dû au début de chaque période.
              L&apos;accès au logiciel est activé après réception et confirmation du paiement.
              Le prix affiché inclut la TVA applicable selon le pays de facturation de l&apos;utilisateur,
              calculée automatiquement par Stripe Tax.
            </p>
            <ul className="list-disc list-inside text-[var(--text-muted)] space-y-1 mt-2">
              <li>Paiement mensuel par Stripe (carte bancaire)</li>
              <li>Période d&apos;essai gratuite de 14 jours pour les nouveaux comptes</li>
              <li>Résiliation à tout moment depuis l&apos;onglet « Account » du logiciel ou via le portail Stripe</li>
              <li>L&apos;abonnement ne couvre QUE le logiciel, pas les données de marché (l&apos;utilisateur doit avoir son propre abonnement broker / data feed)</li>
            </ul>
          </>
        ),
      },
      {
        title: '4 bis. Droit de rétractation',
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              Conformément à l&apos;article L221-28-13° du Code de la consommation,
              le droit de rétractation de 14 jours ne s&apos;applique <strong className="text-[var(--text-primary)]">pas</strong>{' '}
              aux services numériques dont l&apos;exécution a commencé avec l&apos;accord
              préalable et exprès du consommateur, qui a expressément renoncé à son
              droit de rétractation.
            </p>
            <p className="text-[var(--text-muted)] mt-2">
                      En cochant la case <em>« J&apos;accepte les conditions générales d&apos;utilisation »</em>{' '}
              lors de la création du compte (ou en se connectant via Google OAuth après avoir coché cette case),
              et en confirmant le paiement de l&apos;abonnement,
              l&apos;utilisateur :
            </p>
            <ul className="list-disc list-inside text-[var(--text-muted)] space-y-1 mt-2">
              <li>demande l&apos;exécution immédiate du service numérique ;</li>
              <li>reconnaît avoir été informé de la perte de son droit de rétractation
                  dès l&apos;activation de l&apos;accès au logiciel.</li>
            </ul>
            <p className="text-[var(--text-muted)] mt-2">
              Cette renonciation ne s&apos;applique <strong className="text-[var(--text-primary)]">pas</strong>{' '}
              à la période d&apos;essai gratuit de 14 jours : pendant cette période,
              l&apos;utilisateur peut résilier sans frais et sans justification.
              Le premier prélèvement n&apos;intervient qu&apos;à l&apos;issue de cette période.
            </p>
          </>
        ),
      },
      {
        title: '4 ter. Modalités de résiliation',
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              L&apos;abonnement peut être résilié à tout moment, conformément à
              l&apos;article L215-1 du Code de la consommation (loi du 1er juin 2023
              sur la résiliation en trois clics) :
            </p>
            <ul className="list-disc list-inside text-[var(--text-muted)] space-y-1 mt-2">
              <li><strong className="text-[var(--text-primary)]">Depuis le logiciel</strong> : onglet « Account » → « Cancel subscription » (accès direct au portail Stripe).</li>
              <li><strong className="text-[var(--text-primary)]">Depuis le site web</strong> : <a href="/account/billing/cancel" className="text-[var(--primary)] hover:text-[var(--primary-light)] underline">orderflow-v2.vercel.app/account/billing/cancel</a>.</li>
              <li><strong className="text-[var(--text-primary)]">Par email</strong> : ryad.bouderga78@gmail.com avec mention « Résiliation [email du compte] ».</li>
            </ul>
            <p className="text-[var(--text-muted)] mt-2">
              La résiliation prend effet immédiatement. L&apos;accès au logiciel reste
              ouvert jusqu&apos;à la fin de la période de facturation déjà payée.
              Aucun remboursement n&apos;est dû pour la période en cours (article L221-28 13°),
              sauf en cas de défaut technique avéré de notre part.
            </p>
          </>
        ),
      },
      {
        title: '4 quater. Médiation et règlement des litiges',
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              Conformément aux articles L611-1 et suivants du Code de la consommation,
              en cas de litige non résolu après une réclamation écrite préalable
              auprès de SENZOUKRIA (par email à ryad.bouderga78@gmail.com),
              l&apos;utilisateur consommateur peut recourir gratuitement au service
              de médiation suivant :
            </p>
            <p className="text-[var(--text-muted)] mt-2 font-mono text-sm">
              <strong className="text-[var(--text-primary)]">Médiateur de la consommation</strong> :{' '}
              <em>(à compléter par l&apos;éditeur — voir Centre de médiation
              de la consommation des conciliateurs de justice : <a
              href="https://cm2c.net" target="_blank" rel="noreferrer" className="text-[var(--primary)] hover:text-[var(--primary-light)] underline">cm2c.net</a>)</em>
            </p>
            <p className="text-[var(--text-muted)] mt-2">
              L&apos;utilisateur peut également saisir la plateforme européenne de
              règlement en ligne des litiges :{' '}
              <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer"
                 className="text-[var(--primary)] hover:text-[var(--primary-light)] underline">ec.europa.eu/consumers/odr</a>.
            </p>
            <p className="text-[var(--text-muted)] mt-2">
              Tout litige relève à défaut des tribunaux français compétents,
              conformément aux règles de compétence territoriale du droit français.
            </p>
          </>
        ),
      },
      {
        title: "5. Connecteurs broker et responsabilité données de marché",
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              L&apos;application desktop SENZOUKRIA propose des connecteurs vers des plateformes et brokers tiers
              (Rithmic, Apex Trader Funding, Interactive Brokers, NinjaTrader, etc.).
            </p>
            <ul className="list-disc list-inside text-[var(--text-muted)] space-y-1 mt-2">
              <li><strong className="text-[var(--text-primary)]">Absence d&apos;affiliation</strong> : SENZOUKRIA n&apos;est pas affilié, sponsorisé ni approuvé par Rithmic, Apex Trader Funding, Interactive Brokers Group, NinjaTrader LLC, CME Group, ni par aucun autre broker ou échange cité dans l&apos;application.</li>
              <li><strong className="text-[var(--text-primary)]">Marques tierces</strong> : ATAS, Bookmap, Sierra Chart, NinjaTrader, Rithmic, Apex Trader Funding, Quantower sont des marques déposées de leurs propriétaires respectifs. Toute mention est uniquement à des fins d&apos;identification ; aucune association ni endossement n&apos;est sous-entendu.</li>
              <li><strong className="text-[var(--text-primary)]">Exactitude des données</strong> : SENZOUKRIA ne garantit pas l&apos;exactitude, la continuité ni la disponibilité des données de marché reçues via les connecteurs broker. Ces données sont fournies « telles quelles » par le broker de l&apos;utilisateur.</li>
              <li><strong className="text-[var(--text-primary)]">Ordres et latence</strong> : SENZOUKRIA n&apos;est pas responsable des ordres transmis, de leur exécution, de leur rejet ou de la latence du connecteur. Le routage d&apos;ordres reste sous l&apos;entière responsabilité de l&apos;utilisateur et de son broker.</li>
              <li><strong className="text-[var(--text-primary)]">Credentials broker</strong> : les identifiants de connexion broker sont stockés uniquement dans le trousseau OS local de l&apos;utilisateur et ne transitent jamais par les serveurs SENZOUKRIA.</li>
            </ul>
          </>
        ),
      },
      {
        title: '6. Limitation de responsabilité',
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              SENZOUKRIA est un outil de visualisation et d&apos;analyse. Il ne constitue en aucun cas un conseil en investissement,
              une recommandation de trading, une analyse financière au sens de la directive MiFID II,
              ni une incitation à acheter ou vendre des instruments financiers.
            </p>
            <p className="text-[var(--text-muted)] mt-2">
              L&apos;assistant IA intégré produit des analyses descriptives à titre informatif uniquement.
              Toute référence à des niveaux de prix, biais directionnels ou zones d&apos;invalidation
              est une description technique de l&apos;orderflow, non une recommandation personnalisée.
            </p>
            <p className="text-[var(--text-muted)] mt-2">
              L&apos;utilisateur est seul responsable de ses décisions de trading et des pertes éventuelles.
              SENZOUKRIA ne peut être tenu responsable des pertes financières, interruptions de service
              ou bugs affectant l&apos;utilisation du logiciel.
            </p>
          </>
        ),
      },
      {
        title: '7. Propriété intellectuelle',
        body: (
          <p className="text-[var(--text-muted)] leading-relaxed">
            Le code source, l&apos;interface, les algorithmes et le design de SENZOUKRIA sont protégés par le droit d&apos;auteur.
            Toute copie, reverse engineering, décompilation ou extraction du code est strictement interdite.
          </p>
        ),
      },
      {
        title: '8. Conformité CME Group',
        body: (
          <div className="p-4 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg">
            <ul className="text-[var(--text-muted)] space-y-2">
              <li>SENZOUKRIA agit en tant que <strong className="text-[var(--text-primary)]">Software Vendor</strong> et non en tant que distributeur de données</li>
              <li>Aucune donnée brute CME (ticks, quotes, depth) n&apos;est stockée, redistribuée ou mutualisée sur nos serveurs</li>
              <li>Chaque utilisateur accède à son propre flux via son propre compte broker</li>
              <li>1 utilisateur = 1 flux personnel = 1 abonnement data individuel</li>
              <li>Les analyses dérivées (profils, heatmaps, footprints) sont générées en temps réel côté client</li>
            </ul>
          </div>
        ),
      },
      {
        title: '9. Résiliation par SENZOUKRIA',
        body: (
          <p className="text-[var(--text-muted)] leading-relaxed">
            SENZOUKRIA se réserve le droit de suspendre ou résilier un compte en cas de violation des présentes
            conditions (partage de compte, usage abusif, reverse engineering). La procédure de résiliation
            par l&apos;utilisateur est décrite au §4 ter.
          </p>
        ),
      },
    ],
  },
  en: {
    back: 'Back',
    title: 'Terms of Service',
    updated: 'Last updated: June 2026',
    sections: [
      {
        title: '1. Service Description',
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              SENZOUKRIA is a <strong className="text-[var(--text-primary)]">charting and analysis software</strong> accessible via web browser.
              It provides visualization tools (Footprint, Heatmap, Delta Profile, Volume Profile)
              enabling CME futures traders to analyze their own market data feeds.
            </p>
            <div className="p-4 bg-[rgb(var(--warning-rgb)/0.1)] border border-[rgb(var(--warning-rgb)/0.2)] rounded-lg mt-4">
              <p className="text-[var(--warning)] font-semibold mb-2">IMPORTANT - Market Data</p>
              <p className="text-[var(--text-muted)]">
                SENZOUKRIA <strong className="text-[var(--text-primary)]">does not provide, store, or redistribute any CME market data</strong>.
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
            <p className="text-[var(--text-muted)] leading-relaxed">
              The subscription grants a personal, non-transferable, and non-exclusive license
              to use the SENZOUKRIA software. This license is strictly limited to:
            </p>
            <ul className="list-disc list-inside text-[var(--text-muted)] space-y-1 mt-2">
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
            <p className="text-[var(--text-muted)] leading-relaxed">
              To protect the integrity of the service, the following measures are enforced:
            </p>
            <ul className="list-disc list-inside text-[var(--text-muted)] space-y-1 mt-2">
              <li>Only one active session per account at any time</li>
              <li>Automatic detection of simultaneous connections</li>
              <li>Device fingerprinting</li>
              <li>IP address monitoring</li>
            </ul>
            <p className="text-[var(--text-muted)] mt-2">
              Any attempt to share an account will result in <strong className="text-[var(--bear)]">immediate suspension</strong> of the account
              without refund.
            </p>
          </>
        ),
      },
      {
        title: '4. Subscription & Payment',
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              The subscription is billed monthly via Stripe. Payment is due at the beginning of each billing period.
              Access to the software is activated upon receipt and confirmation of payment.
              Prices shown include applicable VAT/sales tax for the user&apos;s billing country,
              automatically computed by Stripe Tax.
            </p>
            <ul className="list-disc list-inside text-[var(--text-muted)] space-y-1 mt-2">
              <li>Monthly payment via Stripe (credit/debit card)</li>
              <li>14-day free trial for new accounts</li>
              <li>Cancellation at any time from the &laquo; Account &raquo; tab in the desktop app or the Stripe portal</li>
              <li>The subscription covers ONLY the software, not market data (the user must have their own broker / data-feed subscription)</li>
            </ul>
          </>
        ),
      },
      {
        title: '4.1 Withdrawal Right (EU consumers)',
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              Pursuant to Article L221-28 13° of the French Consumer Code
              (transposing EU Directive 2011/83/EU), the 14-day withdrawal right
              does <strong className="text-[var(--text-primary)]">not</strong> apply to digital
              services whose execution has begun with the consumer&apos;s prior
              express consent and acknowledgment of the loss of the withdrawal
              right.
            </p>
            <p className="text-[var(--text-muted)] mt-2">
              By checking <em>&laquo; I accept the Terms of Service &raquo;</em> at
              account creation and confirming the subscription payment, the user:
            </p>
            <ul className="list-disc list-inside text-[var(--text-muted)] space-y-1 mt-2">
              <li>requests immediate execution of the digital service;</li>
              <li>acknowledges the loss of the right of withdrawal upon
                  activation of access to the software.</li>
            </ul>
            <p className="text-[var(--text-muted)] mt-2">
              This waiver does <strong className="text-[var(--text-primary)]">not</strong> apply
              to the 14-day free trial period: during the trial the user can
              cancel at any time without fee or justification, and the first
              charge only occurs at the end of the trial period.
            </p>
          </>
        ),
      },
      {
        title: '4.2 Cancellation procedure',
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              The subscription can be cancelled at any time, in compliance with
              French Consumer Code Article L215-1 (the &laquo; three-click
              cancellation &raquo; law of 1 June 2023):
            </p>
            <ul className="list-disc list-inside text-[var(--text-muted)] space-y-1 mt-2">
              <li><strong className="text-[var(--text-primary)]">From the desktop app</strong>: Account tab &rarr; &laquo; Cancel subscription &raquo; (direct link to the Stripe portal).</li>
              <li><strong className="text-[var(--text-primary)]">From the website</strong>: <a href="/account/billing/cancel" className="text-[var(--primary)] hover:text-[var(--primary-light)] underline">orderflow-v2.vercel.app/account/billing/cancel</a>.</li>
              <li><strong className="text-[var(--text-primary)]">By email</strong>: ryad.bouderga78@gmail.com with subject &laquo; Cancellation [account email] &raquo;.</li>
            </ul>
            <p className="text-[var(--text-muted)] mt-2">
              Cancellation takes effect immediately. Access to the software
              remains open until the end of the already-paid billing period.
              No refund is owed for the current period (Article L221-28 13°),
              except in the case of a proven technical defect on our part.
            </p>
          </>
        ),
      },
      {
        title: '4.3 Mediation & dispute resolution',
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              In accordance with Articles L611-1 et seq. of the French Consumer
              Code, in case of a dispute that remains unresolved after a written
              complaint to SENZOUKRIA (by email to ryad.bouderga78@gmail.com),
              the consumer user may freely refer the matter to the following
              mediation service:
            </p>
            <p className="text-[var(--text-muted)] mt-2 font-mono text-sm">
              <strong className="text-[var(--text-primary)]">Consumer mediator</strong>:{' '}
              <em>(to be completed by the editor — see Centre de médiation de
              la consommation des conciliateurs de justice: <a
              href="https://cm2c.net" target="_blank" rel="noreferrer" className="text-[var(--primary)] hover:text-[var(--primary-light)] underline">cm2c.net</a>)</em>
            </p>
            <p className="text-[var(--text-muted)] mt-2">
              The user may also refer the dispute to the European Online Dispute
              Resolution platform:{' '}
              <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer"
                 className="text-[var(--primary)] hover:text-[var(--primary-light)] underline">ec.europa.eu/consumers/odr</a>.
            </p>
            <p className="text-[var(--text-muted)] mt-2">
              Failing amicable resolution, any dispute falls under the
              jurisdiction of the competent French courts, in accordance with
              French rules on territorial jurisdiction.
            </p>
          </>
        ),
      },
      {
        title: '5. Broker connectors & market data liability',
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              The SENZOUKRIA desktop app provides connectors to third-party platforms and brokers
              (Rithmic, Apex Trader Funding, Interactive Brokers, NinjaTrader, etc.).
            </p>
            <ul className="list-disc list-inside text-[var(--text-muted)] space-y-1 mt-2">
              <li><strong className="text-[var(--text-primary)]">No affiliation</strong>: SENZOUKRIA is not affiliated with, sponsored by, or endorsed by Rithmic, Apex Trader Funding, Interactive Brokers Group, NinjaTrader LLC, CME Group, or any other broker or exchange mentioned in the app.</li>
              <li><strong className="text-[var(--text-primary)]">Third-party trademarks</strong>: ATAS, Bookmap, Sierra Chart, NinjaTrader, Rithmic, Apex Trader Funding, and Quantower are registered trademarks of their respective owners. Any mention is for identification purposes only; no association or endorsement is implied.</li>
              <li><strong className="text-[var(--text-primary)]">Data accuracy</strong>: SENZOUKRIA does not guarantee the accuracy, continuity, or availability of market data received through broker connectors. Such data is provided "as-is" by the user's broker.</li>
              <li><strong className="text-[var(--text-primary)]">Orders and latency</strong>: SENZOUKRIA is not responsible for orders submitted, their execution, rejection, or connector latency. Order routing remains entirely the responsibility of the user and their broker.</li>
              <li><strong className="text-[var(--text-primary)]">Broker credentials</strong>: broker login credentials are stored only in the user's local OS keychain and never transmitted to SENZOUKRIA servers.</li>
            </ul>
          </>
        ),
      },
      {
        title: '6. Limitation of Liability',
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              SENZOUKRIA is a visualization and analysis tool. It does not constitute investment advice,
              trading recommendations, financial analysis under MiFID II,
              or an incentive to buy or sell financial instruments.
            </p>
            <p className="text-[var(--text-muted)] mt-2">
              The integrated AI assistant produces descriptive analyses for informational purposes only.
              Any reference to price levels, directional bias, or invalidation zones
              is a technical description of orderflow, not a personalized recommendation.
            </p>
            <p className="text-[var(--text-muted)] mt-2">
              The user is solely responsible for their trading decisions and any resulting losses.
              SENZOUKRIA cannot be held liable for financial losses, service interruptions,
              or software bugs affecting the use of the application.
            </p>
          </>
        ),
      },
      {
        title: '7. Intellectual Property',
        body: (
          <p className="text-[var(--text-muted)] leading-relaxed">
            The source code, interface, algorithms, and design of SENZOUKRIA are protected by copyright.
            Any copying, reverse engineering, decompilation, or code extraction is strictly prohibited.
          </p>
        ),
      },
      {
        title: '8. CME Group Compliance',
        body: (
          <div className="p-4 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg">
            <ul className="text-[var(--text-muted)] space-y-2">
              <li>SENZOUKRIA operates as a <strong className="text-[var(--text-primary)]">Software Vendor</strong>, not as a data distributor</li>
              <li>No raw CME data (ticks, quotes, depth) is stored, redistributed, or pooled on our servers</li>
              <li>Each user accesses their own feed through their own broker account</li>
              <li>1 user = 1 personal feed = 1 individual data subscription</li>
              <li>Derived analytics (profiles, heatmaps, footprints) are generated in real-time on the client side</li>
            </ul>
          </div>
        ),
      },
      {
        title: '9. Termination by SENZOUKRIA',
        body: (
          <p className="text-[var(--text-muted)] leading-relaxed">
            SENZOUKRIA reserves the right to suspend or terminate an account in case of violation of these
            terms (account sharing, abusive use, reverse engineering). User-initiated cancellation
            procedures are described in section 4.2.
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
    <MarketingShell>
      <div className="min-h-screen bg-[var(--background)] pt-28 pb-16 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <Link href="/" className="text-[var(--text-dimmed)] hover:text-[var(--text-primary)] text-sm">
              &larr; {t.back}
            </Link>
            <div className="flex gap-1 bg-[rgb(var(--surface-elevated-rgb)/0.5)] rounded-lg p-0.5 border border-[var(--border)]">
              <button
                onClick={() => setLang('fr')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${lang === 'fr' ? 'bg-[rgb(var(--primary-rgb)/0.2)] text-[var(--primary)]' : 'text-[var(--text-dimmed)] hover:text-[var(--text-primary)]'}`}
              >
                FR
              </button>
              <button
                onClick={() => setLang('en')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${lang === 'en' ? 'bg-[rgb(var(--primary-rgb)/0.2)] text-[var(--primary)]' : 'text-[var(--text-dimmed)] hover:text-[var(--text-primary)]'}`}
              >
                EN
              </button>
            </div>
          </div>

          <p
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 11,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
            className="mb-3"
          >
            · Legal
          </p>
          <h1 className="font-display text-3xl text-[var(--text-primary)] mb-2">{t.title}</h1>
          <p className="text-[var(--text-dimmed)] mb-8">{t.updated}</p>

          <div className="prose prose-invert prose-zinc max-w-none space-y-8">
            {t.sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-xl font-semibold text-[var(--text-primary)] border-b border-[var(--border)] pb-2">{section.title}</h2>
                {section.body}
              </section>
            ))}
          </div>

          <div className="mt-12 pt-6 border-t border-[var(--border)] text-center">
            <p className="text-[var(--text-dimmed)] text-sm">
              Contact : ryad.bouderga78@gmail.com
            </p>
          </div>
        </div>
      </div>
    </MarketingShell>
  );
}
