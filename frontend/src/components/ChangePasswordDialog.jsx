import { useState } from "react";
import api from "@/lib/api";
import { apiErr } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function ChangePasswordDialog({ open, onOpenChange }) {
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post("/auth/change-password", { current_password: cur, new_password: nw });
      toast.success("Senha alterada com sucesso!");
      setCur(""); setNw("");
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErr(err.response?.data?.detail, "Erro ao alterar senha"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid="change-password-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Trocar senha</DialogTitle>
          <DialogDescription>Sua senha inicial é o CPF. Defina uma nova senha.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Senha atual</Label>
            <Input data-testid="cp-current" type="password" value={cur} onChange={(e) => setCur(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Nova senha</Label>
            <Input data-testid="cp-new" type="password" value={nw} onChange={(e) => setNw(e.target.value)} minLength={4} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button data-testid="cp-submit" onClick={submit} disabled={busy || !cur || nw.length < 4}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
