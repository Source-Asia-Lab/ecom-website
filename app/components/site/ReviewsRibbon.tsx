const placeholderReviews = [
  {
    id: "rev-01",
    name: "Rajesh Kumar",
    company: "Apex Precision Tools, Bangalore",
    rating: 5,
    text: "Consistently reliable supplier for our industrial manufacturing line. High material accuracy and prompt dispatch.",
    tag: "Verified B2B Buyer",
  },
  {
    id: "rev-02",
    name: "Anita Deshmukh",
    company: "Global Logistics & Packaging",
    rating: 5,
    text: "The bulk packaging quality matches international standards. Order tracking and communication are effortless.",
    tag: "Enterprise Customer",
  },
  {
    id: "rev-03",
    name: "Vikram Sengupta",
    company: "Kolkata Heavy Engineering",
    rating: 5,
    text: "Clear transparent pricing in INR with zero surprise costs. Bulk ordering through Source Asia saved us significant time.",
    tag: "Verified B2B Buyer",
  },
  {
    id: "rev-04",
    name: "Meera Nair",
    company: "Southern Textile Mills, Coimbatore",
    rating: 5,
    text: "Exceptional quality control and stock transparency. Highly recommended for industrial sourcing requirements.",
    tag: "Manufacturing Client",
  },
  {
    id: "rev-05",
    name: "Sanjay Patel",
    company: "Gujarat Polymer Solutions",
    rating: 5,
    text: "Fast delivery timelines to tier-2 industrial clusters. Outstanding customer support throughout the fulfillment cycle.",
    tag: "Verified B2B Buyer",
  },
];

export default function ReviewsRibbon() {
  return (
    <section className="reviews-section" aria-labelledby="reviews-title">
      <div className="reviews-section__container">
        <div className="reviews-section__heading">
          <p className="section-heading__eyebrow">CLIENT FEEDBACK</p>
          <h2 id="reviews-title">Trusted by Industrial & B2B Partners</h2>
          <p className="reviews-section__subtitle">
            Development placeholders for visual reference. Replace with verified Source Asia client feedback before final release.
          </p>
        </div>

        <div className="reviews-ribbon__viewport" aria-label="Customer review cards carousel">
          <div className="reviews-ribbon__track">
            {[0, 1].map((copyIndex) => (
              <div
                className="reviews-ribbon__group"
                key={copyIndex}
                aria-hidden={copyIndex === 1}
              >
                {placeholderReviews.map((review) => (
                  <article
                    className="review-card"
                    key={`${copyIndex}-${review.id}`}
                  >
                    <div className="review-card__header">
                      <div className="review-card__rating" aria-label={`${review.rating} out of 5 stars`}>
                        {"★".repeat(review.rating)}
                      </div>
                      <span className="review-card__badge">
                        Development Placeholder
                      </span>
                    </div>

                    <p className="review-card__text">"{review.text}"</p>

                    <div className="review-card__author">
                      <div className="review-card__avatar">
                        {review.name.charAt(0)}
                      </div>
                      <div className="review-card__meta">
                        <strong className="review-card__name">{review.name}</strong>
                        <span className="review-card__company">{review.company}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

