import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles, Send, MapPin } from "lucide-react";
import LoteamentoGallery from "@/components/LoteamentoGallery";
import LoteamentoVideos from "@/components/LoteamentoVideos";
import LoteamentoMap from "@/components/LoteamentoMap";
import LoteamentoDocs from "@/components/LoteamentoDocs";
import LoteamentoCopys from "@/components/LoteamentoCopys";

const INFRA_LABEL = "Infraestrutura";

function Row({ label, value }) {
  if (!value) return null;
  return <div className="flex gap-2 text-sm"><span className="text-muted-foreground min-w-[130px]">{label}</span><span className="font-medium">{value}</span></div>;
}

function Resumo({ specs, copy }) {
  const s = specs || {};
  const t = s.tecnicos || {}, loc = s.localizacao || {}, c = s.comercial || {}, infra = s.infraestrutura || {};
  const infraItems = [...(infra.items || [])].filter((x) => x !== "Outro");
  if (infra.outro) infraItems.push(infra.outro);
  return (
    <div className="space-y-4" data-testid="corretor-lot-resumo">
      <div className="rounded-xl border border-border/60 p-3 space-y-1.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Técnico</div>
        <Row label="Metragem" value={[t.metragem_min, t.metragem_max].filter(Boolean).join(" a ")} />
        <Row label="Qtd. de lotes" value={t.qtd_lotes} />
        <Row label="Tipo" value={t.tipo === "fechado" ? "Loteamento fechado" : t.tipo === "aberto" ? "Loteamento aberto" : ""} />
      </div>
      <div className="rounded-xl border border-border/60 p-3 space-y-1.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Valores</div>
        <Row label="A partir de" value={c.valor_a_partir && `R$ ${c.valor_a_partir}`} />
        <Row label="Entrada mínima" value={c.entrada_minima} />
        <Row label="Máx. parcelas" value={c.max_parcelas} />
        <Row label="Parcela inicial" value={c.valor_parcela_inicial} />
      </div>
      <div className="rounded-xl border border-border/60 p-3 space-y-1.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Localização</div>
        <Row label="Cidade/UF" value={[loc.cidade, loc.estado].filter(Boolean).join(" - ")} />
        <Row label="Bairro" value={loc.bairro} />
        <Row label="Endereço" value={loc.endereco} />
        {loc.maps && <a href={loc.maps} target="_blank" rel="noreferrer" className="text-sm text-primary inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Abrir no Google Maps</a>}
      </div>
      {infraItems.length > 0 && (
        <div className="rounded-xl border border-border/60 p-3 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{INFRA_LABEL}</div>
          <div className="flex flex-wrap gap-1.5">{infraItems.map((i) => <Badge key={i} variant="secondary" className="text-[11px]">{i}</Badge>)}</div>
        </div>
      )}
      {(c.diferenciais || c.condicoes_especiais) && (
        <div className="rounded-xl border border-border/60 p-3 space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Diferenciais</div>
          {c.diferenciais && <p className="text-sm whitespace-pre-wrap">{c.diferenciais}</p>}
          {c.condicoes_especiais && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{c.condicoes_especiais}</p>}
        </div>
      )}
      {copy && (
        <div className="rounded-xl border border-[hsl(var(--gold)/0.4)] bg-[hsl(var(--gold)/0.06)] p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Texto de divulgação</div>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigator.clipboard?.writeText(copy)}>Copiar</Button>
          </div>
          <p className="text-sm whitespace-pre-wrap">{copy}</p>
        </div>
      )}
    </div>
  );
}

export default function CorretorLoteamentoView({ lot, onOpenChange }) {
  const open = !!lot;
  const scrollRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  const detailQ = useQuery({
    queryKey: ["lot-details", lot?.id],
    queryFn: async () => (await api.get(`/loteamentos/${lot.id}/details`)).data,
    enabled: open,
  });

  useEffect(() => { if (!open) { setMessages([]); setInput(""); } }, [open]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  const askMut = useMutation({
    mutationFn: (msg) => api.post(`/loteamentos/${lot.id}/ai`, { message: msg, history: messages }),
    onSuccess: (res) => setMessages((m) => [...m, { role: "assistant", content: res.data.answer }]),
    onError: (e) => {
      const d = e?.response?.data?.detail;
      setMessages((m) => [...m, { role: "assistant", content: typeof d === "string" ? d : "Serviço de IA indisponível no momento." }]);
    },
  });

  const send = () => {
    const msg = input.trim();
    if (!msg || askMut.isPending) return;
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setInput("");
    askMut.mutate(msg);
  };

  const vis = detailQ.data?.visible_tabs || lot?.visible_tabs || ["galeria", "videos", "mapa", "docs", "copys", "ia"];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onOpenChange(false); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="corretor-lot-view">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{lot?.name}</DialogTitle>
          <DialogDescription>Material de apresentação: fotos, vídeos, mapa, documentos e copys. Tire dúvidas com a IA.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="resumo">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="resumo" data-testid="clot-tab-resumo">Resumo</TabsTrigger>
            {vis.includes("galeria") && <TabsTrigger value="galeria" data-testid="clot-tab-galeria">Galeria</TabsTrigger>}
            {vis.includes("videos") && <TabsTrigger value="videos" data-testid="clot-tab-videos">Vídeos</TabsTrigger>}
            {vis.includes("mapa") && <TabsTrigger value="mapa" data-testid="clot-tab-mapa">Mapa</TabsTrigger>}
            {vis.includes("docs") && <TabsTrigger value="docs" data-testid="clot-tab-docs">Documentos</TabsTrigger>}
            {vis.includes("copys") && <TabsTrigger value="copys" data-testid="clot-tab-copys">Copys</TabsTrigger>}
            {vis.includes("ia") && <TabsTrigger value="ia" data-testid="clot-tab-ia"><Sparkles className="h-4 w-4 mr-1" /> IA</TabsTrigger>}
          </TabsList>

          <TabsContent value="resumo" className="mt-3"><Resumo specs={detailQ.data?.specs} copy={detailQ.data?.copy} /></TabsContent>
          {vis.includes("galeria") && <TabsContent value="galeria" className="mt-3"><LoteamentoGallery lotId={lot?.id} readOnly /></TabsContent>}
          {vis.includes("videos") && <TabsContent value="videos" className="mt-3">{lot?.id && <LoteamentoVideos lotId={lot.id} readOnly />}</TabsContent>}
          {vis.includes("mapa") && <TabsContent value="mapa" className="mt-3"><LoteamentoMap lot={lot} /></TabsContent>}
          {vis.includes("docs") && <TabsContent value="docs" className="mt-3">{lot?.id && <LoteamentoDocs lotId={lot.id} canManage={false} />}</TabsContent>}
          {vis.includes("copys") && <TabsContent value="copys" className="mt-3">{lot?.id && <LoteamentoCopys lotId={lot.id} readOnly />}</TabsContent>}

          {vis.includes("ia") && (
          <TabsContent value="ia" className="mt-3">
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div ref={scrollRef} className="h-[46vh] overflow-y-auto p-3 space-y-3 bg-muted/20" data-testid="clot-ai-messages">
                {messages.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-10">
                    <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    Pergunte sobre <b>{lot?.name}</b>. A IA responde com base nas informações cadastradas.
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-card border border-border/60"}`}>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                ))}
                {askMut.isPending && <div className="text-xs text-muted-foreground">Consultando a IA…</div>}
              </div>
              <div className="flex items-center gap-2 border-t border-border/60 p-2 bg-card">
                <Input data-testid="clot-ai-input" value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") send(); }} placeholder="Ex: Qual a entrada mínima?" className="h-9" />
                <Button data-testid="clot-ai-send" size="icon" className="h-9 w-9 shrink-0" disabled={!input.trim() || askMut.isPending} onClick={send}><Send className="h-4 w-4" /></Button>
              </div>
            </div>
          </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
