import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useThemeMode } from "@/hooks/useTheme";
import { MESES } from "@/lib/format";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import KpiGrid from "@/components/KpiGrid";
import MonthlyChart from "@/components/MonthlyChart";
import RankingCard from "@/components/RankingCard";
import SalesSection from "@/components/SalesSection";
import SaleFormDialog from "@/components/SaleFormDialog";
import InstallmentsDialog from "@/components/InstallmentsDialog";
import { Building2, LogOut, Moon, Sun, CalendarDays } from "lucide-react";

const ALL = "all";
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => currentYear - i);

export default function Dashboard() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const theme = useThemeMode();

  const [month, setMonth] = useState(ALL);
  const [year, setYear] = useState(currentYear);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [instSale, setInstSale] = useState(null);

  const params = useMemo(() => {
    const p = { year };
    if (month !== ALL) p.month = month;
    return p;
  }, [month, year]);

  const salesQ = useQuery({
    queryKey: ["sales", params],
    queryFn: async () => (await api.get("/sales", { params })).data,
  });
  const statsQ = useQuery({
    queryKey: ["stats", params],
    queryFn: async () => (await api.get("/stats", { params })).data,
  });
  const rankingQ = useQuery({
    queryKey: ["ranking", params],
    queryFn: async () => (await api.get("/ranking", { params })).data,
  });
  const seriesQ = useQuery({
    queryKey: ["series", year],
    queryFn: async () => (await api.get("/monthly-series", { params: { year } })).data,
  });

  const invalidateAll = () => {
    ["sales", "stats", "ranking", "series"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };

  const brokers = useMemo(() => {
    const set = new Set((salesQ.data || []).map((s) => s.broker_name).filter(Boolean));
    return Array.from(set);
  }, [salesQ.data]);

  const createMut = useMutation({
    mutationFn: (payload) =>
      editing ? api.put(`/sales/${editing.id}`, payload) : api.post("/sales", payload),
    onSuccess: () => {
      invalidateAll();
      setFormOpen(false);
      setEditing(null);
      toast.success(editing ? "Venda atualizada!" : "Venda cadastrada!");
    },
    onError: () => toast.error("Erro ao salvar venda."),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/sales/${id}`),
    onSuccess: () => { invalidateAll(); toast.success("Venda excluída."); },
    onError: () => toast.error("Erro ao excluir."),
  });

  const toggleMut = useMutation({
    mutationFn: ({ saleId, number }) => api.patch(`/sales/${saleId}/installments/${number}`),
    onSuccess: (res) => {
      invalidateAll();
      if (instSale) setInstSale(res.data);
      toast.success("Parcela atualizada!");
    },
    onError: () => toast.error("Erro ao atualizar parcela."),
  });

  const periodLabel = month === ALL ? `Ano ${year}` : `${MESES[month - 1]} de ${year}`;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b border-border/60">
        <div className="flex items-center gap-3 px-4 md:px-6 h-16">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-primary shrink-0">
            <Building2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="hidden sm:block">
            <div className="font-heading font-extrabold leading-tight">Brilhantes Imóveis</div>
            <div className="text-[11px] text-muted-foreground tracking-wide uppercase">Gestão de Vendas</div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Select value={String(month)} onValueChange={(v) => setMonth(v === ALL ? ALL : Number(v))}>
              <SelectTrigger data-testid="filter-month-select" className="w-[130px] h-9">
                <CalendarDays className="h-4 w-4 mr-1 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Ano inteiro</SelectItem>
                {MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger data-testid="filter-year-select" className="w-[90px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>

            <Button data-testid="theme-toggle" variant="outline" size="icon" className="h-9 w-9" onClick={theme.toggle}>
              {theme.dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button data-testid="user-menu" className="outline-none">
                  <Avatar className="h-9 w-9 border border-border">
                    <AvatarImage src={user?.picture} alt={user?.name} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {(user?.name || "U").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="font-semibold">{user?.name}</div>
                  <div className="text-xs text-muted-foreground font-normal truncate">{user?.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem data-testid="logout-button" onClick={logout} className="text-destructive">
                  <LogOut className="h-4 w-4 mr-2" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="p-4 md:p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
        <div className="flex items-end justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-heading text-2xl md:text-3xl font-extrabold tracking-tight">Painel de Vendas</h1>
            <p className="text-muted-foreground text-sm">{periodLabel}</p>
          </div>
        </div>

        <KpiGrid stats={statsQ.data} loading={statsQ.isLoading} />

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <MonthlyChart series={seriesQ.data} activeMonth={month === ALL ? null : month} />
          </div>
          <div className="lg:col-span-1">
            <RankingCard ranking={rankingQ.data} />
          </div>
        </div>

        <SalesSection
          sales={salesQ.data}
          loading={salesQ.isLoading}
          onAdd={() => { setEditing(null); setFormOpen(true); }}
          onEdit={(s) => { setEditing(s); setFormOpen(true); }}
          onDelete={(id) => deleteMut.mutate(id)}
          onOpenInstallments={(s) => setInstSale(s)}
        />
      </main>

      <SaleFormDialog
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setEditing(null); }}
        onSubmit={(payload) => createMut.mutate(payload)}
        initial={editing}
        brokers={brokers}
      />

      <InstallmentsDialog
        open={!!instSale}
        onOpenChange={(v) => { if (!v) setInstSale(null); }}
        sale={instSale}
        onToggle={(saleId, number) => toggleMut.mutate({ saleId, number })}
      />
    </div>
  );
}
