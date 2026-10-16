import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Wand2, Plus, Trash2, Copy, Loader2 } from "lucide-react";

const CATEGORIES = ["Localização", "Valores", "Infraestrutura", "Geral"];
const CHANNELS = [["whatsapp", "WhatsApp"], ["feed", "Feed"], ["stories", "Stories"]];

export default function LoteamentoCopys({ lotId }) {
  const qc = useQueryClient();
  const [category, setCategory] = useState("Geral");
  const [channel, setChannel] = useState("whatsapp");
  const [text, setText] = useState("");
  const [gen, setGen] = useState(false);
  const [filter, setFilter] = useState("Todas");

  const detQ = useQuery({ queryKey: ["lot-details", lotId], queryFn: async () => (await api.get(`/loteamentos/${lotId}/details`)).data, enabled: !!lotId });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["lot-details", lotId] });

  const addMut = useMutation({
    mutationFn: () => api.post(`/loteamentos/${lotId}/copies`, { category, text }),
    onSuccess: () => { invalidate(); setText(""); toast.success("Copy salva!"); },
  });
  const delMut = useMutation({
    mutationFn: (cid) => api.delete(`/loteamentos/${lotId}/copies/${cid}`),
    onSuccess: () => { invalidate(); toast.success("Copy removida."); },
  });

  const generate = async () => {
    setGen(true);
    try {
      const res = await api.post(`/loteamentos/${lotId}/copies/generate`, { category, channel });
      setText(res.data.text || "");
      toast.success("Copy gerada! Revise e salve.");
    } catch (e) { toast.error(e?.response?.data?.detail || "Erro ao gerar."); }
    finally { setGen(false); }
  };

  const copies = detQ.data?.copies || [];
  const shown = useMemo(() => filter === "Todas" ? copies : copies.filter((c) => c.category === filter), [copies, filter]);

  return (
    <div className="space-y-4" data-testid="lot-copys">
      <div className="rounded-xl border border-border/60 p-3 space-y-2">
        <div className="flex gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger data-testid="copy-category" className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>{CHANNELS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
          <Button data-testid="copy-generate" variant="outline" size="sm" className="h-8 text-xs gap-1" disabled={gen} onClick={generate}>
            {gen ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} Criar com IA
          </Button>
        </div>
        <Textarea data-testid="copy-text" value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Escreva a copy ou gere com a IA..." />
        <div className="flex justify-end">
          <Button data-testid="copy-save" size="sm" disabled={!text.trim() || addMut.isPending} onClick={() => addMut.mutate()}>
            <Plus className="h-4 w-4 mr-1" /> Salvar copy
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {["Todas", ...CATEGORIES].map((c) => (
          <button key={c} onClick={() => setFilter(c)} className={`px-3 py-1 rounded-full text-xs font-semibold border ${filter === c ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground"}`}>{c}</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma copy ainda.</p>
      ) : (
        <div className="space-y-2">
          {shown.map((c) => (
            <div key={c.id} data-testid={`copy-item-${c.id}`} className="rounded-xl border border-border/60 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <Badge variant="secondary" className="text-[10px]">{c.category}</Badge>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { navigator.clipboard?.writeText(c.text); toast.success("Copiado!"); }}><Copy className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" data-testid={`copy-del-${c.id}`} onClick={() => delMut.mutate(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <p className="text-sm whitespace-pre-wrap">{c.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
