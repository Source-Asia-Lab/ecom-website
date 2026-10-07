import fs from "fs";
import path from "path";

// Curated high quality industrial product image library based on exact model & category specifications
const SPECIFICATION_IMAGE_MAP: Array<{ pattern: RegExp; url: string }> = [
  // Fasteners: Allen Bolts, Hex Bolts, Screws
  {
    pattern: /allen bolt|socket head|shcs|csk socket/i,
    url: "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=600&q=80",
  },
  {
    pattern: /hex bolt|hex screw|thumb screw/i,
    url: "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=600&q=80",
  },
  {
    pattern: /screw|standoff|fastener/i,
    url: "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=600&q=80",
  },

  // Washers & Nuts
  {
    pattern: /spring washer|ss spring washer|ms spring washer/i,
    url: "https://images.unsplash.com/photo-1616401784845-180882ba9ba8?auto=format&fit=crop&w=600&q=80",
  },
  {
    pattern: /flat washer|star washer|washer/i,
    url: "https://images.unsplash.com/photo-1616401784845-180882ba9ba8?auto=format&fit=crop&w=600&q=80",
  },
  {
    pattern: /hex nut|nut\b/i,
    url: "https://images.unsplash.com/photo-1616401784845-180882ba9ba8?auto=format&fit=crop&w=600&q=80",
  },

  // Metals & Sheets
  {
    pattern: /ms sheet|cold rolled|tata make|steel sheet/i,
    url: "https://images.unsplash.com/photo-1535813547-99c456a41d4a?auto=format&fit=crop&w=600&q=80",
  },
  {
    pattern: /ss 316|ss 304|stainless steel sheet|jsw make/i,
    url: "https://images.unsplash.com/photo-1535813547-99c456a41d4a?auto=format&fit=crop&w=600&q=80",
  },

  // Electronic Components
  {
    pattern: /ceramic cap|capacitor|0603|0402|0805|x7r|x5r|np0/i,
    url: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80",
  },
  {
    pattern: /chip resistor|resistor|kohm|ohm/i,
    url: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80",
  },
  {
    pattern: /tvs diode|diode|sod-882|sod-923|sod-523|sot-23/i,
    url: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80",
  },
  {
    pattern: /ferrite bead|inductor/i,
    url: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80",
  },
  {
    pattern: /pcb|breadboard|header male/i,
    url: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80",
  },

  // Electrical & Wiring
  {
    pattern: /cable tie|nylon cable tie/i,
    url: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80",
  },
  {
    pattern: /heat shrink|sleeve/i,
    url: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80",
  },
  {
    pattern: /cooling fan|dc fan|ex fan/i,
    url: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80",
  },
  {
    pattern: /fuse holder|plug|strain relief/i,
    url: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80",
  },

  // Safety Equipment
  {
    pattern: /safety helmet|helmet/i,
    url: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80",
  },
  {
    pattern: /gloves|cut-resistant/i,
    url: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80",
  },
  {
    pattern: /tripod|gas detector|bump test/i,
    url: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80",
  },

  // Tools & Machinery
  {
    pattern: /end mill|tapping bit|insert|seco make|grooving/i,
    url: "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=600&q=80",
  },
  {
    pattern: /grinder|flap wheel|emery/i,
    url: "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=600&q=80",
  },
  {
    pattern: /load cell|bubble level/i,
    url: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80",
  },

  // Packaging & Tapes
  {
    pattern: /bopp tape|tape|double-sided tape/i,
    url: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80",
  },
  {
    pattern: /polybag|poly bag|film|lamination/i,
    url: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80",
  },
];

const CACHE_FILE_PATH = path.join(process.cwd(), "app", "lib", "image-cache.json");

const DEFAULT_FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' fill='%23f2f6f3'%3E%3Crect width='100%25' height='100%25'/%3E%3Cpath d='M150 150h100v100H150z' fill='%23d0ded3'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2358685d' font-family='sans-serif' font-size='14'%3EImage Unavailable%3C/text%3E%3C/svg%3E";

const DEVELOPMENT_PRODUCT_IMAGES: Record<string, string> = {
  "RAS-5CFC": "/images/products/raspberry-pi-4-model-b-1gb.png",
  "SDC-0EWH": "/images/categories/sd-cards.jpg",
  "POW-3A7U": "/images/products/power-chord.jpg",
  "STR-4DU5": "/images/products/strapping-clip.webp",
  "2IN-SZFQ": "/images/categories/packaging-tape.jpg",
  "STR-IRMW": "/images/products/stretch-film.jpg",
  "CAB-TI5V": "/images/products/cables-23-36.jpg",
};

let memoryCache: Record<string, string> = {};

function loadCache(): Record<string, string> {
  if (Object.keys(memoryCache).length > 0) return memoryCache;
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      const data = fs.readFileSync(CACHE_FILE_PATH, "utf8");
      memoryCache = JSON.parse(data);
    }
  } catch (err) {
    console.error("Error loading image cache:", err);
  }
  return memoryCache;
}

function saveCache(cacheData: Record<string, string>) {
  try {
    memoryCache = cacheData;
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cacheData, null, 2));
  } catch (err) {
    console.error("Error saving image cache:", err);
  }
}

/**
 * Resolves high quality product image based on DB image_url or product specification/model
 */
export function resolveProductImage(
  dbImageUrl: string | null,
  productName: string,
  sku: string
): string {
  if (dbImageUrl && dbImageUrl.trim() && dbImageUrl.startsWith("http")) {
    return dbImageUrl.trim();
  }

  if (process.env.NODE_ENV === "development" && DEVELOPMENT_PRODUCT_IMAGES[sku]) {
    return DEVELOPMENT_PRODUCT_IMAGES[sku];
  }

  const cacheKey = `${sku}:${productName}`;
  const cache = loadCache();

  if (cache[cacheKey]) {
    return cache[cacheKey];
  }

  // Search specification image map
  for (const entry of SPECIFICATION_IMAGE_MAP) {
    if (entry.pattern.test(productName) || entry.pattern.test(sku)) {
      cache[cacheKey] = entry.url;
      saveCache(cache);
      return entry.url;
    }
  }

  // Default fallback image
  cache[cacheKey] = DEFAULT_FALLBACK_IMAGE;
  saveCache(cache);
  return DEFAULT_FALLBACK_IMAGE;
}
