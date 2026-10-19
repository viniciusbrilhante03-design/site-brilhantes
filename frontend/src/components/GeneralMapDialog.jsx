import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { loadGoogleMaps } from "@/lib/gmaps";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MapPinned, MapPin } from "lucide-react";

export default function GeneralMapDialog({ open, onOpenChange, onSelectLot, large = false }) {
  const ref = useRef(null);
  const mapObj = useRef(null);
  const markers = useRef({});
  const [err, setErr] = useState(false);
  const lotQ = useQuery({ queryKey: ["loteamentos"], queryFn: async () => (await api.get("/loteamentos")).data, enabled: open });
  const all = lotQ.data || [];
  const pts = all.filter((l) => l.lat != null && l.lng != null);

  useEffect(() => {
    if (!open || pts.length === 0) return;
    let cancelled = false;
    loadGoogleMaps().then((maps) => {
      if (cancelled || !ref.current) return;
      const map = new maps.Map(ref.current, {
        zoom: 11, center: { lat: Number(pts[0].lat), lng: Number(pts[0].lng) },
        mapTypeControl: false, streetViewControl: false, fullscreenControl: true,
      });
      mapObj.current = map;
      const bounds = new maps.LatLngBounds();
      const info = new maps.InfoWindow();
      markers.current = {};
      pts.forEach((l) => {
        const pos = { lat: Number(l.lat), lng: Number(l.lng) };
        const marker = new maps.Marker({ position: pos, map, title: l.name });
        markers.current[l.id] = { marker, info };
        bounds.extend(pos);
        marker.addListener("click", () => {
          info.setContent(
            `<div style="font-weight:600;margin-bottom:2px">${l.name}</div>` +
            `<div style="font-size:12px;color:#666">${l.cidade || ""}</div>` +
            `<button id="go-${l.id}" style="margin-top:6px;background:#0F382C;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer">Ver detalhes</button>`
          );
          info.open(map, marker);
          maps.event.addListenerOnce(info, "domready", () => {
            const b = document.getElementById(`go-${l.id}`);
            if (b) b.onclick = () => { onSelectLot?.(l); onOpenChange(false); };
          });
        });
      });
      if (pts.length > 1) map.fitBounds(bounds); else map.setZoom(14);
    }).catch(() => setErr(true));
    return () => { cancelled = true; };
  }, [open, lotQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusLot = (l) => {
    if (l.lat == null || l.lng == null) { onSelectLot?.(l); onOpenChange(false); return; }
    const entry = markers.current[l.id];
    if (mapObj.current) { mapObj.current.panTo({ lat: Number(l.lat), lng: Number(l.lng) }); mapObj.current.setZoom(15); }
    if (entry && window.google) window.google.maps.event.trigger(entry.marker, "click");
  };

  const mapH = large ? "h-[52vh] lg:h-[78vh]" : "h-[60vh]";

  const mapCanvas = <div ref={ref} className={`w-full ${mapH} rounded-xl border border-border/60 bg-muted`} data-testid="general-map-canvas" />;

  let body;
  if (err) {
    body = <p className="text-sm text-destructive py-6 text-center" data-testid="general-map-error">Não foi possível carregar o Google Maps. Verifique a chave de API.</p>;
  } else if (pts.length === 0) {
    body = <p className="text-sm text-muted-foreground py-10 text-center" data-testid="general-map-empty">Nenhum loteamento com coordenadas. Edite um loteamento e informe o link do Google Maps ou as coordenadas em Localização.</p>;
  } else if (large) {
    body = (
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="lg:w-72 shrink-0 lg:max-h-[78vh] overflow-y-auto rounded-xl border border-border/60 p-2 space-y-1" data-testid="general-map-list">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-1 py-1">Loteamentos ({all.length})</div>
          {all.map((l) => (
            <button key={l.id} onClick={() => focusLot(l)} data-testid={`map-list-item-${l.id}`}
              className="w-full text-left rounded-lg px-2 py-2 hover:bg-muted/60 transition-colors">
              <div className="font-medium text-sm truncate">{l.name}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                <MapPin className="h-3 w-3 shrink-0" />{l.lat != null ? (l.cidade || "ver no mapa") : "sem localização — abrir detalhes"}
              </div>
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          {mapCanvas}
          <p className="text-[11px] text-muted-foreground">Toque num marcador (ou num loteamento da lista) para abrir os detalhes, fotos, vídeos, documentos e IA.</p>
        </div>
      </div>
    );
  } else {
    body = (
      <>
        {mapCanvas}
        <p className="text-[11px] text-muted-foreground mt-2">Se aparecer "Oops / RefererNotAllowed", autorize o domínio deste app nas restrições da chave do Google Maps (Google Cloud Console).</p>
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={large ? "max-w-[96vw] w-[96vw] max-h-[94vh] overflow-y-auto" : "max-w-4xl"} data-testid="general-map-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2"><MapPinned className="h-5 w-5 text-[hsl(var(--gold))]" /> Mapa geral dos loteamentos</DialogTitle>
          <DialogDescription>{pts.length} loteamento(s) localizados. Clique em um marcador para abrir os detalhes.</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
