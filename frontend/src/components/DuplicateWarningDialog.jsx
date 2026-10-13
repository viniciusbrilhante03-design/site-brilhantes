import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function DuplicateWarningDialog({ open, onOpenChange, payload, onConfirm }) {
  const ql = payload ? [payload.quadra && `Qd ${payload.quadra}`, payload.lote && `Lt ${payload.lote}`].filter(Boolean).join(" · ") : "";
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="duplicate-warning-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Venda parecida já existe ⚠️</AlertDialogTitle>
          <AlertDialogDescription>
            Já há uma venda com o mesmo cliente, loteamento, quadra, lote, data e corretor:
            {payload && (
              <span className="mt-2 block rounded-lg border border-border/60 bg-muted/40 p-2.5 text-foreground text-sm">
                <b>{payload.property_name}</b>{ql ? ` · ${ql}` : ""}<br />
                {[payload.client_name, payload.broker_name, payload.sale_date].filter(Boolean).join(" · ")}
              </span>
            )}
            Deseja salvar mesmo assim?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="duplicate-cancel-btn">Cancelar</AlertDialogCancel>
          <AlertDialogAction data-testid="duplicate-confirm-btn" onClick={onConfirm}>
            Salvar mesmo assim
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
