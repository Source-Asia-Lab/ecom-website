"use client";

import { useState } from "react";
import Link from "next/link";
import { PageContainer } from "../ui";
import SectionHeading from "./SectionHeading";

interface Step {
  id: string;
  number: string;
  title: string;
  description: string;
  detail: string;
  linkText?: string;
  linkHref?: string;
  iconSvg: React.ReactNode;
}

const STEPS: Step[] = [
  {
    id: "step-1",
    number: "01",
    title: "Browse products",
    description: "Search through our catalog of industrial components, raw materials, fasteners, and electronics.",
    detail: "Filter by technical category, SKU, stock availability, or specification. Real-time pricing and stock indicators help you make fast sourcing decisions.",
    linkText: "Browse Store Catalog",
    linkHref: "/store",
    iconSvg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    id: "step-2",
    number: "02",
    title: "Build your order",
    description: "Select product quantities, view volume pricing tiers, and add items directly to your company cart.",
    detail: "Custom order quantities and live stock calculations ensure your business order is accurate before checking out.",
    linkText: "View Shopping Cart",
    linkHref: "/cart",
    iconSvg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
    ),
  },
  {
    id: "step-3",
    number: "03",
    title: "Enter company details",
    description: "Provide your registered business name, tax GST/VAT information, and delivery address.",
    detail: "Save business profiles for one-click checkout, automated tax invoicing, and corporate compliance documentation.",
    iconSvg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    id: "step-4",
    number: "04",
    title: "Review payment options",
    description: "Choose flexible payment methods including corporate credit terms, bank transfers, or card payments.",
    detail: "Secure checkout supporting net payment terms, pro-forma invoices, and instant digital transaction receipts.",
    iconSvg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
  {
    id: "step-5",
    number: "05",
    title: "Receive order confirmation",
    description: "Get instant email confirmation, downloadable tax invoice, and live dispatch tracking details.",
    detail: "Dedicated account manager support and end-to-end shipment notifications from warehouse dispatch to delivery.",
    iconSvg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
  },
];

export default function ProcessFlowSection() {
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  const activeStep = STEPS[activeStepIndex];

  return (
    <section className="checkout-flow process-interactive-section" aria-labelledby="checkout-flow-title">
      <PageContainer className="checkout-flow__inner">
        <SectionHeading
          eyebrow="A straightforward process"
          title="From product search to order confirmation."
          description="A simple overview of the business purchasing journey."
          id="checkout-flow-title"
        />

        {/* Progress Bar Header */}
        <div className="process-progress-track" role="progressbar" aria-valuenow={activeStepIndex + 1} aria-valuemin={1} aria-valuemax={5}>
          <div
            className="process-progress-fill"
            style={{ width: `${((activeStepIndex + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Interactive Step Items */}
        <ol className="checkout-steps process-steps-interactive">
          {STEPS.map((step, idx) => {
            const isActive = idx === activeStepIndex;
            return (
              <li
                key={step.id}
                className={`process-step-item${isActive ? " process-step-item--active" : ""}`}
                onClick={() => setActiveStepIndex(idx)}
                onMouseEnter={() => setActiveStepIndex(idx)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setActiveStepIndex(idx);
                  }
                }}
                aria-selected={isActive}
              >
                <div className="process-step-header">
                  <span className="process-step-number">{step.number}</span>
                  {isActive && <span className="process-active-pill">Active</span>}
                </div>
                <h3>{step.title}</h3>
              </li>
            );
          })}
        </ol>

        {/* Interactive Detail Box */}
        <div className="process-detail-card" key={activeStep.id}>
          <div className="process-detail-header-row">
            <div className="process-detail-icon-wrap">{activeStep.iconSvg}</div>
            <div className="process-detail-badge">
              Step {activeStep.number} of 05
            </div>
          </div>

          <div className="process-detail-content">
            <h4 className="process-detail-title">{activeStep.title}</h4>
            <p className="process-detail-desc">{activeStep.description}</p>
            <p className="process-detail-extra">{activeStep.detail}</p>
            {activeStep.linkText && activeStep.linkHref && (
              <Link href={activeStep.linkHref} className="process-detail-cta">
                <span>{activeStep.linkText}</span>
                <span aria-hidden="true">&rarr;</span>
              </Link>
            )}
          </div>

          {/* Quick step switcher controls */}
          <div className="process-nav-buttons">
            <button
              type="button"
              className="process-nav-btn"
              disabled={activeStepIndex === 0}
              onClick={(e) => {
                e.stopPropagation();
                if (activeStepIndex > 0) setActiveStepIndex(activeStepIndex - 1);
              }}
              aria-label="Previous step"
              title="Previous step"
            >
              &larr; Previous
            </button>
            <button
              type="button"
              className="process-nav-btn process-nav-btn--next"
              disabled={activeStepIndex === STEPS.length - 1}
              onClick={(e) => {
                e.stopPropagation();
                if (activeStepIndex < STEPS.length - 1) setActiveStepIndex(activeStepIndex + 1);
              }}
              aria-label="Next step"
              title="Next step"
            >
              Next &rarr;
            </button>
          </div>
        </div>
      </PageContainer>
    </section>
  );
}
