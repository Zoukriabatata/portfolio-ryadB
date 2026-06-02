import LandingClientShell from '@/components/landing/LandingClientShell';
import LandingNav from '@/components/landing/LandingNav';
import HeroSection from '@/components/landing/HeroSection';
import BrokersSection from '@/components/landing/BrokersSection';
import FeaturesSection from '@/components/landing/FeaturesSection';
import CapabilitiesSection from '@/components/landing/CapabilitiesSection';
import HowItWorksSection from '@/components/landing/HowItWorksSection';
import SocialSection from '@/components/landing/SocialSection';
import FAQSection from '@/components/landing/FAQSection';
import CTASection from '@/components/landing/CTASection';
import LandingFooter from '@/components/landing/LandingFooter';

// TestimonialsSection is intentionally NOT rendered for the public
// preview launch. The component still exists in components/landing/
// because we'll re-enable it once we have ~5 real testimonials from
// preview users — hardcoded fake ones would burn TikTok trust
// faster than no testimonials at all.

export default function HomePage() {
  return (
    <LandingClientShell>
      {/* Fixed navigation */}
      <LandingNav />

      {/* Content sections */}
      <HeroSection />
      <FeaturesSection />
      <BrokersSection />
      <CapabilitiesSection />
      <HowItWorksSection />
      <SocialSection />
      <FAQSection />
      <CTASection />
      <LandingFooter />
    </LandingClientShell>
  );
}
