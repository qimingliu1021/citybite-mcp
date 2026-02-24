import { z } from "zod";

export const mapStopSchema = z.object({
  name: z.string().describe("Restaurant name"),
  neighborhood: z.string().optional().describe("Neighborhood or area"),
  cuisineType: z.string().optional().describe("Type of cuisine"),
  lat: z.number().describe("Latitude"),
  lng: z.number().describe("Longitude"),
  signatureDish: z.string().describe("Must-try dish at this restaurant"),
  dishDescription: z.string().optional().describe("Short description of the dish"),
  dishImageUrl: z.string().optional().describe("Unsplash image URL for the dish, or empty string"),
  whyLocal: z.string().optional().describe("Why locals love it"),
  timeSlot: z.string().optional().describe("Time slot for itinerary mode, e.g. Morning Coffee"),
  timeRange: z.string().optional().describe("Time range for itinerary mode, e.g. 8:00–10:00 AM"),
});

export const dayItinerarySchema = z.object({
  day: z.number().describe("Day number (1-based)"),
  label: z.string().describe("Day label, e.g. 'Day 1 — Classic Rome'"),
  stops: z.array(mapStopSchema).describe("Stops for this day"),
});

export const propSchema = z.object({
  city: z.string().describe("The city being explored"),
  centerLat: z.number().optional().describe("Map center latitude"),
  centerLng: z.number().optional().describe("Map center longitude"),
  stops: z.array(mapStopSchema).describe("All restaurant stops (flat list)"),
  days: z.array(dayItinerarySchema).optional().describe("Per-day itinerary grouping"),
});

export type MapStop = z.infer<typeof mapStopSchema>;
export type DayItinerary = z.infer<typeof dayItinerarySchema>;
export type CityFoodMapProps = z.infer<typeof propSchema>;
