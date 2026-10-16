import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Merge, Building2, UserRound, ShieldCheck } from "lucide-react";

export default function DuplicatesDialog({ open, onOpenChange }) {
  const qc = useQueryClient();
  const lotsQ = useQuery({ queryKey: ["lot-dups"], queryFn: async () => (await api.get("/loteamentos/duplicates")).data, enabled: open });
  const cliQ = useQuery({ queryKey: ["cli-dups"], queryFn: async () => (await api.get("/clients/duplicates")).data, enabled: open });
  const [lotKeep, setLotKeep] = useState({});
  const [cliKeep, setCliKeep] = useState({});

  const invalidate = () => ["lot-dups", "cli-dups", "sales", "stats", "clients", "loteamentos", "ranking"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const lotMerge = useMutation({
    mutationFn: ({ keep, drop }) => api.post("/loteamentos/merge", { keep, drop }),
    onSuccess: () => { invalidate(); toast.success("Loteamentos mesclados!"); },
    onError: () => toast.error("Erro ao mesclar loteamentos."),
  });
  const cliMerge = useMutation({
    mutationFn: ({ keep_id, merge_ids }) => api.post("/clients/merge", { keep_id, merge_ids }),
    onSuccess: () => { invalidate(); toast.success("Clientes mesclados!"); },
    onError: () => toast.error("Erro ao mesclar clientes."),
  });

  const lots = lotsQ.data || [];
  const clis = cliQ.data || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="duplicates-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2"><Merge className="h-5 w-5" /> Revisar duplicados</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-[hsl(var(--emerald))]" /> Mesclar NÃO apaga histórico — as vendas são reatribuídas ao registro escolhido.</DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><Building2 className="h-4 w-4" /> Loteamentos ({lots.length})</h3>
          {lots.length === 0 ? <p className="text-sm text-muted-foreground py-3">Nenhum loteamento duplicado. 🎉</p>
            : lots.map((g, i) => {
              const keep = lotKeep[g.key] ?? g.names[0];
              return (
                <div key={g.key} data-testid={`lot-dup-${i}`} className="rounded-lg border border-border/60 p-3 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {g.names.map((n) => (
                      <Button key={n} type="button" size="sm" className="h-7 text-xs"
                        variant={keep === n ? "default" : "outline"}
                        onClick={() => setLotKeep((s) => ({ ...s, [g.key]: n }))}>{n}</Button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Oficial: <b className="text-foreground">{keep}</b></span>
                    <Button size="sm" className="h-7" data-testid={`lot-merge-btn-${i}`} disabled={lotMerge.isPending}
                      onClick={() => lotMerge.mutate({ keep, drop: g.names.filter((n) => n !== keep) })}>Mesclar</Button>
                  </div>
                </div>
              );
            })}
        </section>

        <section className="space-y-2 mt-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><UserRound className="h-4 w-4" /> Clientes ({clis.length})</h3>
          {clis.length === 0 ? <p className="text-sm text-muted-foreground py-3">Nenhum cliente duplicado. 🎉</p>
            : clis.map((g, i) => {
              const keep = cliKeep[g.key] ?? g.clients[0].id;
              return (
                <div key={g.key} data-testid={`cli-dup-${i}`} className="rounded-lg border border-border/60 p-3 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {g.clients.map((c) => (
                      <Button key={c.id} type="button" size="sm" className="h-7 text-xs"
                        variant={keep === c.id ? "default" : "outline"}
                        onClick={() => setCliKeep((s) => ({ ...s, [g.key]: c.id }))}>
                        {c.name}{c.cpf ? ` · ${c.cpf}` : ""}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-[10px]">manter o escolhido</Badge>
                    <Button size="sm" className="h-7" data-testid={`cli-merge-btn-${i}`} disabled={cliMerge.isPending}
                      onClick={() => cliMerge.mutate({ keep_id: keep, merge_ids: g.clients.map((c) => c.id).filter((id) => id !== keep) })}>Mesclar</Button>
                  </div>
                </div>
              );
            })}
        </section>
      </DialogContent>
    </Dialog>
  );
}
