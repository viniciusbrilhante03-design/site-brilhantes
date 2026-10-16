import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, KeyRound, Gauge, RotateCcw } from "lucide-react";

const MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"];

export default function AiSettingsDialog({ open, onOpenChange }) {
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [limit, setLimit] = useState(0);

  const q = useQuery({ queryKey: ["ai-settings"], queryFn: async () => (await api.get("/settings/ai")).data, enabled: open });

  useEffect(() => {
    if (q.data) { setKey(""); setModel(q.data.model || "gpt-4o-mini"); setLimit(q.data.monthly_limit || 0); }
  }, [q.data]);

  const saveMut = useMutation({
    mutationFn: (payload) => api.put("/settings/ai", payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai-settings"] }); setKey(""); toast.success("Configurações da IA salvas!"); },
    onError: () => toast.error("Erro ao salvar."),
  });
  const resetMut = useMutation({
    mutationFn: () => api.put("/settings/ai", { reset_usage: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai-settings"] }); toast.success("Uso zerado."); },
  });

  const s = q.data || {};
  const usage = s.usage || {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="ai-settings-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2"><Sparkles className="h-5 w-5 text-[hsl(var(--gold))]" /> Configurações da IA</DialogTitle>
          <DialogDescription>Chave da OpenAI, modelo e limite mensal de uso. A chave nunca é exibida por completo.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 p-3 grid grid-cols-3 gap-2 text-center" data-testid="ai-usage">
            <div><div className="text-xs text-muted-foreground">Solicitações (mês)</div><div className="font-heading font-bold text-lg">{usage.requests || 0}</div></div>
            <div><div className="text-xs text-muted-foreground">Tokens (mês)</div><div className="font-heading font-bold text-lg">{(usage.tokens || 0).toLocaleString("pt-BR")}</div></div>
            <div><div className="text-xs text-muted-foreground">Limite</div><div className="font-heading font-bold text-lg">{s.monthly_limit ? s.monthly_limit : "∞"}</div></div>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><KeyRound className="h-4 w-4" /> Chave da OpenAI</Label>
            <Input data-testid="ai-key-input" type="password" value={key} onChange={(e) => setKey(e.target.value)}
              placeholder={s.has_key ? `Configurada (${s.key_source === "env" ? "padrão do sistema" : "personalizada"}) ${s.key_masked} — deixe em branco p/ manter` : "sk-..."} />
            <p className="text-[11px] text-muted-foreground">Preencha só para trocar a chave. Em branco mantém a atual.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger data-testid="ai-model-select"><SelectValue /></SelectTrigger>
                <SelectContent>{MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Gauge className="h-4 w-4" /> Limite mensal</Label>
              <Input data-testid="ai-limit-input" type="number" min={0} value={limit} onChange={(e) => setLimit(Number(e.target.value))} placeholder="0 = sem limite" />
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" size="sm" className="gap-1.5" data-testid="ai-reset-usage" onClick={() => resetMut.mutate()}><RotateCcw className="h-4 w-4" /> Zerar uso</Button>
            <Button data-testid="ai-save" disabled={saveMut.isPending} onClick={() => saveMut.mutate({ openai_key: key, model, monthly_limit: limit })}>
              {saveMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
