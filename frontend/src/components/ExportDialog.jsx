import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FileSpreadsheet, FileText, Users } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

export const EXPORT_COLUMNS = [
  "Data", "Loteamento", "Quadra", "Lote", "Cliente", "Corretor",
  "Valor da venda", "Comissão %", "Comissão total", "Comissão corretor",
  "Comissão imobiliária", "Entrada", "Já recebido", "A receber", "Status",
];

export default function ExportDialog({ open, onOpenChange, onExport }) {
  const [cols, setCols] = useState(EXPORT_COLUMNS);

  const toggle = (c) =>
    setCols((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  const ordered = EXPORT_COLUMNS.filter((c) => cols.includes(c));

  const run = (type) => {
    onExport(type, ordered.length ? ordered : EXPORT_COLUMNS);
    onOpenChange(false);
  };

  const exportClients = async () => {
    try {
      const res = await api.get("/export/backup", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "backup-brilhantes.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup completo gerado!");
    } catch {
      toast.error("Erro ao gerar backup.");
    }
  };

  const exportJson = async () => {
    try {
      const res = await api.get("/export/backup-json", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "backup-brilhantes.json";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup em JSON gerado!");
    } catch {
      toast.error("Erro ao gerar backup JSON.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="export-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Exportar relatório</DialogTitle>
          <DialogDescription>Escolha as colunas que vão aparecer no arquivo.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{ordered.length} coluna(s) selecionada(s)</span>
          <div className="flex gap-2">
            <Button data-testid="export-select-all" variant="ghost" size="sm" className="h-7 text-xs"
              onClick={() => setCols(EXPORT_COLUMNS)}>Todas</Button>
            <Button data-testid="export-select-none" variant="ghost" size="sm" className="h-7 text-xs"
              onClick={() => setCols([])}>Nenhuma</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 max-h-[46vh] overflow-y-auto pr-1">
          {EXPORT_COLUMNS.map((c) => (
            <label key={c} data-testid={`export-col-${c}`}
              className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50">
              <Checkbox checked={cols.includes(c)} onCheckedChange={() => toggle(c)} />
              <span className="truncate">{c}</span>
            </label>
          ))}
        </div>

        <div className="flex gap-2 pt-1">
          <Button data-testid="export-run-xlsx" className="flex-1" disabled={!ordered.length} onClick={() => run("xlsx")}>
            <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Vendas (.xlsx)
          </Button>
          <Button data-testid="export-run-pdf" className="flex-1" variant="outline" disabled={!ordered.length} onClick={() => run("pdf")}>
            <FileText className="h-4 w-4 mr-1.5" /> Vendas (PDF)
          </Button>
        </div>

        <div className="pt-2 mt-1 border-t border-border/60 space-y-2">
          <p className="text-xs text-muted-foreground">Backup de <strong>todos os dados</strong> (vendas, parcelas, baixas, clientes, corretores, agenda, auditoria) — o que o GitHub não leva.</p>
          <Button data-testid="export-run-clients" variant="secondary" className="w-full" onClick={exportClients}>
            <Users className="h-4 w-4 mr-1.5" /> Backup completo — Excel (.xlsx)
          </Button>
          <Button data-testid="export-run-json" variant="outline" className="w-full" onClick={exportJson}>
            <FileText className="h-4 w-4 mr-1.5" /> Backup p/ migração — JSON (Bolt/código)
          </Button>
          <p className="text-[11px] text-muted-foreground">Use o <strong>JSON</strong> ao migrar para outra ferramenta (ex.: Bolt), pois ela não aceita .xlsx.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
