import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { loadGoogleMaps } from "@/lib/gmaps";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPinned, MapPin, Search, Navigation, Layers, Map as MapIcon } from "lucide-react";

const statusColor = (l) => (l.phase === "lancamento" ? "#D4AF37" : (l.tipo === "fechado" ? "#E11D48" : "#10B981"));
const routeUrl = (l) => `https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}`;
const localLabel = (l) => [l.cidade, l.estado].filter(Boolean).join(" - ");

export default function GeneralMapDialog({ open, onOpenChange, onSelectLot, large = false }) {
  const ref = useRef(null);
  const mapObj = useRef(null);
  const markers = useRef({});
  const [err, setErr] = useState(false);
  const [q, setQ] = useState("");
  const [lotSel, setLotSel] = useState("all");
  const [tipo, setTipo] = useState("all");
  const [city, setCity] = useState("all");
  const [mapType, setMapType] = useState("roadmap");

  const lotQ = useQuery({ queryKey: ["loteamentos"], queryFn: async () => (await api.get("/loteamentos")).data, enabled: open });
  const all = lotQ.data || [];

  const cities = useMemo(() => [...new Set(all.map((l) => l.cidade).filter(Boolean))].sort(), [all]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter((l) => {
      if (lotSel !== "all" && l.id !== lotSel) return false;
      if (term && !((l.name || "").toLowerCase().includes(term) || (l.cidade || "").toLowerCase().includes(term))) return false;
      if (tipo !== "all" && (l.tipo || "") !== tipo) return false;
      if (city !== "all" && (l.cidade || "") !== city) return false;
      return true;
    });
  }, [all, q, lotSel, tipo, city]);

  const fpts = filtered.filter((l) => l.lat != null && l.lng != null);
  const filterKey = fpts.map((l) => l.id).join(",");

  useEffect(() => {
    if (!open || fpts.length === 0) return;
    let cancelled = false;
    loadGoogleMaps().then((maps) => {
      if (cancelled || !ref.current) return;
      const map = new maps.Map(ref.current, {
        zoom: 11, center: { lat: Number(fpts[0].lat), lng: Number(fpts[0].lng) },
        mapTypeControl: true, streetViewControl: false, fullscreenControl: true, mapTypeId: mapType,
        mapTypeControlOptions: { mapTypeIds: ["roadmap", "satellite", "hybrid"] },
      });
      mapObj.current = map;
      map.addListener("maptypeid_changed", () => setMapType(map.getMapTypeId()));
      const bounds = new maps.LatLngBounds();
      const info = new maps.InfoWindow();
      markers.current = {};
      fpts.forEach((l) => {
        const pos = { lat: Number(l.lat), lng: Number(l.lng) };
        const marker = new maps.Marker({
          position: pos, map, title: l.name,
          icon: {
            path: "M12 0C7 0 3 4 3 9c0 6 9 15 9 15s9-9 9-15c0-5-4-9-9-9z",
            fillColor: statusColor(l), fillOpacity: 1, strokeColor: "#fff", strokeWeight: 1.5,
            scale: 1.6, anchor: new maps.Point(12, 24),
          },
        });
        markers.current[l.id] = marker;
        bounds.extend(pos);
        marker.addListener("click", () => {
          info.setContent(
            `<div style="font-weight:700;font-size:14px;color:#0F382C;margin-bottom:2px">${l.name}</div>` +
            `<div style="font-size:12px;color:#374151;font-weight:500">${localLabel(l) || "Sem cidade/estado"}</div>` +
            `<div style="margin-top:6px;display:flex;gap:6px">` +
            `<button id="go-${l.id}" style="background:#0F382C;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer">Ver detalhes</button>` +
            `<a href="${routeUrl(l)}" target="_blank" rel="noreferrer" style="background:#D4AF37;color:#000;border-radius:6px;padding:4px 10px;font-size:12px;text-decoration:none">Traçar rota</a>` +
            `</div>`
          );
          info.open(map, marker);
          maps.event.addListenerOnce(info, "domready", () => {
            const b = document.getElementById(`go-${l.id}`);
            if (b) b.onclick = () => { onSelectLot?.(l); onOpenChange(false); };
          });
        });
      });
      if (fpts.length > 1) map.fitBounds(bounds); else map.setZoom(14);
    }).catch(() => setErr(true));
    return () => { cancelled = true; };
  }, [open, filterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (mapObj.current) mapObj.current.setMapTypeId(mapType); }, [mapType]);

  const focusLot = (l) => {
    if (l.lat == null || l.lng == null) { onSelectLot?.(l); onOpenChange(false); return; }
    if (mapObj.current) { mapObj.current.panTo({ lat: Number(l.lat), lng: Number(l.lng) }); mapObj.current.setZoom(15); }
    const m = markers.current[l.id];
    if (m && window.google) window.google.maps.event.trigger(m, "click");
  };

  const toggleSatellite = () => setMapType((t) => (t === "roadmap" ? "satellite" : "roadmap"));
  const mapH = large ? "h-[48vh] lg:h-[74vh]" : "h-[56vh]";

  const legendEl = (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#10B981" }} /> Aberto</span>
      <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#E11D48" }} /> Fechado</span>
      <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#D4AF37" }} /> Lançamento</span>
    </div>
  );

  const sortedLots = useMemo(() => [...all].sort((a, b) => (a.name || "").localeCompare(b.name || "")), [all]);

  const filtersEl = (
    <div className="flex flex-col sm:flex-row flex-wrap gap-2">
      <div className="relative flex-1 min-w-[180px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar loteamento ou cidade..." className="pl-9 h-9" data-testid="map-search" />
      </div>
      <Select value={lotSel} onValueChange={setLotSel}>
        <SelectTrigger className="h-9 w-full sm:w-[200px]" data-testid="map-filter-lot"><SelectValue placeholder="Loteamento" /></SelectTrigger>
        <SelectContent className="max-h-[300px]">
          <SelectItem value="all">Todos os loteamentos</SelectItem>
          {sortedLots.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={tipo} onValueChange={setTipo}>
        <SelectTrigger className="h-9 w-full sm:w-[140px]" data-testid="map-filter-tipo"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os tipos</SelectItem>
          <SelectItem value="aberto">Aberto</SelectItem>
          <SelectItem value="fechado">Fechado</SelectItem>
        </SelectContent>
      </Select>
      <Select value={city} onValueChange={setCity}>
        <SelectTrigger className="h-9 w-full sm:w-[160px]" data-testid="map-filter-city"><SelectValue placeholder="Cidade" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as cidades</SelectItem>
          {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button variant="outline" className="h-9 gap-1.5 shrink-0" onClick={toggleSatellite} data-testid="map-toggle-satellite">
        {mapType === "roadmap" ? <Layers className="h-4 w-4" /> : <MapIcon className="h-4 w-4" />}
        <span className="hidden sm:inline">{mapType === "roadmap" ? "Satélite" : "Mapa"}</span>
      </Button>
    </div>
  );

  const mapCanvas = <div ref={ref} className={`w-full ${mapH} rounded-xl border border-border/60 bg-muted`} data-testid="general-map-canvas" />;

  let body;
  if (err) {
    body = <p className="text-sm text-destructive py-6 text-center" data-testid="general-map-error">Não foi possível carregar o Google Maps. Verifique a chave de API.</p>;
  } else {
    const empty = fpts.length === 0;
    const sidebar = (
      <div className="lg:w-72 shrink-0 lg:max-h-[74vh] overflow-y-auto rounded-xl border border-border/60 p-2 space-y-1" data-testid="general-map-list">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-1 py-1">Loteamentos ({filtered.length})</div>
        {filtered.map((l) => (
          <div key={l.id} className="rounded-lg hover:bg-muted/60 transition-colors flex items-center">
            <button onClick={() => focusLot(l)} data-testid={`map-list-item-${l.id}`} className="flex-1 text-left px-2 py-2 min-w-0">
              <div className="font-medium text-sm truncate flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: statusColor(l) }} />{l.name}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                <MapPin className="h-3 w-3 shrink-0" />{l.lat != null ? (localLabel(l) || "ver no mapa") : "sem localização — abrir detalhes"}
              </div>
            </button>
            {l.lat != null && (
              <a href={routeUrl(l)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Traçar rota"
                className="shrink-0 mr-1 h-8 w-8 rounded-md flex items-center justify-center text-primary hover:bg-primary/10" data-testid={`map-route-${l.id}`}>
                <Navigation className="h-4 w-4" />
              </a>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="text-xs text-muted-foreground px-2 py-4 text-center">Nenhum loteamento com esses filtros.</p>}
      </div>
    );
    const mapSide = (
      <div className="flex-1 min-w-0 space-y-2">
        {empty ? (
          <div className={`w-full ${mapH} rounded-xl border border-dashed border-border/60 bg-muted/40 flex items-center justify-center text-sm text-muted-foreground text-center px-4`} data-testid="general-map-empty">
            Nenhum loteamento com coordenadas nos filtros atuais. Informe o link do Google Maps / coordenadas em Localização.
          </div>
        ) : mapCanvas}
        <p className="text-[11px] text-muted-foreground">Toque num pino (ou na lista) para abrir os detalhes, fotos, vídeos, documentos e IA. Use "Traçar rota" para navegar até o loteamento.</p>
      </div>
    );
    body = (
      <div className="space-y-3">
        {filtersEl}
        {legendEl}
        {large ? <div className="flex flex-col lg:flex-row gap-3">{sidebar}{mapSide}</div> : mapSide}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={large ? "max-w-[96vw] w-[96vw] max-h-[94vh] overflow-y-auto" : "max-w-4xl"} data-testid="general-map-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2"><MapPinned className="h-5 w-5 text-[hsl(var(--gold))]" /> Mapa geral dos loteamentos</DialogTitle>
          <DialogDescription>{fpts.length} loteamento(s) no mapa. Filtre, clique num pino e trace a rota.</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
