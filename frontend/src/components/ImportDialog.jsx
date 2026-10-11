import { useState, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import api from "@/lib/api";
import { UploadCloud, FileSpreadsheet, FileText, Download, Loader2 } from "lucide-react";

const TEMPLATE_HEADERS = "Loteamento,Quadra,Lote,Cliente,Numero,Email,Corretor,Data,Valor,Comissao %,Entrada,Parcelas";
const TEMPLATE_EXAMPLE = "Residencial Jardim das Aguas,12,07,Maria Silva,(11) 98888-0000,maria@email.com,Ana Paula,15/06/2026,180000,6,18000,12";

export default function ImportDialog({ open, onOpenChange, onImported }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  const downloadTemplate = () => {
    const csv = `${TEMPLATE_HEADERS}\n${TEMPLATE_EXAMPLE}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-vendas-brilhantes.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("/sales/import", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`${res.data.imported} venda(s) importada(s) com sucesso!`);
      setFile(null);
      onImported?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erro ao importar o arquivo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="import-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Importar planilha</DialogTitle>
          <DialogDescription>
            Envie um arquivo Excel (.xlsx), CSV ou PDF com suas vendas. Guardamos tudo automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <button
            data-testid="import-dropzone"
            onClick={() => inputRef.current?.click()}
            className="w-full border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-2 hover:border-primary/60 hover:bg-muted/40 transition-colors"
          >
            <UploadCloud className="h-8 w-8 text-muted-foreground" />
            {file ? (
              <span className="text-sm font-semibold">{file.name}</span>
            ) : (
              <>
                <span className="text-sm font-semibold">Clique para selecionar o arquivo</span>
                <span className="text-xs text-muted-foreground">.xlsx · .csv · .pdf</span>
              </>
            )}
          </button>
          <input
            ref={inputRef}
            data-testid="import-file-input"
            type="file"
            accept=".xlsx,.xls,.csv,.pdf"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />

          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-2">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <FileSpreadsheet className="h-4 w-4" /> Colunas reconhecidas
            </div>
            <p>Loteamento, Quadra, Lote, Cliente, Número, Email, Corretor, Data, Valor, Comissão %, Entrada, Parcelas.</p>
            <button data-testid="import-download-template" onClick={downloadTemplate}
              className="inline-flex items-center gap-1.5 text-primary font-semibold hover:underline">
              <Download className="h-3.5 w-3.5" /> Baixar modelo CSV
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="h-4 w-4" /> PDF com tabela também é aceito (melhor esforço na leitura).
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button data-testid="import-submit-button" onClick={handleUpload} disabled={!file || loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <UploadCloud className="h-4 w-4 mr-1" />}
            Importar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
