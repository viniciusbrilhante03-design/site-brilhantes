import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { apiErr } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { brl, formatDateBR } from "@/lib/format";
import GroupsManager from "@/components/GroupsManager";
import { Users, Copy, Phone, Mail, IdCard, Link2, History, Camera, Plus, Pencil, Trash2, ArrowLeft, KeyRound, ScrollText, ArrowRightLeft, FilePlus2, FileX2 } from "lucide-react";

function fileToDataURL(file, max = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2, sy = (img.height - size) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = max; canvas.height = max;
        canvas.getContext("2d").drawImage(img, sx, sy, size, size, 0, 0, max, max);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject; img.src = e.target.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

const emptyC = { name: "", war_name: "", email: "", phone: "", creci: "", picture: "", active: true };

function CorretorForm({ initial, onCancel, onSaved }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(initial ? { ...emptyC, ...initial } : emptyC);
  const fileRef = useRef(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const saveMut = useMutation({
    mutationFn: (payload) => (initial ? api.put(`/corretores/${initial.user_id}`, payload) : api.post("/corretores", payload)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["corretores"] });
      qc.invalidateQueries({ queryKey: ["ranking"] });
      toast.success(initial ? "Corretor atualizado!" : "Corretor cadastrado!");
      onSaved();
    },
    onError: (e) => toast.error(apiErr(e.response?.data?.detail, "Erro ao salvar")),
  });

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { set("picture", await fileToDataURL(file)); } catch { toast.error("Não foi possível carregar a foto."); }
  };

  const display = form.war_name || form.name || "Corretor";
  const valid = (form.war_name || form.name || "").trim().length > 0;

  return (
    <div className="space-y-4" data-testid="corretor-form">
      <button onClick={onCancel} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar à lista
      </button>
      <div className="flex items-center gap-4">
        <button onClick={() => fileRef.current?.click()} className="relative group" data-testid="corretor-photo-btn">
          <Avatar className="h-20 w-20 ring-2 ring-border">
            {form.picture ? <AvatarImage src={form.picture} alt={display} /> : null}
            <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">{display.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><Camera className="h-5 w-5 text-white" /></span>
        </button>
        <div className="text-sm text-muted-foreground">Foto do corretor (opcional).<br />Aparece no ranking.</div>
        <input ref={fileRef} data-testid="corretor-photo-input" type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>Nome de guerra</Label><Input data-testid="corretor-war-name" value={form.war_name} onChange={(e) => set("war_name", e.target.value)} placeholder="Ex: Aninha" /></div>
        <div className="space-y-1.5"><Label>Nome completo</Label><Input data-testid="corretor-full-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex: Ana Paula Souza" /></div>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="space-y-1.5"><Label>E-mail (login)</Label><Input data-testid="corretor-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="email@exemplo.com" /></div>
        <div className="space-y-1.5"><Label>Telefone</Label><Input data-testid="corretor-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(00) 00000-0000" /></div>
        <div className="space-y-1.5"><Label>CRECI</Label><Input data-testid="corretor-creci" value={form.creci} onChange={(e) => set("creci", e.target.value)} placeholder="000000-F" /></div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button data-testid="corretor-save-btn" disabled={!valid || saveMut.isPending} onClick={() => saveMut.mutate(form)}>
          {initial ? "Salvar alterações" : "Cadastrar corretor"}
        </Button>
      </div>
    </div>
  );
}

export default function TeamDialog({ open, onOpenChange }) {
  const qc = useQueryClient();
  const regLink = `${window.location.origin}/cadastro`;
  const [view, setView] = useState("list");
  const [editing, setEditing] = useState(null);
  const [newLot, setNewLot] = useState("");

  const teamQ = useQuery({ queryKey: ["corretores"], queryFn: async () => (await api.get("/corretores")).data, enabled: open });
  const histQ = useQuery({ queryKey: ["history"], queryFn: async () => (await api.get("/history")).data, enabled: open });
  const lotQ = useQuery({ queryKey: ["loteamentos"], queryFn: async () => (await api.get("/loteamentos")).data, enabled: open });
  const auditQ = useQuery({ queryKey: ["audit"], queryFn: async () => (await api.get("/audit")).data, enabled: open });

  const activeMut = useMutation({
    mutationFn: ({ id, active }) => api.patch(`/corretores/${id}/active`, { active }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["corretores"] }); toast.success("Status atualizado."); },
  });
  const rankingMut = useMutation({
    mutationFn: ({ id, participate }) => api.patch(`/corretores/${id}/ranking`, { participate }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["corretores"] }); qc.invalidateQueries({ queryKey: ["ranking"] }); toast.success("Participação no ranking atualizada."); },
  });
  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/corretores/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["corretores"] }); qc.invalidateQueries({ queryKey: ["ranking"] }); toast.success("Corretor removido."); },
  });
  const addLotMut = useMutation({
    mutationFn: (name) => api.post("/loteamentos", { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["loteamentos"] }); setNewLot(""); toast.success("Loteamento cadastrado!"); },
    onError: () => toast.error("Erro ao cadastrar loteamento."),
  });
  const delLotMut = useMutation({
    mutationFn: (id) => api.delete(`/loteamentos/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["loteamentos"] }); toast.success("Loteamento removido."); },
  });

  const copy = () => { navigator.clipboard.writeText(regLink); toast.success("Link copiado!"); };
  const goList = () => { setView("list"); setEditing(null); };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) goList(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="team-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2"><Users className="h-5 w-5" /> Equipe de Corretores</DialogTitle>
          <DialogDescription>Cadastro manual e por link ficam na mesma lista — tudo editável aqui.</DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border/60 p-3 flex items-center gap-2 bg-muted/30">
          <Link2 className="h-4 w-4 text-primary shrink-0" />
          <Input readOnly value={regLink} data-testid="reg-link" className="h-9 text-sm" />
          <Button data-testid="copy-reg-link" size="sm" onClick={copy}><Copy className="h-4 w-4 mr-1" /> Copiar</Button>
        </div>

        <Tabs defaultValue="equipe" className="mt-2">
          <TabsList>
            <TabsTrigger value="equipe" data-testid="tab-equipe">Corretores</TabsTrigger>
            <TabsTrigger value="duplas" data-testid="tab-duplas"><Users className="h-4 w-4 mr-1" /> Duplas</TabsTrigger>
            <TabsTrigger value="loteamentos" data-testid="tab-loteamentos">Loteamentos</TabsTrigger>
            <TabsTrigger value="historico" data-testid="tab-historico"><History className="h-4 w-4 mr-1" /> Histórico</TabsTrigger>
            <TabsTrigger value="auditoria" data-testid="tab-auditoria"><ScrollText className="h-4 w-4 mr-1" /> Auditoria</TabsTrigger>
          </TabsList>

          <TabsContent value="equipe" className="space-y-3 mt-3">
            {view === "form" ? (
              <CorretorForm initial={editing} onCancel={goList} onSaved={goList} />
            ) : (
              <>
                <div className="flex justify-end">
                  <Button data-testid="btn-add-corretor" onClick={() => { setEditing(null); setView("form"); }}><Plus className="h-4 w-4 mr-1" /> Novo corretor</Button>
                </div>
                {teamQ.isLoading ? <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
                  : (teamQ.data || []).length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground"><Users className="h-10 w-10 mx-auto mb-2 opacity-40" />Nenhum corretor. Cadastre ou compartilhe o link acima.</div>
                  ) : (teamQ.data || []).map((c) => (
                    <div key={c.user_id} data-testid={`team-card-${c.user_id}`} className="rounded-xl border border-border/60 p-4 flex gap-3">
                      <Avatar className="h-12 w-12 shrink-0">
                        {c.picture ? <AvatarImage src={c.picture} alt={c.war_name || c.name} /> : null}
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold">{(c.war_name || c.name || "C").slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold flex items-center gap-2 flex-wrap">
                          {c.war_name || c.name}
                          {c.war_name && c.name ? <span className="text-xs text-muted-foreground font-normal">· {c.name}</span> : null}
                          <Badge variant={c.has_login ? "default" : "secondary"} className="text-[10px]">
                            {c.has_login ? <><KeyRound className="h-2.5 w-2.5 mr-1" />Acesso por link</> : "Cadastro manual"}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                          {c.creci && <span className="flex items-center gap-1"><IdCard className="h-3 w-3" />{c.creci}</span>}
                          {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-xs">
                          <span className="font-semibold tabular">{c.qtd_vendas} venda(s)</span>
                          <span className="text-muted-foreground tabular">{brl(c.volume)}</span>
                          <span className="text-[hsl(var(--emerald))] tabular">Comissão: {brl(c.comissao_corretor)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-muted-foreground">{c.active !== false ? "Ativo" : "Inativo"}</span>
                          <Switch data-testid={`team-active-${c.user_id}`} checked={c.active !== false} onCheckedChange={(v) => activeMut.mutate({ id: c.user_id, active: v })} />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-muted-foreground">No ranking</span>
                          <Switch data-testid={`team-ranking-${c.user_id}`} checked={c.ranking_opt_out !== true} onCheckedChange={(v) => rankingMut.mutate({ id: c.user_id, participate: v })} />
                        </div>
                        <div className="flex gap-1">
                          <Button data-testid={`btn-edit-corretor-${c.user_id}`} variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(c); setView("form"); }}><Pencil className="h-4 w-4" /></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild><Button data-testid={`btn-del-corretor-${c.user_id}`} variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader><AlertDialogTitle>Remover corretor?</AlertDialogTitle><AlertDialogDescription>"{c.war_name || c.name}" será removido. As vendas já lançadas não são afetadas.</AlertDialogDescription></AlertDialogHeader>
                              <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => delMut.mutate(c.user_id)}>Remover</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                  ))}
              </>
            )}
          </TabsContent>

          <TabsContent value="duplas" className="mt-3">
            <GroupsManager enabled={open} />
          </TabsContent>

          <TabsContent value="loteamentos" className="space-y-3 mt-3">
            <div className="flex items-center gap-2">
              <Input data-testid="lot-input" value={newLot} onChange={(e) => setNewLot(e.target.value)} placeholder="Nome do novo loteamento" className="h-9"
                onKeyDown={(e) => { if (e.key === "Enter" && newLot.trim()) addLotMut.mutate(newLot.trim()); }} />
              <Button data-testid="lot-add" size="sm" disabled={!newLot.trim() || addLotMut.isPending} onClick={() => addLotMut.mutate(newLot.trim())}>Adicionar</Button>
            </div>
            <p className="text-xs text-muted-foreground">Só o gestor cadastra loteamentos. Os corretores só selecionam os já cadastrados.</p>
            {(lotQ.data || []).length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Nenhum loteamento cadastrado.</p> : (
              <div className="grid sm:grid-cols-2 gap-2">
                {(lotQ.data || []).map((l) => (
                  <div key={l.id} data-testid={`lot-${l.id}`} className="flex items-center gap-2 rounded-lg border border-border/60 p-2.5">
                    <span className="flex-1 text-sm font-medium truncate">{l.name}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" data-testid={`lot-del-${l.id}`} onClick={() => delLotMut.mutate(l.id)}>×</Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="historico" className="space-y-2 mt-3">
            {histQ.isLoading ? <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
              : (histQ.data || []).length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma venda excluída.</p>
              : (histQ.data || []).map((h, i) => (
                <div key={i} data-testid={`hist-${i}`} className="rounded-lg border border-border/60 p-3 flex items-center gap-3 text-sm">
                  <div className="flex-1 min-w-0"><div className="font-medium truncate">{h.property_name}</div><div className="text-xs text-muted-foreground">{h.broker_name} · {brl(h.sale_value)} · venda {formatDateBR(h.sale_date)}</div></div>
                  <div className="text-right text-xs text-muted-foreground">Excluída por<br /><span className="font-medium text-foreground">{h.deleted_by_name || "—"}</span></div>
                </div>
              ))}
          </TabsContent>

          <TabsContent value="auditoria" className="space-y-2 mt-3">
            <p className="text-xs text-muted-foreground">Registro de quem cadastrou, editou, transferiu ou excluiu cada venda.</p>
            {auditQ.isLoading ? <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
              : (auditQ.data || []).length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">Nenhum registro ainda.</p>
              : (auditQ.data || []).map((a, i) => {
                const act = { create: "Cadastrou", update: "Editou", transfer: "Transferiu", delete: "Excluiu" }[a.action] || a.action;
                const AIcon = a.action === "transfer" ? ArrowRightLeft : a.action === "delete" ? FileX2 : a.action === "create" ? FilePlus2 : Pencil;
                const tone = a.action === "delete" ? "text-destructive" : a.action === "transfer" ? "text-[hsl(var(--gold))]" : a.action === "create" ? "text-[hsl(var(--emerald))]" : "text-primary";
                const when = a.at ? new Date(a.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
                const ql = [a.quadra && `Qd ${a.quadra}`, a.lote && `Lt ${a.lote}`].filter(Boolean).join(" · ");
                return (
                  <div key={i} data-testid={`audit-${i}`} className="rounded-lg border border-border/60 p-3 flex items-start gap-3 text-sm">
                    <AIcon className={`h-4 w-4 mt-0.5 shrink-0 ${tone}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        <span className={tone}>{act}</span> · {a.property_name || "—"}{ql ? ` · ${ql}` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[a.client_name, a.broker_name].filter(Boolean).join(" · ")}
                        {a.detail ? ` — ${a.detail}` : ""}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">por <span className="font-medium text-foreground">{a.by || "—"}</span> · {when}</div>
                    </div>
                  </div>
                );
              })}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}