import { MCPServer, error, text, widget } from "mcp-use/server";
import { z } from "zod";
import OpenAI from "openai";
import { tavily } from "@tavily/core";
import { parse } from "node-html-parser";

const server = new MCPServer({
  name: "citybites",
  title: "CityBites",
  version: "1.0.0",
  description: "AI travel companion that helps you explore cities through food — find locally representative restaurants, understand dishes, and build a taste itinerary.",
  baseUrl: process.env.MCP_URL || "http://localhost:3000",
  favicon: "favicon.ico",
  websiteUrl: "https://mcp-use.com",
  icons: [
    {
      src: "icon.svg",
      mimeType: "image/svg+xml",
      sizes: ["512x512"],
    },
  ],
});

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}
function getTavily() {
  return tavily({ apiKey: process.env.TAVILY_API_KEY ?? "" });
}

// Simple in-memory cache to avoid redundant API calls
const cache = new Map<string, { data: unknown; expires: number }>();
function getCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) return entry.data as T;
  return null;
}
function setCache(key: string, data: unknown, ttlMs = 10 * 60 * 1000) {
  cache.set(key, { data, expires: Date.now() + ttlMs });
}

// ─── TOOL 1: search-city-food ────────────────────────────────────────────────

server.tool(
  {
    name: "search-city-food",
    description:
      "Search for locally representative restaurants in a city. Returns a visual card grid with restaurant names, neighborhoods, cuisine types, and URLs. Use this as the first step when a user wants food recommendations for a city.",
    schema: z.object({
      city: z.string().describe("The city to search for food in (e.g. 'Tokyo', 'Mexico City', 'Lisbon')"),
    }),
    widget: {
      name: "restaurant-spots",
      invoking: "Searching for local food spots...",
      invoked: "Restaurants found",
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ city }) => {
    if (!process.env.TAVILY_API_KEY) return error("TAVILY_API_KEY not configured.");
    if (!process.env.OPENAI_API_KEY) return error("OPENAI_API_KEY not configured.");

    const cacheKey = `restaurants:${city.toLowerCase()}`;
    const cached = getCache<{ restaurants: Restaurant[] }>(cacheKey);

    let restaurants: Restaurant[];

    if (cached) {
      console.log(`[search-city-food] Cache hit for ${city}`);
      restaurants = cached.restaurants;
    } else {
      try {
        console.log(`[search-city-food] Searching for restaurants in ${city}...`);
        const searchResults = await getTavily().search(
          `best local authentic restaurants to try in ${city} food guide`,
          {
            searchDepth: "basic",
            maxResults: 8,
            includeAnswer: true,
          }
        );

        const snippets = searchResults.results
          .map((r) => `Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.content}`)
          .join("\n\n");

        console.log(`[search-city-food] Extracting data with OpenAI for ${city}...`);
        const completion = await getOpenAI().chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are a local food expert. Extract restaurant recommendations from search results and return a JSON array. Each restaurant must have: name (string), neighborhood (string), cuisineType (string), vibeTagline (string, max 8 words capturing the local feel), whyLocal (string, 1 sentence on why locals love it), url (string, use the source URL or empty string if none). Return ONLY valid JSON array, no markdown.`,
            },
            {
              role: "user",
              content: `City: ${city}\n\nSearch results:\n${snippets}\n\nExtract up to 6 restaurants. If a URL is a review/article page (not a restaurant's own site), still include it.`,
            },
          ],
          response_format: { type: "json_object" },
        });

        const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
        restaurants = (parsed.restaurants ?? parsed) as Restaurant[];
        if (!Array.isArray(restaurants)) restaurants = [];
        setCache(cacheKey, { restaurants });
      } catch (err) {
        console.error("search-city-food error:", err);
        return error(`Failed to search for restaurants in ${city}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    return widget({
      props: { city, restaurants },
      output: text(`Found ${restaurants.length} local food spots in ${city}: ${restaurants.map((r) => r.name).join(", ")}`),
    });
  }
);

// ─── TOOL 2: get-menu-dishes ─────────────────────────────────────────────────

server.tool(
  {
    name: "get-menu-dishes",
    description:
      "Fetch a restaurant's menu and return its signature dishes with traveler-friendly descriptions and food images. Use this after search-city-food when the user wants to know what to order at a specific restaurant.",
    schema: z.object({
      restaurantName: z.string().describe("The name of the restaurant"),
      city: z.string().describe("The city the restaurant is in"),
      url: z.string().optional().describe("The restaurant's website URL if available"),
    }),
    widget: {
      name: "menu-highlights",
      invoking: "Reading the menu...",
      invoked: "Dishes ready",
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ restaurantName, city, url }) => {
    if (!process.env.OPENAI_API_KEY) return error("OPENAI_API_KEY not configured.");

    const cacheKey = `menu:${city.toLowerCase()}:${restaurantName.toLowerCase()}`;
    const cached = getCache<{ dishes: Dish[] }>(cacheKey);

    let dishes: Dish[];

    if (cached) {
      console.log(`[get-menu-dishes] Cache hit for ${restaurantName}`);
      dishes = cached.dishes;
    } else {
      try {
        let menuContext = "";

        // Try to fetch menu text from the restaurant URL
        if (url && url.startsWith("http")) {
          try {
            console.log(`[get-menu-dishes] Fetching website content for ${restaurantName}...`);
            const res = await fetch(url, {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; CityBitesBot/1.0)" },
              signal: AbortSignal.timeout(6000),
            });
            const html = await res.text();
            const root = parse(html);
            // Remove scripts, styles, nav
            root.querySelectorAll("script, style, nav, footer, header").forEach((el) => el.remove());
            const rawText = root.structuredText.replace(/\s+/g, " ").slice(0, 4000);
            menuContext = `\n\nRestaurant website content:\n${rawText}`;
          } catch {
            // URL fetch failed — fall through to web search
          }
        }

        // If no menu text, search for the menu
        if (!menuContext && process.env.TAVILY_API_KEY) {
          console.log(`[get-menu-dishes] Searching web for ${restaurantName} dishes...`);
          const menuSearch = await getTavily().search(
            `${restaurantName} ${city} menu dishes food`,
            { maxResults: 4, searchDepth: "basic" }
          );
          menuContext = "\n\nSearch results about this restaurant:\n" +
            menuSearch.results.map((r) => r.content).join("\n");
        }

        console.log(`[get-menu-dishes] Identifying dishes with OpenAI for ${restaurantName}...`);
        const completion = await getOpenAI().chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are a food guide writer helping travelers understand local dishes. Given a restaurant and city, return a JSON object with a "dishes" array. Each dish: name (string), description (string, 2 sentences: what it is + why it matters to the city's food culture), mealType (one of: "breakfast","lunch","dinner","snack","drink"), imageQuery (string, a short Unsplash search query for a photo of this dish, e.g. "ramen noodle soup bowl"). Return ONLY valid JSON, no markdown.`,
            },
            {
              role: "user",
              content: `Restaurant: ${restaurantName}\nCity: ${city}${menuContext}\n\nReturn 4-5 signature dishes.`,
            },
          ],
          response_format: { type: "json_object" },
        });

        const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
        dishes = (parsed.dishes ?? []) as Dish[];

        // Fetch Unsplash images for each dish
        if (process.env.UNSPLASH_ACCESS_KEY) {
          console.log(`[get-menu-dishes] Fetching images from Unsplash for ${restaurantName}...`);
          dishes = await Promise.all(
            dishes.map(async (dish) => {
              try {
                const imgRes = await fetch(
                  `https://api.unsplash.com/search/photos?query=${encodeURIComponent(dish.imageQuery)}&per_page=1&orientation=landscape`,
                  { 
                    headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` },
                    signal: AbortSignal.timeout(5000)
                  }
                );
                const imgData = (await imgRes.json()) as { results?: { urls?: { small?: string } }[] };
                return { ...dish, imageUrl: imgData.results?.[0]?.urls?.small ?? "" };
              } catch {
                return { ...dish, imageUrl: "" };
              }
            })
          );
        }

        setCache(cacheKey, { dishes });
      } catch (err) {
        console.error("get-menu-dishes error:", err);
        return error(`Failed to get menu for ${restaurantName}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    return widget({
      props: { restaurantName, city, dishes },
      output: text(`${restaurantName} serves: ${dishes.map((d) => d.name).join(", ")}`),
    });
  }
);

// ─── TOOL 3: build-taste-itinerary ───────────────────────────────────────────

server.tool(
  {
    name: "build-taste-itinerary",
    description:
      "Compose a time-aware taste itinerary for a city — morning coffee, afternoon snack, dinner, and late bites — with cultural context explaining why each dish represents the city. Includes an interactive route map. Use this when the user wants a full day food plan.",
    schema: z.object({
      city: z.string().describe("The city to build the itinerary for"),
      preferences: z.string().optional().describe("Optional dietary preferences or interests, e.g. 'vegetarian', 'street food only', 'no seafood'"),
    }),
    widget: {
      name: "taste-itinerary",
      invoking: "Composing your taste itinerary...",
      invoked: "Itinerary ready",
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ city, preferences }) => {
    if (!process.env.OPENAI_API_KEY) return error("OPENAI_API_KEY not configured.");
    if (!process.env.TAVILY_API_KEY) return error("TAVILY_API_KEY not configured.");

    const cacheKey = `itinerary:${city.toLowerCase()}:${(preferences ?? "").toLowerCase()}`;
    const cached = getCache<{ stops: ItineraryStop[]; centerLat: number; centerLng: number }>(cacheKey);

    let stops: ItineraryStop[];
    let centerLat: number;
    let centerLng: number;

    if (cached) {
      console.log(`[build-taste-itinerary] Cache hit for ${city}`);
      stops = cached.stops;
      centerLat = cached.centerLat;
      centerLng = cached.centerLng;
    } else {
      try {
        console.log(`[build-taste-itinerary] Searching cultural context for ${city}...`);
        // Search for cultural food context
        const [foodSearch, cultureSearch] = await Promise.all([
          getTavily().search(`${city} iconic local food dishes must try authentic`, { maxResults: 5, searchDepth: "basic" }),
          getTavily().search(`${city} food culture history traditional cuisine`, { maxResults: 4, searchDepth: "basic" }),
        ]);

        const context = [
          ...foodSearch.results.map((r) => r.content),
          ...cultureSearch.results.map((r) => r.content),
        ].join("\n\n").slice(0, 5000);

        console.log(`[build-taste-itinerary] Composing itinerary with OpenAI for ${city}...`);
        const prefNote = preferences ? `\nUser preferences: ${preferences}` : "";

        const completion = await getOpenAI().chat.completions.create({
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
              content: `City: ${city}${prefNote}\n\nContext from web:\n${context}\n\nBuild a 4-stop day itinerary (morning, midday, dinner, late).`,
            },
          ],
          response_format: { type: "json_object" },
        });

        const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
        centerLat = parsed.centerLat ?? 0;
        centerLng = parsed.centerLng ?? 0;
        const rawStops = (parsed.stops ?? []) as (ItineraryStop & { imageQuery?: string })[];

        // Fetch Unsplash images for each stop's dish
        console.log(`[build-taste-itinerary] Fetching images from Unsplash for ${city}...`);
        stops = await Promise.all(
          rawStops.map(async (stop) => {
            let dishImageUrl = "";
            if (process.env.UNSPLASH_ACCESS_KEY && stop.imageQuery) {
              try {
                const imgRes = await fetch(
                  `https://api.unsplash.com/search/photos?query=${encodeURIComponent(stop.imageQuery)}&per_page=1&orientation=landscape`,
                  { 
                    headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` },
                    signal: AbortSignal.timeout(5000)
                  }
                );
                const imgData = (await imgRes.json()) as { results?: { urls?: { small?: string } }[] };
                dishImageUrl = imgData.results?.[0]?.urls?.small ?? "";
              } catch {
                // Unsplash fetch failed — proceed without image
              }
            }
            return {
              timeSlot: stop.timeSlot,
              timeRange: stop.timeRange,
              restaurantName: stop.restaurantName,
              neighborhood: stop.neighborhood,
              dish: stop.dish,
              dishDescription: stop.dishDescription,
              culturalContext: stop.culturalContext,
              walkingNote: stop.walkingNote,
              lat: stop.lat ?? 0,
              lng: stop.lng ?? 0,
              dishImageUrl,
            };
          })
        );

        setCache(cacheKey, { stops, centerLat, centerLng });
      } catch (err) {
        console.error("build-taste-itinerary error:", err);
        return error(`Failed to build itinerary for ${city}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    return widget({
      props: { city, preferences: preferences ?? "", stops, centerLat, centerLng },
      output: text(`Taste itinerary for ${city}: ${stops.map((s) => `${s.timeSlot} → ${s.restaurantName} (${s.dish})`).join(" | ")}`),
    });
  }
);

// ─── TOOL 4: explore-city-food-map ───────────────────────────────────────────

type DayItinerary = { day: number; label: string; stops: MapStop[] };

server.tool(
  {
    name: "explore-city-food-map",
    description:
      "Generate an interactive map showing a food crawl route through a city, organized by day. Each pin is a restaurant with its signature dish, photo, and time slot. Supports multi-day trips with a day switcher. Use this when the user wants to visually explore food spots on a map.",
    schema: z.object({
      city: z.string().describe("The city to explore food in (e.g. 'Rome', 'Tokyo', 'Mexico City')"),
      preferences: z.string().optional().describe("Optional dietary preferences or interests"),
      days: z.number().min(1).max(3).optional().describe("Number of days to plan (1-3, default 1)"),
    }),
    widget: {
      name: "city-food-map",
      invoking: "Building your food map...",
      invoked: "Food map ready",
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ city, preferences, days: numDays }) => {
    if (!process.env.TAVILY_API_KEY) return error("TAVILY_API_KEY not configured.");
    if (!process.env.OPENAI_API_KEY) return error("OPENAI_API_KEY not configured.");

    const dayCount = numDays ?? 1;
    const cacheKey = `foodmap:${city.toLowerCase()}:${(preferences ?? "").toLowerCase()}:${dayCount}d`;
    const cached = getCache<{ stops: MapStop[]; days: DayItinerary[]; centerLat: number; centerLng: number }>(cacheKey);

    let stops: MapStop[];
    let days: DayItinerary[];
    let centerLat: number;
    let centerLng: number;

    if (cached) {
      console.log(`[explore-city-food-map] Cache hit for ${city}`);
      stops = cached.stops;
      days = cached.days;
      centerLat = cached.centerLat;
      centerLng = cached.centerLng;
    } else {
      try {
        console.log(`[explore-city-food-map] Searching restaurants for ${city}...`);
        const prefNote = preferences ? ` focusing on ${preferences}` : "";

        // Step 1: Search for restaurants
        const searchResults = await getTavily().search(
          `best local authentic restaurants food crawl in ${city}${prefNote}`,
          { searchDepth: "basic", maxResults: 10, includeAnswer: true }
        );

        const snippets = searchResults.results
          .map((r) => `Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.content}`)
          .join("\n\n");

        // Step 2: Extract restaurants organized by day
        console.log(`[explore-city-food-map] Planning ${dayCount} days with OpenAI for ${city}...`);
        const completion = await getOpenAI().chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are a local food expert, travel planner, and geocoding assistant. Given search results about restaurants in a city, create a ${dayCount}-day food itinerary and return a JSON object with:
- "centerLat" (number): latitude of the city center
- "centerLng" (number): longitude of the city center
- "days" (array of ${dayCount} objects): each day has:
  - "day" (number): day number starting at 1
  - "label" (string): a short thematic label like "Day 1 — Classic Flavors" or "Day 2 — Street Food Trail"
  - "stops" (array of 4 objects): each stop has:
    - "name" (string): restaurant name
    - "neighborhood" (string): neighborhood or area
    - "cuisineType" (string): type of cuisine
    - "lat" (number): estimated latitude based on city + neighborhood
    - "lng" (number): estimated longitude based on city + neighborhood
    - "signatureDish" (string): the must-try dish
    - "dishDescription" (string): 1-2 sentences explaining the dish
    - "whyLocal" (string): 1 sentence on why locals love it
    - "timeSlot" (string): one of "Morning Coffee", "Lunch", "Dinner", "Late Bites"
    - "timeRange" (string): e.g. "8:00–10:00 AM"
    - "imageQuery" (string): a short Unsplash search query for the dish photo

Each day should have 4 stops (morning, lunch, dinner, late). Use different restaurants each day. Spread geographically. Return ONLY valid JSON, no markdown.`,
            },
            {
              role: "user",
              content: `City: ${city}${prefNote ? `\nPreferences: ${preferences}` : ""}\n\nSearch results:\n${snippets}`,
            },
          ],
          response_format: { type: "json_object" },
        });

        const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
        centerLat = parsed.centerLat ?? 0;
        centerLng = parsed.centerLng ?? 0;
        const rawDays = (parsed.days ?? []) as ({ day: number; label: string; stops: (MapStop & { imageQuery?: string })[] })[];

        // Step 3: Fetch Unsplash images + build flat list
        console.log(`[explore-city-food-map] Fetching images from Unsplash for ${city}...`);
        days = [];
        stops = [];

        for (const rawDay of rawDays) {
          const dayStops: MapStop[] = await Promise.all(
            (rawDay.stops ?? []).map(async (stop) => {
              let dishImageUrl = "";
              if (process.env.UNSPLASH_ACCESS_KEY && stop.imageQuery) {
                try {
                  const imgRes = await fetch(
                    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(stop.imageQuery)}&per_page=1&orientation=landscape`,
                    { 
                      headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` },
                      signal: AbortSignal.timeout(5000)
                    }
                  );
                  const imgData = (await imgRes.json()) as { results?: { urls?: { small?: string } }[] };
                  dishImageUrl = imgData.results?.[0]?.urls?.small ?? "";
                } catch {
                  // Unsplash fetch failed
                }
              }
              return {
                name: stop.name,
                neighborhood: stop.neighborhood,
                cuisineType: stop.cuisineType,
                lat: stop.lat,
                lng: stop.lng,
                signatureDish: stop.signatureDish,
                dishDescription: stop.dishDescription,
                dishImageUrl,
                whyLocal: stop.whyLocal ?? "",
                timeSlot: stop.timeSlot ?? "",
                timeRange: stop.timeRange ?? "",
              };
            })
          );

          days.push({ day: rawDay.day, label: rawDay.label, stops: dayStops });
          stops.push(...dayStops);
        }

        setCache(cacheKey, { stops, days, centerLat, centerLng });
      } catch (err) {
        console.error("explore-city-food-map error:", err);
        return error(`Failed to build food map for ${city}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    return widget({
      props: { city, centerLat, centerLng, stops, days },
      output: text(
        `Food map for ${city} (${days.length} day${days.length > 1 ? "s" : ""}) with ${stops.length} stops: ${stops.map((s, i) => `${i + 1}. ${s.name} (${s.signatureDish})`).join(", ")}`
      ),
    });
  }
);

// ─── Types (shared between server and widgets via inference) ──────────────────

export type Restaurant = {
  name: string;
  neighborhood: string;
  cuisineType: string;
  vibeTagline: string;
  whyLocal: string;
  url: string;
};

export type Dish = {
  name: string;
  description: string;
  mealType: string;
  imageQuery: string;
  imageUrl?: string;
};

export type ItineraryStop = {
  timeSlot: string;
  timeRange: string;
  restaurantName: string;
  neighborhood: string;
  dish: string;
  dishDescription: string;
  culturalContext: string;
  walkingNote: string;
  lat: number;
  lng: number;
  dishImageUrl: string;
};

export type MapStop = {
  name: string;
  neighborhood: string;
  cuisineType: string;
  lat: number;
  lng: number;
  signatureDish: string;
  dishDescription: string;
  dishImageUrl: string;
  whyLocal: string;
  timeSlot?: string;
  timeRange?: string;
};

server.listen().then(() => {
  console.log("CityBites MCP server running");
});

