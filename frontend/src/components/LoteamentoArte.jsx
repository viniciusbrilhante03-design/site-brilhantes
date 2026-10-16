import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ImagePlus, Download, Loader2, UserRound } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

function loadImg(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

export default function LoteamentoArte({ open, onOpenChange, lotId, profilePhoto }) {
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const [photo, setPhoto] = useState("");
  const [rendering, setRendering] = useState(false);

  const detailQ = useQuery({ queryKey: ["lot-details", lotId], queryFn: async () => (await api.get(`/loteamentos/${lotId}/details`)).data, enabled: open && !!lotId });
  const galQ = useQuery({ queryKey: ["lot-images", lotId], queryFn: async () => (await api.get(`/loteamentos/${lotId}/images`)).data, enabled: open && !!lotId });

  const d = detailQ.data || {};
  const s = d.specs || {};
  const c = s.comercial || {}, loc = s.localizacao || {};
  const infra = [...((s.infraestrutura || {}).items || [])].filter((x) => x !== "Outro").slice(0, 3);

  const draw = async () => {
    const cv = canvasRef.current;
    if (!cv) return;
    setRendering(true);
    try {
      const W = 1080, H = 1350;
      cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#0F382C"; ctx.fillRect(0, 0, W, H);
      if (photo) {
        try {
          const img = await loadImg(photo);
          const r = Math.max(W / img.width, (H * 0.62) / img.height);
          const w = img.width * r, h = img.height * r;
          ctx.drawImage(img, (W - w) / 2, 0, w, h);
        } catch { /* ignore */ }
      }
      // gradientes
      const g = ctx.createLinearGradient(0, H * 0.35, 0, H);
      g.addColorStop(0, "rgba(15,56,44,0)"); g.addColorStop(0.55, "rgba(15,56,44,0.85)"); g.addColorStop(1, "rgba(15,56,44,0.98)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // marca
      ctx.fillStyle = "#D4AF37"; ctx.font = "700 34px Georgia, serif";
      ctx.fillText("BRILHANTE'S IMÓVEIS", 60, 80);
      // nome
      ctx.fillStyle = "#fff"; ctx.font = "800 72px Georgia, serif";
      const name = (d.name || "").toUpperCase();
      const words = name.split(" "); let line = "", y = H - 430;
      for (const w of words) {
        if (ctx.measureText(line + " " + w).width > W - 120 && line) { ctx.fillText(line, 60, y); line = w; y += 80; }
        else line = line ? line + " " + w : w;
      }
      if (line) { ctx.fillText(line, 60, y); y += 80; }
      // valor
      if (c.valor_a_partir) {
        ctx.fillStyle = "#D4AF37"; ctx.font = "800 54px Arial";
        ctx.fillText(`A partir de R$ ${c.valor_a_partir}`, 60, y + 40); y += 90;
      }
      // condições
      if (c.entrada_minima || c.max_parcelas) {
        ctx.fillStyle = "#e6e6e6"; ctx.font = "400 32px Arial";
        const cond = [c.entrada_minima && `Entrada ${c.entrada_minima}`, c.max_parcelas && `até ${c.max_parcelas}x`].filter(Boolean).join(" · ");
        ctx.fillText(cond, 60, y + 30); y += 60;
      }
      // localização
      const locTxt = [loc.bairro, loc.cidade, loc.estado].filter(Boolean).join(", ");
      if (locTxt) { ctx.fillStyle = "#cfe3db"; ctx.font = "400 30px Arial"; ctx.fillText("📍 " + locTxt, 60, y + 30); y += 56; }
      // infra chips
      let cx = 60; const cy = y + 20;
      ctx.font = "600 26px Arial";
      for (const it of infra) {
        const tw = ctx.measureText(it).width + 40;
        ctx.fillStyle = "rgba(212,175,55,0.2)"; ctx.strokeStyle = "#D4AF37"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(cx, cy, tw, 52, 26); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.fillText(it, cx + 20, cy + 35);
        cx += tw + 16; if (cx > W - 200) break;
      }
    } finally { setRendering(false); }
  };

  useEffect(() => { if (open && detailQ.data) draw(); /* eslint-disable-next-line */ }, [open, detailQ.data, photo]);

  const onFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload = (ev) => setPhoto(ev.target.result); r.readAsDataURL(f);
  };
  const download = () => {
    const cv = canvasRef.current; if (!cv) return;
    try {
      const a = document.createElement("a");
      a.href = cv.toDataURL("image/png"); a.download = `arte-${(d.name || "loteamento").replace(/\s+/g, "-")}.png`; a.click();
    } catch { /* taint */ }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto" data-testid="lot-arte-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">Imagem de divulgação</DialogTitle>
          <DialogDescription>Gere uma arte com foto + dados do loteamento e a identidade Brilhante's.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} data-testid="arte-photo-input" />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()} data-testid="arte-upload-photo"><ImagePlus className="h-4 w-4" /> Adicionar foto</Button>
          {profilePhoto && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPhoto(profilePhoto)} data-testid="arte-use-profile"><UserRound className="h-4 w-4" /> Foto do perfil</Button>}
          {(galQ.data || []).slice(0, 4).map((im) => (
            <button key={im.id} onClick={() => setPhoto(`${BACKEND}/api/loteamentos/images/${im.id}/raw`)} className="h-9 w-12 rounded border border-border/60 overflow-hidden" data-testid={`arte-gallery-${im.id}`}>
              <img src={`${BACKEND}/api/loteamentos/images/${im.id}/raw`} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>

        <div className="rounded-xl overflow-hidden border border-border/60 bg-muted relative">
          {rendering && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
          <canvas ref={canvasRef} className="w-full h-auto block" data-testid="arte-canvas" />
        </div>

        <Button className="w-full gap-1.5" onClick={download} data-testid="arte-download"><Download className="h-4 w-4" /> Baixar arte</Button>
      </DialogContent>
    </Dialog>
  );
}
