import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Paperclip, Download, Trash2, FileText, UploadCloud, Loader2 } from "lucide-react";

const fmtSize = (b) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

export default function AttachmentsDialog({ open, onOpenChange, sale }) {
  const qc = useQueryClient();
  const inputRef = useRef(null);
  const saleId = sale?.id;

  const listQ = useQuery({
    queryKey: ["attachments", saleId],
    queryFn: async () => (await api.get(`/sales/${saleId}/attachments`)).data,
    enabled: open && !!saleId,
  });

  const uploadMut = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append("file", file);
      return api.post(`/sales/${saleId}/attachments`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attachments", saleId] });
      toast.success("Arquivo anexado!");
    },
    onError: (e) => toast.error(e?.response?.data?.detail || "Erro ao anexar."),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/attachments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attachments", saleId] });
      toast.success("Anexo removido.");
    },
    onError: () => toast.error("Erro ao remover."),
  });

  const download = async (att) => {
    try {
      const res = await api.get(`/attachments/${att.id}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Erro ao baixar o anexo.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="attachments-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2">
            <Paperclip className="h-5 w-5" /> Anexos da venda
          </DialogTitle>
          <DialogDescription>{sale?.property_name} · anexe contratos, comprovantes e documentos.</DialogDescription>
        </DialogHeader>

        <button data-testid="attachment-dropzone" onClick={() => inputRef.current?.click()}
          className="w-full border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center gap-1 hover:border-primary/60 hover:bg-muted/40 transition-colors">
          {uploadMut.isPending ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <UploadCloud className="h-6 w-6 text-muted-foreground" />}
          <span className="text-sm font-semibold">Clique para anexar um arquivo</span>
          <span className="text-xs text-muted-foreground">PDF, imagens, planilhas · até 10 MB</span>
        </button>
        <input ref={inputRef} data-testid="attachment-file-input" type="file" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMut.mutate(f); e.target.value = ""; }} />

        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {listQ.isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
          ) : (Array.isArray(listQ.data) ? listQ.data : []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum anexo ainda.</p>
          ) : (
            (Array.isArray(listQ.data) ? listQ.data : []).map((att) => (
              <div key={att.id} data-testid={`attachment-item-${att.id}`}
                className="flex items-center gap-3 p-3 rounded-lg border border-border/60">
                <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{att.filename}</div>
                  <div className="text-xs text-muted-foreground">{fmtSize(att.size)}</div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => download(att)}
                  data-testid={`attachment-download-${att.id}`}>
                  <Download className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                      data-testid={`attachment-delete-${att.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remover anexo?</AlertDialogTitle>
                      <AlertDialogDescription>"{att.filename}" será removido permanentemente.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => deleteMut.mutate(att.id)}>Remover</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
