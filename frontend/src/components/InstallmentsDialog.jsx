import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { brl, formatDateBR } from "@/lib/format";
import { CheckCircle2, Undo2 } from "lucide-react";

const STATUS = {
  pago: { label: "Pago", cls: "bg-[hsl(var(--emerald))] text-white" },
  parcial: { label: "Parcial", cls: "bg-[hsl(var(--amber))] text-white" },
  vencida: { label: "Vencida", cls: "bg-[hsl(var(--rose))] text-white" },
  pendente: { label: "Pendente", cls: "bg-muted text-foreground" },
};

export default function InstallmentsDialog({ open, onOpenChange, sale, onBaixa, onToggle }) {
  const [openRow, setOpenRow] = useState(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("PIX");
  const [kind, setKind] = useState("repasse");
  if (!sale) return null;

  const cv = sale.commission_value || 0;
  const insts = sale.installments || [];
  const net = (i) => i.net || i.value || 0;
  const paidOf = (i) => i.paid || 0;
  const received = insts.reduce((s, i) => s + paidOf(i), 0) || (sale.commission_received ? cv : 0);
  const pending = Math.max((insts.reduce((s, i) => s + net(i), 0) || cv) - received, 0);
  const overdue = insts.filter((i) => i.status === "vencida").reduce((s, i) => s + (net(i) - paidOf(i)), 0);

  const startBaixa = (i) => { setOpenRow(i.number); setAmount(String(Math.max(net(i) - paidOf(i), 0))); setMethod("PIX"); setKind("repasse"); };
  const confirm = (i) => {
    onBaixa(sale.id, i.number, { amount: parseFloat(amount) || 0, method, kind });
    setOpenRow(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="installments-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Parcelas da comissão</DialogTitle>
          <DialogDescription>{sale.property_name} · {sale.broker_name} · Comissão total {brl(cv)}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 my-2">
          <div className="rounded-lg bg-[hsl(var(--emerald)/0.1)] p-3"><div className="text-xs text-muted-foreground">Recebida</div><div className="font-heading font-bold text-[hsl(var(--emerald))] tabular text-sm">{brl(received)}</div></div>
          <div className="rounded-lg bg-[hsl(var(--amber)/0.1)] p-3"><div className="text-xs text-muted-foreground">A receber</div><div className="font-heading font-bold text-[hsl(var(--amber))] tabular text-sm">{brl(pending)}</div></div>
          <div className="rounded-lg bg-[hsl(var(--rose)/0.1)] p-3"><div className="text-xs text-muted-foreground">Vencida</div><div className="font-heading font-bold text-[hsl(var(--rose))] tabular text-sm">{brl(overdue)}</div></div>
        </div>

        <div className="space-y-2 mt-1">
          {insts.length === 0 && (
            <div className="p-3 rounded-lg border border-border/60 flex items-center justify-between" data-testid="installment-item-avista">
              <span className="text-sm">Comissão à vista {sale.commission_received ? "— recebida" : ""}</span>
              {onToggle && <Button size="sm" variant={sale.commission_received ? "outline" : "default"} onClick={() => onToggle(sale.id, 0)} data-testid="btn-toggle-avista">{sale.commission_received ? "Desfazer" : "Dar baixa"}</Button>}
            </div>
          )}
          {insts.map((inst) => {
            const st = STATUS[inst.status] || STATUS.pendente;
            const saldo = net(inst) - paidOf(inst);
            return (
              <div key={inst.number} className="p-3 rounded-lg border border-border/60" data-testid={`installment-item-${inst.number}`}>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">Parcela #{inst.number}</span>
                      <Badge className={`${st.cls} text-[10px]`} data-testid={`installment-status-${inst.number}`}>{st.label}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">Vence {formatDateBR(inst.due_date)} · Líquido {brl(net(inst))} · Pago {brl(paidOf(inst))} · Saldo {brl(saldo)}</div>
                  </div>
                  {inst.status !== "pago" && (
                    <Button size="sm" data-testid={`btn-baixa-${inst.number}`} onClick={() => (openRow === inst.number ? setOpenRow(null) : startBaixa(inst))}>
                      <CheckCircle2 className="h-4 w-4" /><span className="ml-1 hidden sm:inline">Dar baixa</span>
                    </Button>
                  )}
                </div>
                {openRow === inst.number && (
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/40 pt-3" data-testid={`baixa-form-${inst.number}`}>
                    <div><label className="text-xs text-muted-foreground">Valor</label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid={`baixa-amount-${inst.number}`} /></div>
                    <div><label className="text-xs text-muted-foreground">Forma</label>
                      <select value={method} onChange={(e) => setMethod(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" data-testid={`baixa-method-${inst.number}`}>
                        <option>PIX</option><option>Boleto</option><option>Transferência</option>
                      </select>
                    </div>
                    <div><label className="text-xs text-muted-foreground">Tipo</label>
                      <select value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" data-testid={`baixa-kind-${inst.number}`}>
                        <option value="repasse">Repasse (p/ corretor)</option>
                        <option value="recebimento">Recebimento (da construtora)</option>
                      </select>
                    </div>
                    <div className="flex items-end"><Button className="w-full" size="sm" onClick={() => confirm(inst)} data-testid={`baixa-confirm-${inst.number}`}>Confirmar baixa</Button></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
