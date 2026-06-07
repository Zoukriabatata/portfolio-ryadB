import LandingNav from '@/components/landing/LandingNav';
import LandingFooter from '@/components/landing/LandingFooter';

/**
 * Chrome marketing partagé pour les pages publiques NON-landing
 * (pricing, download, contact, legal…). Rend la navbar de marque
 * (pill verre flottante) + le footer de marque, là où ces pages
 * héritaient sinon de la topbar applicative du DashboardClientLayout.
 *
 * Pas de <main> ici : ce shell est rendu À L'INTÉRIEUR du <main> du
 * DashboardClientLayout (un seul <main> par page). La navbar est en
 * position fixed ; les pages gardent leur propre padding haut pour
 * dégager la pill (~70px).
 */
export default function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LandingNav />
      {children}
      <LandingFooter />
    </>
  );
}
