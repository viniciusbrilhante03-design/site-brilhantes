import { useState, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import api from "@/lib/api";
import { brl } from "@/lib/format";
import { UploadCloud, FileSpreadsheet, FileText, Download, Loader2, Sparkles, ArrowLeft, Camera } from "lucide-react";

const TEMPLATE_HEADERS = "Loteamento,Quadra,Lote,Cliente,Numero,Email,Corretor,Data,Valor,Comissao %,Entrada,Parcelas";
const TEMPLATE_EXAMPLE = "Residencial Jardim das Aguas,12,07,Maria Silva,(11) 98888-0000,maria@email.com,Ana Paula,15/06/2026,180000,6,18000,12";
const ACCEPT = ".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp,.heic,.gif,.bmp";

export default function ImportDialog({ open, onOpenChange, onImported }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  const [aiFile, setAiFile] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [preview, setPreview] = useState(null);   // {total, duplicates}
  const [rows, setRows] = useState([]);            // editable copy
  const [selected, setSelected] = useState(new Set());
  const aiInputRef = useRef(null);

  const lotsQ = useQuery({ queryKey: ["loteamentos"], queryFn: async () => (await api.get("/loteamentos")).data, enabled: open });
  const corrsQ = useQuery({ queryKey: ["corretores"], queryFn: async () => (await api.get("/corretores")).data, enabled: open });
  const lotNames = useMemo(() => (lotsQ.data || []).map((l) => l.name), [lotsQ.data]);
  const corrNames = useMemo(() => (corrsQ.data || []).map((c) => c.war_name || c.name).filter(Boolean), [corrsQ.data]);
  const lotSet = useMemo(() => new Set(lotNames.map((n) => n.toLowerCase())), [lotNames]);
  const corrSet = useMemo(() => new Set(corrNames.map((n) => n.toLowerCase())), [corrNames]);

  const downloadTemplate = () => {
    const csv = `${TEMPLATE_HEADERS}\n${TEMPLATE_EXAMPLE}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "modelo-vendas-brilhantes.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const resetAi = () => { setAiFile(null); setPreview(null); setRows([]); setSelected(new Set()); };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("/sales/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`${res.data.imported} venda(s) importada(s) com sucesso!`);
      setFile(null); onImported?.(); onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erro ao importar o arquivo.");
    } finally { setLoading(false); }
  };

  const handleAnalyze = async () => {
    if (!aiFile) return;
    setAiLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", aiFile);
      const res = await api.post("/sales/import-ai/preview", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setPreview({ total: res.data.total, duplicates: res.data.duplicates });
      setRows(res.data.rows || []);
      const sel = new Set();
      (res.data.rows || []).forEach((r, i) => { if (!r.is_duplicate) sel.add(i); });
      setSelected(sel);
      if (!res.data.total) toast.info("A IA não encontrou vendas no arquivo.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erro ao analisar com IA.");
    } finally { setAiLoading(false); }
  };

  const updateRow = (i, key, val) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
  const toggleRow = (i) => setSelected((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const toggleAll = () => setSelected((s) => (s.size === rows.length ? new Set() : new Set(rows.map((_, i) => i))));

  const handleConfirm = async () => {
    const chosen = rows.filter((_, i) => selected.has(i)).map((r) => ({
      ...r, sale_value: parseFloat(r.sale_value) || 0,
    }));
    if (!chosen.length) return;
    setAiLoading(true);
    try {
      const res = await api.post("/sales/import-ai/confirm", { rows: chosen });
      const extra = [];
      if (res.data.new_corretores) extra.push(`${res.data.new_corretores} corretor(es) novo(s)`);
      if (res.data.new_loteamentos) extra.push(`${res.data.new_loteamentos} loteamento(s) novo(s)`);
      toast.success(`${res.data.imported} venda(s) importada(s)!${extra.length ? " " + extra.join(", ") + "." : ""}`);
      resetAi(); onImported?.(); onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erro ao confirmar importação.");
    } finally { setAiLoading(false); }
  };

  const selCount = selected.size;
  const allChecked = useMemo(() => rows.length > 0 && selCount === rows.length, [rows, selCount]);
  const isNewLot = (v) => (v || "").trim() && !lotSet.has((v || "").trim().toLowerCase());
  const isNewCorr = (v) => (v || "").trim() && !corrSet.has((v || "").trim().toLowerCase());

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setFile(null); resetAi(); } }}>
      <DialogContent className={preview ? "max-w-5xl max-h-[92vh] overflow-y-auto" : "max-w-lg"} data-testid="import-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Importar vendas</DialogTitle>
          <DialogDescription>Planilha, PDF ou foto do relatório da construtora — com leitura inteligente por IA.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="ia" className="mt-1">
          <TabsList>
            <TabsTrigger value="ia" data-testid="tab-import-ia"><Sparkles className="h-4 w-4 mr-1" /> Com IA</TabsTrigger>
            <TabsTrigger value="simples" data-testid="tab-import-simples">Planilha</TabsTrigger>
          </TabsList>

          <TabsContent value="ia" className="space-y-4 mt-3">
            {!preview ? (
              <>
                <button data-testid="import-ai-dropzone" onClick={() => aiInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-primary/40 rounded-xl p-8 flex flex-col items-center gap-2 hover:border-primary/60 hover:bg-primary/5 transition-colors">
                  <div className="flex items-center gap-2 text-primary"><Sparkles className="h-7 w-7" /><Camera className="h-7 w-7" /></div>
                  {aiFile ? <span className="text-sm font-semibold">{aiFile.name}</span> : (
                    <>
                      <span className="text-sm font-semibold">Selecione o relatório ou tire uma foto</span>
                      <span className="text-xs text-muted-foreground">.xlsx · .csv · .pdf · foto (.jpg/.png) — a IA lê qualquer layout</span>
                    </>
                  )}
                </button>
                <input ref={aiInputRef} data-testid="import-ai-file-input" type="file" accept={ACCEPT} capture="environment"
                  className="hidden" onChange={(e) => setAiFile(e.target.files?.[0] || null)} />
                <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                  A IA extrai as vendas, reconhece corretor/loteamento/cliente/valores/parcelas, marca possíveis
                  duplicatas e mostra uma prévia <strong>editável</strong> para você corrigir antes de salvar.
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                  <Button data-testid="import-ai-analyze-button" onClick={handleAnalyze} disabled={!aiFile || aiLoading}>
                    {aiLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                    Analisar com IA
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <button onClick={resetAi} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="h-4 w-4" /> Trocar arquivo
                  </button>
                  <div className="text-sm text-muted-foreground">
                    {preview.total} venda(s) · <span className="text-[hsl(var(--amber))] font-medium">{preview.duplicates} duplicada(s)</span> · edite o que precisar
                  </div>
                </div>
                <datalist id="imp-lots">{lotNames.map((n) => <option key={n} value={n} />)}</datalist>
                <datalist id="imp-corrs">{corrNames.map((n) => <option key={n} value={n} />)}</datalist>
                <div className="rounded-xl border border-border/60 overflow-x-auto max-h-[56vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card z-10">
                      <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                        <th className="p-2"><Checkbox data-testid="import-ai-select-all" checked={allChecked} onCheckedChange={toggleAll} /></th>
                        <th className="p-2 font-medium min-w-[180px]">Loteamento</th>
                        <th className="p-2 font-medium">Qd/Lt</th>
                        <th className="p-2 font-medium min-w-[140px]">Corretor</th>
                        <th className="p-2 font-medium min-w-[140px]">Cliente</th>
                        <th className="p-2 font-medium">Data</th>
                        <th className="p-2 font-medium text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} data-testid={`import-ai-row-${i}`}
                          className={`border-b border-border/40 align-top ${r.is_duplicate ? "bg-[hsl(var(--amber)/0.08)]" : ""}`}>
                          <td className="p-2 pt-3"><Checkbox data-testid={`import-ai-check-${i}`} checked={selected.has(i)} onCheckedChange={() => toggleRow(i)} /></td>
                          <td className="p-2">
                            <Input data-testid={`import-ai-lot-${i}`} list="imp-lots" value={r.property_name || ""}
                              onChange={(e) => updateRow(i, "property_name", e.target.value)} className="h-8" />
                            <div className="flex flex-wrap gap-1 mt-1">
                              {r.is_duplicate && <Badge variant="outline" className="text-[9px] border-[hsl(var(--amber))] text-[hsl(var(--amber))]">Duplicada</Badge>}
                              {isNewLot(r.property_name) && <Badge variant="secondary" className="text-[9px]">Novo loteamento</Badge>}
                            </div>
                          </td>
                          <td className="p-2">
                            <div className="flex gap-1">
                              <Input data-testid={`import-ai-quadra-${i}`} value={r.quadra || ""} onChange={(e) => updateRow(i, "quadra", e.target.value)} className="h-8 w-12 px-1.5" placeholder="Qd" />
                              <Input data-testid={`import-ai-lote-${i}`} value={r.lote || ""} onChange={(e) => updateRow(i, "lote", e.target.value)} className="h-8 w-12 px-1.5" placeholder="Lt" />
                            </div>
                          </td>
                          <td className="p-2">
                            <Input data-testid={`import-ai-corr-${i}`} list="imp-corrs" value={r.broker_name || ""}
                              onChange={(e) => updateRow(i, "broker_name", e.target.value)} className="h-8" />
                            {isNewCorr(r.broker_name) && <Badge variant="secondary" className="text-[9px] mt-1">Novo corretor</Badge>}
                          </td>
                          <td className="p-2">
                            <Input data-testid={`import-ai-client-${i}`} value={r.client_name || ""} onChange={(e) => updateRow(i, "client_name", e.target.value)} className="h-8" />
                          </td>
                          <td className="p-2">
                            <Input data-testid={`import-ai-date-${i}`} type="date" value={r.sale_date || ""} onChange={(e) => updateRow(i, "sale_date", e.target.value)} className="h-8 w-36" />
                          </td>
                          <td className="p-2">
                            <Input data-testid={`import-ai-value-${i}`} type="number" value={r.sale_value || ""} onChange={(e) => updateRow(i, "sale_value", e.target.value)} className="h-8 w-28 text-right" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Dica: corrija o corretor/loteamento aqui e o sistema cadastra automaticamente os novos.</span>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={resetAi}>Voltar</Button>
                    <Button data-testid="import-ai-confirm-button" onClick={handleConfirm} disabled={!selCount || aiLoading}>
                      {aiLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <UploadCloud className="h-4 w-4 mr-1" />}
                      Importar {selCount} selecionada(s)
                    </Button>
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="simples" className="space-y-4 mt-3">
            <button data-testid="import-dropzone" onClick={() => inputRef.current?.click()}
              className="w-full border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-2 hover:border-primary/60 hover:bg-muted/40 transition-colors">
              <UploadCloud className="h-8 w-8 text-muted-foreground" />
              {file ? <span className="text-sm font-semibold">{file.name}</span> : (
                <>
                  <span className="text-sm font-semibold">Clique para selecionar o arquivo</span>
                  <span className="text-xs text-muted-foreground">.xlsx · .csv · .pdf</span>
                </>
              )}
            </button>
            <input ref={inputRef} data-testid="import-file-input" type="file" accept=".xlsx,.xls,.csv,.pdf"
              className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-2">
              <div className="flex items-center gap-2 text-foreground font-semibold"><FileSpreadsheet className="h-4 w-4" /> Colunas reconhecidas</div>
              <p>Loteamento, Quadra, Lote, Cliente, Número, Email, Corretor, Data, Valor, Comissão %, Entrada, Parcelas.</p>
              <button data-testid="import-download-template" onClick={downloadTemplate}
                className="inline-flex items-center gap-1.5 text-primary font-semibold hover:underline">
                <Download className="h-3.5 w-3.5" /> Baixar modelo CSV
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-4 w-4" /> PDF com tabela também é aceito (melhor esforço na leitura).
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button data-testid="import-submit-button" onClick={handleUpload} disabled={!file || loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <UploadCloud className="h-4 w-4 mr-1" />}
                Importar
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
