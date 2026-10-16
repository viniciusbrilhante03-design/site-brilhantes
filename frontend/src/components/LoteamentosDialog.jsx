import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Building2, Plus, Trash2, Sparkles, Search } from "lucide-react";
import LoteamentoDetailsDialog from "@/components/LoteamentoDetailsDialog";

export default function LoteamentosDialog({ open, onOpenChange }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [newName, setNewName] = useState("");
  const [detail, setDetail] = useState(null);

  const lotQ = useQuery({
    queryKey: ["loteamentos"],
    queryFn: async () => (await api.get("/loteamentos")).data,
    enabled: open,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["loteamentos"] });
  const addMut = useMutation({
    mutationFn: (name) => api.post("/loteamentos", { name }),
    onSuccess: () => { invalidate(); setNewName(""); toast.success("Loteamento cadastrado!"); },
    onError: () => toast.error("Erro ao cadastrar."),
  });
  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/loteamentos/${id}`),
    onSuccess: () => { invalidate(); toast.success("Loteamento removido."); },
  });

  const list = useMemo(() => {
    const all = lotQ.data || [];
    const term = q.trim().toLowerCase();
    return term ? all.filter((l) => (l.name || "").toLowerCase().includes(term)) : all;
  }, [lotQ.data, q]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="loteamentos-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[hsl(var(--gold))]" /> Loteamentos
            </DialogTitle>
            <DialogDescription>Cadastre loteamentos e gerencie dados técnicos, galeria, IA e copys.</DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Input data-testid="lot-new-name" value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome do novo loteamento" onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) addMut.mutate(newName.trim()); }} />
            <Button data-testid="lot-add-btn" disabled={!newName.trim() || addMut.isPending} onClick={() => addMut.mutate(newName.trim())}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input data-testid="lot-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar loteamento..." className="pl-9" />
          </div>

          {lotQ.isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
          ) : list.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Building2 className="h-10 w-10 mx-auto mb-2 opacity-40" />
              Nenhum loteamento. Cadastre o primeiro acima.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {list.map((l) => (
                <div key={l.id} data-testid={`lot-card-${l.id}`} className="flex items-center gap-2 rounded-xl border border-border/60 p-3">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 text-sm font-medium truncate">{l.name}</span>
                  <Button variant="outline" size="sm" className="h-8 gap-1 text-primary" data-testid={`lot-manage-${l.id}`} onClick={() => setDetail(l)}>
                    <Sparkles className="h-3.5 w-3.5" /> Gerenciar
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" data-testid={`lot-remove-${l.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover "{l.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>As vendas já cadastradas não são afetadas.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => delMut.mutate(l.id)}>Remover</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <LoteamentoDetailsDialog lot={detail} onOpenChange={(v) => { if (!v) setDetail(null); }} />
    </>
  );
}
