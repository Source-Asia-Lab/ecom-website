import type { Metadata } from "next";
import PolicyPage from "../components/site/PolicyPage";

export const metadata: Metadata = {
  title: "Cancellation, Returns and Refunds | Source Asia",
  description: "How to request cancellation, report a product issue, and follow a return or refund review.",
};

export default function ReturnsRefundsPage() {
  return (
    <PolicyPage title="Cancellation, Returns and Refunds" intro="Return and replacement requests are reviewed against the product, reported issue, evidence, and delivery date. Contact support promptly and include your order number.">
      <section>
        <h2>Order cancellation</h2>
        <p>You may request cancellation before dispatch through customer support. If the order has not been dispatched, it may be cancelled and the eligible amount refunded to the original payment method. The current account page does not provide direct cancellation controls. Once dispatched, an order normally cannot be cancelled through the website; receive the shipment and submit a return or replacement request if eligible.</p>
      </section>
      <section>
        <h2>Report an issue within 48 hours</h2>
        <p>Report a wrong, damaged, defective, leaking, incorrectly sized, incorrectly dimensioned, or incorrectly supplied product within 48 hours of delivery. Some issues that are not immediately visible may be reviewed case by case. Requests received later may be declined unless the issue is covered by a manufacturing-defect or warranty/quality policy.</p>
      </section>
      <section>
        <h2>Evidence to include</h2>
        <p>Include your order number or invoice, photographs of the product, packaging and shipping label, and the SKU/model/part number where available. Show the reported issue clearly. For size or dimension claims, include a measurement photo with a suitable measuring instrument. A short video may be needed for leakage, damage, or a fault that photos cannot demonstrate. Support may request additional information.</p>
        <p>For damage visible at delivery, photograph the package before opening it when possible, the shipping label, damaged packaging, and the product. Where possible, note visible damage with the courier.</p>
      </section>
      <section>
        <h2>Product-specific conditions</h2>
        <ul>
          <li><strong>Metals, fasteners, hardware, and metal products:</strong> eligible issues may include wrong product, size, dimensions, visible transit damage, quantity mismatch, or applicable manufacturing defect. Do not cut, drill, machine, install, modify, or use the product before confirming it matches the order. Modified or used items may be ineligible unless Source Asia supplied the wrong item or confirms a manufacturing defect.</li>
          <li><strong>Adhesives, sealants, and chemical products:</strong> eligible issues may include leakage on arrival, an already-open seal, damaged container, unusable condition, wrong product, or quantity mismatch. Do not use a product after discovering suspected leakage, an open seal, or an incorrect item.</li>
          <li><strong>Wires, cables, and electrical products:</strong> eligible issues may include wrong colour, length, dimension, product/specification, transit damage, quantity mismatch, or applicable manufacturing defect. Cut, stripped, terminated, installed, or modified wires and cables are generally not returnable unless the wrong item was supplied or a defect is confirmed.</li>
          <li><strong>Wrong product or specification:</strong> report a mismatch within 48 hours and provide photos of the item and identifying label. If confirmed, Source Asia will arrange an appropriate return or replacement.</li>
          <li><strong>Customized or cut-to-size products:</strong> returns may be restricted unless the product supplied was incorrect or defective.</li>
        </ul>
        <p>Items may generally be ineligible if used, installed, cut, modified, drilled, machined, stripped, altered, mixed with other materials, damaged after delivery, or returned without necessary product identification or evidence. Opened or used consumables may be excluded unless a pre-existing defect, leakage, damaged seal, or incorrect supply is verified.</p>
      </section>
      <section>
        <h2>Review and return shipping</h2>
        <p>Requests are reviewed and may require additional evidence or inspection. If approved, Source Asia will provide return instructions or arrange pickup/replacement as applicable. A returned product may be inspected before resolution.</p>
        <p>Source Asia generally bears return or replacement shipping when a wrong product, size, dimension, colour, quantity, confirmed manufacturing defect, confirmed leakage/opened seal on arrival, or transit damage is verified. Customers may be responsible for return shipping when they ordered the wrong item or size, changed requirements, or the item is not defective and the return is based on preference. Charges may also apply to customized or specially prepared products under the applicable review.</p>
      </section>
      <section>
        <h2>Refunds and replacements</h2>
        <p>Approved refunds are normally issued to the original online payment method, or another approved electronic method. Refunds are generally initiated within 5–7 working days after return approval and completion of any required inspection. The time for funds to appear depends on the bank, card issuer, or payment provider.</p>
        <p>Shipping charges may be refunded when the return results from a company error, confirmed damage, or another company-approved reason. Shipping or handling charges may not be refundable for customer preference or an incorrect customer selection.</p>
        <p>Where appropriate, Source Asia may offer the correct product, size, dimension, or colour, or replace a damaged/defective item. Replacement depends on availability; if unavailable, an eligible refund may be offered. No Cash on Delivery (COD) refunds are available because COD is not offered.</p>
      </section>
      <section>
        <h2>Submit a request</h2>
        <p>Use the <a href="/support">support page</a> or email <a href="mailto:sales@sourceasia.co.in">sales@sourceasia.co.in</a>. Include your name, order number, registered email or phone, a description, and supporting evidence. Refunds are not complete until the payment provider or approved electronic payment method confirms processing.</p>
      </section>
    </PolicyPage>
  );
}