import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { brl } from "@/lib/format";
import { celebrate, randomPhrase, soundEnabled, setSoundEnabled } from "@/lib/celebrate";
import { Trophy, Share2, Download, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const norm = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

// Carrega a imagem sem "tainting" o canvas (via blob) para que o toBlob/salvar funcione.
async function loadImageSafe(src) {
  if (!src) return null;
  if (src.startsWith("data:")) return loadImage(src);
  try {
    const res = await fetch(src, { credentials: "include" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const img = await loadImage(url);
    URL.revokeObjectURL(url);
    return img;
  } catch {
    return null;
  }
}

function wrapText(ctx, text, maxWidth) {
  const words = (text || "").split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export default function CelebrationDialog({ sale, photoMap = {}, onOpenChange }) {
  const open = !!sale;
  const [sound, setSound] = useState(soundEnabled());
  const [generating, setGenerating] = useState(false);

  const firstBrokerName = useMemo(() => {
    if (!sale) return "";
    const n = sale.brokers?.[0]?.name || sale.broker_name || "";
    return n.split(" + ")[0].trim();
  }, [sale]);

  const displayName = sale?.broker_name || firstBrokerName || "Corretor";
  const normMap = useMemo(() => {
    const m = {};
    Object.entries(photoMap || {}).forEach(([k, v]) => { if (v) m[norm(k)] = v; });
    return m;
  }, [photoMap]);
  const photo = normMap[norm(firstBrokerName)] || null;
  const phrase = useMemo(() => randomPhrase(), [sale?.id]);

  useEffect(() => {
    if (open) celebrate();
  }, [open]);

  const loteamento = sale?.property_name || sale?.loteamento || "—";
  const qdLt = [sale?.quadra && `Qd ${sale.quadra}`, sale?.lote && `Lt ${sale.lote}`].filter(Boolean).join(" · ");
  const vgv = brl(sale?.sale_value || 0);

  const buildStoryBlob = async () => {
    const W = 1080, H = 1920;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0a2417");
    bg.addColorStop(0.55, "#06160d");
    bg.addColorStop(1, "#020a05");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Gold radial glow top
    const glow = ctx.createRadialGradient(W / 2, 360, 40, W / 2, 360, 620);
    glow.addColorStop(0, "rgba(212,175,55,0.22)");
    glow.addColorStop(1, "rgba(212,175,55,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, 900);

    // Confetti dots
    const colors = ["#D4AF37", "#1F8A4C", "#ffffff", "#e8c766"];
    for (let i = 0; i < 70; i++) {
      ctx.globalAlpha = 0.5 + Math.random() * 0.5;
      ctx.fillStyle = colors[i % colors.length];
      const x = Math.random() * W, y = Math.random() * H;
      const s = 4 + Math.random() * 9;
      ctx.fillRect(x, y, s, s * 1.6);
    }
    ctx.globalAlpha = 1;

    // Gold frame
    ctx.strokeStyle = "rgba(212,175,55,0.65)";
    ctx.lineWidth = 6;
    ctx.strokeRect(34, 34, W - 68, H - 68);

    // Logo
    const logo = await loadImage("/logo-dark.jpg");
    if (logo) {
      const lw = 320, lh = (logo.height / logo.width) * lw;
      ctx.save();
      const r = 28, lx = (W - lw) / 2, ly = 100;
      ctx.beginPath();
      ctx.moveTo(lx + r, ly);
      ctx.arcTo(lx + lw, ly, lx + lw, ly + lh, r);
      ctx.arcTo(lx + lw, ly + lh, lx, ly + lh, r);
      ctx.arcTo(lx, ly + lh, lx, ly, r);
      ctx.arcTo(lx, ly, lx + lw, ly, r);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(logo, lx, ly, lw, lh);
      ctx.restore();
    }

    ctx.textAlign = "center";

    // Trophy + headline
    ctx.font = "120px serif";
    ctx.fillText("🏆", W / 2, 540);

    ctx.fillStyle = "#D4AF37";
    ctx.font = "800 72px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillText("VENDA REALIZADA! 🎉", W / 2, 640);

    // Broker photo
    const cx = W / 2, cy = 800, rad = 90;
    const bphoto = await loadImageSafe(photo);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (bphoto) {
      ctx.drawImage(bphoto, cx - rad, cy - rad, rad * 2, rad * 2);
    } else {
      ctx.fillStyle = "#1F8A4C";
      ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 72px 'Plus Jakarta Sans', Arial, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText((displayName || "C").slice(0, 2).toUpperCase(), cx, cy + 4);
      ctx.textBaseline = "alphabetic";
    }
    ctx.restore();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#D4AF37";
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.stroke();

    // Broker name
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 60px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillText(displayName, W / 2, 970);

    // Loteamento card
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    const card = { x: 110, y: 1030, w: W - 220, h: 300, r: 28 };
    ctx.beginPath();
    ctx.moveTo(card.x + card.r, card.y);
    ctx.arcTo(card.x + card.w, card.y, card.x + card.w, card.y + card.h, card.r);
    ctx.arcTo(card.x + card.w, card.y + card.h, card.x, card.y + card.h, card.r);
    ctx.arcTo(card.x, card.y + card.h, card.x, card.y, card.r);
    ctx.arcTo(card.x, card.y, card.x + card.w, card.y, card.r);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#9fe3b8";
    ctx.font = "600 30px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillText("LOTEAMENTO", W / 2, 1100);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 54px 'Plus Jakarta Sans', Arial, sans-serif";
    const lotLines = wrapText(ctx, loteamento, card.w - 80);
    let ly2 = 1160;
    lotLines.slice(0, 2).forEach((l) => { ctx.fillText(l, W / 2, ly2); ly2 += 58; });
    if (qdLt) {
      ctx.fillStyle = "#D4AF37";
      ctx.font = "700 40px 'Plus Jakarta Sans', Arial, sans-serif";
      ctx.fillText(qdLt, W / 2, Math.min(ly2 + 6, card.y + card.h - 24));
    }

    // VGV
    ctx.fillStyle = "#9fe3b8";
    ctx.font = "600 34px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillText("VALOR DA VENDA (VGV)", W / 2, 1430);
    ctx.fillStyle = "#D4AF37";
    ctx.font = "900 92px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillText(vgv, W / 2, 1520);

    // PARABÉNS + phrase
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 64px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillText("PARABÉNS!", W / 2, 1640);
    ctx.fillStyle = "#e8c766";
    ctx.font = "600 38px 'Plus Jakarta Sans', Arial, sans-serif";
    const phLines = wrapText(ctx, phrase, W - 220);
    let py = 1700;
    phLines.slice(0, 2).forEach((l) => { ctx.fillText(l, W / 2, py); py += 46; });

    // Footer
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "700 36px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillText("Brilhante's Imóveis 🦅", W / 2, H - 70);

    return new Promise((resolve) => {
      try { canvas.toBlob((b) => resolve(b), "image/png"); }
      catch { resolve(null); }
    });
  };

  const handleShare = async () => {
    setGenerating(true);
    try {
      const blob = await buildStoryBlob();
      if (!blob) throw new Error("no blob");
      const file = new File([blob], "conquista-brilhantes.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Venda realizada!", text: phrase });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "conquista-brilhantes.png"; a.click();
        URL.revokeObjectURL(url);
        toast.success("Imagem baixada! Poste no seu Story 📲");
      }
    } catch (e) {
      if (e?.name !== "AbortError") toast.error("Não foi possível gerar a imagem.");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const blob = await buildStoryBlob();
      if (!blob) throw new Error("no blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "conquista-brilhantes.png"; a.click();
      URL.revokeObjectURL(url);
      toast.success("Imagem baixada! 📲");
    } catch {
      toast.error("Não foi possível gerar a imagem.");
    } finally {
      setGenerating(false);
    }
  };

  const toggleSound = () => {
    const v = !sound;
    setSound(v);
    setSoundEnabled(v);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onOpenChange(false); }}>
      <DialogContent
        data-testid="celebration-dialog"
        className="max-w-md overflow-hidden border-[hsl(var(--gold)/0.4)] bg-gradient-to-b from-[#0a2417] to-[#04100a] text-white p-0"
      >
        <button
          data-testid="celebration-close"
          onClick={() => onOpenChange(false)}
          className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-6 py-8 text-center space-y-5">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[hsl(var(--gold)/0.15)] ring-2 ring-[hsl(var(--gold)/0.5)]">
            <Trophy className="h-10 w-10 text-[hsl(var(--gold))]" />
          </div>

          <div>
            <div className="font-heading text-2xl font-extrabold text-[hsl(var(--gold))]">VENDA REALIZADA! 🎉</div>
            <div className="mt-1 text-sm font-semibold text-white/80">PARABÉNS!</div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <Avatar className="h-20 w-20 border-2 border-[hsl(var(--gold))]">
              <AvatarImage src={photo || undefined} alt={displayName} />
              <AvatarFallback className="bg-[hsl(var(--emerald))] text-white text-lg font-bold">
                {(displayName || "C").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="text-lg font-bold" data-testid="celebration-broker">{displayName}</div>
          </div>

          <div className="rounded-xl bg-white/5 p-4 space-y-1">
            <div className="text-[11px] uppercase tracking-widest text-emerald-200/80">Loteamento</div>
            <div className="font-bold text-lg leading-tight">{loteamento}</div>
            {qdLt && <div className="text-sm text-[hsl(var(--gold))] font-semibold">{qdLt}</div>}
            <div className="pt-2 text-[11px] uppercase tracking-widest text-emerald-200/80">Valor da venda</div>
            <div className="font-heading text-3xl font-extrabold text-[hsl(var(--gold))]" data-testid="celebration-vgv">{vgv}</div>
          </div>

          <p className="text-sm font-semibold text-[hsl(var(--gold-2,42_60%_70%))] text-amber-200">{phrase}</p>

          <div className="flex items-center justify-center gap-2 pt-1">
            <Button
              data-testid="celebration-share-btn"
              onClick={handleShare}
              disabled={generating}
              className="flex-1 bg-[hsl(var(--gold))] text-black font-bold hover:bg-[hsl(var(--gold)/0.85)]"
            >
              <Share2 className="h-4 w-4 mr-1.5" />
              {generating ? "Gerando..." : "Compartilhar Conquista"}
            </Button>
            <Button
              data-testid="celebration-download-btn"
              onClick={handleDownload}
              disabled={generating}
              variant="outline"
              size="icon"
              className="border-white/20 bg-white/5 text-white hover:bg-white/15"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              data-testid="celebration-sound-btn"
              onClick={toggleSound}
              variant="outline"
              size="icon"
              className="border-white/20 bg-white/5 text-white hover:bg-white/15"
            >
              {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
          </div>
          <div className="text-[11px] text-white/50">Imagem 9:16 para Stories · sem dados do cliente</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
