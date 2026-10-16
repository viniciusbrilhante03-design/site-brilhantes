import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles, Send, Megaphone, GraduationCap, Wand2, Loader2 } from "lucide-react";
import LoteamentoSpecsForm, { mergeSpecs, EMPTY_SPECS } from "@/components/LoteamentoSpecsForm";
import LoteamentoGallery from "@/components/LoteamentoGallery";
import LoteamentoCopys from "@/components/LoteamentoCopys";
import LoteamentoKnowledge from "@/components/LoteamentoKnowledge";
import LoteamentoVideos from "@/components/LoteamentoVideos";
import LoteamentoDocs from "@/components/LoteamentoDocs";
import LoteamentoMap from "@/components/LoteamentoMap";

function fmtUpdated(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch { return null; }
}

export default function LoteamentoDetailsDialog({ lot, onOpenChange }) {
  const open = !!lot;
  const qc = useQueryClient();
  const [specs, setSpecs] = useState(EMPTY_SPECS);
  const [copy, setCopy] = useState("");
  const [training, setTraining] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [genLoading, setGenLoading] = useState(false);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);

  const detailQ = useQuery({
    queryKey: ["lot-details", lot?.id],
    queryFn: async () => (await api.get(`/loteamentos/${lot.id}/details`)).data,
    enabled: open,
  });

  useEffect(() => {
    if (detailQ.data) {
      setSpecs(mergeSpecs(detailQ.data.specs));
      setCopy(detailQ.data.copy || "");
      setTraining(detailQ.data.ai_training || "");
      setUpdatedAt(detailQ.data.details_updated_at || null);
    }
  }, [detailQ.data]);

  useEffect(() => { if (!open) { setMessages([]); setInput(""); } }, [open]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  const saveMut = useMutation({
    mutationFn: () => api.put(`/loteamentos/${lot.id}/details`, { specs, copy, ai_training: training }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["lot-details", lot.id] });
      setUpdatedAt(res.data.details_updated_at || new Date().toISOString());
      toast.success("Informações do loteamento salvas!");
    },
    onError: () => toast.error("Erro ao salvar."),
  });

  const askMut = useMutation({
    mutationFn: (msg) => api.post(`/loteamentos/${lot.id}/ai`, { message: msg, history: messages }),
    onSuccess: (res) => setMessages((m) => [...m, { role: "assistant", content: res.data.answer }]),
    onError: (e) => {
      const d = e?.response?.data?.detail;
      setMessages((m) => [...m, { role: "assistant", content: typeof d === "string" ? d : "Serviço de IA indisponível no momento." }]);
    },
  });

  const generateCopy = async (channel) => {
    setGenLoading(true);
    try {
      await api.put(`/loteamentos/${lot.id}/details`, { specs, copy, ai_training: training });
      const res = await api.post(`/loteamentos/${lot.id}/generate-copy`, null, { params: { channel } });
      setCopy(res.data.copy || "");
      toast.success("Copy gerada pela IA! Revise e salve.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Não foi possível gerar a copy.");
    } finally { setGenLoading(false); }
  };

  const copyToClipboard = () => {
    if (!copy) return;
    navigator.clipboard?.writeText(copy);
    toast.success("Copy copiada!");
  };

  const send = () => {
    const msg = input.trim();
    if (!msg || askMut.isPending) return;
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setInput("");
    askMut.mutate(msg);
  };

  const lastUpdate = fmtUpdated(updatedAt);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onOpenChange(false); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="lot-details-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{lot?.name}</DialogTitle>
          <DialogDescription>
            Selecione as informações do loteamento, gere a copy e tire dúvidas com a IA.
            {lastUpdate && <span className="block text-[11px] mt-0.5 text-muted-foreground">Última atualização: {lastUpdate}</span>}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="dados">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="dados" data-testid="lot-tab-dados">Informações</TabsTrigger>
            <TabsTrigger value="galeria" data-testid="lot-tab-galeria">Galeria</TabsTrigger>
            <TabsTrigger value="videos" data-testid="lot-tab-videos">Vídeos</TabsTrigger>
            <TabsTrigger value="mapa" data-testid="lot-tab-mapa">Mapa</TabsTrigger>
            <TabsTrigger value="docs" data-testid="lot-tab-docs">Documentos</TabsTrigger>
            <TabsTrigger value="copys" data-testid="lot-tab-copys">Copys</TabsTrigger>
            <TabsTrigger value="base" data-testid="lot-tab-base">Base IA</TabsTrigger>
            <TabsTrigger value="ia" data-testid="lot-tab-ia"><Sparkles className="h-4 w-4 mr-1" /> IA Especialista</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-4 mt-3">
            <LoteamentoSpecsForm value={specs} onChange={setSpecs} />

            <div className="space-y-1.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label className="flex items-center gap-1.5"><Megaphone className="h-4 w-4" /> Copy (texto de divulgação)</Label>
                <div className="flex gap-1.5 items-center">
                  <span className="text-[11px] text-muted-foreground mr-0.5">Gerar p/:</span>
                  <Button data-testid="lot-gen-stories" variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={genLoading} onClick={() => generateCopy("stories")}>
                    {genLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} Stories
                  </Button>
                  <Button data-testid="lot-gen-feed" variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={genLoading} onClick={() => generateCopy("feed")}>
                    <Wand2 className="h-3.5 w-3.5" /> Feed
                  </Button>
                  <Button data-testid="lot-gen-whatsapp" variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={genLoading} onClick={() => generateCopy("whatsapp")}>
                    <Wand2 className="h-3.5 w-3.5" /> WhatsApp
                  </Button>
                  {copy && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={copyToClipboard}>Copiar</Button>}
                </div>
              </div>
              <Textarea data-testid="lot-copy" value={copy} onChange={(e) => setCopy(e.target.value)} rows={4}
                placeholder="Clique em 'Gerar com IA' para criar um texto pronto para WhatsApp/Instagram a partir das informações acima." />
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><GraduationCap className="h-4 w-4" /> Treinar a IA (informações extras)</Label>
              <Textarea data-testid="lot-training" value={training} onChange={(e) => setTraining(e.target.value)} rows={3}
                placeholder="Escreva aqui o que a IA deve saber além das informações acima (regras, diferenciais, respostas a dúvidas comuns...)." />
            </div>

            <div className="flex justify-end">
              <Button data-testid="lot-save-details" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
                {saveMut.isPending ? "Salvando..." : "Salvar informações"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="galeria" className="mt-3">
            <LoteamentoGallery lotId={lot?.id} />
          </TabsContent>

          <TabsContent value="videos" className="mt-3">
            {lot?.id && <LoteamentoVideos lotId={lot.id} />}
          </TabsContent>

          <TabsContent value="mapa" className="mt-3">
            <LoteamentoMap lot={lot} />
          </TabsContent>

          <TabsContent value="docs" className="mt-3">
            {lot?.id && <LoteamentoDocs lotId={lot.id} canManage />}
          </TabsContent>

          <TabsContent value="copys" className="mt-3">
            {lot?.id && <LoteamentoCopys lotId={lot.id} />}
          </TabsContent>

          <TabsContent value="base" className="mt-3">
            {lot?.id && <LoteamentoKnowledge lotId={lot.id} />}
          </TabsContent>

          <TabsContent value="ia" className="mt-3">
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div ref={scrollRef} className="h-[46vh] overflow-y-auto p-3 space-y-3 bg-muted/20" data-testid="lot-ai-messages">
                {messages.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-10">
                    <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    Pergunte sobre <b>{lot?.name}</b>. A IA responde com base nas informações cadastradas.
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} data-testid={`lot-ai-msg-${i}`}
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-card border border-border/60"}`}>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                ))}
                {askMut.isPending && <div className="text-xs text-muted-foreground">Consultando a IA…</div>}
              </div>
              <div className="flex items-center gap-2 border-t border-border/60 p-2 bg-card">
                <Input data-testid="lot-ai-input" value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                  placeholder="Ex: Qual a metragem mínima do lote?" className="h-9" />
                <Button data-testid="lot-ai-send" size="icon" className="h-9 w-9 shrink-0" disabled={!input.trim() || askMut.isPending} onClick={send}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">A IA usa só as informações da aba "Informações". Salve antes de perguntar.</p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
