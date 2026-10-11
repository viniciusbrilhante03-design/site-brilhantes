import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { apiErr } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";

export default function Cadastro() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", war_name: "", email: "", cpf: "", creci: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/auth/register", form);
      setUser(data);
      toast.success("Conta criada! Sua senha inicial é o seu CPF.");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      toast.error(apiErr(err.response?.data?.detail, "Falha no cadastro"));
    } finally {
      setBusy(false);
    }
  };

  const valid = (form.name || form.war_name) && form.email && form.cpf;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md fade-up">
        <div className="flex justify-center mb-6"><img src="/logo-light.jpg" alt="Brilhante's Imóveis" className="h-20 w-auto dark:hidden" /><img src="/logo-dark.jpg" alt="Brilhante's Imóveis" className="h-20 w-auto hidden dark:block" /></div>
        <h1 className="font-heading text-2xl font-extrabold text-center">Cadastro de Corretor</h1>
        <p className="text-sm text-muted-foreground text-center mt-1 mb-6">
          Sua <strong>senha inicial será o seu CPF</strong> (você pode trocar depois).
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome completo</Label>
            <Input data-testid="cad-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Seu nome completo" />
          </div>
          <div className="space-y-1.5">
            <Label>Nome de guerra</Label>
            <Input data-testid="cad-war" value={form.war_name} onChange={(e) => set("war_name", e.target.value)} placeholder="Como aparece no ranking" />
          </div>
          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input data-testid="cad-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="voce@email.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>CPF (senha inicial)</Label>
              <Input data-testid="cad-cpf" value={form.cpf} onChange={(e) => set("cpf", e.target.value)} placeholder="000.000.000-00" />
            </div>
            <div className="space-y-1.5">
              <Label>CRECI (opcional)</Label>
              <Input data-testid="cad-creci" value={form.creci} onChange={(e) => set("creci", e.target.value)} placeholder="000000-F" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Telefone (opcional)</Label>
            <Input data-testid="cad-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(00) 00000-0000" />
          </div>
          <Button data-testid="cad-submit" type="submit" className="w-full h-11 rounded-xl" disabled={!valid || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar minha conta"}
          </Button>
        </form>
        <Link to="/" className="mt-5 flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar ao login
        </Link>
      </div>
    </div>
  );
}
