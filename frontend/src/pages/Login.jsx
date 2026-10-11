import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { apiErr } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { TrendingUp, Trophy, Wallet, Loader2 } from "lucide-react";

export default function Login() {
  const { user, loading, setUser } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate("/dashboard", { replace: true });
  }, [user, loading, navigate]);

  const handleGoogle = () => {
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setUser(data);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      toast.error(apiErr(err.response?.data?.detail, "Falha no login"));
    } finally {
      setBusy(false);
    }
  };

  const features = [
    { icon: TrendingUp, title: "Vendas datadas", desc: "Controle mês a mês e no ano" },
    { icon: Wallet, title: "Fluxo a receber", desc: "Entrada, parcelas e baixas" },
    { icon: Trophy, title: "Ranking de corretores", desc: "Por volume e quantidade" },
  ];

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden"
        style={{ backgroundColor: "hsl(158 42% 14%)" }}>
        <div className="absolute inset-0 opacity-25" style={{
          backgroundImage: "url(https://images.unsplash.com/photo-1760072513367-55182245e76c?crop=entropy&cs=srgb&fm=jpg&q=85)",
          backgroundSize: "cover", backgroundPosition: "center",
        }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, hsl(158 42% 14% / 0.85), hsl(158 42% 10% / 0.95))" }} />
        <div className="relative z-10">
          <img src="/logo-dark.jpg" alt="Brilhante's Imóveis" className="h-28 w-auto rounded-2xl shadow-2xl ring-1 ring-white/10" />
        </div>
        <div className="relative z-10 space-y-6">
          <h1 className="text-white font-heading font-extrabold text-4xl xl:text-5xl leading-[1.1]">
            Controle total das suas <span style={{ color: "hsl(40 55% 65%)" }}>comissões e vendas</span>.
          </h1>
          <div className="space-y-4 pt-2">
            {features.map((f) => (
              <div key={f.title} className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-white/10">
                  <f.icon className="h-5 w-5" style={{ color: "hsl(40 55% 65%)" }} />
                </div>
                <div>
                  <div className="text-white font-semibold text-sm">{f.title}</div>
                  <div className="text-white/50 text-xs">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 text-white/40 text-xs">© {new Date().getFullYear()} Brilhante's Imóveis</div>
      </div>

      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm fade-up">
          <div className="lg:hidden flex justify-center mb-8">
            <img src="/logo-light.jpg" alt="Brilhante's Imóveis" className="h-24 w-auto" />
          </div>
          <h2 className="font-heading text-3xl font-extrabold tracking-tight">Bem-vindo</h2>
          <p className="text-muted-foreground mt-2 text-sm">Acesse o painel de vendas da imobiliária.</p>

          <form onSubmit={handleLogin} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input data-testid="login-email" type="email" value={email} required
                onChange={(e) => setEmail(e.target.value)} placeholder="corretor@email.com" />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label>Senha</Label>
                <Link to="/forgot-password" className="text-xs text-primary hover:underline" data-testid="forgot-link">Esqueci a senha</Link>
              </div>
              <Input data-testid="login-password" type="password" value={password} required
                onChange={(e) => setPassword(e.target.value)} placeholder="Sua senha (inicial: CPF)" />
            </div>
            <Button data-testid="login-submit" type="submit" className="w-full h-11 rounded-xl" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
            </Button>
          </form>

          <p className="text-sm text-center mt-4 text-muted-foreground">
            É corretor e ainda não tem conta?{" "}
            <Link to="/cadastro" className="text-primary font-semibold hover:underline" data-testid="cadastro-link">Cadastre-se</Link>
          </p>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-border" /><span className="text-xs text-muted-foreground">ou</span><div className="flex-1 h-px bg-border" />
          </div>

          <Button data-testid="google-login-button" onClick={handleGoogle} variant="outline" className="w-full h-11 gap-2 rounded-xl">
            <svg className="h-5 w-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/></svg>
            Entrar como gestor (Google)
          </Button>
        </div>
      </div>
    </div>
  );
}
