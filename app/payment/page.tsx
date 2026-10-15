import type { Metadata } from "next";
import PolicyPage from "../components/site/PolicyPage";

export const metadata: Metadata = {
  title: "Payment Information | Source Asia",
  description: "Payment methods and the current order-request status for Source Asia.",
};

export default function PaymentPolicyPage() {
  return (
    <PolicyPage title="Payment Information" intro="Payment method: online payment only. Cash on Delivery (COD) is not available anywhere on this website.">
      <section>
        <h2>Current checkout status</h2>
        <p>The current checkout submits an order request for review. It does not collect payment or confirm a sale. Do not treat the request-received message as payment confirmation or a confirmed order.</p>
      </section>
      <section>
        <h2>Online payment methods</h2>
        <p>When online checkout is enabled, the payment methods available for a particular order will be shown at checkout. These may include UPI, credit/debit cards, net banking, and other enabled online methods. An option is not available unless it is displayed during checkout. B2B bank transfers or credit terms require separate approval and confirmation.</p>
      </section>
      <section>
        <h2>Payment safety and refunds</h2>
        <p>Payment status must be confirmed by the payment provider. Keep your order reference and payment receipt for support. Eligible refunds are made to the original payment method or another approved electronic method under the <a href="/returns-refunds">returns and refunds policy</a>. COD is not accepted and COD refunds are not available.</p>
      </section>
      <section>
        <h2>Payment support</h2>
        <p>Contact <a href="mailto:sales@sourceasia.co.in">sales@sourceasia.co.in</a> or <a href="tel:+919844223703">+91 98442 23703</a> with your order reference and payment details. Do not send full card numbers, CVV, passwords, or one-time passcodes.</p>
      </section>
    </PolicyPage>
  );
}