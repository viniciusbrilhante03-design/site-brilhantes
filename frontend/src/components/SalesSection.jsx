import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { brl, formatDateBR, splitComm } from "@/lib/format";
import { Search, Pencil, Trash2, Wallet, Plus, Upload, Paperclip, Download, FileSpreadsheet, FileText, SlidersHorizontal, X } from "lucide-react";

const ALL = "all";
const emptyFilters = { lot: ALL, broker: ALL, status: ALL, client: "", quadra: "", lote: "", start: "", end: "" };

function statusOf(s) {
  if (!s.parcelado) return "avista";
  return (s.installments || []).some((i) => !i.received) ? "receber" : "quitado";
}

export default function SalesSection({ sales, loading, onAdd, onEdit, onDelete, onOpenInstallments, onImport, onExport, onOpenAttachments }) {
  const [q, setQ] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [f, setF] = useState(emptyFilters);
  const setFilter = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const loteamentos = useMemo(() => [...new Set((sales || []).map((s) => s.property_name).filter(Boolean))].sort(), [sales]);
  const corretores = useMemo(() => {
    const set = new Set();
    (sales || []).forEach((s) => {
      (s.brokers || []).forEach((b) => b.name && set.add(b.name));
      if (!(s.brokers || []).length && s.broker_name) set.add(s.broker_name);
    });
    return [...set].sort();
  }, [sales]);

  const activeCount = useMemo(() => {
    let n = 0;
    if (f.lot !== ALL) n++;
    if (f.broker !== ALL) n++;
    if (f.status !== ALL) n++;
    if (f.client.trim()) n++;
    if (f.quadra.trim()) n++;
    if (f.lote.trim()) n++;
    if (f.start) n++;
    if (f.end) n++;
    return n;
  }, [f]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (sales || []).filter((s) => {
      if (t) {
        const hay = [s.property_name, s.broker_name, s.client_name, s.quadra, s.lote].map((x) => (x || "").toLowerCase());
        if (!hay.some((h) => h.includes(t))) return false;
      }
      if (f.lot !== ALL && s.property_name !== f.lot) return false;
      if (f.broker !== ALL) {
        const inBrokers = (s.brokers || []).some((b) => b.name === f.broker);
        if (!inBrokers && s.broker_name !== f.broker) return false;
      }
      if (f.status !== ALL && statusOf(s) !== f.status) return false;
      if (f.client.trim() && !(s.client_name || "").toLowerCase().includes(f.client.trim().toLowerCase())) return false;
      if (f.quadra.trim() && !(s.quadra || "").toLowerCase().includes(f.quadra.trim().toLowerCase())) return false;
      if (f.lote.trim() && !(s.lote || "").toLowerCase().includes(f.lote.trim().toLowerCase())) return false;
      if (f.start && (s.sale_date || "") < f.start) return false;
      if (f.end && (s.sale_date || "") > f.end) return false;
      return true;
    });
  }, [sales, q, f]);

  return (
    <Card className="rounded-xl border-border/60 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-5 border-b border-border/60">
        <div>
          <h3 className="font-heading font-bold text-lg">Vendas</h3>
          <p className="text-xs text-muted-foreground">{filtered.length} registro(s){activeCount ? " · filtrado" : " no período"}</p>
        </div>
        <div className="sm:ml-auto flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input data-testid="sales-table-search-input" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar rápido..." className="pl-9" />
          </div>
          <Button data-testid="btn-toggle-filters" variant={activeCount ? "default" : "outline"} className="shrink-0 relative"
            onClick={() => setShowFilters((v) => !v)}>
            <SlidersHorizontal className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Filtros</span>
            {activeCount > 0 && <Badge className="ml-1.5 h-5 min-w-5 px-1 bg-background text-foreground">{activeCount}</Badge>}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button data-testid="btn-export-menu" variant="outline" className="shrink-0">
                <Download className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Exportar</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem data-testid="btn-export-xlsx" onClick={() => onExport("xlsx")}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem data-testid="btn-export-pdf" onClick={() => onExport("pdf")}>
                <FileText className="h-4 w-4 mr-2" /> PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button data-testid="btn-import-sales" variant="outline" onClick={onImport} className="shrink-0">
            <Upload className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Importar</span>
          </Button>
          <Button data-testid="btn-add-new-sale" onClick={onAdd} className="shrink-0">
            <Plus className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Nova venda</span>
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="p-5 border-b border-border/60 bg-muted/20 space-y-4" data-testid="sales-filters-panel">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Loteamento</Label>
              <Select value={f.lot} onValueChange={(v) => setFilter("lot", v)}>
                <SelectTrigger data-testid="filter-lot-select" className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {loteamentos.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Corretor</Label>
              <Select value={f.broker} onValueChange={(v) => setFilter("broker", v)}>
                <SelectTrigger data-testid="filter-broker-select" className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {corretores.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={f.status} onValueChange={(v) => setFilter("status", v)}>
                <SelectTrigger data-testid="filter-status-select" className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  <SelectItem value="avista">À vista</SelectItem>
                  <SelectItem value="quitado">Quitado</SelectItem>
                  <SelectItem value="receber">A receber</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cliente</Label>
              <Input data-testid="filter-client-input" value={f.client} onChange={(e) => setFilter("client", e.target.value)}
                placeholder="Nome do cliente" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Quadra</Label>
              <Input data-testid="filter-quadra-input" value={f.quadra} onChange={(e) => setFilter("quadra", e.target.value)}
                placeholder="Ex: 12" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Lote</Label>
              <Input data-testid="filter-lote-input" value={f.lote} onChange={(e) => setFilter("lote", e.target.value)}
                placeholder="Ex: 07" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Período — de</Label>
              <Input data-testid="filter-start-input" type="date" value={f.start} onChange={(e) => setFilter("start", e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Período — até</Label>
              <Input data-testid="filter-end-input" type="date" value={f.end} onChange={(e) => setFilter("end", e.target.value)} className="h-9" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button data-testid="btn-clear-filters" variant="ghost" size="sm" disabled={!activeCount}
              onClick={() => setF(emptyFilters)}>
              <X className="h-4 w-4 mr-1" /> Limpar filtros
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Data</TableHead>
              <TableHead>Loteamento</TableHead>
              <TableHead>Corretor</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">Comissão</TableHead>
              <TableHead className="text-right">Entrada</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                {activeCount || q ? "Nenhuma venda corresponde aos filtros." : 'Nenhuma venda encontrada. Clique em "Nova venda" ou "Importar" para começar.'}
              </TableCell></TableRow>
            ) : (
              filtered.map((s) => {
                const pend = (s.installments || []).some((i) => !i.received);
                const { broker, agency } = splitComm(s);
                const ql = [s.quadra && `Qd ${s.quadra}`, s.lote && `Lt ${s.lote}`].filter(Boolean).join(" · ");
                return (
                  <TableRow key={s.id} data-testid={`sale-row-${s.id}`} className="group">
                    <TableCell className="tabular text-sm whitespace-nowrap">{formatDateBR(s.sale_date)}</TableCell>
                    <TableCell className="font-medium max-w-[220px]">
                      <div className="truncate">{s.property_name}</div>
                      {(ql || s.client_name) && (
                        <div className="text-xs text-muted-foreground font-normal truncate">
                          {[ql, s.client_name].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{s.broker_name}</TableCell>
                    <TableCell className="text-right tabular font-semibold">{brl(s.sale_value)}</TableCell>
                    <TableCell className="text-right tabular text-sm">
                      {brl(s.commission_value)}
                      <div className="text-[11px] text-muted-foreground">
                        Corr {brl(broker)} · Imob {brl(agency)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular text-sm">{brl(s.entrada)}</TableCell>
                    <TableCell>
                      {s.parcelado ? (
                        pend ? (
                          <Badge variant="outline" className="border-[hsl(var(--amber))] text-[hsl(var(--amber))] text-[10px]">A receber</Badge>
                        ) : (
                          <Badge className="bg-[hsl(var(--emerald))] hover:bg-[hsl(var(--emerald))] text-white text-[10px]">Quitado</Badge>
                        )
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">À vista</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button data-testid={`btn-attachments-${s.id}`} variant="ghost" size="icon" className="h-8 w-8"
                          title="Anexos" onClick={() => onOpenAttachments(s)}>
                          <Paperclip className="h-4 w-4" />
                        </Button>
                        <Button data-testid={`btn-installments-${s.id}`} variant="ghost" size="icon" className="h-8 w-8"
                          title="Fluxo a receber" onClick={() => onOpenInstallments(s)}>
                          <Wallet className="h-4 w-4" />
                        </Button>
                        <Button data-testid={`btn-edit-${s.id}`} variant="ghost" size="icon" className="h-8 w-8"
                          title="Editar" onClick={() => onEdit(s)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button data-testid={`btn-delete-${s.id}`} variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                              title="Excluir">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir venda?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação não pode ser desfeita. A venda de "{s.property_name}" será removida.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction data-testid={`confirm-delete-${s.id}`}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => onDelete(s.id)}>
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
