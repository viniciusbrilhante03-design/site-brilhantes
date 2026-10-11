import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { MESES_CURTO, brl } from "@/lib/format";

export default function MonthlyChart({ series, activeMonth }) {
  const data = (series || []).map((m) => ({
    name: MESES_CURTO[m.month - 1],
    month: m.month,
    volume: m.volume,
    qtd: m.qtd,
  }));

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg text-xs">
        <div className="font-semibold mb-1">{d.name}</div>
        <div className="tabular">{brl(d.volume)}</div>
        <div className="text-muted-foreground">{d.qtd} venda(s)</div>
      </div>
    );
  };

  return (
    <Card className="p-5 rounded-xl border-border/60" data-testid="monthly-chart">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-heading font-bold text-lg">Volume por mês</h3>
          <p className="text-xs text-muted-foreground">Vendas ao longo do ano</p>
        </div>
      </div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
            <YAxis tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" width={48} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.5)" }} />
            <Bar dataKey="volume" radius={[6, 6, 0, 0]} maxBarSize={38}>
              {data.map((d) => (
                <Cell key={d.month} fill={activeMonth && d.month === activeMonth ? "hsl(var(--gold))" : "hsl(var(--primary))"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
