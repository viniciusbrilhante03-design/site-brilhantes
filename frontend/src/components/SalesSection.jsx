import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { brl, formatDateBR } from "@/lib/format";
import { Search, Pencil, Trash2, Wallet, Plus } from "lucide-react";

export default function SalesSection({ sales, loading, onAdd, onEdit, onDelete, onOpenInstallments }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return sales || [];
    return (sales || []).filter(
      (s) =>
        (s.property_name || "").toLowerCase().includes(t) ||
        (s.broker_name || "").toLowerCase().includes(t) ||
        (s.client_name || "").toLowerCase().includes(t)
    );
  }, [sales, q]);

  const receivedOf = (s) => {
    const inst = s.installments || [];
    if (inst.length === 0) return s.sale_value - (s.sale_value - (s.entrada || 0));
    return (s.entrada || 0) + inst.filter((i) => i.received).reduce((a, i) => a + i.value, 0);
  };

  return (
    <Card className="rounded-xl border-border/60 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-5 border-b border-border/60">
        <div>
          <h3 className="font-heading font-bold text-lg">Vendas</h3>
          <p className="text-xs text-muted-foreground">{filtered.length} registro(s) no período</p>
        </div>
        <div className="sm:ml-auto flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input data-testid="sales-table-search-input" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar imóvel, corretor..." className="pl-9" />
          </div>
          <Button data-testid="btn-add-new-sale" onClick={onAdd} className="shrink-0">
            <Plus className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Nova venda</span>
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Data</TableHead>
              <TableHead>Imóvel</TableHead>
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
                Nenhuma venda encontrada. Clique em "Nova venda" para começar.
              </TableCell></TableRow>
            ) : (
              filtered.map((s) => {
                const pend = (s.installments || []).some((i) => !i.received);
                return (
                  <TableRow key={s.id} data-testid={`sale-row-${s.id}`} className="group">
                    <TableCell className="tabular text-sm whitespace-nowrap">{formatDateBR(s.sale_date)}</TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {s.property_name}
                      {s.client_name ? <div className="text-xs text-muted-foreground font-normal truncate">{s.client_name}</div> : null}
                    </TableCell>
                    <TableCell className="text-sm">{s.broker_name}</TableCell>
                    <TableCell className="text-right tabular font-semibold">{brl(s.sale_value)}</TableCell>
                    <TableCell className="text-right tabular text-sm">
                      {brl(s.commission_value)}
                      <div className="text-xs text-muted-foreground">{s.commission_rate}%</div>
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
