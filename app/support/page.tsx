import type { Metadata } from "next";
import SiteFooter from "../components/site/SiteFooter";
import SiteHeader from "../components/site/SiteHeader";
import SupportClient from "../components/site/SupportClient";

export const metadata: Metadata = {
  title: "Customer Support & Help Center | Source Asia Direct",
  description:
    "Get help with Source Asia hardware products, track orders, request GST invoices, or contact our customer care team.",
};

export default function SupportPage() {
  return (
    <div className="landing-page">
      <SiteHeader currentPage="support" />
      <main className="support-page-shell">
        <SupportClient />
      </main>
      <SiteFooter />
    </div>
  );
}
