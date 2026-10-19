import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/gmaps";
import { Button } from "@/components/ui/button";
import { MapPin, ExternalLink } from "lucide-react";

export default function LoteamentoMap({ lot }) {
  const ref = useRef(null);
  const [err, setErr] = useState(false);
  const lat = lot?.lat;
  const lng = lot?.lng;

  useEffect(() => {
    if (lat == null || lng == null) return;
    let cancelled = false;
    loadGoogleMaps().then((maps) => {
      if (cancelled || !ref.current) return;
      const pos = { lat: Number(lat), lng: Number(lng) };
      const map = new maps.Map(ref.current, { center: pos, zoom: 15, mapTypeControl: false, streetViewControl: false, zoomControl: true });
      new maps.Marker({ position: pos, map, title: lot?.name });
    }).catch(() => setErr(true));
    return () => { cancelled = true; };
  }, [lat, lng, lot?.name]);

  if (lat == null || lng == null) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground" data-testid="lot-map-empty">
        <MapPin className="h-8 w-8 mx-auto mb-2 opacity-40" />
        Sem coordenadas. Vá em <b>Informações → Localização</b> e cole o link do Google Maps ou as coordenadas (lat, long), depois salve.
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="lot-map">
      <div ref={ref} className="w-full h-[48vh] rounded-xl border border-border/60 bg-muted" />
      {err && <p className="text-xs text-destructive">Não foi possível carregar o mapa. Verifique a chave do Google Maps.</p>}
      <a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noreferrer">
        <Button variant="outline" size="sm" className="gap-1.5"><ExternalLink className="h-4 w-4" /> Abrir no Google Maps</Button>
      </a>
    </div>
  );
}
