import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductDetail from "../../components/products/ProductDetail";
import SiteFooter from "../../components/site/SiteFooter";
import SiteHeader from "../../components/site/SiteHeader";
import { getProductBySlugFromDb } from "../../lib/db-products";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlugFromDb(slug);

  return {
    title: product ? `${product.name} | Source Asia` : "Product not found | Source Asia",
    description: product?.description ?? "This product could not be found.",
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlugFromDb(slug);

  if (!product) {
    notFound();
  }

  return (
    <div className="landing-page">
      <SiteHeader currentPage="store" />
      <main>
        <ProductDetail product={product} />
      </main>
      <SiteFooter />
    </div>
  );
}
