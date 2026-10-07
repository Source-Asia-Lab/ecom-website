import type { ReactNode } from "react";

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  description?: string;
  aside?: ReactNode;
  id?: string;
}

export default function SectionHeading({
  eyebrow,
  title,
  description,
  aside,
  id,
}: SectionHeadingProps) {
  return (
    <div className="section-heading">
      <div className="section-heading__copy">
        <p className="section-heading__eyebrow">{eyebrow}</p>
        <h2 id={id}>{title}</h2>
        {description && <p className="section-heading__description">{description}</p>}
      </div>
      {aside && <div className="section-heading__aside">{aside}</div>}
    </div>
  );
}
