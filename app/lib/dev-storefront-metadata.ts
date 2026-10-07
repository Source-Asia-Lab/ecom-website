import type { Product } from "../store/products";

export interface DevStorefrontMetadata {
  category: string;
  subcategory?: string;
  description: string;
  imageSearchKey: string;
}

const DEVELOPMENT_METADATA: Record<string, DevStorefrontMetadata> = {
  "93486f65-bce2-4218-936a-d63ce944c167": {
    category: "Tapes",
    description: "2 inch industrial tape for packaging, bundling, and securing products during transit and storage.",
    imageSearchKey: "2 inch tape",
  },
  "a6a265e0-06c7-4e61-a580-fb9bbeb45058": {
    category: "Raspberry Pi",
    subcategory: "Raspberry Pi Boards",
    description: "Raspberry Pi 4 Model B with 1GB RAM for embedded systems, learning, and prototyping projects.",
    imageSearchKey: "Raspberry Pi 4 Model B 1GB RAM",
  },
  "3a0e9eb4-6061-4cf0-9d10-0266df8d77db": {
    category: "SD Cards",
    subcategory: "SD Cards",
    description: "High-capacity SD card for storage expansion in devices, embedded systems, and data backup workflows.",
    imageSearchKey: "SD Card memory card",
  },
  "409ee97f-b48d-4c66-b31e-4664032f08bd": {
    category: "Clips",
    subcategory: "Strapping Clips",
    description: "Strapping clip designed for secure bundling and reliable cable or component retention.",
    imageSearchKey: "Strapping clip",
  },
  "6058ff33-076c-4f0f-ab66-fed20c90de6e": {
    category: "Stretch Film",
    subcategory: "Stretch Film Rolls",
    description: "Stretch film for pallet wrapping, safe load securing, and protective packaging applications.",
    imageSearchKey: "Stretch film strech film",
  },
  "31d4829a-d4cb-4397-adf1-445d2c9329c5": {
    category: "Power Supplies",
    subcategory: "Power Cables",
    description: "Power cable for reliable electrical connectivity in industrial and general-purpose setups.",
    imageSearchKey: "Power cable",
  },
  "f5d7dc56-6eed-436b-bdfc-e7e5cac5effb": {
    category: "",
    description: "Cable assembly for wired connections and electrical distribution tasks.",
    imageSearchKey: "Cables 23 36",
  },
};

export const devStorefrontMetadata: Record<string, DevStorefrontMetadata> =
  process.env.NODE_ENV === "development" ? DEVELOPMENT_METADATA : {};

export type ProductWithImageSearchKey = Product & { imageSearchKey?: string };

export function applyDevStorefrontMetadata(product: Product): ProductWithImageSearchKey {
  if (process.env.NODE_ENV !== "development") return product;

  const metadata = devStorefrontMetadata[product.id];
  if (!metadata) return product;

  return { ...product, ...metadata };
}