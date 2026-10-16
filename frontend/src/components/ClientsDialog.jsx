import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { brl, formatDateBR } from "@/lib/format";
import { Contact, Search, Phone, Mail, ChevronDown, ChevronRight, Building2, UserPlus, X } from "lucide-react";

const empty = { name: "", phone: "", email: "", cpf: "", birthdate: "" };

export default function ClientsDialog({ open, onOpenChange }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(empty);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const clientsQ = useQuery({ queryKey: ["clients"], queryFn: async () => (await api.get("/clients")).data, enabled: open });

  const createMut = useMutation({
    mutationFn: ({ payload, force }) => api.post(`/clients?force=${force ? "true" : "false"}`, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clients"] }); setShowForm(false); setForm(empty); toast.success("Cliente cadastrado!"); },
    onError: (e) => {
      const d = e?.response?.data?.detail;
      if (e?.response?.status === 409 && d?.message) {
        if (window.confirm(`${d.message}\n\nCadastrar mesmo assim?`)) createMut.mutate({ payload: form, force: true });
      } else {
        toast.error(typeof d === "string" ? d : "Erro ao cadastrar cliente.");
      }
    },
  });

  const save = () => {
    if (!form.name.trim()) { toast.error("Informe o nome."); return; }
    createMut.mutate({ payload: form, force: false });
  };

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = clientsQ.data || [];
    if (!t) return list;
    return list.filter((c) => c.name.toLowerCase().includes(t) || (c.phone || "").includes(t) || (c.email || "").toLowerCase().includes(t));
  }, [clientsQ.data, q]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="clients-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2"><Contact className="h-5 w-5" /> Clientes</DialogTitle>
          <DialogDescription>Busque por nome, telefone ou e-mail — ou cadastre um novo cliente.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input data-testid="clients-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, telefone ou e-mail..." className="pl-9" />
          </div>
          <Button data-testid="btn-add-client" className="gap-1.5 shrink-0" onClick={() => setShowForm((s) => !s)}>
            {showForm ? <X className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}<span className="hidden sm:inline">{showForm ? "Fechar" : "Incluir novo cliente"}</span>
          </Button>
        </div>

        {showForm && (
          <div className="rounded-xl border border-border/60 p-3 space-y-3 bg-muted/20" data-testid="client-form">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Nome *</Label><Input data-testid="client-name" value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
              <div className="space-y-1"><Label>Telefone</Label><Input data-testid="client-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
              <div className="space-y-1"><Label>E-mail</Label><Input data-testid="client-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
              <div className="space-y-1"><Label>CPF</Label><Input data-testid="client-cpf" value={form.cpf} onChange={(e) => set("cpf", e.target.value)} placeholder="000.000.000-00" /></div>
              <div className="space-y-1"><Label>Data de nascimento</Label><Input data-testid="client-birthdate" type="date" value={form.birthdate} onChange={(e) => set("birthdate", e.target.value)} /></div>
            </div>
            <div className="flex justify-end">
              <Button data-testid="client-save" disabled={createMut.isPending} onClick={save}>{createMut.isPending ? "Salvando..." : "Salvar cliente"}</Button>
            </div>
          </div>
        )}

        <div className="space-y-2 mt-2">
          {clientsQ.isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground"><Contact className="h-10 w-10 mx-auto mb-2 opacity-40" /> Nenhum cliente encontrado.</div>
          ) : (
            filtered.map((c) => {
              const isOpen = expanded === c.name.toLowerCase();
              return (
                <div key={c.name.toLowerCase()} data-testid={`client-card-${c.name.toLowerCase()}`} className="rounded-xl border border-border/60 overflow-hidden">
                  <button data-testid={`client-toggle-${c.name.toLowerCase()}`} onClick={() => setExpanded(isOpen ? null : c.name.toLowerCase())}
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
                        <div key={i} data-testid={`client-purchase-${c.name.toLowerCase()}-${i}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                          <Building2 className="h-4 w-4 text-primary shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{p.property_name}
                              {(p.quadra || p.lote) && (<span className="text-xs text-muted-foreground font-normal">{" · "}{[p.quadra && `Qd ${p.quadra}`, p.lote && `Lt ${p.lote}`].filter(Boolean).join(" ")}</span>)}
                            </div>
                            <div className="text-xs text-muted-foreground">{formatDateBR(p.sale_date)} · {p.broker_name}</div>
                          </div>
                          <div className="font-semibold tabular shrink-0">{brl(p.sale_value)}</div>
                        </div>
                      ))}
                      {c.purchases.length === 0 && <div className="px-4 py-2.5 text-xs text-muted-foreground">Sem compras ainda.</div>}
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
