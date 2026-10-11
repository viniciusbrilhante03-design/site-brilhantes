import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { apiErr } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: pwd });
      toast.success("Senha redefinida! Faça login com a nova senha.");
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(apiErr(err.response?.data?.detail, "Não foi possível redefinir"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm fade-up">
        <h1 className="font-heading text-2xl font-extrabold">Nova senha</h1>
        <p className="text-sm text-muted-foreground mt-1 mb-6">Defina sua nova senha de acesso.</p>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nova senha</Label>
            <Input data-testid="reset-password" type="password" value={pwd} required minLength={4}
              onChange={(e) => setPwd(e.target.value)} placeholder="Mínimo 4 caracteres" />
          </div>
          <Button data-testid="reset-submit" type="submit" className="w-full h-11 rounded-xl" disabled={busy || !token}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Redefinir senha"}
          </Button>
          {!token && <p className="text-xs text-destructive text-center">Link inválido.</p>}
        </form>
        <Link to="/" className="mt-5 flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar ao login
        </Link>
      </div>
    </div>
  );
}
