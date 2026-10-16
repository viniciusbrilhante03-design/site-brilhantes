import { useState, useEffect } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function CancelSaleDialog({ sale, onOpenChange, onConfirm }) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (sale) setReason(""); }, [sale]);
  return (
    <AlertDialog open={!!sale} onOpenChange={(v) => { if (!v) onOpenChange(false); }}>
      <AlertDialogContent data-testid="cancel-sale-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar / distrato da venda?</AlertDialogTitle>
          <AlertDialogDescription>
            A venda de "{sale?.property_name}" sairá do VGV, ranking e metas, mas o histórico é preservado e a comissão gera estorno/ajuste. Esta ação fica registrada na auditoria.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label className="text-xs">Motivo</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: distrato a pedido do cliente" data-testid="cancel-reason-input" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="cancel-sale-back">Voltar</AlertDialogCancel>
          <AlertDialogAction data-testid="cancel-sale-confirm" onClick={() => onConfirm(sale.id, reason)}>Confirmar cancelamento</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
