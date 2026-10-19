import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Building2, Plus, Trash2, Search, MapPin, ImageIcon, MapPinned, ChevronUp, ChevronDown } from "lucide-react";
import LoteamentoDetailsDialog from "@/components/LoteamentoDetailsDialog";
import GeneralMapDialog from "@/components/GeneralMapDialog";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const PHASES = { em_vendas: "Em vendas", lancamento: "Lançamento", entregue: "Entregue" };
const TIPOS = { aberto: "Aberto", fechado: "Fechado" };
const TIPO_STYLE = { aberto: "bg-[hsl(var(--emerald))] text-white", fechado: "bg-primary text-primary-foreground" };
const PHASE_STYLE = {
  em_vendas: "bg-[hsl(var(--emerald))] text-white",
  lancamento: "bg-[hsl(var(--gold))] text-black",
  entregue: "bg-muted text-foreground",
};
const FILTERS = [["all", "Todos"], ["aberto", "Aberto"], ["fechado", "Fechado"]];

export default function LoteamentosDialog({ open, onOpenChange, focusLot }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [dragId, setDragId] = useState(null);
  const [newName, setNewName] = useState("");
  const [detail, setDetail] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);

  useEffect(() => { if (open && focusLot) setDetail(focusLot); }, [open, focusLot]);

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
  const phaseMut = useMutation({
    mutationFn: ({ id, phase }) => api.patch(`/loteamentos/${id}/meta`, { phase }),
    onSuccess: invalidate,
  });
  const reorderMut = useMutation({
    mutationFn: (ids) => api.post("/loteamentos/reorder", { ids }),
    onSuccess: invalidate,
  });

  const move = (id, dir) => {
    const all = [...(lotQ.data || [])];
    const i = all.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= all.length) return;
    [all[i], all[j]] = [all[j], all[i]];
    reorderMut.mutate(all.map((l) => l.id));
  };
  const canReorder = filter === "all" && !q.trim();
  const dropOn = (targetId) => {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const all = [...(lotQ.data || [])];
    const from = all.findIndex((x) => x.id === dragId);
    const to = all.findIndex((x) => x.id === targetId);
    if (from < 0 || to < 0) return;
    const [m] = all.splice(from, 1);
    all.splice(to, 0, m);
    reorderMut.mutate(all.map((x) => x.id));
    setDragId(null);
  };

  const list = useMemo(() => {
    let all = lotQ.data || [];
    const term = q.trim().toLowerCase();
    if (term) all = all.filter((l) => (l.name || "").toLowerCase().includes(term) || (l.cidade || "").toLowerCase().includes(term));
    if (filter !== "all") all = all.filter((l) => (l.tipo || "") === filter);
    return all;
  }, [lotQ.data, q, filter]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="loteamentos-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[hsl(var(--gold))]" /> Loteamentos
            </DialogTitle>
            <DialogDescription>Cadastre loteamentos e gerencie dados técnicos, galeria, vídeos, mapa, documentos, IA e copys.</DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Input data-testid="lot-new-name" value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome do novo loteamento" onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) addMut.mutate(newName.trim()); }} />
            <Button data-testid="lot-add-btn" disabled={!newName.trim() || addMut.isPending} onClick={() => addMut.mutate(newName.trim())}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
            <Button data-testid="lot-open-map" variant="outline" className="gap-1.5 shrink-0" onClick={() => setMapOpen(true)}>
              <MapPinned className="h-4 w-4" /> <span className="hidden sm:inline">Mapa geral</span>
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input data-testid="lot-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar loteamento ou cidade..." className="pl-9" />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map(([v, lbl]) => (
              <button key={v} data-testid={`lot-filter-${v}`} onClick={() => setFilter(v)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${filter === v ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:bg-muted/50"}`}>
                {lbl}
              </button>
            ))}
          </div>

          {lotQ.isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
          ) : list.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Building2 className="h-10 w-10 mx-auto mb-2 opacity-40" />
              Nenhum loteamento encontrado.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {list.map((l) => (
                <div key={l.id} data-testid={`lot-card-${l.id}`} draggable={canReorder}
                  onDragStart={() => canReorder && setDragId(l.id)} onDragOver={(e) => canReorder && e.preventDefault()} onDrop={() => canReorder && dropOn(l.id)}
                  className={`rounded-xl border border-border/60 overflow-hidden bg-card flex flex-col ${dragId === l.id ? "opacity-50" : ""} ${canReorder ? "cursor-move" : ""}`}>
                  <div className="relative aspect-video bg-muted">
                    {l.cover ? (
                      <img src={`${BACKEND}/api/loteamentos/images/${l.cover}/raw`} alt={l.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/50">
                        <ImageIcon className="h-8 w-8" />
                      </div>
                    )}
                    {l.tipo && (
                      <span className={`absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${TIPO_STYLE[l.tipo]}`}>
                        {TIPOS[l.tipo]}
                      </span>
                    )}
                    {canReorder && (
                      <div className="absolute top-2 right-2 flex flex-col gap-1">
                        <Button variant="secondary" size="icon" className="h-6 w-6 bg-background/80" data-testid={`lot-move-up-${l.id}`} onClick={() => move(l.id, -1)}><ChevronUp className="h-3.5 w-3.5" /></Button>
                        <Button variant="secondary" size="icon" className="h-6 w-6 bg-background/80" data-testid={`lot-move-down-${l.id}`} onClick={() => move(l.id, 1)}><ChevronDown className="h-3.5 w-3.5" /></Button>
                      </div>
                    )}
                  </div>
                  <div className="p-3 flex-1 flex flex-col gap-2">
                    <div>
                      <div className="font-bold truncate">{l.name}</div>
                      {l.cidade && <div className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{l.cidade}</div>}
                    </div>
                    <Select value={l.phase || "em_vendas"} onValueChange={(v) => phaseMut.mutate({ id: l.id, phase: v })}>
                      <SelectTrigger data-testid={`lot-phase-${l.id}`} className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(PHASES).map(([v, lbl]) => <SelectItem key={v} value={v}>{lbl}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2 mt-auto">
                      <Button className="flex-1 h-8 text-xs" data-testid={`lot-manage-${l.id}`} onClick={() => setDetail(l)}>Ver detalhes</Button>
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <LoteamentoDetailsDialog lot={detail} onOpenChange={(v) => { if (!v) setDetail(null); }} />
      <GeneralMapDialog open={mapOpen} onOpenChange={setMapOpen} onSelectLot={(l) => setDetail(l)} />
    </>
  );
}
