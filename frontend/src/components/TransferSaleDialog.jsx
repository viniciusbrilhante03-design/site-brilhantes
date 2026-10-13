import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowRightLeft } from "lucide-react";

export default function TransferSaleDialog({ open, onOpenChange, sale, brokers = [], onConfirm }) {
  const [target, setTarget] = useState("");
  useEffect(() => { if (open) setTarget(""); }, [open, sale]);

  const options = brokers.filter((b) => b && b !== sale?.broker_name);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="transfer-sale-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" /> Transferir venda
          </DialogTitle>
          <DialogDescription>
            A venda será movida para outro corretor — sem duplicar. VGV, quantidade, ranking e comissões
            passam a contar para o novo corretor.
          </DialogDescription>
        </DialogHeader>

        {sale && (
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
            <div className="font-semibold">{sale.property_name}</div>
            <div className="text-xs text-muted-foreground">
              {[sale.quadra && `Qd ${sale.quadra}`, sale.lote && `Lt ${sale.lote}`, sale.client_name].filter(Boolean).join(" · ")}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Corretor atual: <b>{sale.broker_name}</b></div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">Transferir para</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger data-testid="transfer-broker-select"><SelectValue placeholder="Selecione o corretor" /></SelectTrigger>
            <SelectContent>
              {options.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button data-testid="transfer-confirm-btn" disabled={!target}
            onClick={() => { onConfirm(sale.id, target); onOpenChange(false); }}>
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
