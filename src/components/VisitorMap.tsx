import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap, ZoomControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { getRegion } from "@/pages/Index";
import { Satellite, Map as MapIcon } from "lucide-react";

type Props = { regionFilter: string; propertyId: string };

const TILES = {
  street: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com">CARTO</a>',
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://www.esri.com">Esri</a>',
  },
};

const SATELLITE_LABELS_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

function MapFit({ points, propertyId }: { points: { lat: number; lon: number }[]; propertyId: string }) {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => {
      map.invalidateSize();
      if (points.length > 0) {
        // Usa mediana — robusta a outliers internacionais (Suécia, Irlanda, etc.)
        const lats = [...points.map(p => p.lat)].sort((a, b) => a - b);
        const lons = [...points.map(p => p.lon)].sort((a, b) => a - b);
        const mid = Math.floor(points.length / 2);
        map.setView([lats[mid], lons[mid]], 5);
      } else {
        map.setView([-15.77972, -47.92972], 5);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [points, propertyId]);
  return null;
}

export function VisitorMap({ regionFilter, propertyId }: Props) {
  const [tileMode, setTileMode] = useState<"street" | "satellite">("street");

  const { data: events = [] } = useQuery({
    queryKey: ["fb-events-map", propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data, error } = await supabase
        .from("fb_events_raw")
        .select("lat, lon, city, country, state")
        .eq("property_id", propertyId)
        .not("lat", "is", null).not("lon", "is", null)
        .limit(3000);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!propertyId,
    staleTime: 120000,
    refetchInterval: 120000,
  });

  // Deduplica + agrega por grade de 0.1° (~11km) — reduz de 3000 para ~100-200 pontos
  const points = useMemo(() => {
    const grid = new globalThis.Map<string, { lat: number; lon: number; count: number; city: string; country: string }>();
    for (const e of events) {
      if (regionFilter !== "all" && getRegion(e.state, e.country) !== regionFilter) continue;
      const k = `${(+e.lat).toFixed(1)},${(+e.lon).toFixed(1)}`;
      if (grid.has(k)) { grid.get(k)!.count++; }
      else { grid.set(k, { lat: +e.lat, lon: +e.lon, count: 1, city: e.city || "", country: e.country || "" }); }
    }
    return Array.from(grid.values());
  }, [events, regionFilter]);

  const isSat = tileMode === "satellite";
  const fillColor = "#1a6b3a";
  const borderColor = "rgba(255,255,255,0.45)";

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <MapContainer
        center={[-15.77972, -47.92972]}
        zoom={5}
        scrollWheelZoom={true}
        zoomControl={false}
        preferCanvas={true}
        style={{ height: "100%", width: "100%" }}
      >
        <MapFit points={points} propertyId={propertyId} />
        <ZoomControl position="bottomright" />
        <TileLayer key={tileMode} url={TILES[tileMode].url} attribution={TILES[tileMode].attribution} />
        {isSat && <TileLayer url={SATELLITE_LABELS_URL} opacity={1} />}

        {points.map((p, i) => {
          const r = p.count >= 50 ? 10 : p.count >= 10 ? 7 : 5;
          return (
            <CircleMarker
              key={i}
              center={[p.lat, p.lon]}
              radius={r}
              pathOptions={{ color: borderColor, fillColor, fillOpacity: 0.9, weight: 2 }}
            >
              <Tooltip direction="top" opacity={1}>
                <span style={{ fontWeight: 600 }}>{p.city || p.country}</span>
                {p.count > 1 && <span style={{ color: fillColor }}> · {p.count}</span>}
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Toggle */}
      <div style={{ position: "absolute", top: 12, right: 12, zIndex: 1000 }}>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-background/90 backdrop-blur p-1 shadow-md">
          <button onClick={() => setTileMode("street")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${!isSat ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}>
            <MapIcon className="h-3 w-3" /> Mapa
          </button>
          <button onClick={() => setTileMode("satellite")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${isSat ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}>
            <Satellite className="h-3 w-3" /> Satélite
          </button>
        </div>
      </div>
    </div>
  );
}
