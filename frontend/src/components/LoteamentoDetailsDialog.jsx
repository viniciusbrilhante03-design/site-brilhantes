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
import { GripVertical, Plus, Trash2, Sparkles, Send, Megaphone, GraduationCap } from "lucide-react";

const SUGGESTED = ["Área total", "Metragem mínima do lote", "Infraestrutura", "Status da obra", "Documentação", "Formas de pagamento", "Localização"];

export default function LoteamentoDetailsDialog({ lot, onOpenChange }) {
  const open = !!lot;
  const qc = useQueryClient();
  const [fields, setFields] = useState([]);
  const [copy, setCopy] = useState("");
  const [training, setTraining] = useState("");
  const dragIdx = useRef(null);

  // chat
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
      setFields((detailQ.data.fields || []).map((f) => ({ ...f })));
      setCopy(detailQ.data.copy || "");
      setTraining(detailQ.data.ai_training || "");
    }
  }, [detailQ.data]);

  useEffect(() => {
    if (!open) { setMessages([]); setInput(""); }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const saveMut = useMutation({
    mutationFn: () => api.put(`/loteamentos/${lot.id}/details`, { fields, copy, ai_training: training }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lot-details", lot.id] }); toast.success("Informações do loteamento salvas!"); },
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

  const addField = (label = "") => setFields((f) => [...f, { id: `new_${Date.now()}`, label, value: "" }]);
  const setField = (i, k, v) => setFields((f) => f.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));
  const removeField = (i) => setFields((f) => f.filter((_, idx) => idx !== i));

  const onDrop = (i) => {
    const from = dragIdx.current;
    if (from === null || from === i) return;
    setFields((f) => {
      const arr = [...f];
      const [moved] = arr.splice(from, 1);
      arr.splice(i, 0, moved);
      return arr;
    });
    dragIdx.current = null;
  };

  const send = () => {
    const msg = input.trim();
    if (!msg || askMut.isPending) return;
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setInput("");
    askMut.mutate(msg);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onOpenChange(false); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="lot-details-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{lot?.name}</DialogTitle>
          <DialogDescription>Cadastre os dados técnicos, treine a IA e tire dúvidas sobre o loteamento.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="dados">
          <TabsList>
            <TabsTrigger value="dados" data-testid="lot-tab-dados">Dados & Copy</TabsTrigger>
            <TabsTrigger value="ia" data-testid="lot-tab-ia"><Sparkles className="h-4 w-4 mr-1" /> IA Especialista</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-4 mt-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Campos técnicos</Label>
                <span className="text-[11px] text-muted-foreground">Arraste para reordenar</span>
              </div>
              <div className="space-y-2" data-testid="lot-fields">
                {fields.map((f, i) => (
                  <div key={f.id || i} data-testid={`lot-field-${i}`}
                    draggable
                    onDragStart={() => { dragIdx.current = i; }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(i)}
                    className="flex items-center gap-2 rounded-lg border border-border/60 p-2 bg-card">
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" data-testid={`lot-field-drag-${i}`} />
                    <Input data-testid={`lot-field-label-${i}`} value={f.label} placeholder="Ex: Metragem mínima"
                      onChange={(e) => setField(i, "label", e.target.value)} className="h-8 w-[40%]" />
                    <Input data-testid={`lot-field-value-${i}`} value={f.value} placeholder="Ex: 200 m²"
                      onChange={(e) => setField(i, "value", e.target.value)} className="h-8 flex-1" />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0"
                      data-testid={`lot-field-remove-${i}`} onClick={() => removeField(i)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" data-testid="lot-add-field" onClick={() => addField()}>
                  <Plus className="h-3.5 w-3.5" /> Adicionar campo
                </Button>
                {SUGGESTED.filter((s) => !fields.some((f) => f.label === s)).map((s) => (
                  <Button key={s} variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => addField(s)}>+ {s}</Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Megaphone className="h-4 w-4" /> Copy (texto de divulgação)</Label>
              <Textarea data-testid="lot-copy" value={copy} onChange={(e) => setCopy(e.target.value)} rows={3}
                placeholder="Texto pronto para divulgar o loteamento nas redes/WhatsApp." />
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><GraduationCap className="h-4 w-4" /> Treinar a IA (informações extras)</Label>
              <Textarea data-testid="lot-training" value={training} onChange={(e) => setTraining(e.target.value)} rows={4}
                placeholder="Escreva aqui tudo que a IA deve saber para ajudar o corretor (regras, diferenciais, respostas a perguntas comuns...)." />
            </div>

            <div className="flex justify-end">
              <Button data-testid="lot-save-details" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>Salvar informações</Button>
            </div>
          </TabsContent>

          <TabsContent value="ia" className="mt-3">
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div ref={scrollRef} className="h-[46vh] overflow-y-auto p-3 space-y-3 bg-muted/20" data-testid="lot-ai-messages">
                {messages.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-10">
                    <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    Pergunte sobre <b>{lot?.name}</b>. A IA responde com base nos dados técnicos cadastrados.
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
            <p className="text-[11px] text-muted-foreground mt-2">A IA usa só os dados cadastrados na aba "Dados & Copy". Salve antes de perguntar.</p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
