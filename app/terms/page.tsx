import type { Metadata } from "next";
import PolicyPage from "../components/site/PolicyPage";

export const metadata: Metadata = {
  title: "Terms of Use | Source Asia",
  description: "Terms for using the Source Asia storefront and submitting order requests.",
};

export default function TermsPage() {
  return (
    <PolicyPage title="Terms of Use" intro="These terms describe use of the Source Asia storefront. Order, payment, delivery, cancellation, and return rules are also described in the linked policies.">
      <section>
        <h2>Storefront and order requests</h2>
        <p>Product information, availability, prices, and delivery estimates may change. The current checkout records a request for review; submitting it does not take payment, reserve inventory, or confirm a sale. A request is not an accepted order until Source Asia confirms it through an operational process.</p>
      </section>
      <section>
        <h2>Payment and delivery</h2>
        <p>Cash on Delivery is not available. Online payment options, when enabled, are shown at checkout. Delivery is subject to PIN-code serviceability; carrier and delivery estimates may vary. See the <a href="/payment">payment information</a> and <a href="/shipping">shipping policy</a>.</p>
      </section>
      <section>
        <h2>Cancellation, returns, and support</h2>
        <p>Cancellation, return, replacement, and refund requests are subject to review and the conditions in the <a href="/returns-refunds">cancellation, returns, and refunds policy</a>. Customers should provide accurate contact, billing, delivery, and order information and report delivery issues within the stated reporting window.</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>SourceAsia Supply Private Limited, LR Arcade No. 13/1, 1st Floor, Ward No. 194, Kembathalli, Gottigere, Bangalore – 560083, Karnataka, India. GSTIN: 29ABQCS9369C1ZK. Contact <a href="mailto:sales@sourceasia.co.in">sales@sourceasia.co.in</a> for questions about these terms.</p>
      </section>
    </PolicyPage>
  );
}