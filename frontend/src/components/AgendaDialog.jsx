import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarClock, Plus, Trash2, Check, Pencil, Footprints, Store, PhoneCall, Star, X } from "lucide-react";

const TYPES = [
  { v: "visita", label: "Visita", icon: Footprints },
  { v: "plantao", label: "Plantão", icon: Store },
  { v: "ligacao", label: "Retorno de ligação", icon: PhoneCall },
  { v: "outro", label: "Outro", icon: Star },
];
const typeMeta = (t) => TYPES.find((x) => x.v === t) || TYPES[3];
const empty = { title: "", type: "visita", when: "", client_name: "", notes: "", done: false };

function fmtWhen(iso) {
  if (!iso) return "";
  const [d, t] = iso.split("T");
  const [y, m, day] = (d || "").split("-");
  return `${day}/${m}/${y}${t ? ` · ${t}` : ""}`;
}

export default function AgendaDialog({ open, onOpenChange, clients = [] }) {
  const qc = useQueryClient();
  const [view, setView] = useState("list");
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const apptQ = useQuery({
    queryKey: ["appointments"],
    queryFn: async () => (await api.get("/appointments")).data,
    enabled: open,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["appointments"] });

  const saveMut = useMutation({
    mutationFn: (payload) => (editId ? api.put(`/appointments/${editId}`, payload) : api.post("/appointments", payload)),
    onSuccess: () => { invalidate(); setView("list"); setForm(empty); setEditId(null); toast.success(editId ? "Compromisso atualizado!" : "Compromisso agendado!"); },
    onError: () => toast.error("Erro ao salvar compromisso."),
  });
  const doneMut = useMutation({
    mutationFn: ({ id, done }) => api.patch(`/appointments/${id}/done`, { done }),
    onSuccess: invalidate,
  });
  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/appointments/${id}`),
    onSuccess: () => { invalidate(); toast.success("Compromisso removido."); },
  });

  const list = apptQ.data || [];
  const pending = list.filter((a) => !a.done);
  const doneList = list.filter((a) => a.done);
  const valid = form.title.trim() && form.when.trim();

  const openEdit = (a) => {
    setForm({ title: a.title, type: a.type, when: a.when, client_name: a.client_name || "", notes: a.notes || "", done: a.done });
    setEditId(a.id); setView("form");
  };

  const Row = (a) => {
    const M = typeMeta(a.type);
    return (
      <div key={a.id} data-testid={`appt-row-${a.id}`}
        className={`flex items-start gap-3 rounded-xl border border-border/60 p-3 ${a.done ? "opacity-60" : ""}`}>
        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <M.icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-semibold truncate ${a.done ? "line-through" : ""}`}>{a.title}</div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
            <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3" />{fmtWhen(a.when)}</span>
            <Badge variant="secondary" className="text-[10px]">{M.label}</Badge>
            {a.client_name && <span>· {a.client_name}</span>}
            {a.owner_name && <span className="text-[hsl(var(--emerald))]">· {a.owner_name}</span>}
          </div>
          {a.notes && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.notes}</div>}
        </div>
        <div className="flex gap-1 shrink-0">
          <Button data-testid={`appt-done-${a.id}`} variant="ghost" size="icon" className={`h-8 w-8 ${a.done ? "text-[hsl(var(--emerald))]" : ""}`}
            onClick={() => doneMut.mutate({ id: a.id, done: !a.done })} title={a.done ? "Reabrir" : "Concluir"}>
            <Check className="h-4 w-4" />
          </Button>
          <Button data-testid={`appt-edit-${a.id}`} variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button data-testid={`appt-del-${a.id}`} variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => delMut.mutate(a.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setView("list"); setForm(empty); setEditId(null); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="agenda-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-[hsl(var(--gold))]" /> Minha Agenda
          </DialogTitle>
          <DialogDescription>Visitas, plantões, retornos de ligação e lembretes. Você recebe um aviso no dia.</DialogDescription>
        </DialogHeader>

        {view === "form" ? (
          <div className="space-y-4" data-testid="appt-form">
            <div className="space-y-1.5">
              <Label>Título <span className="text-destructive">*</span></Label>
              <Input data-testid="appt-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Ex: Visita ao lote com o cliente" />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={(v) => set("type", v)}>
                  <SelectTrigger data-testid="appt-type"><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Data e hora <span className="text-destructive">*</span></Label>
                <Input data-testid="appt-when" type="datetime-local" value={form.when} onChange={(e) => set("when", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Cliente <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Input data-testid="appt-client" list="agenda-clients" value={form.client_name} onChange={(e) => set("client_name", e.target.value)} placeholder="Nome do cliente" />
              <datalist id="agenda-clients">{clients.map((c) => <option key={c.name} value={c.name} />)}</datalist>
            </div>
            <div className="space-y-1.5">
              <Label>Observação <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Textarea data-testid="appt-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Detalhes do compromisso" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setView("list"); setForm(empty); setEditId(null); }}>Cancelar</Button>
              <Button data-testid="appt-save" disabled={!valid || saveMut.isPending} onClick={() => saveMut.mutate(form)}>
                {editId ? "Salvar" : "Agendar"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex justify-end">
              <Button data-testid="btn-new-appt" onClick={() => { setForm(empty); setEditId(null); setView("form"); }}>
                <Plus className="h-4 w-4 mr-1" /> Novo compromisso
              </Button>
            </div>
            {apptQ.isLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
            ) : list.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <CalendarClock className="h-10 w-10 mx-auto mb-2 opacity-40" />
                Nenhum compromisso agendado. Clique em "Novo compromisso".
              </div>
            ) : (
              <div className="space-y-4">
                {pending.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pendentes ({pending.length})</div>
                    {pending.map(Row)}
                  </div>
                )}
                {doneList.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Concluídos ({doneList.length})</div>
                    {doneList.map(Row)}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
