import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { apiErr } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Users, Plus, Trash2 } from "lucide-react";

export default function GroupsManager({ enabled }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [members, setMembers] = useState([]);

  const groupsQ = useQuery({ queryKey: ["broker-groups"], queryFn: async () => (await api.get("/broker-groups")).data, enabled });
  const teamQ = useQuery({ queryKey: ["corretores"], queryFn: async () => (await api.get("/corretores")).data, enabled });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["broker-groups"] }); qc.invalidateQueries({ queryKey: ["ranking"] }); };

  const createMut = useMutation({
    mutationFn: (payload) => api.post("/broker-groups", payload),
    onSuccess: () => { invalidate(); setName(""); setMembers([]); toast.success("Dupla criada!"); },
    onError: (e) => toast.error(apiErr(e.response?.data?.detail, "Erro ao criar dupla")),
  });
  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/broker-groups/${id}`),
    onSuccess: () => { invalidate(); toast.success("Dupla removida."); },
  });

  const names = (teamQ.data || []).map((c) => c.war_name || c.name).filter(Boolean);
  const toggle = (n) => setMembers((m) => (m.includes(n) ? m.filter((x) => x !== n) : [...m, n]));
  const valid = name.trim() && members.length >= 2;

  return (
    <div className="space-y-4" data-testid="groups-manager">
      <div className="rounded-xl border border-border/60 p-4 bg-muted/30 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nova dupla / grupo</div>
        <div className="space-y-1.5">
          <Label>Nome exibido no ranking</Label>
          <Input data-testid="group-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Claudia + Paola" />
        </div>
        <div className="space-y-1.5">
          <Label>Corretores do grupo (mín. 2)</Label>
          <div className="grid sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
            {names.map((n) => (
              <label key={n} data-testid={`group-member-${n}`} className="flex items-center gap-2 rounded-lg border border-border/60 px-2.5 py-2 cursor-pointer hover:bg-muted/50">
                <Checkbox checked={members.includes(n)} onCheckedChange={() => toggle(n)} />
                <span className="text-sm truncate">{n}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end">
          <Button data-testid="group-save-btn" disabled={!valid || createMut.isPending}
            onClick={() => createMut.mutate({ name: name.trim(), members })}>
            <Plus className="h-4 w-4 mr-1" /> Criar dupla
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">As duplas aparecem como um único item no ranking, somando vendas e comissão — sem apagar os perfis individuais.</p>

      {(groupsQ.data || []).length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma dupla criada.</p>
      ) : (
        (groupsQ.data || []).map((g) => (
          <div key={g.id} data-testid={`group-item-${g.id}`} className="flex items-center gap-3 rounded-lg border border-border/60 p-3">
            <Users className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{g.name}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {g.members.map((m) => <Badge key={m} variant="secondary" className="text-[10px]">{m}</Badge>)}
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button data-testid={`group-del-${g.id}`} variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Remover dupla?</AlertDialogTitle><AlertDialogDescription>"{g.name}" deixará de aparecer agrupada. Os corretores voltam a aparecer individualmente.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => delMut.mutate(g.id)}>Remover</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ))
      )}
    </div>
  );
}
