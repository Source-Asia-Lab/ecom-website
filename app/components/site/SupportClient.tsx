"use client";

import { useState } from "react";
import Link from "next/link";
import { PageContainer } from "../ui";
import SupportTicketForm from "./SupportTicketForm";

interface FAQItem {
  id: string;
  category: string;
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    id: "faq-1",
    category: "Orders & Delivery",
    question: "How do I track my hardware or bulk order?",
    answer:
      "Tracking details are provided after dispatch. Live carrier tracking is not available in this help center yet. Use the carrier link shared with your dispatch details or contact sales@sourceasia.co.in.",
  },
  {
    id: "faq-2",
    category: "Payments & Invoicing",
    question: "How can I get a GST tax invoice for my business purchase?",
    answer:
      "The current checkout records an order request and does not yet generate a paid-order invoice. For invoice questions, contact sales@sourceasia.co.in with your order reference.",
  },
  {
    id: "faq-3",
    category: "Returns & Refunds",
    question: "What is the return policy for industrial tools & equipment?",
    answer:
      "Report a wrong, damaged, defective, leaking, incorrectly sized, incorrectly dimensioned, or incorrectly supplied product within 48 hours of delivery. Eligibility and resolution depend on the product and evidence. Read the full Returns & Refunds Policy.",
  },
  {
    id: "faq-4",
    category: "Bulk / B2B Orders",
    question: "Do you offer bulk discounts or custom quotes for large orders?",
    answer:
      "For bulk procurement or a custom quote, contact sales@sourceasia.co.in with the products, quantities, and delivery PIN code. Availability and pricing are confirmed by the Source Asia team.",
  },
  {
    id: "faq-5",
    category: "Payments & Invoicing",
    question: "What payment methods are accepted on Source Asia?",
    answer:
      "Payment method: Online Payment Only. Cash on Delivery is not available. The current checkout submits an order request and does not yet collect online payment. Available online methods will be shown at checkout when payment is enabled.",
  },
  {
    id: "faq-6",
    category: "Product Support",
    question: "What warranty coverage comes with power tools and machinery?",
    answer:
      "Warranty coverage varies by product and manufacturer. Check the product information or contact sales@sourceasia.co.in before ordering for the applicable product details.",
  },
  {
    id: "faq-7",
    category: "Account & Login",
    question: "How can I update my business delivery address or company details?",
    answer:
      "Google sign-in is available, but address-book and profile editing are not yet supported. Contact sales@sourceasia.co.in to request an update to business or delivery details.",
  },
];

const CATEGORIES = [
  {
    id: "orders",
    title: "Orders & Delivery",
    description: "Track shipments, delivery timelines, freight charges & order cancellations.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13" rx="2" />
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
    tag: "Orders",
  },
  {
    id: "returns",
    title: "Returns & Refunds",
    description: "Return guidelines, damaged item replacement & refund processing.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1 4 1 10 7 10" />
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
      </svg>
    ),
    tag: "Returns",
  },
  {
    id: "products",
    title: "Product Support",
    description: "Technical datasheets, user manuals, warranty specs & compatibility.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
    tag: "Product",
  },
  {
    id: "payments",
    title: "Payments & Invoicing",
    description: "GST tax invoices, payment gateways, NEFT/RTGS & credit options.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    ),
    tag: "Payments",
  },
  {
    id: "account",
    title: "Account & Login",
    description: "Profile management, company addresses, security & password reset.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    tag: "Account",
  },
  {
    id: "b2b",
    title: "Bulk / B2B Orders",
    description: "Custom quotations, RFQs, volume pricing tiers & corporate accounts.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21h18" />
        <path d="M3 7v14" />
        <path d="M13 3v18" />
        <path d="M21 11v10" />
        <path d="M7 11h2" />
        <path d="M7 15h2" />
        <path d="M17 15h2" />
      </svg>
    ),
    tag: "B2B",
  },
];

export default function SupportClient() {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFaq, setExpandedFaq] = useState<string | null>("faq-1");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filteredFaqs = FAQS.filter((faq) => {
    const matchesSearch =
      searchQuery.trim() === "" ||
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.category.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      !selectedCategory || faq.category.toLowerCase().includes(selectedCategory.toLowerCase());

    return matchesSearch && matchesCategory;
  });

  const toggleFaq = (id: string) => {
    setExpandedFaq((prev) => (prev === id ? null : id));
  };

  return (
    <div className="support-client">
      {/* Hero & Search Header */}
      <section className="support-hero">
        <PageContainer className="support-hero__inner">
          <div className="support-hero__badge">
            <span className="support-hero__badge-dot"></span>
            SOURCE ASIA HELP CENTER
          </div>
          <h1 className="support-hero__title">How can we help you?</h1>
          <p className="support-hero__subtitle">
            Search our knowledge base or browse help topics below for instant assistance with hardware products and orders.
          </p>

          {/* Main Search Input */}
          <div className="support-search-wrap">
            <svg
              className="support-search-icon"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="support-search-input"
              placeholder="Search for help, products, orders, returns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search help center"
            />
            {searchQuery && (
              <button
                className="support-search-clear"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
              >
                &times;
              </button>
            )}
          </div>

          {/* Quick Filter Pills */}
          <div className="support-quick-pills">
            <span className="support-pills-label">Quick topics:</span>
            {["Track Order", "GST Invoice", "Returns", "B2B Quote"].map((pill) => (
              <button
                key={pill}
                type="button"
                className={`support-pill ${searchQuery.toLowerCase() === pill.toLowerCase() ? "support-pill--active" : ""}`}
                onClick={() => setSearchQuery(pill === searchQuery ? "" : pill)}
              >
                {pill}
              </button>
            ))}
          </div>
        </PageContainer>
      </section>

      {/* Prominent CTA Actions Banner */}
      <section className="support-actions-bar">
        <PageContainer className="support-actions-grid">
          <div className="support-action-card">
            <div className="support-action-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </div>
            <div className="support-action-body">
              <h3>Contact Support</h3>
              <p>Speak or email with our dedicated hardware technical team.</p>
              <a href="#contact-us" className="support-action-btn support-action-btn--primary">
                <span>Get in Touch</span>
                <span className="support-btn-arrow">&darr;</span>
              </a>
            </div>
          </div>

          <div className="support-action-card">
            <div className="support-action-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="15" height="13" rx="2" />
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
            </div>
            <div className="support-action-body">
              <h3>Track Order</h3>
              <p>Review shipment tracking details shared after dispatch.</p>
              <a href="#track-order" className="support-action-btn support-action-btn--secondary">
                <span>Track Shipment</span>
                <span className="support-btn-arrow">&darr;</span>
              </a>
            </div>
          </div>

          <div className="support-action-card">
            <div className="support-action-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            </div>
            <div className="support-action-body">
              <h3>Browse Products</h3>
              <p>Explore our catalog of tools, machinery & hardware.</p>
              <Link href="/store" className="support-action-btn support-action-btn--outline">
                <span>Visit Store</span>
                <span className="support-btn-arrow">&rarr;</span>
              </Link>
            </div>
          </div>
        </PageContainer>
      </section>

      {/* Support Categories Section */}
      <section className="support-section">
        <PageContainer>
          <div className="support-section-header">
            <span className="support-eyebrow">HELP CATEGORIES</span>
            <h2>Explore Help Topics</h2>
            <p>Select a category to view specific guidance and FAQs.</p>
          </div>

          <div className="support-categories-grid">
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.title;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={`support-cat-card ${isSelected ? "support-cat-card--selected" : ""}`}
                  onClick={() => {
                    setSelectedCategory(isSelected ? null : cat.title);
                    const faqEl = document.getElementById("faqs");
                    if (faqEl) {
                      faqEl.scrollIntoView({ behavior: "smooth" });
                    }
                  }}
                >
                  <div className="support-cat-header">
                    <div className="support-cat-icon">{cat.icon}</div>
                    <span className="support-cat-arrow" aria-hidden="true">&rarr;</span>
                  </div>
                  <h3 className="support-cat-title">{cat.title}</h3>
                  <p className="support-cat-desc">{cat.description}</p>
                </button>
              );
            })}
          </div>
        </PageContainer>
      </section>

      {/* Shipment tracking details are shared after dispatch. */}
      <section id="track-order" className="support-section support-section--accent">
        <PageContainer>
          <div className="support-track-box">
            <div className="support-track-info">
              <span className="support-eyebrow">AFTER DISPATCH</span>
              <h2>Shipment tracking</h2>
              <p>Tracking details are provided after dispatch. Live tracking is not available in this help center yet.</p>
            </div>
            <a className="support-track-btn" href="mailto:sales@sourceasia.co.in?subject=Shipment%20tracking%20request">Contact support</a>
          </div>
        </PageContainer>
      </section>

      {/* Expandable FAQs Section */}
      <section id="faqs" className="support-section">
        <PageContainer>
          <div className="support-section-header">
            <span className="support-eyebrow">FAQS</span>
            <h2>Frequently Asked Questions</h2>
            <p>
              {selectedCategory
                ? `Showing questions for "${selectedCategory}"`
                : "Quick answers to common questions about hardware products & business orders."}
            </p>
            {selectedCategory && (
              <button
                type="button"
                className="support-reset-cat-btn"
                onClick={() => setSelectedCategory(null)}
              >
                Show all categories &times;
              </button>
            )}
          </div>

          <div className="support-faq-list">
            {filteredFaqs.length === 0 ? (
              <div className="support-faq-empty">
                <p>No matching questions found for &quot;{searchQuery}&quot;.</p>
                <button
                  type="button"
                  className="support-action-btn support-action-btn--primary"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory(null);
                  }}
                >
                  Clear search filters
                </button>
              </div>
            ) : (
              filteredFaqs.map((faq) => {
                const isOpen = expandedFaq === faq.id;
                return (
                  <div key={faq.id} className={`support-faq-card ${isOpen ? "support-faq-card--open" : ""}`}>
                    <button
                      type="button"
                      className="support-faq-question"
                      onClick={() => toggleFaq(faq.id)}
                      aria-expanded={isOpen}
                    >
                      <span className="support-faq-q-text">{faq.question}</span>
                      <span className="support-faq-badge">{faq.category}</span>
                      <span className="support-faq-chevron" aria-hidden="true">
                        {isOpen ? "−" : "+"}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="support-faq-answer">
                        <p>{faq.answer}</p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </PageContainer>
      </section>

      {/* Contact Us Section */}
      <section id="contact-us" className="support-section support-section--contact">
        <PageContainer>
          <div className="support-section-header support-section-header--center">
            <span className="support-eyebrow">REACH OUT</span>
            <h2>Still need help? Contact Us</h2>
            <p>Our customer service and B2B technical specialists are standing by.</p>
          </div>

          <div className="support-contact-grid">
            {/* Email Support Card */}
            <div className="support-contact-card">
              <div className="support-contact-icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <h3>Email Support</h3>
              <p>For general inquiries, order updates & documentation requests.</p>
              <div className="support-contact-detail">sales@sourceasia.co.in</div>
              <a href="mailto:sales@sourceasia.co.in" className="support-contact-cta">
                <span>Send an Email</span>
                <span className="support-btn-arrow">&rarr;</span>
              </a>
            </div>

            {/* Phone Support Card */}
            <div className="support-contact-card">
              <div className="support-contact-icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <h3>Phone Support</h3>
              <p>Speak directly with our technical support team during business hours.</p>
              <div className="support-contact-detail">+91 98442 23703</div>
              <a href="tel:+919844223703" className="support-contact-cta">
                <span>Call Us Now</span>
                <span className="support-btn-arrow">&rarr;</span>
              </a>
            </div>

            {/* B2B / Bulk Enquiry Card */}
            <div className="support-contact-card">
              <div className="support-contact-icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              </div>
              <h3>B2B / Bulk Enquiry</h3>
              <p>Ask the Source Asia team about a bulk order or product quote.</p>
              <div className="support-contact-detail">sales@sourceasia.co.in</div>
              <a href="mailto:sales@sourceasia.co.in?subject=B2B%20Bulk%20Order%20Enquiry" className="support-contact-cta">
                <span>Request B2B Quote</span>
                <span className="support-btn-arrow">&rarr;</span>
              </a>
            </div>
          </div>
          <section className="support-ticket-panel" aria-labelledby="support-ticket-title">
            <h3 id="support-ticket-title">Submit a support request</h3>
            <p>Include your order reference and supporting details where applicable.</p>
            <SupportTicketForm />
          </section>
        </PageContainer>
      </section>
    </div>
  );
}
