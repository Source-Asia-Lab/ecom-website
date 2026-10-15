import type { ReactNode } from "react";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import { PageContainer } from "../ui";

export default function PolicyPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="landing-page">
      <SiteHeader currentPage="support" />
      <main className="support-page-shell">
        <PageContainer className="policy-page">
          <p className="section-heading__eyebrow">SOURCE ASIA CUSTOMER INFORMATION</p>
          <h1>{title}</h1>
          <p className="policy-page__intro">{intro}</p>
          <div className="policy-page__content">{children}</div>
          <aside className="policy-page__contact" aria-label="Business and support contact">
            <h2>SourceAsia Supply Private Limited</h2>
            <p>Customer support: Nitin Kumar</p>
            <p>Business/contact address: LR Arcade No. 13/1, 1st Floor, Ward No. 194, Kembathalli, Gottigere, Bangalore – 560083, Karnataka, India.</p>
            <p>GSTIN: 29ABQCS9369C1ZK</p>
            <p><a href="mailto:sales@sourceasia.co.in">sales@sourceasia.co.in</a> · <a href="tel:+919844223703">+91 98442 23703</a></p>
          </aside>
        </PageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}