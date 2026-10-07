import Image from "next/image";
import { TextLink } from "../ui";
import HeroVideo from "./HeroVideo";

const heroPoster =
  "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=2200&q=88";
export default function Hero() {
  return (
    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-hero__media" aria-hidden="true">
        <Image
          className="landing-hero__poster"
          fill
          priority
          sizes="100vw"
          src={heroPoster}
          alt=""
        />
        <HeroVideo poster={heroPoster} />
        <div className="landing-hero__veil" />
      </div>

      <div className="landing-hero__content">
        <span className="landing-hero__eyebrow">Source Asia Direct</span>
        <h1 id="landing-title">
          Source Asia products,
          <br />
          ordered with clarity.
        </h1>
        <p>
          Browse products for your business, review clear product information,
          and build an order through the Source Asia store.
        </p>
        <div className="landing-hero__actions">
          <TextLink className="hero-action hero-action--primary" href="/store">
            Explore Products <span aria-hidden="true">&rarr;</span>
          </TextLink>
          <TextLink
            className="hero-action hero-action--secondary"
            href="/support"
          >
            Need Support?
          </TextLink>
        </div>
      </div>

      <div className="landing-hero__index" aria-hidden="true">
        <span>Industrial supply</span>
        <span>01 / Source Asia</span>
      </div>
    </section>
  );
}
