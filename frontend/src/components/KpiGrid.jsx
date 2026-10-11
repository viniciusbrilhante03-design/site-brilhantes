import { Card } from "@/components/ui/card";
import { brl } from "@/lib/format";
import { TrendingUp, Wallet, Banknote, ArrowDownToLine, Clock, Hash } from "lucide-react";

const fmtInt = (v) => (Number(v) || 0).toLocaleString("pt-BR");

export default function KpiGrid({ stats, loading }) {
  const cards = [
    { key: "total-vendas-mes", label: "Total Vendido", value: brl(stats?.total_vendido), icon: TrendingUp, tone: "primary", testid: "kpi-total-vendas-mes" },
    { key: "comissao-total", label: "Comissão Total", value: brl(stats?.comissao_total), icon: Banknote, tone: "gold", testid: "kpi-comissao-total" },
    { key: "entrada-total", label: "Entradas", value: brl(stats?.entrada_total), icon: ArrowDownToLine, tone: "emerald", testid: "kpi-entrada-total" },
    { key: "ja-entrou", label: "Já Entrou", value: brl(stats?.ja_entrou), icon: Wallet, tone: "emerald", testid: "kpi-ja-entrou" },
    { key: "falta-entrar", label: "Falta Entrar", value: brl(stats?.falta_entrar), icon: Clock, tone: "amber", testid: "kpi-falta-entrar" },
    { key: "qtd-vendas", label: "Qtd. de Vendas", value: fmtInt(stats?.qtd_vendas), icon: Hash, tone: "primary", testid: "kpi-qtd-vendas" },
  ];

  const toneMap = {
    primary: "text-primary bg-primary/10",
    gold: "text-[hsl(var(--gold))] bg-[hsl(var(--gold)/0.12)]",
    emerald: "text-[hsl(var(--emerald))] bg-[hsl(var(--emerald)/0.12)]",
    amber: "text-[hsl(var(--amber))] bg-[hsl(var(--amber)/0.12)]",
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
      {cards.map((c, i) => (
        <Card
          key={c.key}
          data-testid={c.testid}
          className="p-4 rounded-xl border-border/60 hover:shadow-md transition-all duration-200 fade-up"
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center mb-3 ${toneMap[c.tone]}`}>
            <c.icon className="h-5 w-5" strokeWidth={2.2} />
          </div>
          <div className="text-xs text-muted-foreground font-medium">{c.label}</div>
          <div className="font-heading font-extrabold text-lg md:text-xl tracking-tight mt-0.5 tabular">
            {loading ? "—" : c.value}
          </div>
        </Card>
      ))}
    </div>
  );
}
