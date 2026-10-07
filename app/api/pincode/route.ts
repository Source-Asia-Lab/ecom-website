import { NextRequest, NextResponse } from "next/server";

export interface PostalResult {
  pincode: string;
  postOffice: string;
  district: string;
  state: string;
}

// Common prefix mappings for major Indian cities to enable partial prefix search
const PREFIX_CITY_MAP: Record<string, string> = {
  "110": "Delhi",
  "122": "Gurgaon",
  "141": "Ludhiana",
  "160": "Chandigarh",
  "201": "Noida",
  "208": "Kanpur",
  "226": "Lucknow",
  "302": "Jaipur",
  "380": "Ahmedabad",
  "390": "Vadodara",
  "395": "Surat",
  "400": "Mumbai",
  "403": "Goa",
  "411": "Pune",
  "452": "Indore",
  "462": "Bhopal",
  "500": "Hyderabad",
  "520": "Vijayawada",
  "530": "Visakhapatnam",
  "560": "Bangalore",
  "600": "Chennai",
  "625": "Madurai",
  "641": "Coimbatore",
  "682": "Kochi",
  "695": "Trivandrum",
  "700": "Kolkata",
  "751": "Bhubaneswar",
  "781": "Guwahati",
  "800": "Patna",
  "834": "Ranchi",
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() || "";

    if (!query) {
      return NextResponse.json({ status: "ERROR", error: "Query parameter required", results: [] }, { status: 400 });
    }

    // 1. Exact 6-digit Indian PIN Code search
    if (/^[1-9][0-9]{5}$/.test(query)) {
      const response = await fetch(`https://api.postalpincode.in/pincode/${query}`, {
        next: { revalidate: 86400 }, // Cache for 24 hours
      });

      if (!response.ok) {
        return NextResponse.json({ status: "ERROR", error: "Postal service error", results: [] }, { status: 502 });
      }

      const data = await response.json();
      const firstGroup = data?.[0];

      if (firstGroup?.Status === "Success" && Array.isArray(firstGroup.PostOffice) && firstGroup.PostOffice.length > 0) {
        const seen = new Set<string>();
        const results: PostalResult[] = [];

        for (const po of firstGroup.PostOffice) {
          const key = `${po.Pincode}-${po.Name}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push({
              pincode: po.Pincode,
              postOffice: po.Name,
              district: po.District || po.Division || "",
              state: po.State || po.Circle || "",
            });
          }
        }

        return NextResponse.json({ status: "OK", results: results.slice(0, 15) });
      }

      return NextResponse.json({ status: "NOT_FOUND", results: [] });
    }

    // 2. Partial PIN Code search (3 to 5 digits)
    if (/^\d{3,5}$/.test(query)) {
      const prefix = query.slice(0, 3);
      const targetCity = PREFIX_CITY_MAP[prefix] || "Bangalore";

      const response = await fetch(`https://api.postalpincode.in/postoffice/${targetCity}`, {
        next: { revalidate: 86400 },
      });

      if (response.ok) {
        const data = await response.json();
        const firstGroup = data?.[0];

        if (firstGroup?.Status === "Success" && Array.isArray(firstGroup.PostOffice)) {
          const filtered = firstGroup.PostOffice.filter((po: any) => po.Pincode && po.Pincode.startsWith(query));
          const seen = new Set<string>();
          const results: PostalResult[] = [];

          for (const po of filtered) {
            if (!seen.has(po.Pincode)) {
              seen.add(po.Pincode);
              results.push({
                pincode: po.Pincode,
                postOffice: po.Name,
                district: po.District || po.Division || "",
                state: po.State || po.Circle || "",
              });
            }
          }

          if (results.length > 0) {
            return NextResponse.json({ status: "OK", results: results.slice(0, 15) });
          }
        }
      }

      return NextResponse.json({ status: "NOT_FOUND", results: [] });
    }

    // 3. Location / City / Post Office Name search (3+ letters)
    if (query.length >= 3 && /^[a-zA-Z\s.-]+$/.test(query)) {
      const response = await fetch(`https://api.postalpincode.in/postoffice/${encodeURIComponent(query)}`, {
        next: { revalidate: 86400 },
      });

      if (!response.ok) {
        return NextResponse.json({ status: "ERROR", error: "Postal service error", results: [] }, { status: 502 });
      }

      const data = await response.json();
      const firstGroup = data?.[0];

      if (firstGroup?.Status === "Success" && Array.isArray(firstGroup.PostOffice) && firstGroup.PostOffice.length > 0) {
        const seen = new Set<string>();
        const results: PostalResult[] = [];

        for (const po of firstGroup.PostOffice) {
          const key = `${po.Pincode}-${po.Name}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push({
              pincode: po.Pincode,
              postOffice: po.Name,
              district: po.District || po.Division || "",
              state: po.State || po.Circle || "",
            });
          }
        }

        return NextResponse.json({ status: "OK", results: results.slice(0, 15) });
      }

      return NextResponse.json({ status: "NOT_FOUND", results: [] });
    }

    // Invalid format or query too short
    return NextResponse.json({ status: "NOT_FOUND", results: [] });
  } catch (error) {
    console.error("Pincode API route error:", error);
    return NextResponse.json(
      { status: "ERROR", error: "Unable to load PIN code information. Please try again.", results: [] },
      { status: 500 }
    );
  }
}
