import LandingClientShell from '@/components/landing/LandingClientShell';
import LandingNav from '@/components/landing/LandingNav';
import HeroSection from '@/components/landing/HeroSection';
import BrokersSection from '@/components/landing/BrokersSection';
import FeaturesSection from '@/components/landing/FeaturesSection';
import CapabilitiesSection from '@/components/landing/CapabilitiesSection';
import HowItWorksSection from '@/components/landing/HowItWorksSection';
import TestimonialsSection from '@/components/landing/TestimonialsSection';
import SocialSection from '@/components/landing/SocialSection';
import FAQSection from '@/components/landing/FAQSection';
import CTASection from '@/components/landing/CTASection';
import LandingFooter from '@/components/landing/LandingFooter';

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
      <TestimonialsSection />
      <SocialSection />
      <FAQSection />
      <CTASection />
      <LandingFooter />
    </LandingClientShell>
  );
}
