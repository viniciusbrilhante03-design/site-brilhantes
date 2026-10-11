import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { brl } from "@/lib/format";
import { Trophy, Medal, Award } from "lucide-react";

export default function RankingCard({ ranking }) {
  const [mode, setMode] = useState("volume"); // volume | count

  const sorted = [...(ranking || [])].sort((a, b) =>
    mode === "volume" ? b.volume - a.volume : b.qtd - a.qtd
  );

  const podium = [
    { icon: Trophy, color: "hsl(40 72% 52%)", ring: "ring-[hsl(40,72%,52%)]", bg: "bg-[hsl(40,72%,52%)/0.1]", label: "1º" },
    { icon: Medal, color: "hsl(210 10% 60%)", ring: "ring-[hsl(210,10%,60%)]", bg: "bg-[hsl(210,10%,60%)/0.1]", label: "2º" },
    { icon: Award, color: "hsl(28 50% 48%)", ring: "ring-[hsl(28,50%,48%)]", bg: "bg-[hsl(28,50%,48%)/0.1]", label: "3º" },
  ];

  return (
    <Card className="p-5 rounded-xl border-border/60 h-full" data-testid="broker-ranking">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-[hsl(var(--gold))]" />
          <h3 className="font-heading font-bold text-lg">Ranking de Corretores</h3>
        </div>
      </div>
      <div className="inline-flex rounded-lg bg-muted p-1 mb-4">
        <button data-testid="broker-ranking-toggle-volume" onClick={() => setMode("volume")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${mode === "volume" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>
          Por Volume
        </button>
        <button data-testid="broker-ranking-toggle-count" onClick={() => setMode("count")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${mode === "count" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>
          Por Quantidade
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma venda no período.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((b, i) => {
            const p = podium[i];
            return (
              <div key={b.broker_name} data-testid={`ranking-row-${i}`}
                className={`flex items-center gap-3 p-2.5 rounded-xl transition-colors ${p ? `${p.bg} border border-border/40` : "hover:bg-muted/60"}`}>
                <div className="w-7 flex justify-center">
                  {p ? (
                    <p.icon className="h-6 w-6" style={{ color: p.color }} strokeWidth={2} />
                  ) : (
                    <span className="text-sm font-semibold text-muted-foreground tabular">{i + 1}</span>
                  )}
                </div>
                <Avatar className={`h-9 w-9 ${p ? `ring-2 ${p.ring} ring-offset-1 ring-offset-background` : ""}`}>
                  {b.photo ? <AvatarImage src={b.photo} alt={b.broker_name} /> : null}
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {b.broker_name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate flex items-center gap-1.5">
                    {b.broker_name}
                    {p && <span className="text-[10px] font-bold" style={{ color: p.color }}>{p.label}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground tabular">
                    {mode === "volume" ? `${b.qtd} venda(s)` : brl(b.volume)}
                  </div>
                </div>
                <div className="text-right font-heading font-bold text-sm tabular">
                  {mode === "volume" ? brl(b.volume) : `${b.qtd}`}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
