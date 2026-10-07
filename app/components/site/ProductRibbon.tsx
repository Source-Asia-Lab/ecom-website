const ribbonItems = [
  "Source Asia Direct",
  "Products Available",
  "B2B orders",
  "GST invoicing",
  "Secure checkout",
  "Direct purchase",
];

export default function ProductRibbon() {
  return (
    <section className="product-ribbon" aria-label="Store highlights">
      <p className="ui-sr-only">
        {ribbonItems.join(". ")}.
      </p>
      <div className="product-ribbon__viewport" aria-hidden="true">
        <div className="product-ribbon__track">
          {[0, 1].map((copy) => (
            <div className="product-ribbon__group" key={copy}>
              {ribbonItems.map((item, index) => (
                <span className="product-ribbon__item" key={item}>
                  {index > 0 && <span className="product-ribbon__dot" />}
                  {item}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
