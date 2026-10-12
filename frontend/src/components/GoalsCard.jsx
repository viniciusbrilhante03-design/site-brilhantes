import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/format";
import { Target, Settings2, Building2, UserRound } from "lucide-react";

const fmtVal = (metric, v) => (metric === "vgv" ? brl(v) : `${Math.round(v)}`);

export default function GoalsCard({ goals, onManage }) {
  const list = goals || [];
  return (
    <Card className="p-5 rounded-xl border-border/60 h-full" data-testid="goals-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-[hsl(var(--emerald))]" />
          <h3 className="font-heading font-bold text-lg">Metas</h3>
        </div>
        {onManage && (
          <Button data-testid="btn-manage-goals" variant="outline" size="sm" className="h-8 gap-1.5" onClick={onManage}>
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
            const reached = g.pct >= 100;
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
                  <span className={`text-xs font-bold tabular shrink-0 ${reached ? "text-[hsl(var(--emerald))]" : "text-muted-foreground"}`}>
                    {g.pct}%
                  </span>
                </div>
                <Progress value={g.pct}
                  className={reached ? "[&>div]:bg-[hsl(var(--emerald))]" : "[&>div]:bg-[hsl(var(--gold))]"} />
                <div className="flex justify-between text-[11px] text-muted-foreground tabular">
                  <span>{fmtVal(g.metric, g.current)}</span>
                  <span>meta: {fmtVal(g.metric, g.target)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
