import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl } from "@/lib/format";
import { Trophy, Medal, Award, Users } from "lucide-react";

const iso = (d) => d.toISOString().slice(0, 10);

function periodParams(mode, start, end) {
  const now = new Date();
  if (mode === "week") {
    const day = (now.getDay() + 6) % 7; // 0 = segunda
    const mon = new Date(now); mon.setDate(now.getDate() - day);
    return { start: iso(mon), end: iso(now) };
  }
  if (mode === "year") return { year: now.getFullYear() };
  if (mode === "custom") return start && end ? { start, end } : { year: now.getFullYear() };
  return { month: now.getMonth() + 1, year: now.getFullYear() }; // month
}

const podium = [
  { icon: Trophy, color: "hsl(40 72% 52%)", ring: "ring-[hsl(40,72%,52%)]", bg: "bg-[hsl(40,72%,52%)/0.1]", label: "1º" },
  { icon: Medal, color: "hsl(210 10% 60%)", ring: "ring-[hsl(210,10%,60%)]", bg: "bg-[hsl(210,10%,60%)/0.1]", label: "2º" },
  { icon: Award, color: "hsl(28 50% 48%)", ring: "ring-[hsl(28,50%,48%)]", bg: "bg-[hsl(28,50%,48%)/0.1]", label: "3º" },
];

export default function RankingCard() {
  const [mode, setMode] = useState("month");     // week | month | year | custom
  const [order, setOrder] = useState("volume");  // volume | count | commission
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const params = useMemo(() => periodParams(mode, start, end), [mode, start, end]);
  const rankingQ = useQuery({
    queryKey: ["ranking", params],
    queryFn: async () => (await api.get("/ranking", { params })).data,
  });

  const sorted = useMemo(() => {
    const list = [...(rankingQ.data || [])];
    const key = order === "volume" ? "volume" : order === "count" ? "qtd" : "comissao_corretor";
    return list.sort((a, b) => (b[key] || 0) - (a[key] || 0));
  }, [rankingQ.data, order]);

  const mainVal = (b) => (order === "count" ? `${b.qtd}` : brl(order === "volume" ? b.volume : b.comissao_corretor));
  const subVal = (b) => (order === "count" ? brl(b.volume) : order === "volume" ? `${b.qtd} venda(s)` : `${b.qtd} venda(s)`);

  return (
    <Card className="p-5 rounded-xl border-border/60" data-testid="broker-ranking">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="h-5 w-5 text-[hsl(var(--gold))]" />
        <h3 className="font-heading font-bold text-lg">Ranking de Corretores</h3>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Select value={mode} onValueChange={setMode}>
          <SelectTrigger data-testid="ranking-period-select" className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Esta semana</SelectItem>
            <SelectItem value="month">Este mês</SelectItem>
            <SelectItem value="year">Este ano</SelectItem>
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode === "custom" && (
        <div className="flex items-center gap-2 mb-3">
          <Input data-testid="ranking-custom-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-8 text-xs" />
          <span className="text-xs text-muted-foreground">até</span>
          <Input data-testid="ranking-custom-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-8 text-xs" />
        </div>
      )}

      <div className="inline-flex rounded-lg bg-muted p-1 mb-4 w-full">
        {[["volume", "Volume"], ["count", "Qtd"], ["commission", "Comissão"]].map(([v, lbl]) => (
          <button key={v} data-testid={`ranking-order-${v}`} onClick={() => setOrder(v)}
            className={`flex-1 px-2 py-1.5 text-xs font-semibold rounded-md transition-all ${order === v ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>
            {lbl}
          </button>
        ))}
      </div>

      {rankingQ.isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma venda no período.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((b, i) => {
            const p = podium[i];
            return (
              <div key={b.broker_name + i} data-testid={`ranking-row-${i}`}
                className={`flex items-center gap-3 p-2.5 rounded-xl transition-colors ${p ? `${p.bg} border border-border/40` : "hover:bg-muted/60"}`}>
                <div className="w-7 flex justify-center">
                  {p ? <p.icon className="h-6 w-6" style={{ color: p.color }} strokeWidth={2} />
                    : <span className="text-sm font-semibold text-muted-foreground tabular">{i + 1}</span>}
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
                    {b.is_group && <Badge variant="secondary" className="text-[9px] gap-0.5 px-1.5"><Users className="h-2.5 w-2.5" />Dupla</Badge>}
                    {p && <span className="text-[10px] font-bold" style={{ color: p.color }}>{p.label}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground tabular">{subVal(b)}</div>
                </div>
                <div className="text-right font-heading font-bold text-sm tabular">{mainVal(b)}</div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
