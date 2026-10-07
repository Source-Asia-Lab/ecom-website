"use client";

import { useState } from "react";
import Link from "next/link";
import { PageContainer } from "../ui";

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
      "Once your order is dispatched, you will receive an SMS and email notification containing your tracking number and logistics partner link. You can also use our Track Order tool on this page by entering your Order ID.",
  },
  {
    id: "faq-2",
    category: "Payments & Invoicing",
    question: "How can I get a GST tax invoice for my business purchase?",
    answer:
      "All orders processed on Source Asia automatically generate a GST-compliant tax invoice. Your invoice is emailed to your registered address upon dispatch, and can also be requested via sales@sourceasia.co.in by quoting your Order ID.",
  },
  {
    id: "faq-3",
    category: "Returns & Refunds",
    question: "What is the return policy for industrial tools & equipment?",
    answer:
      "We offer a 7-day return policy for unused hardware items in their original sealed packaging. If you receive a damaged, defective, or incorrect product, please notify customer support within 48 hours for immediate replacement or full refund.",
  },
  {
    id: "faq-4",
    category: "Bulk / B2B Orders",
    question: "Do you offer bulk discounts or custom quotes for large orders?",
    answer:
      "Yes! For bulk procurement or corporate orders, our B2B team provides tiered volume discounts and formal RFQ quotations. Reach out through our B2B contact card or email b2b@sourceasia.co.in.",
  },
  {
    id: "faq-5",
    category: "Payments & Invoicing",
    question: "What payment methods are accepted on Source Asia?",
    answer:
      "We accept Credit & Debit Cards (Visa, Mastercard, RuPay), Net Banking across major banks, UPI (GPay, PhonePe, Paytm), NEFT/RTGS transfers for B2B orders, and Cash on Delivery for eligible pincodes.",
  },
  {
    id: "faq-6",
    category: "Product Support",
    question: "What warranty coverage comes with power tools and machinery?",
    answer:
      "All power tools, heavy machinery, and electrical equipment sold on Source Asia carry standard manufacturer warranties (ranging from 6 to 24 months). Warranty details are listed on each product specification sheet.",
  },
  {
    id: "faq-7",
    category: "Account & Login",
    question: "How can I update my business delivery address or company details?",
    answer:
      "Log into your Source Asia account and navigate to Account Settings > Address Book. You can add multiple delivery locations, warehouse contacts, and updated GST numbers for seamless checkout.",
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
  const [trackOrderInput, setTrackOrderInput] = useState("");
  const [trackStatus, setTrackStatus] = useState<string | null>(null);

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

  const handleTrackOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackOrderInput.trim()) {
      setTrackStatus("Please enter a valid Order ID (e.g., SA-98240).");
      return;
    }
    setTrackStatus(
      `Order ${trackOrderInput.toUpperCase()} is currently in Transit. Expected Delivery: 2-3 Business Days via Express Logistics.`
    );
  };

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
              <p>Get live dispatch status for your pending shipments.</p>
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

      {/* Track Order Quick Tool */}
      <section id="track-order" className="support-section support-section--accent">
        <PageContainer>
          <div className="support-track-box">
            <div className="support-track-info">
              <span className="support-eyebrow">EXPRESS LOGISTICS</span>
              <h2>Track Your Order Status</h2>
              <p>Enter your Source Asia Order ID to check real-time shipping updates.</p>
            </div>
            <form className="support-track-form" onSubmit={handleTrackOrder}>
              <div className="support-track-input-group">
                <input
                  type="text"
                  placeholder="e.g. SA-98240"
                  className="support-track-input"
                  value={trackOrderInput}
                  onChange={(e) => setTrackOrderInput(e.target.value)}
                />
                <button type="submit" className="support-track-btn">
                  Check Status
                </button>
              </div>
              {trackStatus && (
                <div className="support-track-result" role="status">
                  <span className="support-track-status-icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                      <line x1="12" y1="22.08" x2="12" y2="12" />
                    </svg>
                  </span>
                  <p>{trackStatus}</p>
                </div>
              )}
            </form>
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
                <p>No matching questions found for "{searchQuery}".</p>
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
              <div className="support-contact-detail">+91 (800) 123-4567</div>
              <span className="support-contact-hours">Mon – Sat: 9:00 AM – 7:00 PM IST</span>
              <a href="tel:+918001234567" className="support-contact-cta">
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
              <p>Get custom volume pricing, formal RFQ quotes & credit account setup.</p>
              <div className="support-contact-detail">b2b@sourceasia.co.in</div>
              <a href="mailto:b2b@sourceasia.co.in?subject=B2B%20Bulk%20Order%20Enquiry" className="support-contact-cta">
                <span>Request B2B Quote</span>
                <span className="support-btn-arrow">&rarr;</span>
              </a>
            </div>
          </div>
        </PageContainer>
      </section>
    </div>
  );
}
