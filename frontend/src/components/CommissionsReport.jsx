import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { brl, MESES } from "@/lib/format";
import { FileSpreadsheet, FileText, Columns3, Layers } from "lucide-react";

const ALL_COLS = ["Data", "Loteamento", "Quadra", "Lote", "Corretor", "Valor",
  "%", "Comissão", "Desc. NF/boleto", "Líquido", "Parcelas", "Pago", "Saldo", "Status"];
const MONEY = new Set(["Valor", "Comissão", "Desc. NF/boleto", "Líquido", "Pago", "Saldo"]);
const STCLS = { Paga: "bg-[hsl(var(--emerald))] text-white", Parcial: "bg-[hsl(var(--amber))] text-white", Pendente: "bg-muted text-foreground" };
const nowYear = new Date().getFullYear();

function Kpi({ label, value, tone, testid }) {
  return (
    <div className={`rounded-lg p-3 bg-[hsl(var(--${tone})/0.1)]`} data-testid={testid}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-heading font-bold tabular text-sm text-[hsl(var(--${tone}))]`}>{value}</div>
    </div>
  );
}

export default function CommissionsReport({ canEdit }) {
  const qc = useQueryClient();
  const [year, setYear] = useState(nowYear);
  const [month, setMonth] = useState("");       // "" = ano todo
  const [loteamento, setLoteamento] = useState("");
  const [corretor, setCorretor] = useState("");
  const [status, setStatus] = useState("");
  const [cols, setCols] = useState(ALL_COLS);
  const [grouped, setGrouped] = useState(false);
  const [edit, setEdit] = useState(null);        // {id, field}
  const [editVal, setEditVal] = useState("");

  const filters = { year, month, loteamento, corretor, status };
  const reportQ = useQuery({
    queryKey: ["comm-report", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (year) params.set("year", year);
      if (month) params.set("month", month);
      if (loteamento) params.set("loteamento", loteamento);
      if (corretor) params.set("corretor", corretor);
      if (status) params.set("status", status);
      return (await api.get(`/commissions/report?${params}`)).data;
    },
  });
  const lotsQ = useQuery({ queryKey: ["lots-names"], queryFn: async () => (await api.get("/loteamentos")).data });
  const brokersQ = useQuery({ queryKey: ["brokers"], queryFn: async () => (await api.get("/brokers")).data });

  const rows = reportQ.data?.rows || [];
  const summary = reportQ.data?.summary || {};
  const allowEdit = canEdit && reportQ.data?.can_edit;

  const patchMut = useMutation({
    mutationFn: ({ id, body }) => api.patch(`/sales/${id}/commission`, body),
    onSuccess: () => {
      ["comm-report", "extrato", "agenda", "stats", "ranking", "sales", "monthly-series"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] }));
      toast.success("Comissão atualizada.");
    },
    onError: () => toast.error("Erro ao atualizar comissão."),
  });

  const startEdit = (r, field) => {
    if (!allowEdit) return;
    setEdit({ id: r.sale_id, field });
    setEditVal(String(field === "%" ? (r["%"] || "") : (r.discount_total || "")));
  };
  const saveEdit = (r) => {
    const v = parseFloat(String(editVal).replace(",", ".")) || 0;
    const body = edit.field === "%" ? { commission_rate: v } : { discount: v };
    patchMut.mutate({ id: r.sale_id, body });
    setEdit(null);
  };

  const download = async (type) => {
    try {
      const params = new URLSearchParams();
      if (year) params.set("year", year);
      if (month) params.set("month", month);
      if (loteamento) params.set("loteamento", loteamento);
      if (corretor) params.set("corretor", corretor);
      if (status) params.set("status", status);
      params.set("columns", cols.join("||"));
      const res = await api.get(`/commissions/report/${type}?${params}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-comissoes.${type === "xlsx" ? "xlsx" : "pdf"}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Relatório gerado!");
    } catch {
      toast.error("Erro ao exportar.");
    }
  };

  const visible = ALL_COLS.filter((c) => cols.includes(c));
  const groups = useMemo(() => {
    if (!grouped) return [{ key: null, rows }];
    const map = new Map();
    for (const r of rows) {
      const k = r.Loteamento || "—";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, rs]) => ({ key, rows: rs.slice().sort((x, y) => (x.Quadra || "").localeCompare(y.Quadra || "")) }));
  }, [grouped, rows]);

  const cellTxt = (r, c) => {
    const v = r[c];
    if (MONEY.has(c)) return brl(v);
    if (c === "%") return v ? `${v}%` : "—";
    return v === "" || v == null ? "—" : v;
  };

  const lotOptions = (lotsQ.data || []).map((l) => l.name).filter(Boolean);
  const brokerOptions = [...new Set((brokersQ.data || []).map((b) => b.war_name || b.full_name).filter(Boolean))];

  return (
    <div className="space-y-3" data-testid="report-content">
      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Kpi label="Vendas" value={summary.vendas ?? 0} tone="primary" testid="report-kpi-vendas" />
        <Kpi label="Comissão gerada" value={brl(summary.comissao_gerada || 0)} tone="gold" testid="report-kpi-gerada" />
        <Kpi label="Recebida" value={brl(summary.recebida || 0)} tone="emerald" testid="report-kpi-recebida" />
        <Kpi label="A receber" value={brl(summary.a_receber || 0)} tone="amber" testid="report-kpi-areceber" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-9 rounded-md border border-input bg-background px-2 text-sm" data-testid="report-filter-year">
          {[nowYear + 1, nowYear, nowYear - 1, nowYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm" data-testid="report-filter-month">
          <option value="">Ano todo</option>
          {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={loteamento} onChange={(e) => setLoteamento(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm max-w-[160px]" data-testid="report-filter-loteamento">
          <option value="">Todos loteamentos</option>
          {lotOptions.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={corretor} onChange={(e) => setCorretor(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm max-w-[140px]" data-testid="report-filter-corretor">
          <option value="">Todos corretores</option>
          {brokerOptions.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm" data-testid="report-filter-status">
          <option value="">Todos status</option>
          <option value="pendente">Pendente</option>
          <option value="parcial">Parcial</option>
          <option value="pago">Paga</option>
        </select>

        <Button type="button" variant={grouped ? "default" : "outline"} size="sm" className="h-9 gap-1.5" onClick={() => setGrouped((g) => !g)} data-testid="report-group-toggle">
          <Layers className="h-4 w-4" /> Agrupar
        </Button>

        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" data-testid="report-cols-btn"><Columns3 className="h-4 w-4" /> Colunas</Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 max-h-[50vh] overflow-y-auto" data-testid="report-cols-popover">
            <div className="space-y-1.5">
              {ALL_COLS.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                  <Checkbox checked={cols.includes(c)} onCheckedChange={() =>
                    setCols((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c])} data-testid={`report-col-${c}`} />
                  <span>{c}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex gap-2">
          <Button type="button" size="sm" className="h-9 gap-1.5" onClick={() => download("xlsx")} data-testid="report-export-xlsx"><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
          <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => download("pdf")} data-testid="report-export-pdf"><FileText className="h-4 w-4" /> PDF</Button>
        </div>
      </div>

      {allowEdit && <p className="text-xs text-muted-foreground">Dica: clique no <b>%</b> ou no <b>Desc. NF/boleto</b> para editar direto na tabela.</p>}

      {/* Tabela */}
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-sm" data-testid="report-table">
          <thead>
            <tr className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              {visible.map((c) => <th key={c} className={`px-2.5 py-2 text-left whitespace-nowrap ${MONEY.has(c) ? "text-right" : ""}`}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {reportQ.isLoading ? (
              <tr><td colSpan={visible.length} className="px-3 py-8 text-center text-muted-foreground">Carregando...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={visible.length} className="px-3 py-8 text-center text-muted-foreground">Nenhuma comissão no período.</td></tr>
            ) : groups.map((g) => (
              <>
                {g.key !== null && (
                  <tr key={`h-${g.key}`} className="bg-primary/5">
                    <td colSpan={visible.length} className="px-2.5 py-1.5 font-semibold text-xs">
                      {g.key} · {g.rows.length} venda(s) · {brl(g.rows.reduce((s, r) => s + (r["Comissão"] || 0), 0))}
                    </td>
                  </tr>
                )}
                {g.rows.map((r) => (
                  <tr key={r.sale_id} className="border-t border-border/40 hover:bg-muted/30" data-testid={`report-row-${r.sale_id}`}>
                    {visible.map((c) => {
                      const editable = allowEdit && (c === "%" || c === "Desc. NF/boleto");
                      const isEditing = edit && edit.id === r.sale_id && edit.field === c;
                      return (
                        <td key={c} className={`px-2.5 py-1.5 whitespace-nowrap ${MONEY.has(c) ? "text-right tabular" : ""}`}>
                          {c === "Status" ? (
                            <Badge className={`${STCLS[r.Status] || STCLS.Pendente} text-[10px]`}>{r.Status}</Badge>
                          ) : isEditing ? (
                            <Input autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)}
                              onBlur={() => saveEdit(r)} onKeyDown={(e) => { if (e.key === "Enter") saveEdit(r); if (e.key === "Escape") setEdit(null); }}
                              className="h-7 w-20 text-right" data-testid={`report-edit-input-${r.sale_id}`} />
                          ) : editable ? (
                            <button className="underline decoration-dotted hover:text-primary" onClick={() => startEdit(r, c)}
                              data-testid={`report-edit-${c === "%" ? "rate" : "disc"}-${r.sale_id}`}>{cellTxt(r, c)}</button>
                          ) : cellTxt(r, c)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
