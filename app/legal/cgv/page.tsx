'use client';

import Link from 'next/link';
import { useState } from 'react';
import MarketingShell from '@/components/marketing/MarketingShell';

const content = {
  fr: {
    back: 'Retour',
    title: 'Conditions Générales de Vente',
    updated: 'Dernière mise à jour : juin 2026',
    sections: [
      {
        title: '1. Identité du vendeur',
        body: (
          <div className="p-4 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg">
            <ul className="text-[var(--text-muted)] space-y-1">
              <li><strong className="text-[var(--text-primary)]">Raison sociale :</strong> SENZOUKRIA</li>
              <li><strong className="text-[var(--text-primary)]">Entrepreneur individuel :</strong> Ryad Bouderga</li>
              <li><strong className="text-[var(--text-primary)]">SIRET :</strong> 105 536 023 00010</li>
              <li><strong className="text-[var(--text-primary)]">Adresse :</strong> 6 passage de la Porte Comprise, 95800 Cergy, France</li>
              <li><strong className="text-[var(--text-primary)]">Contact :</strong> ryad.bouderga78@gmail.com</li>
            </ul>
          </div>
        ),
      },
      {
        title: '2. Prix',
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              Les prix sont indiqués en euros (€). SENZOUKRIA bénéficie de la franchise en base de TVA conformément
              à l&apos;article 293B du CGI — <strong className="text-[var(--text-primary)]">TVA non applicable</strong>.
            </p>
            <p className="text-[var(--text-muted)] mt-2">
              Les tarifs en vigueur sont ceux affichés sur la page{' '}
              <Link href="/pricing" className="text-[var(--primary)] hover:text-[var(--primary-light)] underline">
                /pricing
              </Link>{' '}
              au moment de la souscription. SENZOUKRIA se réserve le droit de modifier ses tarifs à tout moment,
              les abonnements en cours restant inchangés jusqu&apos;à leur prochaine échéance.
            </p>
          </>
        ),
      },
      {
        title: '3. Modalités de paiement',
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              Le paiement s&apos;effectue en ligne via <strong className="text-[var(--text-primary)]">Stripe</strong> (carte bancaire).
              Le débit intervient immédiatement à la souscription, puis automatiquement à chaque échéance mensuelle.
            </p>
            <ul className="list-disc list-inside text-[var(--text-muted)] space-y-1 mt-2">
              <li>Paiement sécurisé par Stripe (PCI-DSS niveau 1)</li>
              <li>Cartes acceptées : Visa, Mastercard, American Express</li>
              <li>Facturation mensuelle automatique</li>
              <li>Une facture est émise automatiquement à chaque prélèvement et envoyée par email</li>
            </ul>
          </>
        ),
      },
      {
        title: '4. Livraison du service',
        body: (
          <p className="text-[var(--text-muted)] leading-relaxed">
            SENZOUKRIA est un <strong className="text-[var(--text-primary)]">service numérique</strong> accessible en ligne et via application desktop.
            L&apos;accès est activé <strong className="text-[var(--text-primary)]">immédiatement</strong> après confirmation du paiement.
            Aucune livraison physique n&apos;est effectuée.
          </p>
        ),
      },
      {
        title: '5. Droit de rétractation',
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              Conformément à l&apos;article L221-28 13° du Code de la consommation,
              le droit de rétractation de 14 jours <strong className="text-[var(--text-primary)]">ne s&apos;applique pas</strong> aux
              contenus et services numériques dont l&apos;exécution a commencé avec l&apos;accord préalable et exprès
              du consommateur, qui a expressément renoncé à son droit de rétractation.
            </p>
            <p className="text-[var(--text-muted)] mt-2">
              En confirmant le paiement, l&apos;utilisateur reconnaît avoir demandé
              l&apos;exécution immédiate du service et avoir été informé de la perte de son droit de rétractation.
            </p>
            <div className="p-4 bg-[rgb(var(--primary-rgb)/0.05)] border border-[rgb(var(--primary-rgb)/0.15)] rounded-lg mt-3">
              <p className="text-[var(--text-muted)] text-sm">
                <strong className="text-[var(--text-primary)]">Période d&apos;essai :</strong> la période d&apos;essai gratuite de 14 jours
                permet de résilier sans frais avant le premier prélèvement. La rétractation s&apos;applique pleinement
                pendant cette période.
              </p>
            </div>
          </>
        ),
      },
      {
        title: '6. Garanties légales',
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              SENZOUKRIA est soumis aux garanties légales suivantes :
            </p>
            <ul className="list-disc list-inside text-[var(--text-muted)] space-y-1 mt-2">
              <li><strong className="text-[var(--text-primary)]">Garantie de conformité</strong> (art. L217-4 et s. C. conso.) : le service fourni doit être conforme au contrat et exempt de défauts de conformité.</li>
              <li><strong className="text-[var(--text-primary)]">Garantie contre les vices cachés</strong> (art. 1641 et s. C. civ.) : SENZOUKRIA garantit contre les défauts cachés rendant le service impropre à son usage.</li>
            </ul>
            <p className="text-[var(--text-muted)] mt-2">
              En cas de défaut avéré imputable à SENZOUKRIA, un remboursement au prorata de la période non utilisée
              peut être accordé sur demande à ryad.bouderga78@gmail.com.
            </p>
          </>
        ),
      },
      {
        title: '7. Réclamations',
        body: (
          <p className="text-[var(--text-muted)] leading-relaxed">
            Toute réclamation doit être adressée par email à{' '}
            <a href="mailto:ryad.bouderga78@gmail.com" className="text-[var(--primary)] hover:text-[var(--primary-light)] underline">
              ryad.bouderga78@gmail.com
            </a>{' '}
            en indiquant l&apos;email du compte concerné et la nature du problème.
            SENZOUKRIA s&apos;engage à répondre dans un délai de <strong className="text-[var(--text-primary)]">5 jours ouvrés</strong>.
          </p>
        ),
      },
      {
        title: '8. Médiation consommateur',
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              Conformément aux articles L611-1 et suivants du Code de la consommation,
              en cas de litige non résolu après réclamation écrite préalable auprès de SENZOUKRIA,
              l&apos;utilisateur consommateur peut recourir gratuitement à un médiateur :
            </p>
            <p className="text-[var(--text-muted)] mt-2">
              <strong className="text-[var(--text-primary)]">CM2C</strong> — Centre de Médiation de la Consommation des Conciliateurs de Justice :{' '}
              <a href="https://cm2c.net" target="_blank" rel="noreferrer" className="text-[var(--primary)] hover:text-[var(--primary-light)] underline">
                cm2c.net
              </a>
            </p>
            <p className="text-[var(--text-muted)] mt-2">
              Plateforme européenne de règlement en ligne des litiges :{' '}
              <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer" className="text-[var(--primary)] hover:text-[var(--primary-light)] underline">
                ec.europa.eu/consumers/odr
              </a>
            </p>
          </>
        ),
      },
      {
        title: '9. Droit applicable',
        body: (
          <p className="text-[var(--text-muted)] leading-relaxed">
            Les présentes CGV sont soumises au <strong className="text-[var(--text-primary)]">droit français</strong>.
            Tout litige non résolu par voie amiable ou de médiation relève de la compétence
            des tribunaux compétents de Cergy (Val-d&apos;Oise).
          </p>
        ),
      },
    ],
  },
  en: {
    back: 'Back',
    title: 'General Terms and Conditions of Sale',
    updated: 'Last updated: June 2026',
    sections: [
      {
        title: '1. Seller Identity',
        body: (
          <div className="p-4 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg">
            <ul className="text-[var(--text-muted)] space-y-1">
              <li><strong className="text-[var(--text-primary)]">Trade name:</strong> SENZOUKRIA</li>
              <li><strong className="text-[var(--text-primary)]">Sole trader:</strong> Ryad Bouderga</li>
              <li><strong className="text-[var(--text-primary)]">SIRET:</strong> 105 536 023 00010</li>
              <li><strong className="text-[var(--text-primary)]">Address:</strong> 6 passage de la Porte Comprise, 95800 Cergy, France</li>
              <li><strong className="text-[var(--text-primary)]">Contact:</strong> ryad.bouderga78@gmail.com</li>
            </ul>
          </div>
        ),
      },
      {
        title: '2. Pricing',
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              Prices are quoted in euros (€). SENZOUKRIA operates under the French VAT exemption scheme
              (article 293B of the French General Tax Code) —{' '}
              <strong className="text-[var(--text-primary)]">VAT not applicable</strong>.
            </p>
            <p className="text-[var(--text-muted)] mt-2">
              Applicable prices are those shown on the{' '}
              <Link href="/pricing" className="text-[var(--primary)] hover:text-[var(--primary-light)] underline">
                /pricing
              </Link>{' '}
              page at the time of subscription. SENZOUKRIA reserves the right to change prices at any time;
              existing subscriptions remain unaffected until their next renewal date.
            </p>
          </>
        ),
      },
      {
        title: '3. Payment',
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              Payment is processed online via <strong className="text-[var(--text-primary)]">Stripe</strong> (credit/debit card).
              The charge occurs immediately upon subscription, then automatically each month.
            </p>
            <ul className="list-disc list-inside text-[var(--text-muted)] space-y-1 mt-2">
              <li>Secure payment via Stripe (PCI-DSS level 1)</li>
              <li>Accepted cards: Visa, Mastercard, American Express</li>
              <li>Automatic monthly billing</li>
              <li>An invoice is automatically issued and emailed at each billing cycle</li>
            </ul>
          </>
        ),
      },
      {
        title: '4. Service Delivery',
        body: (
          <p className="text-[var(--text-muted)] leading-relaxed">
            SENZOUKRIA is a <strong className="text-[var(--text-primary)]">digital service</strong> accessible online and via desktop application.
            Access is activated <strong className="text-[var(--text-primary)]">immediately</strong> upon payment confirmation.
            No physical delivery is made.
          </p>
        ),
      },
      {
        title: '5. Right of Withdrawal',
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              Pursuant to Article L221-28 13° of the French Consumer Code,
              the 14-day right of withdrawal <strong className="text-[var(--text-primary)]">does not apply</strong> to digital
              content and services whose execution has begun with the consumer&apos;s prior express consent
              and acknowledgment of the loss of the right of withdrawal.
            </p>
            <p className="text-[var(--text-muted)] mt-2">
              By confirming payment, the user acknowledges having requested immediate execution of the service
              and having been informed of the loss of their right of withdrawal.
            </p>
            <div className="p-4 bg-[rgb(var(--primary-rgb)/0.05)] border border-[rgb(var(--primary-rgb)/0.15)] rounded-lg mt-3">
              <p className="text-[var(--text-muted)] text-sm">
                <strong className="text-[var(--text-primary)]">Free trial:</strong> the 14-day free trial period allows
                cancellation at no cost before the first charge. The right of withdrawal applies in full
                during this period.
              </p>
            </div>
          </>
        ),
      },
      {
        title: '6. Legal Warranties',
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              SENZOUKRIA is subject to the following legal warranties under French law:
            </p>
            <ul className="list-disc list-inside text-[var(--text-muted)] space-y-1 mt-2">
              <li><strong className="text-[var(--text-primary)]">Warranty of conformity</strong> (art. L217-4 et seq. Consumer Code): the service must conform to the contract and be free of defects.</li>
              <li><strong className="text-[var(--text-primary)]">Hidden defects warranty</strong> (art. 1641 et seq. Civil Code): SENZOUKRIA warrants against hidden defects rendering the service unfit for its intended use.</li>
            </ul>
            <p className="text-[var(--text-muted)] mt-2">
              In the event of a proven defect attributable to SENZOUKRIA, a pro-rata refund for the unused period
              may be granted upon request at ryad.bouderga78@gmail.com.
            </p>
          </>
        ),
      },
      {
        title: '7. Complaints',
        body: (
          <p className="text-[var(--text-muted)] leading-relaxed">
            Any complaint must be sent by email to{' '}
            <a href="mailto:ryad.bouderga78@gmail.com" className="text-[var(--primary)] hover:text-[var(--primary-light)] underline">
              ryad.bouderga78@gmail.com
            </a>{' '}
            stating the account email and nature of the issue.
            SENZOUKRIA commits to responding within <strong className="text-[var(--text-primary)]">5 business days</strong>.
          </p>
        ),
      },
      {
        title: '8. Consumer Mediation',
        body: (
          <>
            <p className="text-[var(--text-muted)] leading-relaxed">
              In accordance with Articles L611-1 et seq. of the French Consumer Code,
              in case of an unresolved dispute after a written complaint to SENZOUKRIA,
              the consumer user may freely refer the matter to a mediator:
            </p>
            <p className="text-[var(--text-muted)] mt-2">
              <strong className="text-[var(--text-primary)]">CM2C</strong> — Consumer Mediation Centre:{' '}
              <a href="https://cm2c.net" target="_blank" rel="noreferrer" className="text-[var(--primary)] hover:text-[var(--primary-light)] underline">
                cm2c.net
              </a>
            </p>
            <p className="text-[var(--text-muted)] mt-2">
              European Online Dispute Resolution platform:{' '}
              <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer" className="text-[var(--primary)] hover:text-[var(--primary-light)] underline">
                ec.europa.eu/consumers/odr
              </a>
            </p>
          </>
        ),
      },
      {
        title: '9. Governing Law',
        body: (
          <p className="text-[var(--text-muted)] leading-relaxed">
            These Terms and Conditions of Sale are governed by <strong className="text-[var(--text-primary)]">French law</strong>.
            Any dispute not resolved amicably or through mediation falls under the jurisdiction
            of the competent courts of Cergy (Val-d&apos;Oise), France.
          </p>
        ),
      },
    ],
  },
};

export default function CGVPage() {
  const [lang, setLang] = useState<'fr' | 'en'>('fr');
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
