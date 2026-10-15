"use client";

import { useState } from "react";

const TICKET_CATEGORIES = [
  ["ORDER", "Order or delivery"],
  ["PAYMENT", "Payment"],
  ["RETURN", "Return or replacement"],
  ["REFUND", "Refund"],
  ["PRODUCT", "Product support"],
  ["PRIVACY", "Privacy request"],
  ["OTHER", "Other"],
] as const;

export default function SupportTicketForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [ticketNumber, setTicketNumber] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");
    setTicketNumber("");
    setIsSubmitting(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    try {
      const response = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { ticketNumber?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not submit your request.");
      setTicketNumber(result.ticketNumber || "");
      setFeedback("Your support request was received.");
      form.reset();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not submit your request.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="support-ticket-form" onSubmit={handleSubmit}>
      <div className="support-ticket-form__grid">
        <label className="ui-field">
          <span className="ui-label">Name *</span>
          <input className="ui-input" name="name" required maxLength={200} autoComplete="name" />
        </label>
        <label className="ui-field">
          <span className="ui-label">Email *</span>
          <input className="ui-input" type="email" name="email" required maxLength={255} autoComplete="email" />
        </label>
        <label className="ui-field">
          <span className="ui-label">Phone</span>
          <input className="ui-input" type="tel" name="phone" maxLength={20} autoComplete="tel" />
        </label>
        <label className="ui-field">
          <span className="ui-label">Order number</span>
          <input className="ui-input" name="orderNumber" maxLength={50} />
        </label>
        <label className="ui-field">
          <span className="ui-label">Topic *</span>
          <select className="ui-select" name="category" defaultValue="OTHER">
            {TICKET_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="ui-field">
          <span className="ui-label">Subject *</span>
          <input className="ui-input" name="subject" required minLength={4} maxLength={160} />
        </label>
        <label className="ui-field support-ticket-form__wide">
          <span className="ui-label">How can we help? *</span>
          <textarea className="ui-input support-ticket-form__message" name="message" required minLength={10} maxLength={5000} />
        </label>
      </div>
      <label className="support-ticket-form__honeypot" aria-hidden="true">
        Website <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <button className="support-action-btn support-action-btn--primary" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Submitting..." : "Submit support request"}
      </button>
      {feedback && (
        <p className="checkout-feedback" role={ticketNumber ? "status" : "alert"}>
          {feedback}{ticketNumber ? ` Reference: ${ticketNumber}` : ""}
        </p>
      )}
      <p className="support-ticket-form__note">For a return or damage report, include your order number and describe the issue. Send requested photos or videos to sales@sourceasia.co.in with your ticket reference.</p>
    </form>
  );
}