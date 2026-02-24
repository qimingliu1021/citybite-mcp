import { McpUseProvider, useWidget, useWidgetTheme, useCallTool, type WidgetMetadata } from "mcp-use/react";
import React, { useState, useEffect, useRef } from "react";
import { propSchema, type RestaurantProps, type Restaurant } from "./types";

export const widgetMetadata: WidgetMetadata = {
  description: "Display locally representative restaurant recommendations for a city with inline menu, itinerary, and map views",
  props: propSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Searching for local food spots...",
    invoked: "Restaurants found",
    csp: {
      connectDomains: ["https://api.unsplash.com"],
      resourceDomains: [
        "https://images.unsplash.com",
        "https://unpkg.com",
        "https://tile.openstreetmap.org",
        "https://a.tile.openstreetmap.org",
        "https://b.tile.openstreetmap.org",
        "https://c.tile.openstreetmap.org",
      ],
    },
  },
};

// ─── Types for inline data from tool calls ───────────────────────────────────

interface Dish {
  name: string;
  description?: string;
  mealType?: string;
  imageQuery?: string;
  imageUrl?: string;
}

interface ItineraryStop {
  timeSlot?: string;
  timeRange?: string;
  restaurantName: string;
  neighborhood?: string;
  dish: string;
  dishDescription?: string;
  culturalContext?: string;
  walkingNote?: string;
  lat: number;
  lng: number;
  dishImageUrl?: string;
}

interface MapStop {
  name: string;
  neighborhood?: string;
  cuisineType?: string;
  lat: number;
  lng: number;
  signatureDish: string;
  dishDescription?: string;
  dishImageUrl?: string;
  whyLocal?: string;
  timeSlot?: string;
  timeRange?: string;
}

type ViewState = "restaurants" | "menu" | "itinerary" | "itinerary-map";

// ─── Theme ───────────────────────────────────────────────────────────────────

function useColors() {
  const theme = useWidgetTheme();
  return {
    bg: theme === "dark" ? "#111" : "#fafaf8",
    card: theme === "dark" ? "#1c1c1c" : "#ffffff",
    border: theme === "dark" ? "#2a2a2a" : "#e8e4de",
    text: theme === "dark" ? "#f0ede8" : "#1a1714",
    textSecondary: theme === "dark" ? "#888" : "#6b6560",
    accent: "#d4622a",
    accentLight: theme === "dark" ? "#3a1f10" : "#fdf0e8",
    tag: theme === "dark" ? "#252525" : "#f2ede7",
    tagText: theme === "dark" ? "#aaa" : "#7a6f66",
    hover: theme === "dark" ? "#242424" : "#f7f3ee",
    imageBg: theme === "dark" ? "#1a1a1a" : "#f0ece6",
  };
}

const SLOT_COLORS: Record<string, string> = {
  "Morning Coffee": "#c98b2e", "Midday Snack": "#d4622a",
  Lunch: "#d4622a", Dinner: "#8b3a62", "Late Bites": "#4a5899",
};
const SLOT_ICONS: Record<string, string> = {
  "Morning Coffee": "☕", "Midday Snack": "🥙",
  Lunch: "☀️", Dinner: "🍷", "Late Bites": "🌙",
};
const MEAL_ICONS: Record<string, string> = {
  breakfast: "🌅", lunch: "☀️", dinner: "🌙", snack: "🍡", drink: "🍵",
};

// ─── Back Button ─────────────────────────────────────────────────────────────

const BackButton: React.FC<{ onClick: () => void; label: string; color: string }> = ({ onClick, label, color }) => (
  <button
    onClick={onClick}
    style={{
      background: "none", border: "none", padding: "0 0 12px",
      cursor: "pointer", fontSize: 13, fontWeight: 600, color,
      display: "flex", alignItems: "center", gap: 6,
    }}
  >
    ← {label}
  </button>
);

// ─── Spinner Banner ──────────────────────────────────────────────────────────

const SpinnerBanner: React.FC<{
  text: string;
  colors: ReturnType<typeof useColors>;
}> = ({ text, colors }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 10,
    padding: "12px 16px", backgroundColor: colors.accentLight,
    borderRadius: 12, border: `1px solid ${colors.accent}20`,
  }}>
    <div style={{
      width: 20, height: 20,
      border: `3px solid ${colors.border}`,
      borderTopColor: colors.accent,
      borderRadius: "50%",
      animation: "spin 0.8s linear infinite",
    }} />
    <span style={{ fontSize: 13, fontWeight: 600, color: colors.accent }}>{text}</span>
  </div>
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGE 1: Restaurant Card
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const RestaurantCard: React.FC<{
  restaurant: Restaurant;
  index: number;
  colors: ReturnType<typeof useColors>;
  onGetMenu: (r: Restaurant) => void;
  isLoading: boolean;
}> = ({ restaurant, index, colors, onGetMenu, isLoading }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        backgroundColor: hovered ? colors.hover : colors.card,
        border: `1px solid ${colors.border}`, borderRadius: 16,
        padding: "20px", transition: "all 0.2s ease", cursor: "default",
        display: "flex", flexDirection: "column", gap: 10,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            backgroundColor: colors.accentLight, color: colors.accent,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700, flexShrink: 0,
          }}>{index + 1}</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: colors.text, lineHeight: 1.3 }}>
              {restaurant.name}
            </div>
            {restaurant.neighborhood && (
              <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>📍 {restaurant.neighborhood}</div>
            )}
          </div>
        </div>
        {restaurant.cuisineType && (
          <span style={{
            fontSize: 11, fontWeight: 500, backgroundColor: colors.tag, color: colors.tagText,
            padding: "3px 8px", borderRadius: 20, whiteSpace: "nowrap", flexShrink: 0,
          }}>{restaurant.cuisineType}</span>
        )}
      </div>
      {restaurant.vibeTagline && (
        <div style={{ fontSize: 13, fontStyle: "italic", color: colors.accent, fontWeight: 500 }}>
          &quot;{restaurant.vibeTagline}&quot;
        </div>
      )}
      {restaurant.whyLocal && (
        <div style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 1.5 }}>{restaurant.whyLocal}</div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
        <button
          onClick={() => onGetMenu(restaurant)}
          disabled={isLoading}
          style={{
            flex: 1, padding: "8px 12px", backgroundColor: colors.accent, color: "#fff",
            border: "none", borderRadius: 10, fontSize: 12, fontWeight: 600,
            cursor: isLoading ? "not-allowed" : "pointer",
            opacity: isLoading ? 0.6 : 1, transition: "opacity 0.15s",
          }}
        >{isLoading ? "Loading menu..." : "See what to order →"}</button>
        {restaurant.url && (
          <a href={restaurant.url} target="_blank" rel="noopener noreferrer" style={{
            padding: "8px 10px", backgroundColor: colors.tag, color: colors.tagText,
            border: "none", borderRadius: 10, fontSize: 12, textDecoration: "none", fontWeight: 500,
          }}>🔗</a>
        )}
      </div>
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGE 2: Dish Card (menu view)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DishCard: React.FC<{ dish: Dish; colors: ReturnType<typeof useColors> }> = ({ dish, colors }) => {
  const [imgError, setImgError] = useState(false);
  const icon = MEAL_ICONS[dish.mealType ?? ""] ?? "🍽️";

  return (
    <div style={{
      backgroundColor: colors.card, border: `1px solid ${colors.border}`,
      borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column",
    }}>
      <div style={{
        height: 140, backgroundColor: colors.imageBg, position: "relative",
        overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {dish.imageUrl && !imgError ? (
          <img src={dish.imageUrl} alt={dish.name} onError={() => setImgError(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: 48, opacity: 0.4 }}>🍽️</span>
        )}
        {dish.mealType && (
          <div style={{
            position: "absolute", top: 10, left: 10,
            backgroundColor: "rgba(0,0,0,0.55)", color: "#fff",
            fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 20,
            backdropFilter: "blur(4px)", display: "flex", alignItems: "center", gap: 4,
          }}>{icon} {dish.mealType}</div>
        )}
      </div>
      <div style={{ padding: "14px 16px 16px", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.text }}>{dish.name}</div>
        {dish.description && (
          <div style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 1.55, flex: 1 }}>{dish.description}</div>
        )}
      </div>
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGE 3: Itinerary Stop Card
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ItineraryStopCard: React.FC<{
  stop: ItineraryStop;
  index: number;
  isLast: boolean;
  colors: ReturnType<typeof useColors>;
  isHighlighted: boolean;
  onHover: (i: number | null) => void;
  compact?: boolean;
}> = ({ stop, index, isLast, colors, isHighlighted, onHover, compact }) => {
  const [expanded, setExpanded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const slotColor = SLOT_COLORS[stop.timeSlot ?? ""] ?? "#d4622a";
  const slotIcon = SLOT_ICONS[stop.timeSlot ?? ""] ?? "🍽️";

  return (
    <div
      style={{ display: "flex", gap: compact ? 10 : 16 }}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Timeline dot + line */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <div style={{
          width: compact ? 26 : 32, height: compact ? 26 : 32, borderRadius: "50%",
          backgroundColor: slotColor, color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: compact ? 12 : 15, fontWeight: 800,
          border: isHighlighted ? `3px solid ${colors.text}` : "3px solid transparent",
          boxShadow: isHighlighted ? `0 0 0 3px ${slotColor}40` : "none",
          transition: "all 0.2s ease",
        }}>{slotIcon}</div>
        {!isLast && <div style={{ width: 2, flex: 1, backgroundColor: colors.border, marginTop: 4, marginBottom: 4 }} />}
      </div>

      {/* Content card */}
      <div style={{
        flex: 1,
        backgroundColor: isHighlighted ? colors.accentLight : colors.card,
        border: `1px solid ${isHighlighted ? slotColor + "40" : colors.border}`,
        borderRadius: compact ? 10 : 14, padding: compact ? 10 : 14,
        marginBottom: isLast ? 0 : compact ? 6 : 12,
        transition: "all 0.2s ease",
      }}>
        {/* Dish image */}
        {!compact && stop.dishImageUrl && !imgError && (
          <div style={{ height: 100, borderRadius: 10, overflow: "hidden", backgroundColor: colors.imageBg, marginBottom: 10 }}>
            <img src={stop.dishImageUrl} alt={stop.dish} onError={() => setImgError(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        )}

        {/* Time slot + range */}
        {(stop.timeSlot || stop.timeRange) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            {stop.timeSlot && <span style={{ fontSize: compact ? 10 : 11, fontWeight: 700, color: slotColor, textTransform: "uppercase", letterSpacing: "0.05em" }}>{stop.timeSlot}</span>}
            {stop.timeRange && <span style={{ fontSize: compact ? 10 : 11, color: colors.textSecondary }}>{stop.timeRange}</span>}
          </div>
        )}

        <div style={{ fontSize: compact ? 13 : 16, fontWeight: 700, color: colors.text, marginBottom: 2 }}>{stop.restaurantName}</div>
        {(stop.neighborhood || stop.walkingNote) && (
          <div style={{ fontSize: compact ? 10 : 12, color: colors.textSecondary, marginBottom: compact ? 4 : 8 }}>
            {stop.neighborhood ? `📍 ${stop.neighborhood}` : ""} {stop.walkingNote ? `· ${stop.walkingNote}` : ""}
          </div>
        )}

        {/* Dish highlight */}
        <div style={{
          backgroundColor: colors.accentLight, border: `1px solid ${colors.accent}20`,
          borderRadius: 8, padding: compact ? "5px 8px" : "7px 10px", marginBottom: compact ? 0 : 8,
        }}>
          <div style={{ fontSize: compact ? 11 : 13, fontWeight: 700, color: colors.accent }}>🍽️ {stop.dish}</div>
          {!compact && stop.dishDescription && (
            <div style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 1.4, marginTop: 2 }}>{stop.dishDescription}</div>
          )}
        </div>

        {/* Cultural context — expandable */}
        {!compact && stop.culturalContext && (
          <>
            <button onClick={() => setExpanded(!expanded)} style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              fontSize: 12, fontWeight: 600, color: colors.textSecondary, marginTop: 6,
            }}>{expanded ? "▾" : "▸"} Why this matters…</button>
            {expanded && (
              <div style={{
                fontSize: 12, color: colors.textSecondary, lineHeight: 1.55,
                padding: "6px 0 0", borderTop: `1px solid ${colors.border}`, marginTop: 6,
              }}>{stop.culturalContext}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGE 4: Leaflet Map
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const LeafletMap: React.FC<{
  stops: MapStop[];
  centerLat: number;
  centerLng: number;
  colors: ReturnType<typeof useColors>;
  highlightedIndex: number | null;
  onStopClick: (i: number) => void;
}> = ({ stops, centerLat, centerLng, colors, highlightedIndex, onStopClick }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!document.querySelector('link[href*="leaflet"]')) {
      const cssLink = document.createElement("link");
      cssLink.rel = "stylesheet";
      cssLink.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(cssLink);
    }
    if (!(window as any).L) {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = () => setLoaded(true);
      document.head.appendChild(script);
    } else {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded || !mapRef.current || mapInstanceRef.current) return;
    const L = (window as any).L;
    const map = L.map(mapRef.current, { scrollWheelZoom: false }).setView([centerLat, centerLng], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    const bounds: [number, number][] = [];
    stops.forEach((stop, index) => {
      const slotColor = SLOT_COLORS[stop.timeSlot ?? ""] ?? "#d4622a";
      const slotIcon = SLOT_ICONS[stop.timeSlot ?? ""] ?? "📍";
      const markerIcon = L.divIcon({
        className: "citybites-marker",
        html: `<div style="width:36px;height:36px;border-radius:50%;background:${slotColor};color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;">${slotIcon}</div>`,
        iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -22],
      });
      const imgHtml = stop.dishImageUrl ? `<img src="${stop.dishImageUrl}" alt="${stop.signatureDish}" style="width:100%;height:90px;object-fit:cover;border-radius:8px;margin-bottom:8px;" onerror="this.style.display='none'" />` : "";
      const popup = `<div style="font-family:system-ui,-apple-system,sans-serif;min-width:200px;max-width:250px;">
        ${imgHtml}
        <div style="font-size:10px;font-weight:700;color:${slotColor};text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">${slotIcon} ${stop.timeSlot ?? ""} · ${stop.timeRange ?? ""}</div>
        <div style="font-size:14px;font-weight:700;margin-bottom:2px;">${stop.name}</div>
        <div style="font-size:11px;color:#6b6560;margin-bottom:6px;">📍 ${stop.neighborhood ?? ""}</div>
        <div style="background:#fdf0e8;border-radius:6px;padding:6px 8px;">
          <div style="font-size:12px;font-weight:700;color:#d4622a;">🍽️ ${stop.signatureDish}</div>
          ${stop.dishDescription ? `<div style="font-size:11px;color:#6b6560;line-height:1.4;margin-top:2px;">${stop.dishDescription}</div>` : ""}
        </div>
      </div>`;
      const marker = L.marker([stop.lat, stop.lng], { icon: markerIcon }).addTo(map);
      marker.bindPopup(popup, { maxWidth: 270, closeButton: true });
      marker.on("click", () => onStopClick(index));
      markersRef.current.push(marker);
      bounds.push([stop.lat, stop.lng]);
    });

    if (bounds.length > 1) {
      L.polyline(bounds, { color: "#d4622a", weight: 3, opacity: 0.5, dashArray: "10, 8" }).addTo(map);
    }
    if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40] });
    mapInstanceRef.current = map;
    return () => { map.remove(); mapInstanceRef.current = null; markersRef.current = []; };
  }, [loaded, stops, centerLat, centerLng]);

  useEffect(() => {
    if (highlightedIndex !== null && markersRef.current[highlightedIndex]) {
      markersRef.current[highlightedIndex].openPopup();
    }
  }, [highlightedIndex]);

  return (
    <div ref={mapRef} style={{
      width: "100%", height: "100%", minHeight: 400,
      borderRadius: 16, overflow: "hidden", border: `1px solid ${colors.border}`,
    }} />
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN WIDGET — unified navigation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const RestaurantSpots: React.FC = () => {
  const { props, isPending } = useWidget<RestaurantProps>();
  const colors = useColors();

  // Tool hooks
  const { callTool: getMenuDishes, isPending: isMenuLoading } = useCallTool("get-menu-dishes");
  const { callTool: buildItinerary, isPending: isItineraryLoading } = useCallTool("build-taste-itinerary");
  const { callTool: exploreFoodMap, isPending: isMapLoading } = useCallTool("explore-city-food-map");

  // Navigation
  const [view, setView] = useState<ViewState>("restaurants");

  // Menu data
  const [selectedRestaurant, setSelectedRestaurant] = useState<string | null>(null);
  const [menuDishes, setMenuDishes] = useState<Dish[]>([]);

  // Itinerary data
  const [itineraryStops, setItineraryStops] = useState<ItineraryStop[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);

  // Map data
  const [mapData, setMapData] = useState<{ stops: MapStop[]; centerLat: number; centerLng: number } | null>(null);

  // Shared loading state
  const [loadingName, setLoadingName] = useState<string | null>(null);

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div style={{ backgroundColor: colors.bg, padding: 24, borderRadius: 20 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ height: 20, width: 180, backgroundColor: colors.border, borderRadius: 6, marginBottom: 8, animation: "pulse 1.5s infinite" }} />
            <div style={{ height: 14, width: 120, backgroundColor: colors.border, borderRadius: 6, animation: "pulse 1.5s infinite" }} />
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ backgroundColor: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 20, marginBottom: 12, height: 120, animation: "pulse 1.5s infinite" }} />
          ))}
          <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
        </div>
      </McpUseProvider>
    );
  }

  const { city, restaurants } = props;

  // ── Handlers ──

  const handleGetMenu = (restaurant: Restaurant) => {
    setSelectedRestaurant(restaurant.name);
    setMenuDishes([]);
    setLoadingName(restaurant.name);
    setView("menu");
    getMenuDishes(
      { restaurantName: restaurant.name, city, url: restaurant.url },
      {
        onSuccess: (data: any) => {
          const dishes = data?.structuredContent?.dishes ?? [];
          setMenuDishes(dishes);
        },
        onError: (err: any) => console.error("[widget] get-menu-dishes ERROR:", err),
        onSettled: () => setLoadingName(null),
      }
    );
  };

  const handleBuildItinerary = () => {
    setItineraryStops([]);
    setLoadingName("itinerary");
    setView("itinerary");
    buildItinerary(
      { city },
      {
        onSuccess: (data: any) => {
          const stops = data?.structuredContent?.stops ?? [];
          setItineraryStops(stops);
        },
        onError: (err: any) => console.error("[widget] build-taste-itinerary ERROR:", err),
        onSettled: () => setLoadingName(null),
      }
    );
  };

  const handleExploreMap = () => {
    setLoadingName("map");
    exploreFoodMap(
      { city },
      {
        onSuccess: (data: any) => {
          const sc = data?.structuredContent;
          if (sc) {
            setMapData({
              stops: sc.stops ?? [],
              centerLat: sc.centerLat ?? 0,
              centerLng: sc.centerLng ?? 0,
            });
            setView("itinerary-map");
          }
        },
        onError: (err: any) => console.error("[widget] explore-city-food-map ERROR:", err),
        onSettled: () => setLoadingName(null),
      }
    );
  };

  // ── Render ──

  return (
    <McpUseProvider autoSize>
      <div style={{ backgroundColor: colors.bg, padding: 20, borderRadius: 20, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <style>{`
          @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
          @keyframes spin { to { transform: rotate(360deg) } }
        `}</style>

        {/* ═══ VIEW: RESTAURANTS ═══ */}
        {view === "restaurants" && (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: colors.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>CityBites</div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: colors.text }}>Eat like a local in {city}</h2>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: colors.textSecondary }}>
                {restaurants.length} locally representative spots · tap any to see what to order
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {restaurants.map((r, i) => (
                <RestaurantCard key={r.name} restaurant={r} index={i} colors={colors}
                  onGetMenu={handleGetMenu} isLoading={loadingName === r.name && isMenuLoading} />
              ))}
            </div>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${colors.border}`, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={handleBuildItinerary} disabled={isItineraryLoading}
                style={{
                  padding: "9px 16px", backgroundColor: colors.accentLight, color: colors.accent,
                  border: `1px solid ${colors.accent}30`, borderRadius: 10, fontSize: 13, fontWeight: 600,
                  cursor: isItineraryLoading ? "not-allowed" : "pointer",
                  opacity: isItineraryLoading ? 0.6 : 1, transition: "opacity 0.15s",
                }}>
                {isItineraryLoading ? "Building itinerary…" : "🗺️ Build my taste itinerary"}
              </button>
            </div>
          </>
        )}

        {/* ═══ VIEW: MENU ═══ */}
        {view === "menu" && selectedRestaurant && (
          <>
            <BackButton onClick={() => setView("restaurants")} label="Back to restaurants" color={colors.accent} />
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: colors.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                Menu Highlights · {city}
              </div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: colors.text }}>
                What to order at {selectedRestaurant}
              </h2>
              {!isMenuLoading && menuDishes.length > 0 && (
                <p style={{ margin: "6px 0 0", fontSize: 13, color: colors.textSecondary }}>
                  {menuDishes.length} signature dish{menuDishes.length !== 1 ? "es" : ""} · explained for travelers
                </p>
              )}
            </div>
            {isMenuLoading && (
              <div>
                <SpinnerBanner text={`Reading the menu at ${selectedRestaurant}...`} colors={colors} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginTop: 16 }}>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} style={{ backgroundColor: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, height: 220, animation: "pulse 1.5s infinite" }} />
                  ))}
                </div>
              </div>
            )}
            {!isMenuLoading && menuDishes.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                {menuDishes.map((d) => <DishCard key={d.name} dish={d} colors={colors} />)}
              </div>
            )}
            {!isMenuLoading && menuDishes.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: colors.textSecondary }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🍽️</div>
                <p style={{ margin: 0 }}>No dishes found for this restaurant.</p>
              </div>
            )}
          </>
        )}

        {/* ═══ VIEW: ITINERARY ═══ */}
        {view === "itinerary" && (
          <>
            <BackButton onClick={() => setView("restaurants")} label="Back to restaurants" color={colors.accent} />
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: colors.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                CityBites · Taste Itinerary
              </div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: colors.text }}>A day of food in {city}</h2>
              {!isItineraryLoading && itineraryStops.length > 0 && (
                <p style={{ margin: "6px 0 0", fontSize: 13, color: colors.textSecondary }}>
                  {itineraryStops.length} stops · click &quot;Why this matters&quot; for cultural context
                </p>
              )}
            </div>
            {isItineraryLoading && (
              <div>
                <SpinnerBanner text={`Composing your taste itinerary for ${city}...`} colors={colors} />
                <div style={{ marginTop: 16 }}>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", backgroundColor: colors.border, animation: "pulse 1.5s infinite" }} />
                      <div style={{ flex: 1, height: 120, backgroundColor: colors.card, border: `1px solid ${colors.border}`, borderRadius: 14, animation: "pulse 1.5s infinite" }} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!isItineraryLoading && itineraryStops.length > 0 && (
              <>
                <div>
                  {itineraryStops.map((stop, i) => (
                    <ItineraryStopCard
                      key={`${stop.restaurantName}-${i}`}
                      stop={stop} index={i}
                      isLast={i === itineraryStops.length - 1}
                      colors={colors}
                      isHighlighted={highlightedIndex === i}
                      onHover={setHighlightedIndex}
                    />
                  ))}
                </div>
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${colors.border}` }}>
                  {isMapLoading ? (
                    <SpinnerBanner text={`Building your food map for ${city}...`} colors={colors} />
                  ) : (
                    <button onClick={handleExploreMap} style={{
                      padding: "9px 16px", backgroundColor: colors.accentLight, color: colors.accent,
                      border: `1px solid ${colors.accent}30`, borderRadius: 10, fontSize: 13, fontWeight: 600,
                      cursor: "pointer", transition: "opacity 0.15s",
                    }}>🗺️ Explore on the food map</button>
                  )}
                </div>
              </>
            )}
            {!isItineraryLoading && itineraryStops.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: colors.textSecondary }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
                <p style={{ margin: 0 }}>No stops found for this itinerary.</p>
              </div>
            )}
          </>
        )}

        {/* ═══ VIEW: ITINERARY + MAP ═══ */}
        {view === "itinerary-map" && mapData && (
          <>
            <BackButton onClick={() => setView("itinerary")} label="Back to itinerary" color={colors.accent} />
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: colors.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                CityBites · Food Map
              </div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: colors.text }}>A day of food in {city}</h2>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: colors.textSecondary }}>
                {itineraryStops.length} stops · hover a stop to highlight it on the map
              </p>
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
              {/* Left — compact timeline */}
              <div style={{ flex: "0 0 320px", maxHeight: 500, overflowY: "auto", paddingRight: 8 }}>
                {itineraryStops.map((stop, i) => (
                  <ItineraryStopCard
                    key={`${stop.restaurantName}-${i}`}
                    stop={stop} index={i}
                    isLast={i === itineraryStops.length - 1}
                    colors={colors}
                    isHighlighted={highlightedIndex === i}
                    onHover={setHighlightedIndex}
                    compact
                  />
                ))}
              </div>
              {/* Right — Map */}
              <div style={{ flex: 1, minHeight: 400 }}>
                <LeafletMap
                  stops={mapData.stops}
                  centerLat={mapData.centerLat}
                  centerLng={mapData.centerLng}
                  colors={colors}
                  highlightedIndex={highlightedIndex}
                  onStopClick={setHighlightedIndex}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </McpUseProvider>
  );
};

export default RestaurantSpots;
