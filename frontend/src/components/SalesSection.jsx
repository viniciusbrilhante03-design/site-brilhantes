import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { brl, formatDateBR, splitComm } from "@/lib/format";
import { Search, Pencil, Trash2, Wallet, Plus, Upload, Paperclip, Download, SlidersHorizontal, X, Copy, ArrowRightLeft, Ban, Lock } from "lucide-react";
import { toast } from "sonner";

const ALL = "all";
const emptyFilters = { lot: ALL, broker: ALL, status: ALL, client: "", quadra: "", lote: "", start: "", end: "" };

function statusOf(s) {
  if (!s.parcelado) return "avista";
  return (s.installments || []).some((i) => !i.received) ? "receber" : "quitado";
}

export default function SalesSection({ sales, loading, onAdd, onEdit, onDuplicate, onDelete, onTransfer, onCancel, onOpenInstallments, onImport, onOpenExport, onOpenAttachments, bulkEnabled = false, brokers = [], onBulkDelete, onBulkTransfer, editDeadlineDays, compact = false }) {
  const hc = compact ? "hidden" : "";
  const [q, setQ] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [f, setF] = useState(emptyFilters);
  const [selected, setSelected] = useState(new Set());
  const [transferOpen, setTransferOpen] = useState(false);
  const [bulkBroker, setBulkBroker] = useState("");
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

  const allSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id));
  const toggleOne = (id) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((p) => {
    if (filtered.every((s) => p.has(s.id))) return new Set();
    return new Set(filtered.map((s) => s.id));
  });
  const clearSel = () => setSelected(new Set());
  const selIds = [...selected];
  const colSpan = bulkEnabled ? 9 : 8;

  const doBulkDelete = () => { onBulkDelete?.(selIds); clearSel(); };
  const doBulkTransfer = () => { if (!bulkBroker) return; onBulkTransfer?.(selIds, bulkBroker); setTransferOpen(false); setBulkBroker(""); clearSel(); };
  const renderActions = (s) => (
                      <div className={compact ? "grid grid-cols-3 items-center justify-items-center gap-0.5 w-fit ml-auto" : "flex items-center justify-end gap-1"}>
                        <Button data-testid={`btn-attachments-${s.id}`} variant="ghost" size="icon" className="h-8 w-8"
                          title="Anexos" onClick={() => onOpenAttachments(s)}>
                          <Paperclip className="h-4 w-4" />
                        </Button>
                        <Button data-testid={`btn-installments-${s.id}`} variant="ghost" size="icon" className="h-8 w-8"
                          title="Fluxo a receber" onClick={() => onOpenInstallments(s)}>
                          <Wallet className="h-4 w-4" />
                        </Button>
                        {editDeadlineDays && s.created_at && (Date.now() - new Date(s.created_at).getTime()) > editDeadlineDays * 864e5 ? (
                          <Button data-testid={`btn-edit-locked-${s.id}`} variant="ghost" size="icon" className="h-8 w-8 opacity-50"
                            title="Prazo de edição expirado, contate o gestor"
                            onClick={() => toast.warning("Prazo de edição expirado, contate o gestor.")}>
                            <Lock className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button data-testid={`btn-edit-${s.id}`} variant="ghost" size="icon" className="h-8 w-8"
                            title="Editar" onClick={() => onEdit(s)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {onDuplicate && (
                          <Button data-testid={`btn-duplicate-${s.id}`} variant="ghost" size="icon" className="h-8 w-8"
                            title="Duplicar (novo lote p/ mesmo cliente)" onClick={() => onDuplicate(s)}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                        {onTransfer && (
                          <Button data-testid={`btn-transfer-${s.id}`} variant="ghost" size="icon" className="h-8 w-8"
                            title="Transferir para outro corretor" onClick={() => onTransfer(s)}>
                            <ArrowRightLeft className="h-4 w-4" />
                          </Button>
                        )}
                        {onCancel && (
                          <Button data-testid={`btn-cancel-${s.id}`} variant="ghost" size="icon" className="h-8 w-8 text-[hsl(var(--amber))]"
                            title="Cancelar / distrato" onClick={() => onCancel(s)}>
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}
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
  );

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
          <Button data-testid="btn-open-export" variant="outline" className="shrink-0" onClick={onOpenExport}>
            <Download className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Exportar</span>
          </Button>
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

      {bulkEnabled && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-border/60 bg-primary/5" data-testid="sales-bulk-bar">
          <span className="text-sm font-semibold" data-testid="sales-bulk-count">{selected.size} selecionada(s)</span>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 ml-auto" data-testid="sales-bulk-transfer" onClick={() => setTransferOpen(true)}>
            <ArrowRightLeft className="h-4 w-4" /> Transferir
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="h-8 gap-1.5" data-testid="sales-bulk-delete"><Trash2 className="h-4 w-4" /> Excluir</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir {selected.size} venda(s)?</AlertDialogTitle>
                <AlertDialogDescription>Esta ação não pode ser desfeita. As vendas selecionadas serão removidas.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="sales-bulk-delete-confirm" onClick={doBulkDelete}>Excluir</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="ghost" size="sm" className="h-8" data-testid="sales-bulk-clear" onClick={clearSel}><X className="h-4 w-4" /></Button>
        </div>
      )}

      {compact && (
        <div className="md:hidden divide-y divide-border/60" data-testid="sales-mobile-list">
          {loading ? <div className="text-center py-10 text-muted-foreground text-sm">Carregando...</div>
            : filtered.length === 0 ? <div className="text-center py-10 text-muted-foreground text-sm">Nenhuma venda encontrada.</div>
            : filtered.map((s) => {
              const pend = (s.installments || []).some((i) => !i.received);
              const { broker } = splitComm(s);
              const ql = [s.quadra && `Qd ${s.quadra}`, s.lote && `Lt ${s.lote}`].filter(Boolean).join(" · ");
              return (
                <div key={s.id} className="p-4 space-y-2" data-testid={`sale-card-${s.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{s.property_name}</div>
                      <div className="text-xs text-muted-foreground truncate">{[formatDateBR(s.sale_date), ql, s.client_name].filter(Boolean).join(" · ")}</div>
                    </div>
                    {s.parcelado ? (pend ? <Badge variant="outline" className="border-[hsl(var(--amber))] text-[hsl(var(--amber))] text-[10px] shrink-0">A receber</Badge>
                      : <Badge className="bg-[hsl(var(--emerald))] text-white text-[10px] shrink-0">Quitado</Badge>)
                      : <Badge variant="secondary" className="text-[10px] shrink-0">À vista</Badge>}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div><div className="text-muted-foreground">Valor</div><div className="font-semibold tabular">{brl(s.sale_value)}</div></div>
                    <div><div className="text-muted-foreground">Minha comissão</div><div className="font-semibold tabular">{brl(broker)}</div></div>
                    <div><div className="text-muted-foreground">Entrada</div><div className="font-semibold tabular">{brl(s.entrada)}</div></div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">{renderActions(s)}</div>
                </div>
              );
            })}
        </div>
      )}
      <div className={`overflow-x-auto ${compact ? "hidden md:block" : ""}`}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {bulkEnabled && <TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} data-testid="sales-select-all" /></TableHead>}
              <TableHead>Data</TableHead>
              <TableHead>Loteamento</TableHead>
              <TableHead className={hc}>Corretor</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">Comissão</TableHead>
              <TableHead className={`text-right ${hc}`}>Entrada</TableHead>
              <TableHead className={hc}>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={colSpan} className="text-center py-10 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={colSpan} className="text-center py-12 text-muted-foreground">
                {activeCount || q ? "Nenhuma venda corresponde aos filtros." : 'Nenhuma venda encontrada. Clique em "Nova venda" ou "Importar" para começar.'}
              </TableCell></TableRow>
            ) : (
              filtered.map((s) => {
                const pend = (s.installments || []).some((i) => !i.received);
                const { broker, agency } = splitComm(s);
                const ql = [s.quadra && `Qd ${s.quadra}`, s.lote && `Lt ${s.lote}`].filter(Boolean).join(" · ");
                const statusBadge = s.parcelado ? (
                  pend ? <Badge variant="outline" className="border-[hsl(var(--amber))] text-[hsl(var(--amber))] text-[10px]">A receber</Badge>
                    : <Badge className="bg-[hsl(var(--emerald))] hover:bg-[hsl(var(--emerald))] text-white text-[10px]">Quitado</Badge>
                ) : <Badge variant="secondary" className="text-[10px]">À vista</Badge>;
                return (
                  <TableRow key={s.id} data-testid={`sale-row-${s.id}`} className="group">
                    {bulkEnabled && <TableCell><Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggleOne(s.id)} data-testid={`sale-select-${s.id}`} /></TableCell>}
                    <TableCell className="tabular text-sm whitespace-nowrap" data-testid={`sale-date-${s.id}`}>{formatDateBR(s.sale_date)}</TableCell>
                    <TableCell className={`font-medium ${compact ? "max-w-[180px]" : "max-w-[220px]"}`}>
                      <div className="truncate">{s.property_name}</div>
                      {(ql || s.client_name) && (
                        <div className="text-xs text-muted-foreground font-normal truncate">
                          {[ql, s.client_name].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className={`text-sm ${hc}`}>{s.broker_name}</TableCell>
                    <TableCell className="text-right tabular font-semibold whitespace-nowrap">
                      {brl(s.sale_value)}
                      {compact && (
                        <div className="mt-0.5 flex flex-col items-end gap-0.5 font-normal" data-testid={`sale-compact-info-${s.id}`}>
                          <span className="text-[11px] text-muted-foreground">Entrada {brl(s.entrada)}</span>
                          {statusBadge}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular text-sm">
                      {brl(s.commission_value)}
                      <div className={`text-[11px] text-muted-foreground ${compact ? "whitespace-nowrap flex flex-col" : ""}`}>
                        {compact ? <><span>Corr {brl(broker)}</span><span>Imob {brl(agency)}</span></> : <>Corr {brl(broker)} · Imob {brl(agency)}</>}
                      </div>
                    </TableCell>
                    <TableCell className={`text-right tabular text-sm ${hc}`}>{brl(s.entrada)}</TableCell>
                    <TableCell className={hc}>{statusBadge}</TableCell>
                    <TableCell>
                      {renderActions(s)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent data-testid="sales-bulk-transfer-dialog">
          <DialogHeader>
            <DialogTitle>Transferir {selected.size} venda(s)</DialogTitle>
            <DialogDescription>Selecione o corretor de destino. Todas as vendas selecionadas passarão para ele.</DialogDescription>
          </DialogHeader>
          <Select value={bulkBroker} onValueChange={setBulkBroker}>
            <SelectTrigger data-testid="sales-bulk-transfer-select"><SelectValue placeholder="Corretor de destino" /></SelectTrigger>
            <SelectContent>
              {brokers.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancelar</Button>
            <Button disabled={!bulkBroker} data-testid="sales-bulk-transfer-confirm" onClick={doBulkTransfer}>Transferir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
