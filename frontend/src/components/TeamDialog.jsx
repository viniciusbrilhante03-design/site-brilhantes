import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { brl, formatDateBR } from "@/lib/format";
import { Users, Copy, Phone, Mail, IdCard, Link2, History } from "lucide-react";

export default function TeamDialog({ open, onOpenChange }) {
  const qc = useQueryClient();
  const regLink = `${window.location.origin}/cadastro`;

  const teamQ = useQuery({
    queryKey: ["corretores"],
    queryFn: async () => (await api.get("/corretores")).data,
    enabled: open,
  });
  const histQ = useQuery({
    queryKey: ["history"],
    queryFn: async () => (await api.get("/history")).data,
    enabled: open,
  });

  const activeMut = useMutation({
    mutationFn: ({ id, active }) => api.patch(`/corretores/${id}/active`, { active }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["corretores"] }); toast.success("Status atualizado."); },
  });

  const copy = () => { navigator.clipboard.writeText(regLink); toast.success("Link copiado!"); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="team-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2"><Users className="h-5 w-5" /> Equipe de Corretores</DialogTitle>
          <DialogDescription>Compartilhe o link para cada corretor se cadastrar sozinho (senha inicial = CPF).</DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border/60 p-3 flex items-center gap-2 bg-muted/30">
          <Link2 className="h-4 w-4 text-primary shrink-0" />
          <Input readOnly value={regLink} data-testid="reg-link" className="h-9 text-sm" />
          <Button data-testid="copy-reg-link" size="sm" onClick={copy}><Copy className="h-4 w-4 mr-1" /> Copiar</Button>
        </div>

        <Tabs defaultValue="equipe" className="mt-2">
          <TabsList>
            <TabsTrigger value="equipe" data-testid="tab-equipe">Corretores</TabsTrigger>
            <TabsTrigger value="historico" data-testid="tab-historico"><History className="h-4 w-4 mr-1" /> Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="equipe" className="space-y-3 mt-3">
            {teamQ.isLoading ? <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
              : (teamQ.data || []).length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  Nenhum corretor cadastrado. Compartilhe o link acima.
                </div>
              ) : (teamQ.data || []).map((c) => (
                <div key={c.user_id} data-testid={`team-card-${c.user_id}`} className="rounded-xl border border-border/60 p-4 flex gap-3">
                  <Avatar className="h-11 w-11 shrink-0"><AvatarFallback className="bg-primary/10 text-primary font-semibold">{(c.war_name || c.name || "C").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{c.war_name || c.name}{c.war_name && c.name ? <span className="text-xs text-muted-foreground font-normal"> · {c.name}</span> : null}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>
                      {c.creci && <span className="flex items-center gap-1"><IdCard className="h-3 w-3" />{c.creci}</span>}
                      {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs">
                      <span className="font-semibold tabular">{c.qtd_vendas} venda(s)</span>
                      <span className="text-muted-foreground tabular">{brl(c.volume)}</span>
                      <span className="text-[hsl(var(--emerald))] tabular">Comissão: {brl(c.comissao_corretor)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{c.active ? "Ativo" : "Inativo"}</span>
                      <Switch data-testid={`team-active-${c.user_id}`} checked={c.active !== false}
                        onCheckedChange={(v) => activeMut.mutate({ id: c.user_id, active: v })} />
                    </div>
                  </div>
                </div>
              ))}
          </TabsContent>

          <TabsContent value="historico" className="space-y-2 mt-3">
            {histQ.isLoading ? <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
              : (histQ.data || []).length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma venda excluída.</p>
              : (histQ.data || []).map((h, i) => (
                <div key={i} data-testid={`hist-${i}`} className="rounded-lg border border-border/60 p-3 flex items-center gap-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{h.property_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {h.broker_name} · {brl(h.sale_value)} · venda {formatDateBR(h.sale_date)}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    Excluída por<br /><span className="font-medium text-foreground">{h.deleted_by_name || "—"}</span>
                  </div>
                </div>
              ))}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
