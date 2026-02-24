import { McpUseProvider, useWidget, useWidgetTheme, useCallTool, type WidgetMetadata } from "mcp-use/react";
import React, { useState, useEffect, useRef } from "react";
import { propSchema, type CityFoodMapProps, type MapStop, type DayItinerary } from "./types";

export const widgetMetadata: WidgetMetadata = {
  description: "Interactive map showing a multi-day food crawl route with day-switcher tabs, restaurant pins, dish photos, and route lines",
  props: propSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Building your food map...",
    invoked: "Food map ready",
    csp: {
      resourceDomains: [
        "https://unpkg.com",
        "https://tile.openstreetmap.org",
        "https://images.unsplash.com",
        "https://a.tile.openstreetmap.org",
        "https://b.tile.openstreetmap.org",
        "https://c.tile.openstreetmap.org",
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
  Lunch: "#3a8a4f",
  Dinner: "#8b3a62",
  "Late Bites": "#4a5899",
};

const SLOT_ICONS: Record<string, string> = {
  "Morning Coffee": "☕",
  Lunch: "🍝",
  Dinner: "🍷",
  "Late Bites": "🌙",
};

const DAY_COLORS = ["#d4622a", "#3a8a4f", "#4a5899"];

// ── Leaflet Map Component ─────────────────────────────────────────────────────

const LeafletMap: React.FC<{
  stops: MapStop[];
  centerLat: number;
  centerLng: number;
  colors: ReturnType<typeof useColors>;
  onStopClick: (index: number) => void;
  dayColor?: string;
  userLoc: { lat: number; lng: number } | null;
}> = ({ stops, centerLat, centerLng, colors, onStopClick, dayColor, userLoc }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
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
    if (!loaded || !mapRef.current) return;

    // Clean up previous map instance
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const L = (window as any).L;
    const map = L.map(mapRef.current, { scrollWheelZoom: false }).setView([centerLat, centerLng], 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    const bounds: [number, number][] = [];

    stops.forEach((stop, index) => {
      const slotColor = stop.timeSlot ? (SLOT_COLORS[stop.timeSlot] ?? dayColor ?? "#d4622a") : (dayColor ?? "#d4622a");
      const slotIcon = stop.timeSlot ? (SLOT_ICONS[stop.timeSlot] ?? `${index + 1}`) : `${index + 1}`;
      const isTimeSlotMode = !!stop.timeSlot;

      const markerIcon = L.divIcon({
        className: "citybites-marker",
        html: `<div style="
          width:34px;height:34px;border-radius:50%;
          background:${slotColor};color:#fff;
          display:flex;align-items:center;justify-content:center;
          font-weight:800;font-size:${isTimeSlotMode ? "15px" : "14px"};font-family:system-ui;
          border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);
          cursor:pointer;
        ">${slotIcon}</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -20],
      });

      const dishImgHtml = stop.dishImageUrl
        ? `<img src="${stop.dishImageUrl}" alt="${stop.signatureDish}" style="width:100%;height:100px;object-fit:cover;border-radius:8px;margin-bottom:8px;" onerror="this.style.display='none'" />`
        : "";

      const timeInfo = stop.timeSlot
        ? `<div style="font-size:10px;font-weight:700;color:${slotColor};text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">${slotIcon} ${stop.timeSlot}${stop.timeRange ? ` · ${stop.timeRange}` : ""}</div>`
        : "";

      const popupContent = `
        <div style="font-family:system-ui,-apple-system,sans-serif;min-width:200px;max-width:260px;">
          ${dishImgHtml}
          ${timeInfo}
          <div style="font-size:15px;font-weight:700;margin-bottom:4px;">${stop.name}</div>
          <div style="font-size:11px;color:#6b6560;margin-bottom:6px;">📍 ${stop.neighborhood} · ${stop.cuisineType}</div>
          <div style="background:#fdf0e8;border:1px solid #d4622a30;border-radius:8px;padding:8px 10px;margin-bottom:4px;">
            <div style="font-size:12px;font-weight:700;color:#d4622a;margin-bottom:2px;">🍽️ ${stop.signatureDish}</div>
            <div style="font-size:11px;color:#6b6560;line-height:1.4;">${stop.dishDescription}</div>
          </div>
        </div>
      `;

      const marker = L.marker([stop.lat, stop.lng], { icon: markerIcon }).addTo(map);
      marker.bindPopup(popupContent, { maxWidth: 280, closeButton: true });
      marker.on("click", () => onStopClick(index));
      bounds.push([stop.lat, stop.lng]);
    });

    // Route polyline
    if (bounds.length > 1) {
      L.polyline(bounds, {
        color: dayColor ?? "#d4622a",
        weight: 3,
        opacity: 0.6,
        dashArray: "8, 8",
      }).addTo(map);
    }

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      userMarkerRef.current = null;
    };
  }, [loaded, stops, centerLat, centerLng, dayColor]);

  // Update user location marker
  useEffect(() => {
    if (!loaded || !mapInstanceRef.current) return;
    const L = (window as any).L;

    if (userMarkerRef.current) {
      mapInstanceRef.current.removeLayer(userMarkerRef.current);
    }

    if (userLoc) {
      const userIcon = L.divIcon({
        className: "citybites-user-marker",
        html: `<div style="
          width:16px;height:16px;border-radius:50%;
          background:#2563eb;border:2px solid #fff;
          box-shadow:0 0 0 4px rgba(37,99,235,0.3);
          animation: pulse-user 2s infinite;
        "></div>
        <style>@keyframes pulse-user { 0% { box-shadow:0 0 0 0 rgba(37,99,235,0.4) } 70% { box-shadow:0 0 0 10px rgba(37,99,235,0) } 100% { box-shadow:0 0 0 0 rgba(37,99,235,0) } }</style>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      userMarkerRef.current = L.marker([userLoc.lat, userLoc.lng], { icon: userIcon, zIndexOffset: 1000 }).addTo(mapInstanceRef.current);
      mapInstanceRef.current.panTo([userLoc.lat, userLoc.lng]);
    }
  }, [userLoc, loaded]);

  return (
    <div
      ref={mapRef}
      style={{
        width: "100%",
        height: 380,
        borderRadius: 16,
        overflow: "hidden",
        border: `1px solid ${colors.border}`,
      }}
    />
  );
};

// ── Day Switcher Tab Bar ─────────────────────────────────────────────────────

const DaySwitcher: React.FC<{
  days: DayItinerary[];
  activeDay: number | null; // null = "All"
  onSelect: (day: number | null) => void;
  colors: ReturnType<typeof useColors>;
}> = ({ days, activeDay, onSelect, colors }) => (
  <div style={{
    display: "flex",
    gap: 6,
    marginBottom: 14,
    overflowX: "auto",
    paddingBottom: 4,
  }}>
    {/* All tab */}
    <button
      onClick={() => onSelect(null)}
      style={{
        padding: "6px 14px",
        borderRadius: 20,
        border: `1px solid ${activeDay === null ? colors.accent : colors.border}`,
        backgroundColor: activeDay === null ? colors.accent : colors.card,
        color: activeDay === null ? "#fff" : colors.textSecondary,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "all 0.15s ease",
      }}
    >
      🗺️ All Days
    </button>

    {days.map((day, i) => {
      const isActive = activeDay === day.day;
      const dayColor = DAY_COLORS[i % DAY_COLORS.length];
      return (
        <button
          key={day.day}
          onClick={() => onSelect(day.day)}
          style={{
            padding: "6px 14px",
            borderRadius: 20,
            border: `1px solid ${isActive ? dayColor : colors.border}`,
            backgroundColor: isActive ? dayColor : colors.card,
            color: isActive ? "#fff" : colors.textSecondary,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "all 0.15s ease",
          }}
        >
          {day.label}
        </button>
      );
    })}
  </div>
);

// ── Stop Card ────────────────────────────────────────────────────────────────

const StopCard: React.FC<{
  stop: MapStop;
  index: number;
  colors: ReturnType<typeof useColors>;
  isHighlighted: boolean;
  onGetMenu: (stop: MapStop) => void;
  isLoading: boolean;
}> = ({ stop, index, colors, isHighlighted, onGetMenu, isLoading }) => {
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const slotColor = stop.timeSlot ? (SLOT_COLORS[stop.timeSlot] ?? colors.accent) : colors.accent;
  const slotIcon = stop.timeSlot ? (SLOT_ICONS[stop.timeSlot] ?? "📍") : null;

  return (
    <div
      style={{
        backgroundColor: isHighlighted ? colors.accentLight : colors.card,
        border: `1px solid ${isHighlighted ? slotColor + "50" : colors.border}`,
        borderRadius: 14,
        padding: 14,
        minWidth: 240,
        maxWidth: 280,
        flexShrink: 0,
        transition: "all 0.2s ease",
        cursor: "default",
        scrollSnapAlign: "start",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Dish image */}
      <div style={{
        height: 110, borderRadius: 10, overflow: "hidden",
        backgroundColor: colors.imageBg, marginBottom: 10,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {stop.dishImageUrl && !imgError ? (
          <img src={stop.dishImageUrl} alt={stop.signatureDish} onError={() => setImgError(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: 36, opacity: 0.4 }}>🍽️</span>
        )}
      </div>

      {/* Time slot badge (if itinerary mode) */}
      {stop.timeSlot && (
        <div style={{
          fontSize: 10, fontWeight: 700, color: slotColor,
          textTransform: "uppercase", letterSpacing: "0.05em",
          marginBottom: 4,
        }}>
          {slotIcon} {stop.timeSlot}{stop.timeRange ? ` · ${stop.timeRange}` : ""}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{
          width: 26, height: 26, borderRadius: "50%",
          backgroundColor: slotColor, color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: slotIcon ? 13 : 12, fontWeight: 800, flexShrink: 0,
        }}>
          {slotIcon ?? (index + 1)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: colors.text,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {stop.name}
          </div>
          <div style={{ fontSize: 11, color: colors.textSecondary }}>📍 {stop.neighborhood}</div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 500,
          backgroundColor: colors.tag, color: colors.tagText,
          padding: "2px 7px", borderRadius: 20, whiteSpace: "nowrap", flexShrink: 0,
        }}>
          {stop.cuisineType}
        </span>
      </div>

      {/* Dish info */}
      <div style={{
        backgroundColor: colors.accentLight, border: `1px solid ${colors.accent}20`,
        borderRadius: 8, padding: "7px 10px", marginBottom: 8,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: colors.accent }}>🍽️ {stop.signatureDish}</div>
        <div style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 1.4, marginTop: 2 }}>{stop.dishDescription}</div>
      </div>

      {/* Why local */}
      <div style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 1.4, marginBottom: 8 }}>{stop.whyLocal}</div>

      {/* Get menu button */}
      <button
        onClick={() => onGetMenu(stop)}
        disabled={isLoading}
        style={{
          width: "100%", padding: "7px 12px",
          backgroundColor: colors.accent, color: "#fff", border: "none",
          borderRadius: 8, fontSize: 12, fontWeight: 600,
          cursor: isLoading ? "not-allowed" : "pointer",
          opacity: isLoading ? 0.6 : 1, transition: "opacity 0.15s",
        }}
      >
        {isLoading ? "Loading menu…" : "See full menu →"}
      </button>
    </div>
  );
};

// ── Main Widget ──────────────────────────────────────────────────────────────

const CityFoodMap: React.FC = () => {
  const { props, isPending } = useWidget<CityFoodMapProps>();
  const colors = useColors();
  const { callTool: getMenuDishes, isPending: isMenuLoading } = useCallTool("get-menu-dishes");
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const [loadingStop, setLoadingStop] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [connError, setConnError] = useState(false);

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div style={{ backgroundColor: colors.bg, padding: 24, borderRadius: 20 }}>
          <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
          <div style={{ height: 22, width: 220, backgroundColor: colors.border, borderRadius: 6, marginBottom: 8, animation: "pulse 1.5s infinite" }} />
          <div style={{ height: 14, width: 160, backgroundColor: colors.border, borderRadius: 6, marginBottom: 20, animation: "pulse 1.5s infinite" }} />
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ width: 80, height: 32, backgroundColor: colors.border, borderRadius: 20, animation: "pulse 1.5s infinite" }} />
            ))}
          </div>
          <div style={{ height: 380, backgroundColor: colors.border, borderRadius: 16, marginBottom: 16, animation: "pulse 1.5s infinite" }} />
          <div style={{ display: "flex", gap: 12, overflow: "hidden" }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ minWidth: 240, height: 220, backgroundColor: colors.card, border: `1px solid ${colors.border}`, borderRadius: 14, animation: "pulse 1.5s infinite" }} />
            ))}
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const { city, centerLat, centerLng, stops, days } = props;
  const hasDays = days && days.length > 0;

  // Get the active stops based on selected day
  const activeStops = (() => {
    if (!hasDays || activeDay === null) return stops;
    const dayData = days.find((d) => d.day === activeDay);
    return dayData ? dayData.stops : stops;
  })();

  const activeDayColor = (() => {
    if (!hasDays || activeDay === null) return "#d4622a";
    const dayIndex = days.findIndex((d) => d.day === activeDay);
    return DAY_COLORS[dayIndex % DAY_COLORS.length];
  })();

  const handleGetMenu = (stop: MapStop) => {
    setLoadingStop(stop.name);
    getMenuDishes(
      { restaurantName: stop.name, city },
      { 
        onSettled: () => setLoadingStop(null),
        onError: (err: any) => {
          if (err.message?.includes("not initialized")) setConnError(true);
        }
      }
    );
  };

  const handleLocate = () => {
    if (!navigator.geolocation) return;
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocLoading(false);
      },
      () => setLocLoading(false),
      { enableHighAccuracy: true }
    );
  };

  return (
    <McpUseProvider autoSize>
      <div style={{ backgroundColor: colors.bg, padding: 20, borderRadius: 20, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>

        {/* Header */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: colors.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
            CityBites · Food Map
          </div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: colors.text }}>
            {hasDays && days.length > 1 ? `${days.length}-day taste route in ${city}` : `Taste route in ${city}`}
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: colors.textSecondary }}>
            {activeStops.length} stops{activeDay !== null ? ` on Day ${activeDay}` : ""} · tap a pin or scroll to explore
          </p>
        </div>

        {/* Day Switcher */}
        {hasDays && days.length > 1 && (
          <DaySwitcher days={days} activeDay={activeDay} onSelect={setActiveDay} colors={colors} />
        )}

        {/* Map */}
        <div style={{ marginBottom: 16, position: "relative" }}>
          <LeafletMap
            stops={activeStops}
            centerLat={centerLat ?? 0}
            centerLng={centerLng ?? 0}
            colors={colors}
            onStopClick={setHighlightedIndex}
            dayColor={activeDayColor}
            userLoc={userLoc}
          />
          {/* Locate Me Button Overlay */}
          <button
            onClick={handleLocate}
            disabled={locLoading}
            title="Show my current location"
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              zIndex: 1000,
              width: 36,
              height: 36,
              borderRadius: 8,
              backgroundColor: colors.card,
              border: `1px solid ${colors.border}`,
              color: userLoc ? "#2563eb" : colors.textSecondary,
              fontSize: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
            }}
          >
            {locLoading ? "⏳" : "🎯"}
          </button>
        </div>

        {/* Connection Error Warning */}
        {connError && (
          <div style={{
            marginBottom: 16,
            padding: "12px 16px",
            backgroundColor: "#fee2e2",
            border: "1px solid #ef444430",
            borderRadius: 12,
            color: "#b91c1c",
            fontSize: 13,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}>
            <div style={{ fontWeight: 700 }}>⚠️ Connection lost</div>
            <div style={{ lineHeight: 1.4 }}>
              The server session was lost (common during development hot-reloads). 
              Please <strong>refresh the entire page</strong> to restore connectivity.
            </div>
          </div>
        )}

        {/* Card strip */}
        <div style={{
          display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8,
          scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch",
        }}>
          {activeStops.map((stop, i) => (
            <StopCard
              key={`${stop.name}-${i}`}
              stop={stop}
              index={i}
              colors={colors}
              isHighlighted={highlightedIndex === i}
              onGetMenu={handleGetMenu}
              isLoading={loadingStop === stop.name && isMenuLoading}
            />
          ))}
        </div>

        {activeStops.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: colors.textSecondary }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
            <p style={{ margin: 0 }}>No restaurants found for this city.</p>
          </div>
        )}
      </div>
    </McpUseProvider>
  );
};

export default CityFoodMap;
