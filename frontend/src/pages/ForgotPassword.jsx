import { useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, MailCheck } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/auth/forgot-password", { email });
    } catch (_) {}
    setSent(true);
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm fade-up">
        <h1 className="font-heading text-2xl font-extrabold">Esqueci a senha</h1>
        {sent ? (
          <div className="mt-6 rounded-xl border border-border/60 p-5 text-center space-y-2">
            <MailCheck className="h-8 w-8 mx-auto text-[hsl(var(--emerald))]" />
            <p className="text-sm text-muted-foreground">
              Se este e-mail estiver cadastrado, enviamos um link de redefinição. Verifique sua caixa de entrada.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mt-1 mb-6">Informe seu e-mail para receber o link de redefinição.</p>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input data-testid="forgot-email" type="email" value={email} required onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
              </div>
              <Button data-testid="forgot-submit" type="submit" className="w-full h-11 rounded-xl" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar link"}
              </Button>
            </form>
          </>
        )}
        <Link to="/" className="mt-5 flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar ao login
        </Link>
      </div>
    </div>
  );
}
