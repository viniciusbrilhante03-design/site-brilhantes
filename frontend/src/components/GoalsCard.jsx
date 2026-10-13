import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/format";
import { Target, Settings2, Building2, UserRound } from "lucide-react";

const fmtVal = (metric, v) => (metric === "vgv" ? brl(v) : `${Math.round(v)}`);

function band(pct) {
  if (pct >= 100) return { key: "done", label: "META BATIDA! 🎉", dot: "🟢", color: "emerald", bar: "[&>div]:bg-[hsl(var(--emerald))]", text: "text-[hsl(var(--emerald))]" };
  if (pct >= 90) return { key: "almost", label: "QUASE LÁ!", dot: "🟢", color: "emerald", bar: "[&>div]:bg-[hsl(var(--emerald))]", text: "text-[hsl(var(--emerald))]" };
  if (pct >= 60) return { key: "evolving", label: "EM EVOLUÇÃO", dot: "🟡", color: "amber", bar: "[&>div]:bg-[hsl(var(--amber))]", text: "text-[hsl(var(--amber))]" };
  return { key: "accelerate", label: "PRECISA ACELERAR", dot: "🔴", color: "rose", bar: "[&>div]:bg-[hsl(var(--rose))]", text: "text-[hsl(var(--rose))]" };
}

export default function GoalsCard({ goals, onManage }) {
  const list = goals || [];
  return (
    <Card className="p-5 rounded-xl border-border/60" data-testid="goals-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-[hsl(var(--emerald))]" />
          <h3 className="font-heading font-bold text-lg">Metas</h3>
        </div>
        {onManage && (
          <Button data-testid="btn-manage-goals" type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={onManage}>
            <Settings2 className="h-4 w-4" /> Gerenciar
          </Button>
        )}
      </div>

      {list.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Target className="h-9 w-9 mx-auto mb-2 opacity-40" />
          Nenhuma meta definida {onManage ? "— clique em Gerenciar para criar." : "pela gestão."}
        </div>
      ) : (
        <div className="space-y-4">
          {list.map((g) => {
            const b = band(g.pct);
            const Icon = g.scope === "company" ? Building2 : UserRound;
            return (
              <div key={g.id} data-testid={`goal-row-${g.id}`} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{g.label}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      · {g.metric === "vgv" ? "VGV" : "Vendas"}{g.month ? "" : " (ano)"}
                    </span>
                  </span>
                  <span className={`text-xs font-bold tabular shrink-0 ${b.text}`}>{g.pct}%</span>
                </div>
                <Progress value={g.pct} className={b.bar} />
                <div className="flex items-center justify-between text-[11px] tabular">
                  <span className={`font-bold tracking-wide ${b.text}`} data-testid={`goal-phrase-${g.id}`}>
                    {b.dot} {b.label}
                  </span>
                  <span className="text-muted-foreground">
                    {fmtVal(g.metric, g.current)} <span className="opacity-60">/ {fmtVal(g.metric, g.target)}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
