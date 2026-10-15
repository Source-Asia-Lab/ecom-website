import type { Metadata } from "next";
import Link from "next/link";
import PolicyPage from "../components/site/PolicyPage";

export const metadata: Metadata = {
  title: "Shipping Policy | Source Asia",
  description: "Shipping coverage, estimated delivery windows, and freight information for Source Asia orders.",
};

export default function ShippingPolicyPage() {
  return (
    <PolicyPage title="Shipping Policy" intro="Shipping is available across India, subject to PIN-code serviceability. Delivery windows are estimates and can vary by location, carrier, product, and external conditions.">
      <section>
        <h2>Service area and availability</h2>
        <p>We serve PIN codes across India where an approved logistics partner can deliver. A non-serviceable PIN code cannot be accepted for delivery. The current order-request checkout does not yet validate delivery serviceability or show a delivery estimate. Contact support with the PIN code before relying on delivery availability; serviceability and freight must be confirmed before an order request is accepted.</p>
      </section>
      <section>
        <h2>Processing and delivery estimates</h2>
        <p>Order processing generally takes 1–2 working days after successful payment confirmation. Estimated delivery is generally 2–10 working days after dispatch:</p>
        <ul>
          <li>Metro cities: approximately 2–5 working days.</li>
          <li>Tier-2 and Tier-3 cities: approximately 3–7 working days.</li>
          <li>Remote locations: approximately 5–10 working days.</li>
        </ul>
        <p>These are estimates, not guaranteed delivery dates. Courier delays, weather, holidays, remote-area service, and other events can affect transit. The actual estimate must be confirmed for the serviceable PIN code before order acceptance.</p>
      </section>
      <section>
        <h2>Carriers and tracking</h2>
        <p>Shipments may be assigned to Delhivery, DTDC, Blue Dart, XpressBees, India Post, or another approved logistics partner. Carrier selection depends on PIN-code serviceability, package weight and dimensions, product type, cost, and delivery performance. Tracking details are provided after dispatch.</p>
        <p>The current website does not yet provide live carrier tracking. Use the carrier link or tracking details shared after dispatch, or contact <a href="mailto:sales@sourceasia.co.in">sales@sourceasia.co.in</a> for help.</p>
      </section>
      <section>
        <h2>Shipping charges and bulky products</h2>
        <p>Shipping charges depend on order weight and dimensions, destination PIN code, and product type. The current order-request checkout does not calculate freight. Source Asia must confirm applicable shipping charges before accepting a request. Free shipping applies only when a specific offer is confirmed; heavy or bulk products may require additional freight.</p>
        <p>Return-shipping or return-to-origin charges may apply under the <Link href="/returns-refunds">returns and refunds policy</Link>.</p>
      </section>
      <section>
        <h2>Payment method</h2>
        <p>Online payment only. Cash on Delivery (COD) is not available. See the <Link href="/payment">payment information</Link>.</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>For a delivery or serviceability question, contact <a href="mailto:sales@sourceasia.co.in">sales@sourceasia.co.in</a> or call <a href="tel:+919844223703">+91 98442 23703</a>. Include your order number and delivery PIN code when applicable.</p>
      </section>
    </PolicyPage>
  );
}