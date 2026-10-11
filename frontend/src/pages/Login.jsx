import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { TrendingUp, Trophy, Wallet } from "lucide-react";

export default function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate("/dashboard", { replace: true });
  }, [user, loading, navigate]);

  const handleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const features = [
    { icon: TrendingUp, title: "Vendas datadas", desc: "Controle mês a mês e no ano" },
    { icon: Wallet, title: "Fluxo a receber", desc: "Entrada, parcelas e baixas" },
    { icon: Trophy, title: "Ranking de corretores", desc: "Por volume e quantidade" },
  ];

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden"
        style={{ backgroundColor: "hsl(158 42% 14%)" }}>
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "url(https://images.unsplash.com/photo-1760072513367-55182245e76c?crop=entropy&cs=srgb&fm=jpg&q=85)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, hsl(158 42% 14% / 0.85), hsl(158 42% 10% / 0.95))" }} />
        <div className="relative z-10">
          <img src="/logo-dark.jpg" alt="Brilhante's Imóveis" className="h-28 w-auto rounded-2xl shadow-2xl ring-1 ring-white/10" />
        </div>
        <div className="relative z-10 space-y-6">
          <h1 className="text-white font-heading font-extrabold text-4xl xl:text-5xl leading-[1.1]">
            Controle total das suas <span style={{ color: "hsl(40 55% 65%)" }}>comissões e vendas</span>.
          </h1>
          <p className="text-white/70 text-base max-w-md">
            Planilhe cada venda com data, valor, comissão, entrada e fluxo a receber. Saiba o que já entrou e o que falta entrar.
          </p>
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
        <div className="relative z-10 text-white/40 text-xs">© {new Date().getFullYear()} Brilhantes Imóveis</div>
      </div>

      {/* Right login */}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm fade-up">
          <div className="lg:hidden flex justify-center mb-8">
            <img src="/logo-light.jpg" alt="Brilhante's Imóveis" className="h-24 w-auto" />
          </div>
          <h2 className="font-heading text-3xl font-extrabold tracking-tight">Bem-vindo de volta</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Acesse o painel de controle de vendas da imobiliária.
          </p>
          <Button
            data-testid="google-login-button"
            onClick={handleLogin}
            className="w-full mt-8 h-12 text-base gap-3 rounded-xl"
            size="lg"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" opacity=".9"/>
              <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" opacity=".7"/>
              <path fill="#fff" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" opacity=".5"/>
              <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" opacity=".8"/>
            </svg>
            Entrar com Google
          </Button>
          <p className="text-xs text-muted-foreground mt-6 text-center">
            Ao continuar, você concorda em acessar o painel privado da Brilhantes Imóveis.
          </p>
        </div>
      </div>
    </div>
  );
}
