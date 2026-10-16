import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { brl, formatDateBR } from "@/lib/format";
import { Plus, Pencil, Trash2, Camera, Users, Phone, Mail, IdCard, ArrowLeft, Cake, Fingerprint } from "lucide-react";

const emptyBroker = { war_name: "", full_name: "", phone: "", creci: "", email: "", cpf: "", birthdate: "", photo: "", active: true };

// resize/compress image to a small square data URL
function fileToDataURL(file, max = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = max;
        canvas.height = max;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, sx, sy, size, size, 0, 0, max, max);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function BrokerForm({ initial, onCancel, onSaved }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(initial ? { ...emptyBroker, ...initial } : emptyBroker);
  const fileRef = useRef(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const saveMut = useMutation({
    mutationFn: (payload) =>
      initial ? api.put(`/brokers/${initial.id}`, payload) : api.post("/brokers", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brokers"] });
      qc.invalidateQueries({ queryKey: ["ranking"] });
      toast.success(initial ? "Corretor atualizado!" : "Corretor cadastrado!");
      onSaved();
    },
    onError: () => toast.error("Erro ao salvar corretor."),
  });

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataURL(file);
      set("photo", dataUrl);
    } catch {
      toast.error("Não foi possível carregar a foto.");
    }
  };

  const displayName = form.war_name || form.full_name || "Corretor";
  const valid = (form.war_name || form.full_name || "").trim().length > 0;

  return (
    <div className="space-y-4" data-testid="broker-form">
      <button onClick={onCancel} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar à lista
      </button>

      <div className="flex items-center gap-4">
        <button onClick={() => fileRef.current?.click()} className="relative group" data-testid="broker-photo-btn">
          <Avatar className="h-20 w-20 ring-2 ring-border">
            {form.photo ? <AvatarImage src={form.photo} alt={displayName} /> : null}
            <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
              {displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <Camera className="h-5 w-5 text-white" />
          </span>
        </button>
        <div className="text-sm text-muted-foreground">
          Foto do corretor (opcional).<br />Aparece no ranking.
        </div>
        <input ref={fileRef} data-testid="broker-photo-input" type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Nome de guerra</Label>
          <Input data-testid="broker-war-name" value={form.war_name}
            onChange={(e) => set("war_name", e.target.value)} placeholder="Ex: Aninha" />
        </div>
        <div className="space-y-1.5">
          <Label>Nome completo (opcional)</Label>
          <Input data-testid="broker-full-name" value={form.full_name}
            onChange={(e) => set("full_name", e.target.value)} placeholder="Ex: Ana Paula Souza" />
        </div>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Número (opcional)</Label>
          <Input data-testid="broker-phone" value={form.phone}
            onChange={(e) => set("phone", e.target.value)} placeholder="(00) 00000-0000" />
        </div>
        <div className="space-y-1.5">
          <Label>CRECI (opcional)</Label>
          <Input data-testid="broker-creci" value={form.creci}
            onChange={(e) => set("creci", e.target.value)} placeholder="Ex: 123456-F" />
        </div>
        <div className="space-y-1.5">
          <Label>E-mail (opcional)</Label>
          <Input data-testid="broker-email" type="email" value={form.email}
            onChange={(e) => set("email", e.target.value)} placeholder="email@exemplo.com" />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>CPF (opcional)</Label>
          <Input data-testid="broker-cpf" value={form.cpf}
            onChange={(e) => set("cpf", e.target.value)} placeholder="000.000.000-00" />
        </div>
        <div className="space-y-1.5">
          <Label>Data de nascimento (opcional)</Label>
          <Input data-testid="broker-birthdate" type="date" value={form.birthdate || ""}
            onChange={(e) => set("birthdate", e.target.value)} />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button data-testid="broker-save-btn" disabled={!valid || saveMut.isPending}
          onClick={() => saveMut.mutate(form)}>
          {initial ? "Salvar alterações" : "Cadastrar corretor"}
        </Button>
      </div>
    </div>
  );
}

export default function BrokersDialog({ open, onOpenChange, ranking }) {
  const qc = useQueryClient();
  const [view, setView] = useState("list"); // list | form
  const [editing, setEditing] = useState(null);

  const brokersQ = useQuery({
    queryKey: ["brokers"],
    queryFn: async () => (await api.get("/brokers")).data,
    enabled: open,
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/brokers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brokers"] });
      qc.invalidateQueries({ queryKey: ["ranking"] });
      toast.success("Corretor removido.");
    },
    onError: () => toast.error("Erro ao remover."),
  });

  const statFor = (b) => {
    const names = [b.war_name, b.full_name].filter(Boolean).map((n) => n.trim().toLowerCase());
    const r = (ranking || []).find((x) => names.includes((x.broker_name || "").trim().toLowerCase()));
    return r || { qtd: 0, volume: 0, comissao_corretor: 0 };
  };

  const goList = () => { setView("list"); setEditing(null); };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) goList(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="brokers-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2">
            <Users className="h-5 w-5" /> Corretores
          </DialogTitle>
          <DialogDescription>
            Cadastre os dados dos corretores. A foto aparece no ranking. Em breve cada corretor poderá acessar e acompanhar a previsão de comissão.
          </DialogDescription>
        </DialogHeader>

        {view === "form" ? (
          <BrokerForm initial={editing} onCancel={goList} onSaved={goList} />
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button data-testid="btn-add-broker" onClick={() => { setEditing(null); setView("form"); }}>
                <Plus className="h-4 w-4 mr-1" /> Novo corretor
              </Button>
            </div>

            {brokersQ.isLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
            ) : (brokersQ.data || []).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
                Nenhum corretor cadastrado ainda.
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {(brokersQ.data || []).map((b) => {
                  const st = statFor(b);
                  const name = b.war_name || b.full_name;
                  return (
                    <div key={b.id} data-testid={`broker-card-${b.id}`}
                      className="rounded-xl border border-border/60 p-4 flex gap-3">
                      <Avatar className="h-12 w-12 ring-1 ring-border shrink-0">
                        {b.photo ? <AvatarImage src={b.photo} alt={name} /> : null}
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                          {(name || "C").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{name}</div>
                        {b.full_name && b.war_name ? (
                          <div className="text-xs text-muted-foreground truncate">{b.full_name}</div>
                        ) : null}
                        <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                          {b.creci && <div className="flex items-center gap-1.5"><IdCard className="h-3 w-3" /> {b.creci}</div>}
                          {b.cpf && <div className="flex items-center gap-1.5" data-testid={`broker-cpf-${b.id}`}><Fingerprint className="h-3 w-3" /> {b.cpf}</div>}
                          {b.birthdate && <div className="flex items-center gap-1.5" data-testid={`broker-birthdate-${b.id}`}><Cake className="h-3 w-3" /> {formatDateBR(b.birthdate)}</div>}
                          {b.phone && <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> {b.phone}</div>}
                          {b.email && <div className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3" /> {b.email}</div>}
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-xs">
                          <span className="font-semibold tabular">{st.qtd} venda(s)</span>
                          <span className="text-muted-foreground tabular">{brl(st.volume)}</span>
                        </div>
                        <div className="text-[11px] text-[hsl(var(--emerald))] tabular mt-0.5">
                          Comissão corretor: {brl(st.comissao_corretor)}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button data-testid={`btn-edit-broker-${b.id}`} variant="ghost" size="icon" className="h-8 w-8"
                          onClick={() => { setEditing(b); setView("form"); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button data-testid={`btn-delete-broker-${b.id}`} variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover corretor?</AlertDialogTitle>
                              <AlertDialogDescription>
                                "{name}" será removido do cadastro. As vendas já lançadas não serão afetadas.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => deleteMut.mutate(b.id)}>Remover</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
