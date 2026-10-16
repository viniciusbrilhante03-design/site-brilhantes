import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { brl, formatDateBR } from "@/lib/format";
import { Wallet, CalendarClock, Printer } from "lucide-react";

const STCLS = { pago: "bg-[hsl(var(--emerald))] text-white", parcial: "bg-[hsl(var(--amber))] text-white", vencida: "bg-[hsl(var(--rose))] text-white", pendente: "bg-muted text-foreground" };

function Kpi({ label, value, tone }) {
  return (
    <div className={`rounded-lg p-3 bg-[hsl(var(--${tone})/0.1)]`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-heading font-bold tabular text-sm text-[hsl(var(--${tone}))]`}>{value}</div>
    </div>
  );
}

export default function CommissionsDialog({ open, onOpenChange }) {
  const ext = useQuery({ queryKey: ["extrato"], queryFn: async () => (await api.get("/commissions/extrato")).data, enabled: open });
  const ag = useQuery({ queryKey: ["agenda"], queryFn: async () => (await api.get("/commissions/agenda")).data, enabled: open });
  const e = ext.data || {};
  const agenda = ag.data || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="commissions-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2"><Wallet className="h-5 w-5" /> Comissões</DialogTitle>
          <DialogDescription>Extrato e agenda de recebimentos — somente a sua base de vendas.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="extrato">
          <TabsList>
            <TabsTrigger value="extrato" data-testid="tab-extrato">Extrato</TabsTrigger>
            <TabsTrigger value="agenda" data-testid="tab-agenda"><CalendarClock className="h-4 w-4 mr-1" /> Agenda</TabsTrigger>
          </TabsList>

          <TabsContent value="extrato" className="space-y-3 mt-3" data-testid="extrato-content">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Kpi label="Vendas" value={e.vendas ?? 0} tone="primary" />
              <Kpi label="VGV" value={brl(e.vgv || 0)} tone="primary" />
              <Kpi label="Comissão gerada" value={brl(e.comissao_gerada || 0)} tone="gold" />
              <Kpi label="Recebida" value={brl(e.comissao_recebida || 0)} tone="emerald" />
              <Kpi label="A receber" value={brl(e.comissao_a_receber || 0)} tone="amber" />
              <Kpi label="Vencida" value={brl(e.comissao_vencida || 0)} tone="rose" />
            </div>
            {e.proximo_recebimento && (
              <div className="text-sm text-muted-foreground">Próximo recebimento: <b className="text-foreground">{formatDateBR(e.proximo_recebimento.due_date)}</b> · {e.proximo_recebimento.property_name} · {brl(e.proximo_recebimento.saldo)}</div>
            )}
            <div>
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Próximos recebimentos</h4>
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" data-testid="extrato-print" onClick={() => window.print()}><Printer className="h-3.5 w-3.5" /> PDF</Button>
              </div>
              <div className="space-y-1.5">
                {(e.proximos || []).length === 0 ? <p className="text-sm text-muted-foreground py-3">Nada em aberto. 🎉</p>
                  : (e.proximos || []).map((p, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-border/60 p-2.5 text-sm" data-testid={`extrato-row-${i}`}>
                      <div className="min-w-0"><div className="font-medium truncate">{p.property_name} · Parc #{p.number}</div><div className="text-xs text-muted-foreground">{formatDateBR(p.due_date)} · {p.client_name || "—"}</div></div>
                      <div className="flex items-center gap-2 shrink-0"><Badge className={`${STCLS[p.status]} text-[10px]`}>{p.status}</Badge><span className="font-heading font-bold tabular">{brl(p.saldo)}</span></div>
                    </div>
                  ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="agenda" className="space-y-1.5 mt-3" data-testid="agenda-content">
            {agenda.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Nenhum vencimento em aberto.</p>
              : agenda.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border/60 p-2.5 text-sm" data-testid={`agenda-row-${i}`}>
                  <div className="min-w-0"><div className="font-medium truncate">{p.property_name} · Parc #{p.number}</div><div className="text-xs text-muted-foreground">Vence {formatDateBR(p.due_date)} · {p.broker_name}</div></div>
                  <div className="flex items-center gap-2 shrink-0"><Badge className={`${STCLS[p.status]} text-[10px]`}>{p.status}</Badge><span className="font-heading font-bold tabular">{brl(p.saldo)}</span></div>
                </div>
              ))}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
