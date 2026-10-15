import type { Metadata } from "next";
import PolicyPage from "../components/site/PolicyPage";

export const metadata: Metadata = {
  title: "Privacy Policy | Source Asia",
  description: "How SourceAsia Supply Private Limited handles account, order, and support information.",
};

export default function PrivacyPolicyPage() {
  return (
    <PolicyPage title="Privacy Policy" intro="SourceAsia Supply Private Limited uses account, order, delivery, and support information to operate this storefront and respond to customers.">
      <section>
        <h2>Information used</h2>
        <p>Depending on how you use the website, information may include your name, verified Google account email, phone number, company/GST details, billing and delivery addresses, order and payment-provider references, PIN code, and support messages or evidence you submit.</p>
      </section>
      <section>
        <h2>How information is used</h2>
        <p>Information is used to provide account access, receive and review order requests, process orders and refunds when those services are enabled, arrange delivery, send service updates, prevent misuse, respond to support requests, and meet applicable business or legal requirements.</p>
      </section>
      <section>
        <h2>Service providers and security</h2>
        <p>When integrated, identity, payment, hosting, email/SMS, ERP, and logistics providers may process the information needed to perform their service. We do not ask customers to send card numbers, CVV, passwords, or one-time passcodes through support forms. Access should be limited to authorized personnel and service providers.</p>
      </section>
      <section>
        <h2>Retention and requests</h2>
        <p>Information is retained only as needed for the stated services, support, security, and applicable record-keeping requirements. To request access, correction, or deletion of personal information, email <a href="mailto:sales@sourceasia.co.in">sales@sourceasia.co.in</a> and identify the request as a privacy/personal-data request. We may need to verify your identity before responding.</p>
      </section>
      <section>
        <h2>Business and privacy contact</h2>
        <p>SourceAsia Supply Private Limited, LR Arcade No. 13/1, 1st Floor, Ward No. 194, Kembathalli, Gottigere, Bangalore – 560083, Karnataka, India. GSTIN: 29ABQCS9369C1ZK. Privacy requests: <a href="mailto:sales@sourceasia.co.in">sales@sourceasia.co.in</a> or <a href="tel:+919844223703">+91 98442 23703</a>.</p>
      </section>
    </PolicyPage>
  );
}