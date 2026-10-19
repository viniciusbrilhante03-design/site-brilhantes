import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Building2, Search, MapPin, ImageIcon, MapPinned } from "lucide-react";
import CorretorLoteamentoView from "@/components/CorretorLoteamentoView";
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

export default function CorretorLoteamentosDialog({ open, onOpenChange, focusLot }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [detail, setDetail] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);

  useEffect(() => { if (open && focusLot) setDetail(focusLot); }, [open, focusLot]);

  const lotQ = useQuery({ queryKey: ["loteamentos"], queryFn: async () => (await api.get("/loteamentos")).data, enabled: open });

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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="corretor-loteamentos-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[hsl(var(--gold))]" /> Loteamentos
            </DialogTitle>
            <DialogDescription>Material de apresentação: fotos, vídeos, mapa, documentos, copys e IA de cada loteamento.</DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input data-testid="clot-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar loteamento ou cidade..." className="pl-9" />
            </div>
            <Button data-testid="clot-open-map" variant="outline" className="gap-1.5 shrink-0" onClick={() => setMapOpen(true)}>
              <MapPinned className="h-4 w-4" /> <span className="hidden sm:inline">Mapa geral</span>
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map(([v, lbl]) => (
              <button key={v} data-testid={`clot-filter-${v}`} onClick={() => setFilter(v)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${filter === v ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:bg-muted/50"}`}>
                {lbl}
              </button>
            ))}
          </div>

          {lotQ.isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
          ) : list.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground"><Building2 className="h-10 w-10 mx-auto mb-2 opacity-40" /> Nenhum loteamento encontrado.</div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {list.map((l) => (
                <div key={l.id} data-testid={`clot-card-${l.id}`} className="rounded-xl border border-border/60 overflow-hidden bg-card flex flex-col">
                  <div className="relative aspect-video bg-muted">
                    {l.cover ? (
                      <img src={`${BACKEND}/api/loteamentos/images/${l.cover}/raw`} alt={l.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/50"><ImageIcon className="h-8 w-8" /></div>
                    )}
                    {l.tipo && (
                      <span className={`absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${TIPO_STYLE[l.tipo]}`}>
                        {TIPOS[l.tipo]}
                      </span>
                    )}
                  </div>
                  <div className="p-3 flex-1 flex flex-col gap-2">
                    <div>
                      <div className="font-bold truncate">{l.name}</div>
                      {l.cidade && <div className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{l.cidade}</div>}
                    </div>
                    <Button className="h-8 text-xs mt-auto" data-testid={`clot-open-${l.id}`} onClick={() => setDetail(l)}>Ver material</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <CorretorLoteamentoView lot={detail} onOpenChange={(v) => { if (!v) setDetail(null); }} />
      <GeneralMapDialog open={mapOpen} onOpenChange={setMapOpen} onSelectLot={(l) => setDetail(l)} />
    </>
  );
}
