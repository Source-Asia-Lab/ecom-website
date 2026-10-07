"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageContainer } from "../ui";

const TYPING_SENTENCES = [
  "Need help with your order?",
  "Have questions about product specifications?",
  "Looking for bulk purchasing & commercial rates?",
  "Need assistance tracking your shipment?",
  "Want to inquire about custom component orders?",
];

interface QuickPill {
  label: string;
  icon: string;
  query: string;
}

const QUICK_PILLS: QuickPill[] = [
  { label: "Order Tracking", icon: "📦", query: "Need assistance tracking your shipment?" },
  { label: "Bulk Quotes", icon: "💼", query: "Looking for bulk purchasing & commercial rates?" },
  { label: "Tech Specs", icon: "⚡", query: "Have questions about product specifications?" },
  { label: "General Enquiry", icon: "💬", query: "Need help with your order?" },
];

export default function InteractiveSupportSection() {
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [typingSpeed, setTypingSpeed] = useState(70);
  const [showModal, setShowModal] = useState(false);
  const [enquirySuccess, setEnquirySuccess] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userMessage, setUserMessage] = useState("");

  // Typewriter effect loop
  useEffect(() => {
    const currentFullSentence = TYPING_SENTENCES[sentenceIndex];

    const timer = setTimeout(() => {
      if (!isDeleting) {
        // Typing forward
        setDisplayText(currentFullSentence.substring(0, displayText.length + 1));
        setTypingSpeed(60);

        if (displayText === currentFullSentence) {
          // Pause at end of sentence
          setTimeout(() => setIsDeleting(true), 2400);
        }
      } else {
        // Deleting backward
        setDisplayText(currentFullSentence.substring(0, displayText.length - 1));
        setTypingSpeed(35);

        if (displayText === "") {
          setIsDeleting(false);
          setSentenceIndex((prev) => (prev + 1) % TYPING_SENTENCES.length);
        }
      }
    }, typingSpeed);

    return () => clearTimeout(timer);
  }, [displayText, isDeleting, sentenceIndex, typingSpeed]);

  const handlePillClick = (queryText: string) => {
    const targetIdx = TYPING_SENTENCES.indexOf(queryText);
    if (targetIdx !== -1) {
      setSentenceIndex(targetIdx);
      setDisplayText(queryText);
      setIsDeleting(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (userEmail.trim()) {
      setEnquirySuccess(true);
      setTimeout(() => {
        setEnquirySuccess(false);
        setShowModal(false);
        setUserEmail("");
        setUserMessage("");
      }, 2500);
    }
  };

  return (
    <section className="landing-support support-interactive-section" aria-labelledby="support-title">
      <PageContainer className="landing-support__inner support-interactive-inner">
        <div className="support-interactive-left">
          <p className="section-heading__eyebrow">HERE TO HELP</p>
          
          {/* Animated Sentence Typing Heading */}
          <h2 id="support-title" className="typing-heading">
            <span className="typing-text">{displayText}</span>
            <span className="typing-cursor" aria-hidden="true">|</span>
          </h2>

          <p className="support-subtext">
            Contact the Source Asia team about products or order enquiries.
          </p>

          {/* Interactive Quick Topic Selector Pills */}
          <div className="support-quick-pills">
            {QUICK_PILLS.map((pill) => (
              <button
                key={pill.label}
                type="button"
                className="support-pill-btn"
                onClick={() => handlePillClick(pill.query)}
              >
                <span>{pill.icon}</span>
                <span>{pill.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="support-interactive-right">
          <button
            type="button"
            className="landing-support__cta support-action-btn"
            onClick={() => setShowModal(true)}
          >
            <span>Contact Support</span>
            <span aria-hidden="true">&rarr;</span>
          </button>
          
          <Link href="/support" className="support-page-link">
            Visit Support Portal
          </Link>
        </div>
      </PageContainer>

      {/* Quick Interactive Contact Modal */}
      {showModal && (
        <div className="support-modal-backdrop" onClick={() => setShowModal(false)}>
          <div
            className="support-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-modal-title"
          >
            <div className="support-modal-header">
              <h3 id="support-modal-title">Contact Support Team</h3>
              <button
                type="button"
                className="support-modal-close"
                onClick={() => setShowModal(false)}
                aria-label="Close dialog"
              >
                &times;
              </button>
            </div>

            {enquirySuccess ? (
              <div className="support-modal-success">
                <span className="success-icon">✓</span>
                <h4>Enquiry Submitted!</h4>
                <p>Our team will contact you shortly regarding: &quot;{displayText}&quot;</p>
              </div>
            ) : (
              <form onSubmit={handleFormSubmit} className="support-modal-form">
                <p className="modal-topic-preview">
                  Topic: <strong>{displayText}</strong>
                </p>

                <div className="modal-form-group">
                  <label htmlFor="support-email">Business Email *</label>
                  <input
                    id="support-email"
                    type="email"
                    required
                    placeholder="name@company.com"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    className="modal-input"
                  />
                </div>

                <div className="modal-form-group">
                  <label htmlFor="support-message">Message Details</label>
                  <textarea
                    id="support-message"
                    rows={3}
                    placeholder="Describe your product or order enquiry..."
                    value={userMessage}
                    onChange={(e) => setUserMessage(e.target.value)}
                    className="modal-input modal-textarea"
                  />
                </div>

                <div className="modal-actions">
                  <button type="button" className="modal-cancel-btn" onClick={() => setShowModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="modal-submit-btn">
                    Send Enquiry
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
