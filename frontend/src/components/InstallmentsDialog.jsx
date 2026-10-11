import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { brl, formatDateBR } from "@/lib/format";
import { CheckCircle2, Circle, ArrowDownToLine } from "lucide-react";

export default function InstallmentsDialog({ open, onOpenChange, sale, onToggle }) {
  if (!sale) return null;

  const entrada = sale.entrada || 0;
  const received = (sale.installments || []).filter((i) => i.received).reduce((s, i) => s + i.value, 0) + entrada;
  const pending = (sale.installments || []).filter((i) => !i.received).reduce((s, i) => s + i.value, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="installments-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Fluxo a receber</DialogTitle>
          <DialogDescription>{sale.property_name} · {sale.broker_name}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 my-2">
          <div className="rounded-lg bg-[hsl(var(--emerald)/0.1)] p-3">
            <div className="text-xs text-muted-foreground">Já entrou</div>
            <div className="font-heading font-bold text-[hsl(var(--emerald))] tabular">{brl(received)}</div>
          </div>
          <div className="rounded-lg bg-[hsl(var(--amber)/0.1)] p-3">
            <div className="text-xs text-muted-foreground">Falta entrar</div>
            <div className="font-heading font-bold text-[hsl(var(--amber))] tabular">{brl(pending)}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-lg border border-border/60">
          <ArrowDownToLine className="h-5 w-5 text-[hsl(var(--emerald))]" />
          <div className="flex-1">
            <div className="font-semibold text-sm">Entrada</div>
            <div className="text-xs text-muted-foreground">Recebida no ato</div>
          </div>
          <div className="font-heading font-bold tabular">{brl(entrada)}</div>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto pr-1 mt-1">
          {(sale.installments || []).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Sem parcelas cadastradas.</p>
          )}
          {(sale.installments || []).map((inst) => (
            <div key={inst.number}
              className="flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors"
              data-testid={`installment-item-${inst.number}`}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">Parcela #{inst.number}</span>
                  {inst.received ? (
                    <Badge className="bg-[hsl(var(--emerald))] hover:bg-[hsl(var(--emerald))] text-white text-[10px]">Recebida</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">Pendente</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">Vence {formatDateBR(inst.due_date)}</div>
              </div>
              <div className="font-heading font-bold tabular">{brl(inst.value)}</div>
              <Button
                data-testid={`btn-mark-installment-received-${inst.number}`}
                size="sm"
                variant={inst.received ? "outline" : "default"}
                onClick={() => onToggle(sale.id, inst.number)}
              >
                {inst.received ? <Circle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                <span className="ml-1 hidden sm:inline">{inst.received ? "Desfazer" : "Dar baixa"}</span>
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
