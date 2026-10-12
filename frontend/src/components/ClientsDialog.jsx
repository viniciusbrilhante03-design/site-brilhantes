import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { brl, formatDateBR } from "@/lib/format";
import { Contact, Search, Phone, Mail, ChevronDown, ChevronRight, Building2 } from "lucide-react";

export default function ClientsDialog({ open, onOpenChange }) {
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(null);

  const clientsQ = useQuery({
    queryKey: ["clients"],
    queryFn: async () => (await api.get("/clients")).data,
    enabled: open,
  });

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = clientsQ.data || [];
    if (!t) return list;
    return list.filter(
      (c) => c.name.toLowerCase().includes(t) || (c.phone || "").includes(t) || (c.email || "").toLowerCase().includes(t)
    );
  }, [clientsQ.data, q]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="clients-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2">
            <Contact className="h-5 w-5" /> Clientes
          </DialogTitle>
          <DialogDescription>Histórico de compras por cliente — lotes, valores, datas e corretores.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input data-testid="clients-search-input" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, telefone ou e-mail..." className="pl-9" />
        </div>

        <div className="space-y-2 mt-2">
          {clientsQ.isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Contact className="h-10 w-10 mx-auto mb-2 opacity-40" />
              Nenhum cliente encontrado. Os clientes aparecem conforme você informa o nome nas vendas.
            </div>
          ) : (
            filtered.map((c) => {
              const isOpen = expanded === c.name.toLowerCase();
              return (
                <div key={c.name.toLowerCase()} data-testid={`client-card-${c.name.toLowerCase()}`}
                  className="rounded-xl border border-border/60 overflow-hidden">
                  <button
                    data-testid={`client-toggle-${c.name.toLowerCase()}`}
                    onClick={() => setExpanded(isOpen ? null : c.name.toLowerCase())}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/40 transition-colors">
                    {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{c.name}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                        {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant="secondary" className="text-[10px]">{c.qtd} compra(s)</Badge>
                      <div className="font-heading font-bold text-sm tabular mt-1">{brl(c.volume)}</div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-border/60 divide-y divide-border/40 bg-muted/20">
                      {c.purchases.map((p, i) => (
                        <div key={i} data-testid={`client-purchase-${c.name.toLowerCase()}-${i}`}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm">
                          <Building2 className="h-4 w-4 text-primary shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">
                              {p.property_name}
                              {(p.quadra || p.lote) && (
                                <span className="text-xs text-muted-foreground font-normal">
                                  {" · "}{[p.quadra && `Qd ${p.quadra}`, p.lote && `Lt ${p.lote}`].filter(Boolean).join(" ")}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">{formatDateBR(p.sale_date)} · {p.broker_name}</div>
                          </div>
                          <div className="font-semibold tabular shrink-0">{brl(p.sale_value)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
