import Link from "next/link";
import BrandLogo from "./BrandLogo";

export default function SiteFooter() {
  return (
    <footer className="source-footer">
      {/* Decorative Curved Wave Top Boundary */}
      <div className="source-footer__wave-divider" aria-hidden="true">
        <svg
          viewBox="0 0 1440 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
          className="source-footer__wave-svg"
        >
          <path
            d="M0,24 C320,48 640,0 960,32 C1200,52 1360,18 1440,24 L1440,48 L0,48 Z"
            fill="#111a15"
          />
          <path
            d="M0,24 C320,48 640,0 960,32 C1200,52 1360,18 1440,24"
            stroke="#23342b"
            strokeWidth="1.5"
            fill="none"
          />
        </svg>
      </div>

      <div className="source-footer__container">
        <div className="source-footer__grid">
          {/* LEFT COLUMN: Brand & Info */}
          <div className="source-footer__col source-footer__col--brand">
            <Link className="source-footer__logo" href="/" aria-label="Source Asia home">
              <BrandLogo />
            </Link>
            <p className="source-footer__tagline">
              &quot;Sourcing Mind for Manufacturing&quot;
            </p>
            <p className="source-footer__description">
              Streamlining industrial B2B procurement with transparent pricing, verified regional suppliers, and dedicated order support.
            </p>
            <div className="source-footer__socials">
              <a
                href="https://sourceasia.co.in/"
                target="_blank"
                rel="noreferrer"
                className="source-footer__social-link"
                aria-label="Official Website"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                <span>sourceasia.co.in</span>
              </a>
            </div>
          </div>

          {/* MIDDLE COLUMN: Connect With Us */}
          <div className="source-footer__col source-footer__col--contact">
            <h3 className="source-footer__heading">CONNECT WITH US</h3>
            <ul className="source-footer__contact-list">
              <li>
                <a href="mailto:sales@sourceasia.co.in" className="contact-card">
                  <div className="contact-card__icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                  </div>
                  <div className="contact-card__text">
                    <span className="contact-card__label">Email</span>
                    <strong className="contact-card__val">sales@sourceasia.co.in</strong>
                  </div>
                </a>
              </li>
              <li>
                <a href="tel:+919844223703" className="contact-card">
                  <div className="contact-card__icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </div>
                  <div className="contact-card__text">
                    <span className="contact-card__label">Phone</span>
                    <strong className="contact-card__val">+91 98442 23703</strong>
                  </div>
                </a>
              </li>
              <li>
                <div className="contact-card">
                  <div className="contact-card__icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </div>
                  <div className="contact-card__text">
                    <span className="contact-card__label">Location</span>
                    <strong className="contact-card__val">Bangalore, Karnataka, India</strong>
                  </div>
                </div>
              </li>
            </ul>
          </div>

          {/* RIGHT COLUMN: Strategic Partners */}
          <div className="source-footer__col source-footer__col--partners">
            <h3 className="source-footer__heading">STRATEGIC PARTNERS</h3>
            <div className="partner-card">
              <div className="partner-card__badge">ENTERPRISE PARTNER</div>
              <h4 className="partner-card__title">Topline Services</h4>
              <p className="partner-card__desc">
                Strategic fulfillment and supply chain operations partner for Source Asia industrial products across India.
              </p>
            </div>

            <div className="source-footer__quick-nav">
              <h4 className="quick-nav__title">Quick Links</h4>
              <nav className="quick-nav__links">
                <Link href="/">Home</Link>
                <Link href="/store">Products Store</Link>
                <Link href="/support">Support & Help</Link>
              </nav>
            </div>
          </div>
        </div>

        {/* BOTTOM BAR */}
        <div className="source-footer__bottom">
          <p className="source-footer__copyright">
            &copy; {new Date().getFullYear()} Source Asia. All rights reserved. Sourcing Mind for Manufacturing.
          </p>
          <div className="source-footer__legal">
            <Link href="/support">Support</Link>
            <Link href="/store">Catalog</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
