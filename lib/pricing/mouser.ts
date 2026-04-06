const MOUSER_SEARCH_URL =
  "https://api.mouser.com/api/v1/search/keyword";

export interface MouserPartResult {
  mpn: string;
  description: string;
  unit_price: number;
  currency: string;
  in_stock: boolean;
  mouser_pn: string;
  stock_qty: number;
}

export async function searchMouserPrice(
  mpn: string
): Promise<MouserPartResult | null> {
  const apiKey = process.env.MOUSER_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(`${MOUSER_SEARCH_URL}?apiKey=${apiKey}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        SearchByKeywordRequest: {
          keyword: mpn,
          records: 1,
          startingRecord: 0,
          searchOptions: "",
          searchWithYourSignUpLanguage: "",
        },
      }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      SearchResults?: {
        Parts?: Array<{
          ManufacturerPartNumber: string;
          Description: string;
          MouserPartNumber: string;
          Availability: string;
          PriceBreaks?: Array<{
            Quantity: number;
            Price: string;
            Currency: string;
          }>;
        }>;
      };
    };

    const part = data.SearchResults?.Parts?.[0];
    if (!part) return null;

    // Extract best unit price from price breaks
    const priceBreak = part.PriceBreaks?.[0];
    const priceStr = priceBreak?.Price?.replace(/[^0-9.]/g, "") ?? "0";
    const unitPrice = parseFloat(priceStr) || 0;

    // Parse stock quantity from availability string (e.g., "1,234 In Stock")
    const stockMatch = part.Availability?.match(/[\d,]+/);
    const stockQty = stockMatch
      ? parseInt(stockMatch[0].replace(/,/g, ""), 10)
      : 0;

    return {
      mpn: part.ManufacturerPartNumber,
      description: part.Description,
      unit_price: unitPrice,
      currency: priceBreak?.Currency ?? "CAD",
      in_stock: stockQty > 0,
      mouser_pn: part.MouserPartNumber,
      stock_qty: stockQty,
    };
  } catch {
    return null;
  }
}
