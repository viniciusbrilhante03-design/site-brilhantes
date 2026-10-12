import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { apiErr, brl, MESES } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Target, Plus, Trash2, Building2, UserRound } from "lucide-react";

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 4 }, (_, i) => currentYear + 1 - i);
const ALL = "all";

const emptyGoal = { scope: "company", owner_id: "", metric: "vgv", target: "", month: ALL, year: currentYear };

export default function GoalsDialog({ open, onOpenChange }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyGoal);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const goalsQ = useQuery({
    queryKey: ["goals-manage", form.year],
    queryFn: async () => (await api.get("/goals", { params: { year: form.year } })).data,
    enabled: open,
  });
  const corretoresQ = useQuery({ queryKey: ["corretores"], queryFn: async () => (await api.get("/corretores")).data, enabled: open });

  const invalidate = () => ["goals", "goals-manage"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const saveMut = useMutation({
    mutationFn: (payload) => api.post("/goals", payload),
    onSuccess: () => { invalidate(); setForm({ ...emptyGoal, year: form.year }); toast.success("Meta criada!"); },
    onError: (e) => toast.error(apiErr(e.response?.data?.detail, "Erro ao salvar meta")),
  });
  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/goals/${id}`),
    onSuccess: () => { invalidate(); toast.success("Meta removida."); },
  });

  const corretores = corretoresQ.data || [];
  const valid = useMemo(() => {
    if (!(parseFloat(form.target) > 0)) return false;
    if (form.scope === "broker" && !form.owner_id) return false;
    return true;
  }, [form]);

  const handleSave = () => {
    saveMut.mutate({
      scope: form.scope,
      owner_id: form.scope === "broker" ? form.owner_id : null,
      metric: form.metric,
      target: parseFloat(form.target) || 0,
      month: form.month === ALL ? null : Number(form.month),
      year: Number(form.year),
    });
  };

  const fmt = (metric, v) => (metric === "vgv" ? brl(v) : `${Math.round(v)} venda(s)`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="goals-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2"><Target className="h-5 w-5" /> Metas</DialogTitle>
          <DialogDescription>Defina metas da imobiliária (coletiva) e por corretor — por VGV ou quantidade de vendas.</DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border/60 p-4 bg-muted/30 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nova meta</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.scope} onValueChange={(v) => set("scope", v)}>
                <SelectTrigger data-testid="goal-scope-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">Imobiliária (coletiva)</SelectItem>
                  <SelectItem value="broker">Corretor (individual)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.scope === "broker" && (
              <div className="space-y-1.5">
                <Label>Corretor</Label>
                <Select value={form.owner_id} onValueChange={(v) => set("owner_id", v)}>
                  <SelectTrigger data-testid="goal-broker-select"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {corretores.map((c) => <SelectItem key={c.user_id} value={c.user_id}>{c.war_name || c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Métrica</Label>
              <Select value={form.metric} onValueChange={(v) => set("metric", v)}>
                <SelectTrigger data-testid="goal-metric-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vgv">VGV (R$)</SelectItem>
                  <SelectItem value="count">Quantidade de vendas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Alvo {form.metric === "vgv" ? "(R$)" : "(nº de vendas)"}</Label>
              <Input data-testid="goal-target-input" type="number" step={form.metric === "vgv" ? "1000" : "1"} min="0"
                value={form.target} onChange={(e) => set("target", e.target.value)} placeholder={form.metric === "vgv" ? "1000000" : "10"} />
            </div>
            <div className="space-y-1.5">
              <Label>Período</Label>
              <Select value={String(form.month)} onValueChange={(v) => set("month", v === ALL ? ALL : Number(v))}>
                <SelectTrigger data-testid="goal-month-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Ano inteiro</SelectItem>
                  {MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ano</Label>
              <Select value={String(form.year)} onValueChange={(v) => set("year", Number(v))}>
                <SelectTrigger data-testid="goal-year-select"><SelectValue /></SelectTrigger>
                <SelectContent>{YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button data-testid="goal-save-btn" disabled={!valid || saveMut.isPending} onClick={handleSave}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar meta
            </Button>
          </div>
        </div>

        <div className="space-y-2 mt-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Metas de {form.year}</div>
          {goalsQ.isLoading ? <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
            : (goalsQ.data || []).length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma meta para {form.year}.</p>
            : (goalsQ.data || []).map((g) => (
              <div key={g.id} data-testid={`goal-item-${g.id}`} className="flex items-center gap-3 rounded-lg border border-border/60 p-3 text-sm">
                {g.scope === "company" ? <Building2 className="h-4 w-4 text-primary" /> : <UserRound className="h-4 w-4 text-[hsl(var(--emerald))]" />}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{g.label} · {g.metric === "vgv" ? "VGV" : "Vendas"} {g.month ? `· ${MESES[g.month - 1]}` : "· ano"}</div>
                  <div className="text-xs text-muted-foreground tabular">{fmt(g.metric, g.current)} / {fmt(g.metric, g.target)} · {g.pct}%</div>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button data-testid={`goal-del-${g.id}`} variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Remover meta?</AlertDialogTitle><AlertDialogDescription>A meta de "{g.label}" será removida.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => delMut.mutate(g.id)}>Remover</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
