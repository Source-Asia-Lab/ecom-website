import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer, TextLink } from "./components/ui";
import Hero from "./components/site/Hero";
import ProductRibbon from "./components/site/ProductRibbon";
import HexCategoryRibbon from "./components/site/HexCategoryRibbon";
import ReviewsRibbon from "./components/site/ReviewsRibbon";
import SectionHeading from "./components/site/SectionHeading";
import SiteFooter from "./components/site/SiteFooter";
import SiteHeader from "./components/site/SiteHeader";
import HomepageShowcase from "./components/site/HomepageShowcase";
import ProcessFlowSection from "./components/site/ProcessFlowSection";
import InteractiveSupportSection from "./components/site/InteractiveSupportSection";

export const metadata: Metadata = {
  title: "Source Asia Direct | Products for business",
  description:
    "Explore Source Asia products and build a business order online.",
};

export default function Home() {
  return (
    <div className="landing-page">
      <SiteHeader />
      <main>
        <Hero />
        <ProductRibbon />
        <HexCategoryRibbon />

        <PageContainer
          as="section"
          className="landing-intro scroll-reveal"
          aria-labelledby="intro-title"
        >
          <SectionHeading
            eyebrow="Source Asia Direct"
            title="A clearer place to begin your product search."
            description="Explore available Source Asia products, review their details, and build a business order through the online store."
            id="intro-title"
          />
          <div className="landing-intro-cta-wrap">
            <Link className="landing-intro-cta-btn" href="/store">
              <span>Browse the Store</span>
              <span className="landing-intro-cta-arrow" aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </PageContainer>

        <HomepageShowcase />

        <ProcessFlowSection />

        <InteractiveSupportSection />

        <ReviewsRibbon />
      </main>
      <SiteFooter />
    </div>
  );
}

