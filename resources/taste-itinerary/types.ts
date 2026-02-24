import { z } from "zod";

export const stopSchema = z.object({
  timeSlot: z.string().optional().describe("Morning Coffee, Midday Snack, Dinner, or Late Bites"),
  timeRange: z.string().optional().describe("Time range e.g. 8:00–10:00 AM"),
  restaurantName: z.string().describe("Restaurant name"),
  neighborhood: z.string().optional().describe("Neighborhood or area"),
  dish: z.string().describe("The must-order dish"),
  dishDescription: z.string().optional().describe("Plain-English explanation of the dish"),
  culturalContext: z.string().optional().describe("Why this dish/place is tied to the city's identity"),
  walkingNote: z.string().optional().describe("Vibe of the neighborhood"),
  lat: z.number().describe("Latitude of the restaurant"),
  lng: z.number().describe("Longitude of the restaurant"),
  dishImageUrl: z.string().optional().describe("Unsplash image URL for the dish, or empty string"),
});

export const propSchema = z.object({
  city: z.string().describe("The city"),
  preferences: z.string().describe("User preferences if any"),
  stops: z.array(stopSchema).describe("The itinerary stops"),
  centerLat: z.number().optional().describe("Map center latitude"),
  centerLng: z.number().optional().describe("Map center longitude"),
});

export type TasteItineraryProps = z.infer<typeof propSchema>;
export type ItineraryStop = z.infer<typeof stopSchema>;
