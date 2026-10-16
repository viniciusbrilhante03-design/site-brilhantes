import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { loadGoogleMaps } from "@/lib/gmaps";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MapPinned } from "lucide-react";

export default function GeneralMapDialog({ open, onOpenChange, onSelectLot }) {
  const ref = useRef(null);
  const [err, setErr] = useState(false);
  const lotQ = useQuery({ queryKey: ["loteamentos"], queryFn: async () => (await api.get("/loteamentos")).data, enabled: open });
  const pts = (lotQ.data || []).filter((l) => l.lat != null && l.lng != null);

  useEffect(() => {
    if (!open || pts.length === 0) return;
    let cancelled = false;
    loadGoogleMaps().then((maps) => {
      if (cancelled || !ref.current) return;
      const map = new maps.Map(ref.current, {
        zoom: 11, center: { lat: Number(pts[0].lat), lng: Number(pts[0].lng) },
        mapTypeControl: false, streetViewControl: false,
      });
      const bounds = new maps.LatLngBounds();
      const info = new maps.InfoWindow();
      pts.forEach((l) => {
        const pos = { lat: Number(l.lat), lng: Number(l.lng) };
        const marker = new maps.Marker({ position: pos, map, title: l.name });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl" data-testid="general-map-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2"><MapPinned className="h-5 w-5 text-[hsl(var(--gold))]" /> Mapa geral dos loteamentos</DialogTitle>
          <DialogDescription>{pts.length} loteamento(s) localizados. Clique em um marcador para abrir os detalhes.</DialogDescription>
        </DialogHeader>
        {err ? (
          <p className="text-sm text-destructive py-6 text-center" data-testid="general-map-error">Não foi possível carregar o Google Maps. Verifique a chave de API.</p>
        ) : pts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center" data-testid="general-map-empty">
            Nenhum loteamento com coordenadas. Edite um loteamento e informe o link do Google Maps ou as coordenadas em Localização.
          </p>
        ) : (
          <>
            <div ref={ref} className="w-full h-[60vh] rounded-xl border border-border/60 bg-muted" data-testid="general-map-canvas" />
            <p className="text-[11px] text-muted-foreground mt-2">Se aparecer "Oops / RefererNotAllowed", autorize o domínio deste app nas restrições da chave do Google Maps (Google Cloud Console).</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
