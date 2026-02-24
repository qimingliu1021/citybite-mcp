import { McpUseProvider, useWidget, useWidgetTheme, useCallTool, type WidgetMetadata } from "mcp-use/react";
import React, { useState, useEffect, useRef } from "react";
import { propSchema, type TasteItineraryProps, type ItineraryStop } from "./types";

export const widgetMetadata: WidgetMetadata = {
  description: "A day-long taste itinerary with an interactive route map, cultural context, and signature dishes",
  props: propSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Composing your taste itinerary...",
    invoked: "Itinerary ready",
    csp: {
      resourceDomains: [
        "https://unpkg.com",
        "https://tile.openstreetmap.org",
        "https://a.tile.openstreetmap.org",
        "https://b.tile.openstreetmap.org",
        "https://c.tile.openstreetmap.org",
        "https://images.unsplash.com",
      ],
      connectDomains: [
        "https://unpkg.com",
        "https://tile.openstreetmap.org",
        "https://a.tile.openstreetmap.org",
        "https://b.tile.openstreetmap.org",
        "https://c.tile.openstreetmap.org",
      ],
    },
  },
};

// ── Theme ─────────────────────────────────────────────────────────────────────

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
    imageBg: theme === "dark" ? "#1a1a1a" : "#f0ece6",
  };
}

const SLOT_COLORS: Record<string, string> = {
  "Morning Coffee": "#c98b2e",
  "Midday Snack": "#d4622a",
  Lunch: "#d4622a",
  Dinner: "#8b3a62",
  "Late Bites": "#4a5899",
};

const SLOT_ICONS: Record<string, string> = {
  "Morning Coffee": "☕",
  "Midday Snack": "🥙",
  Lunch: "☀️",
  Dinner: "🍷",
  "Late Bites": "🌙",
};

// ── Map Stop type from explore-city-food-map ─────────────────────────────────

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

// ── Leaflet Map ───────────────────────────────────────────────────────────────

const LeafletMap: React.FC<{
  stops: MapStop[];
  centerLat: number;
  centerLng: number;
  colors: ReturnType<typeof useColors>;
  highlightedIndex: number | null;
  onStopClick: (index: number) => void;
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
        className: "citybites-map-marker",
        html: `<div style="
          width:36px;height:36px;border-radius:50%;
          background:${slotColor};color:#fff;
          display:flex;align-items:center;justify-content:center;
          font-size:16px;
          border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);
          cursor:pointer;
        ">${slotIcon}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -22],
      });

      const dishImgHtml = stop.dishImageUrl
        ? `<img src="${stop.dishImageUrl}" alt="${stop.signatureDish}" style="width:100%;height:90px;object-fit:cover;border-radius:8px;margin-bottom:8px;" onerror="this.style.display='none'" />`
        : "";

      const popupContent = `
        <div style="font-family:system-ui,-apple-system,sans-serif;min-width:200px;max-width:250px;">
          ${dishImgHtml}
          <div style="font-size:10px;font-weight:700;color:${slotColor};text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">${slotIcon} ${stop.timeSlot ?? ""} · ${stop.timeRange ?? ""}</div>
          <div style="font-size:14px;font-weight:700;margin-bottom:2px;">${stop.name}</div>
          <div style="font-size:11px;color:#6b6560;margin-bottom:6px;">📍 ${stop.neighborhood ?? ""}</div>
          <div style="background:#fdf0e8;border-radius:6px;padding:6px 8px;">
            <div style="font-size:12px;font-weight:700;color:#d4622a;">🍽️ ${stop.signatureDish}</div>
            ${stop.dishDescription ? `<div style="font-size:11px;color:#6b6560;line-height:1.4;margin-top:2px;">${stop.dishDescription}</div>` : ""}
          </div>
        </div>
      `;

      const marker = L.marker([stop.lat, stop.lng], { icon: markerIcon }).addTo(map);
      marker.bindPopup(popupContent, { maxWidth: 270, closeButton: true });
      marker.on("click", () => onStopClick(index));
      markersRef.current.push(marker);
      bounds.push([stop.lat, stop.lng]);
    });

    // Route polyline
    if (bounds.length > 1) {
      L.polyline(bounds, {
        color: "#d4622a",
        weight: 3,
        opacity: 0.5,
        dashArray: "10, 8",
      }).addTo(map);
    }

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersRef.current = [];
    };
  }, [loaded, stops, centerLat, centerLng]);

  // Open popup when highlighted from timeline
  useEffect(() => {
    if (highlightedIndex !== null && markersRef.current[highlightedIndex]) {
      markersRef.current[highlightedIndex].openPopup();
    }
  }, [highlightedIndex]);

  return (
    <div
      ref={mapRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 400,
        borderRadius: 16,
        overflow: "hidden",
        border: `1px solid ${colors.border}`,
      }}
    />
  );
};

// ── StopCard ──────────────────────────────────────────────────────────────────

const StopCard: React.FC<{
  stop: ItineraryStop;
  index: number;
  isLast: boolean;
  colors: ReturnType<typeof useColors>;
  isHighlighted: boolean;
  onGetMenu: (stop: ItineraryStop) => void;
  isLoading: boolean;
  onHover: (index: number | null) => void;
  compact?: boolean;
}> = ({ stop, index, isLast, colors, isHighlighted, onGetMenu, isLoading, onHover, compact }) => {
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
      {/* Timeline line + dot */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <div
          style={{
            width: compact ? 26 : 32, height: compact ? 26 : 32, borderRadius: "50%",
            backgroundColor: slotColor, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: compact ? 12 : 15, fontWeight: 800,
            border: isHighlighted ? `3px solid ${colors.text}` : "3px solid transparent",
            boxShadow: isHighlighted ? `0 0 0 3px ${slotColor}40` : "none",
            transition: "all 0.2s ease",
          }}
        >
          {slotIcon}
        </div>
        {!isLast && (
          <div style={{ width: 2, flex: 1, backgroundColor: colors.border, marginTop: 4, marginBottom: 4 }} />
        )}
      </div>

      {/* Card */}
      <div
        style={{
          flex: 1,
          backgroundColor: isHighlighted ? colors.accentLight : colors.card,
          border: `1px solid ${isHighlighted ? slotColor + "40" : colors.border}`,
          borderRadius: compact ? 10 : 14,
          padding: compact ? 10 : 14,
          marginBottom: isLast ? 0 : compact ? 6 : 12,
          transition: "all 0.2s ease",
        }}
      >
        {/* Dish image */}
        {!compact && stop.dishImageUrl && !imgError && (
          <div style={{
            height: 100, borderRadius: 10, overflow: "hidden",
            backgroundColor: colors.imageBg, marginBottom: 10,
          }}>
            <img
              src={stop.dishImageUrl}
              alt={stop.dish}
              onError={() => setImgError(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        )}

        {/* Time slot + time range */}
        {(stop.timeSlot || stop.timeRange) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            {stop.timeSlot && (
              <span style={{ fontSize: compact ? 10 : 11, fontWeight: 700, color: slotColor, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {stop.timeSlot}
              </span>
            )}
            {stop.timeRange && (
              <span style={{ fontSize: compact ? 10 : 11, color: colors.textSecondary }}>
                {stop.timeRange}
              </span>
            )}
          </div>
        )}

        {/* Restaurant name + neighborhood */}
        <div style={{ fontSize: compact ? 13 : 16, fontWeight: 700, color: colors.text, marginBottom: 2 }}>
          {stop.restaurantName}
        </div>
        {(stop.neighborhood || stop.walkingNote) && (
          <div style={{ fontSize: compact ? 10 : 12, color: colors.textSecondary, marginBottom: compact ? 4 : 8 }}>
            {stop.neighborhood ? `📍 ${stop.neighborhood}` : ""} {stop.walkingNote ? `· ${stop.walkingNote}` : ""}
          </div>
        )}

        {/* Dish highlight */}
        <div style={{
          backgroundColor: colors.accentLight,
          border: `1px solid ${colors.accent}20`,
          borderRadius: 8,
          padding: compact ? "5px 8px" : "7px 10px",
          marginBottom: compact ? 4 : 8,
        }}>
          <div style={{ fontSize: compact ? 11 : 13, fontWeight: 700, color: colors.accent }}>
            🍽️ {stop.dish}
          </div>
          {!compact && stop.dishDescription && (
            <div style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 1.4, marginTop: 2 }}>
              {stop.dishDescription}
            </div>
          )}
        </div>

        {/* Cultural context — expandable (only in full mode) */}
        {!compact && stop.culturalContext && (
          <>
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                background: "none", border: "none", padding: 0,
                cursor: "pointer", fontSize: 12, fontWeight: 600,
                color: colors.textSecondary, marginBottom: expanded ? 6 : 8,
              }}
            >
              {expanded ? "▾" : "▸"} Why this matters…
            </button>
            {expanded && (
              <div style={{
                fontSize: 12, color: colors.textSecondary,
                lineHeight: 1.55, padding: "6px 0 8px",
                borderTop: `1px solid ${colors.border}`,
              }}>
                {stop.culturalContext}
              </div>
            )}
          </>
        )}

        {/* Get menu button */}
        {!compact && (
          <button
            onClick={() => onGetMenu(stop)}
            disabled={isLoading}
            style={{
              width: "100%",
              padding: "7px 0",
              backgroundColor: colors.accent,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? 0.6 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {isLoading ? "Loading menu…" : "Full menu →"}
          </button>
        )}
      </div>
    </div>
  );
};

// ── Main Widget ──────────────────────────────────────────────────────────────

export default function TasteItinerary() {
  const { props, isPending } = useWidget<TasteItineraryProps>();
  const colors = useColors();
  const { callTool: getMenuDishes, isPending: isMenuLoading } = useCallTool("get-menu-dishes");
  const { callTool: exploreFoodMap, isPending: isMapLoading } = useCallTool("explore-city-food-map");
  const [loadingStop, setLoadingStop] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);

  // Map state — populated after calling explore-city-food-map
  const [mapData, setMapData] = useState<{
    stops: MapStop[];
    centerLat: number;
    centerLng: number;
  } | null>(null);
  const [showMap, setShowMap] = useState(false);

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div style={{ backgroundColor: colors.bg, padding: 24, borderRadius: 20 }}>
          <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
          <div style={{ height: 22, width: 200, backgroundColor: colors.border, borderRadius: 6, marginBottom: 6, animation: "pulse 1.5s infinite" }} />
          <div style={{ height: 14, width: 140, backgroundColor: colors.border, borderRadius: 6, marginBottom: 16, animation: "pulse 1.5s infinite" }} />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: "flex", gap: 16, marginBottom: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", backgroundColor: colors.border, animation: "pulse 1.5s infinite" }} />
              <div style={{ flex: 1, height: 120, backgroundColor: colors.card, border: `1px solid ${colors.border}`, borderRadius: 14, animation: "pulse 1.5s infinite" }} />
            </div>
          ))}
        </div>
      </McpUseProvider>
    );
  }

  const { city, stops } = props;

  const handleGetMenu = (stop: ItineraryStop) => {
    setLoadingStop(stop.restaurantName);
    getMenuDishes(
      { restaurantName: stop.restaurantName, city },
      { onSettled: () => setLoadingStop(null) }
    );
  };

  const handleExploreMap = () => {
    console.log("[taste-itinerary] Calling explore-city-food-map for:", city);
    exploreFoodMap(
      { city },
      {
        onSuccess: (data: any) => {
          console.log("[taste-itinerary] explore-city-food-map SUCCESS:", data);
          const sc = data?.structuredContent;
          if (sc) {
            setMapData({
              stops: sc.stops ?? [],
              centerLat: sc.centerLat ?? 0,
              centerLng: sc.centerLng ?? 0,
            });
            setShowMap(true);
          }
        },
        onError: (err: any) => {
          console.error("[taste-itinerary] explore-city-food-map ERROR:", err);
        },
      }
    );
  };

  // ── Side-by-side layout (itinerary + map) ──
  if (showMap && mapData) {
    return (
      <McpUseProvider autoSize>
        <div style={{ backgroundColor: colors.bg, padding: 20, borderRadius: 20, fontFamily: "system-ui, -apple-system, sans-serif" }}>
          <style>{`
            @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
            @keyframes spin { to { transform: rotate(360deg) } }
          `}</style>

          {/* Header */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: colors.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
              CityBites · Taste Itinerary
            </div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: colors.text }}>
              A day of food in {city}
            </h2>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: colors.textSecondary }}>
              {stops.length} stops · hover a stop to highlight it on the map
            </p>
          </div>

          {/* Side-by-side: Itinerary (left) + Map (right) */}
          <div style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
            {/* Left — compact timeline */}
            <div style={{
              flex: "0 0 340px",
              maxHeight: 500,
              overflowY: "auto",
              paddingRight: 8,
            }}>
              {stops.map((stop, i) => (
                <StopCard
                  key={`${stop.restaurantName}-${i}`}
                  stop={stop}
                  index={i}
                  isLast={i === stops.length - 1}
                  colors={colors}
                  isHighlighted={highlightedIndex === i}
                  onGetMenu={handleGetMenu}
                  isLoading={loadingStop === stop.restaurantName && isMenuLoading}
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
        </div>
      </McpUseProvider>
    );
  }

  // ── Phase 1: Itinerary only (no map) ──
  return (
    <McpUseProvider autoSize>
      <div style={{ backgroundColor: colors.bg, padding: 20, borderRadius: 20, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <style>{`
          @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
          @keyframes spin { to { transform: rotate(360deg) } }
        `}</style>

        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: colors.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
            CityBites · Taste Itinerary
          </div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: colors.text }}>
            A day of food in {city}
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: colors.textSecondary }}>
            {stops.length} stops · click "Full menu" to see signature dishes
          </p>
        </div>

        {/* Timeline */}
        <div>
          {stops.map((stop, i) => (
            <StopCard
              key={`${stop.restaurantName}-${i}`}
              stop={stop}
              index={i}
              isLast={i === stops.length - 1}
              colors={colors}
              isHighlighted={highlightedIndex === i}
              onGetMenu={handleGetMenu}
              isLoading={loadingStop === stop.restaurantName && isMenuLoading}
              onHover={setHighlightedIndex}
            />
          ))}
        </div>

        {stops.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: colors.textSecondary }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
            <p style={{ margin: 0 }}>No stops found for this itinerary.</p>
          </div>
        )}

        {/* Footer CTA — explore on food map */}
        {stops.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${colors.border}` }}>
            {isMapLoading ? (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 16px",
                backgroundColor: colors.accentLight,
                borderRadius: 12,
                border: `1px solid ${colors.accent}20`,
              }}>
                <div style={{
                  width: 20, height: 20,
                  border: `3px solid ${colors.border}`,
                  borderTopColor: colors.accent,
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: colors.accent }}>
                  Building your food map for {city}...
                </span>
              </div>
            ) : (
              <button
                onClick={handleExploreMap}
                style={{
                  padding: "9px 16px",
                  backgroundColor: colors.accentLight,
                  color: colors.accent,
                  border: `1px solid ${colors.accent}30`,
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "opacity 0.15s",
                }}
              >
                🗺️ Explore on the food map
              </button>
            )}
          </div>
        )}
      </div>
    </McpUseProvider>
  );
}
