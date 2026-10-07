export interface EcommerceCategory {
  name: string;
  types: string[];
  description: string;
  imageUrl: string;
  imageSource: string;
}

export const CATEGORY_IMAGE_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' fill='%23f2f6f3'%3E%3Crect width='100%25' height='100%25'/%3E%3Cpath d='M150 150h100v100H150z' fill='%23d0ded3'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2358685d' font-family='sans-serif' font-size='14'%3EImage Unavailable%3C/text%3E%3C/svg%3E";

export const ECOMMERCE_CATEGORIES: EcommerceCategory[] = [
  {
    name: "Raspberry Pi",
    types: ["Raspberry Pi Boards", "Raspberry Pi Kits", "Raspberry Pi Accessories"],
    description: "Browse Raspberry Pi boards, kits, and accessories.",
    imageUrl: "/images/products/raspberry-pi-4-model-b-1gb.png",
    imageSource: "https://www.raspberrypi.com/products/raspberry-pi-4-model-b/",
  },
  {
    name: "SD Cards",
    types: ["SD Cards", "microSD Cards", "SD Card Adapters"],
    description: "Browse SD cards, microSD cards, and card adapters.",
    imageUrl: "/images/categories/sd-cards.jpg",
    imageSource: "https://commons.wikimedia.org/wiki/File:SDHC_memory_card_-_8GB.jpeg (public domain)",
  },
  {
    name: "Power Supplies",
    types: ["AC Adapters", "DC Power Supplies", "USB Power Supplies", "Power Adapters", "Power Cables"],
    description: "Browse power supplies, adapters, and power cables.",
    imageUrl: "/images/categories/power-adapter.jpg",
    imageSource: "https://commons.wikimedia.org/wiki/File:Notebook-Computer-AC-Adapter.jpg (public domain)",
  },
  {
    name: "Clips",
    types: ["Strapping Clips", "Cable Clips", "Retaining Clips", "Fastening Clips"],
    description: "Browse strapping, cable, retaining, and fastening clips.",
    imageUrl: "/images/categories/strapping-clips.jpg",
    imageSource: "High quality industrial metal strapping clips photo.",
  },
  {
    name: "Stickers",
    types: ["Product Labels", "Barcode Labels", "Warning Stickers", "Industrial Stickers"],
    description: "Browse product labels and industrial stickers.",
    imageUrl: "/images/categories/industrial-labels.jpg",
    imageSource: "https://www.pexels.com/photo/printed-iso-certification-coupons-12324202/ (Pexels License)",
  },
  {
    name: "Handtools",
    types: ["Screwdrivers", "Pliers", "Cutters", "Wrenches", "Hex Keys", "Hand Tool Sets"],
    description: "Browse hand tools including screwdrivers, pliers, cutters, and wrenches.",
    imageUrl: "/images/categories/hand-tools.jpg",
    imageSource: "https://commons.wikimedia.org/wiki/File:Hand-tool_set_with_bits_and_accessories_arranged_on_a_white_surface..jpg (CC0)",
  },
  {
    name: "Loctites",
    types: ["Threadlockers", "Retaining Compounds", "Thread Sealants", "Structural Adhesives"],
    description: "Browse threadlockers, retaining compounds, sealants, and adhesives.",
    imageUrl: "/images/categories/loctite-adhesive.jpg",
    imageSource: "High quality industrial threadlocker adhesive product photo.",
  },
  {
    name: "Stretch Film",
    types: ["Hand Stretch Film", "Machine Stretch Film", "Pre-Stretch Film", "Stretch Film Rolls"],
    description: "Browse stretch film products for packaging and load securing.",
    imageUrl: "/images/categories/stretch-film.jpg",
    imageSource: "High quality transparent stretch film roll product photo.",
  },
  {
    name: "Tapes",
    types: ["Packaging Tape", "Double-Sided Tape", "Electrical Tape", "PTFE Tape", "Masking Tape", "Industrial Adhesive Tape"],
    description: "Browse packaging, electrical, masking, and industrial tapes.",
    imageUrl: "/images/categories/packaging-tape.jpg",
    imageSource: "https://www.pexels.com/photo/packing-tape-gun-on-carton-box-4246111/ (Pexels License)",
  },
  {
    name: "Gloves",
    types: ["Cotton Gloves", "Nitrile Gloves", "Latex Gloves", "Cut-Resistant Gloves", "Safety Gloves"],
    description: "Browse gloves for general handling and safety applications.",
    imageUrl: "/images/categories/safety-gloves.jpg",
    imageSource: "High quality heavy duty nitrile safety gloves photo.",
  },
  {
    name: "Hook Up Wires",
    types: ["Single-Core Wires", "PVC Hook-Up Wires", "Flexible Hook-Up Wires", "Electronic Hook-Up Wires"],
    description: "Browse hook-up wire products for electrical and electronic connections.",
    imageUrl: "/images/categories/hookup-wires.jpg",
    imageSource: "High quality electrical hook up wire spools photo.",
  },
  {
    name: "Office Supplies",
    types: ["Pens", "Notebooks", "Files & Folders", "Markers", "Labels", "Stationery"],
    description: "Browse office stationery and supplies.",
    imageUrl: "/images/categories/office-stationery.jpg",
    imageSource: "https://www.pexels.com/photo/stationery-and-coffee-on-white-background-6193132/ (Pexels License)",
  },
];

export const ECOMMERCE_CATEGORY_NAMES = ECOMMERCE_CATEGORIES.map(({ name }) => name);

export const ECOMMERCE_CATEGORY_BY_NAME = new Map(
  ECOMMERCE_CATEGORIES.map((category) => [category.name, category])
);

export function getEcommerceTypeImage(categoryName: string): string {
  return ECOMMERCE_CATEGORY_BY_NAME.get(categoryName)?.imageUrl ?? CATEGORY_IMAGE_FALLBACK;
}

export const ECOMMERCE_SUBCATEGORY_NAMES = ECOMMERCE_CATEGORIES.flatMap(
  ({ types }) => types
);

interface ProductTaxonomy {
  category: string;
  subcategory?: string;
}

const PRODUCT_TAXONOMY_BY_SKU: Record<string, ProductTaxonomy> = {
  "RAS-5CFC": { category: "Raspberry Pi", subcategory: "Raspberry Pi Boards" },
  "SDC-0EWH": { category: "SD Cards", subcategory: "SD Cards" },
  "POW-3A7U": { category: "Power Supplies", subcategory: "Power Cables" },
  "STR-4DU5": { category: "Clips", subcategory: "Strapping Clips" },
  "2IN-SZFQ": { category: "Tapes" },
  "STR-IRMW": { category: "Stretch Film", subcategory: "Stretch Film Rolls" },
  "CAB-TI5V": { category: "" },
};

const PRODUCT_TAXONOMY_BY_ID: Record<string, ProductTaxonomy> = {
  "a6a265e0-06c7-4e61-a580-fb9bbeb45058": PRODUCT_TAXONOMY_BY_SKU["RAS-5CFC"],
  "3a0e9eb4-6061-4cf0-9d10-0266df8d77db": PRODUCT_TAXONOMY_BY_SKU["SDC-0EWH"],
  "31d4829a-d4cb-4397-adf1-445d2c9329c5": PRODUCT_TAXONOMY_BY_SKU["POW-3A7U"],
  "409ee97f-b48d-4c66-b31e-4664032f08bd": PRODUCT_TAXONOMY_BY_SKU["STR-4DU5"],
  "93486f65-bce2-4218-936a-d63ce944c167": PRODUCT_TAXONOMY_BY_SKU["2IN-SZFQ"],
  "6058ff33-076c-4f0f-ab66-fed20c90de6e": PRODUCT_TAXONOMY_BY_SKU["STR-IRMW"],
  "f5d7dc56-6eed-436b-bdfc-e7e5cac5effb": PRODUCT_TAXONOMY_BY_SKU["CAB-TI5V"],
};

export function getEcommerceProductTaxonomy(
  id: string,
  sku: string
): ProductTaxonomy | undefined {
  return PRODUCT_TAXONOMY_BY_ID[id] ?? PRODUCT_TAXONOMY_BY_SKU[sku];
}
