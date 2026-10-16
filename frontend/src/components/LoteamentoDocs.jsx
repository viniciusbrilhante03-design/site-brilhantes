import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { UploadCloud, Trash2, Loader2, FileText, Download, DollarSign } from "lucide-react";

const CATS = { documento: "Documento", tabela_preco: "Tabela de preço" };

export default function LoteamentoDocs({ lotId, canManage = false }) {
  const qc = useQueryClient();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("documento");

  const listQ = useQuery({ queryKey: ["lot-docs", lotId], queryFn: async () => (await api.get(`/loteamentos/${lotId}/docs`)).data, enabled: !!lotId });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["lot-docs", lotId] });
  const delMut = useMutation({ mutationFn: (id) => api.delete(`/loteamentos/docs/${id}`), onSuccess: () => { invalidate(); toast.success("Removido."); } });

  const handleFile = async (files) => {
    const f = (files || [])[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("title", title.trim() || f.name);
      fd.append("category", category);
      await api.post(`/loteamentos/${lotId}/docs`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      invalidate(); setTitle("");
      toast.success("Arquivo enviado!");
    } catch (e) { toast.error(e?.response?.data?.detail || "Erro ao enviar arquivo."); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  const download = async (d) => {
    try {
      const res = await api.get(`/loteamentos/docs/${d.id}/download`, { responseType: "blob" });
      const u = URL.createObjectURL(res.data);
      const a = document.createElement("a"); a.href = u; a.download = d.filename || d.title || "arquivo"; a.click(); URL.revokeObjectURL(u);
    } catch { toast.error("Erro ao baixar."); }
  };

  const docs = listQ.data || [];

  return (
    <div className="space-y-3" data-testid="lot-docs">
      {canManage && (
        <div className="rounded-xl border border-border/60 p-3 space-y-2">
          <div className="font-semibold text-sm">Enviar arquivo (o corretor poderá baixar)</div>
          <div className="grid grid-cols-2 gap-2">
            <Input data-testid="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (opcional)" className="h-8" />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger data-testid="doc-category" className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(CATS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <button data-testid="doc-upload-dropzone" onClick={() => inputRef.current?.click()} disabled={uploading}
            className="w-full border-2 border-dashed border-primary/40 rounded-xl p-4 flex flex-col items-center gap-1.5 hover:border-primary/60 hover:bg-primary/5 transition-colors disabled:opacity-60">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <UploadCloud className="h-5 w-5 text-primary" />}
            <span className="text-sm font-semibold">{uploading ? "Enviando..." : "Selecionar PDF/arquivo"}</span>
          </button>
          <input ref={inputRef} data-testid="doc-upload-input" type="file" accept="application/pdf,image/*,.xls,.xlsx,.doc,.docx" className="hidden" onChange={(e) => handleFile(e.target.files)} />
        </div>
      )}

      {docs.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-6"><FileText className="h-8 w-8 mx-auto mb-2 opacity-40" /> Nenhum arquivo disponível.</div>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => {
            const Icon = d.category === "tabela_preco" ? DollarSign : FileText;
            return (
              <div key={d.id} data-testid={`doc-${d.id}`} className="flex items-center gap-2.5 rounded-lg border border-border/60 p-2.5">
                <Icon className="h-5 w-5 text-[hsl(var(--gold))] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{d.title}</div>
                  <Badge variant="secondary" className="text-[10px]">{CATS[d.category] || "Documento"}</Badge>
                </div>
                <Button variant="outline" size="sm" className="h-8 gap-1.5" data-testid={`doc-download-${d.id}`} onClick={() => download(d)}><Download className="h-4 w-4" /> Baixar</Button>
                {canManage && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" data-testid={`doc-del-${d.id}`} onClick={() => delMut.mutate(d.id)}><Trash2 className="h-4 w-4" /></Button>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
