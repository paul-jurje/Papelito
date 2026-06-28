import Header from '../components/Header';
import HeroSection from '../components/HeroSection';
import BenefitsSection from '../components/BenefitsSection';
import PricingSection from '../components/PricingSection';
import FAQSection from '../components/FAQSection';
import Footer from '../components/Footer';

export function LandingPage(): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <BenefitsSection />
        <PricingSection />
        <FAQSection />
      </main>
      <Footer />
    </div>
  );
}

export default LandingPage;
