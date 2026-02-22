import { tavily } from "@tavily/core";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function reproduce() {
  if (!TAVILY_API_KEY || !OPENAI_API_KEY) {
    console.error("Missing API keys");
    return;
  }

  const t = tavily({ apiKey: TAVILY_API_KEY });
  const o = new OpenAI({ apiKey: OPENAI_API_KEY });

  const city = "San Francisco";
  console.log(`Searching for ${city}...`);

  try {
    const [foodSearch, cultureSearch] = await Promise.all([
      t.search(`${city} iconic local food dishes must try authentic`, { maxResults: 5, searchDepth: "advanced" }),
      t.search(`${city} food culture history traditional cuisine`, { maxResults: 4, searchDepth: "basic" }),
    ]);

    const context = [
      ...foodSearch.results.map((r) => r.content),
      ...cultureSearch.results.map((r) => r.content),
    ].join("\n\n").slice(0, 5000);

    console.log("Context length:", context.length);

    const completion = await o.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a local food historian, travel guide, and geocoding assistant. Create a one-day taste itinerary for a traveler. Return a JSON object with:
- "centerLat" (number): latitude of the city center
- "centerLng" (number): longitude of the city center
- "stops" (array): each stop has:
  - "timeSlot" (string): one of "Morning Coffee", "Midday Snack", "Dinner", "Late Bites"
  - "timeRange" (string): e.g. "8:00–10:00 AM"
  - "restaurantName" (string): restaurant name
  - "neighborhood" (string): neighborhood or area
  - "dish" (string): the must-order item
  - "dishDescription" (string): 1 sentence plain-English explanation of what it is
  - "culturalContext" (string): 2 sentences on why this dish/place is deeply tied to the city's identity
  - "walkingNote" (string): 1 short sentence on the vibe of the neighborhood
  - "lat" (number): estimated latitude of the restaurant based on city and neighborhood
  - "lng" (number): estimated longitude of the restaurant based on city and neighborhood
  - "imageQuery" (string): a short Unsplash search query for a photo of the dish (e.g. "espresso italian cafe")

Spread the stops geographically across different neighborhoods. Return ONLY valid JSON, no markdown.`,
        },
        {
          role: "user",
          content: `City: ${city}\n\nContext from web:\n${context}\n\nBuild a 4-stop day itinerary (morning, midday, dinner, late).`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
    console.log("Parsed result:", JSON.stringify(parsed, null, 2));

  } catch (err) {
    console.error("Error during reproduction:", err);
  }
}

reproduce();
