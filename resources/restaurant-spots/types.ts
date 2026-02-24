import { z } from "zod";

export const restaurantSchema = z.object({
  name: z.string().describe("Restaurant name"),
  neighborhood: z.string().optional().describe("Neighborhood or area"),
  cuisineType: z.string().optional().describe("Type of cuisine"),
  vibeTagline: z.string().optional().describe("Short vibe description"),
  whyLocal: z.string().optional().describe("Why locals love it"),
  url: z.string().optional().describe("Restaurant or source URL"),
});

export const propSchema = z.object({
  city: z.string().describe("The city being explored"),
  restaurants: z.array(restaurantSchema).describe("List of recommended restaurants"),
});

export type RestaurantProps = z.infer<typeof propSchema>;
export type Restaurant = z.infer<typeof restaurantSchema>;
