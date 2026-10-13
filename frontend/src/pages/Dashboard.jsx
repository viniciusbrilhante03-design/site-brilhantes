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
import ImportDialog from "@/components/ImportDialog";
import AttachmentsDialog from "@/components/AttachmentsDialog";
import TeamDialog from "@/components/TeamDialog";
import NotificationsBell from "@/components/NotificationsBell";
import { celebrate, randomPhrase } from "@/lib/celebrate";
import ClientsDialog from "@/components/ClientsDialog";
import GoalsCard from "@/components/GoalsCard";
import GoalsDialog from "@/components/GoalsDialog";

import { LogOut, Moon, Sun, CalendarDays, UsersRound, Contact } from "lucide-react";

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
  const [importOpen, setImportOpen] = useState(false);
  const [attachSale, setAttachSale] = useState(null);
  const [teamOpen, setTeamOpen] = useState(false);
  const [clientsOpen, setClientsOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);

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
    enabled: false,
  });
  const seriesQ = useQuery({
    queryKey: ["series", year],
    queryFn: async () => (await api.get("/monthly-series", { params: { year } })).data,
  });
  const loteamentosQ = useQuery({
    queryKey: ["loteamentos"],
    queryFn: async () => (await api.get("/loteamentos")).data,
  });
  const corretoresQ = useQuery({
    queryKey: ["corretores"],
    queryFn: async () => (await api.get("/corretores")).data,
  });
  const clientsQ = useQuery({
    queryKey: ["clients"],
    queryFn: async () => (await api.get("/clients")).data,
  });
  const goalsQ = useQuery({
    queryKey: ["goals", params],
    queryFn: async () => (await api.get("/goals", { params })).data,
  });

  const invalidateAll = () => {
    ["sales", "stats", "ranking", "series", "loteamentos", "corretores", "clients", "goals"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };

  const loteamentos = useMemo(() => (loteamentosQ.data || []).map((l) => l.name), [loteamentosQ.data]);

  const brokers = useMemo(() => {
    const set = new Set();
    (corretoresQ.data || []).forEach((c) => { const n = c.war_name || c.name; if (n) set.add(n); });
    (salesQ.data || []).forEach((s) => s.broker_name && set.add(s.broker_name));
    return Array.from(set);
  }, [corretoresQ.data, salesQ.data]);

  const createMut = useMutation({
    mutationFn: (payload) =>
      editing?.id ? api.put(`/sales/${editing.id}`, payload) : api.post("/sales", payload),
    onSuccess: () => {
      invalidateAll();
      setFormOpen(false);
      const wasEdit = editing?.id;
      setEditing(null);
      if (wasEdit) toast.success("Venda atualizada!");
      else { celebrate(); toast.success(randomPhrase(), { description: "🎉 Venda cadastrada com sucesso!" }); }
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

  const handleExport = async (type) => {
    try {
      toast.info("Gerando relatório...");
      const res = await api.get(`/export/${type}`, { params, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-brilhantes-${year}${month !== ALL ? "-" + String(month).padStart(2, "0") : ""}.${type}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Relatório gerado!");
    } catch {
      toast.error("Erro ao gerar o relatório.");
    }
  };

  const periodLabel = month === ALL ? `Ano ${year}` : `${MESES[month - 1]} de ${year}`;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b border-border/60">
        <div className="flex flex-wrap items-center gap-3 px-4 md:px-6 min-h-16 py-2">
          <img src={theme.dark ? "/logo-dark.jpg" : "/logo-light.jpg"} alt="Brilhante's Imóveis"
            className="h-11 w-auto rounded-lg shrink-0" data-testid="app-logo" />
          <div className="hidden md:block">
            <div className="text-[11px] text-muted-foreground tracking-[0.2em] uppercase">Gestão de Vendas</div>
          </div>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
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

            <NotificationsBell />

            <Button data-testid="btn-open-clients" variant="outline" className="h-9 gap-1.5"
              onClick={() => setClientsOpen(true)}>
              <Contact className="h-4 w-4" /><span className="hidden md:inline">Clientes</span>
            </Button>

            <Button data-testid="btn-open-team" variant="outline" className="h-9 gap-1.5"
              onClick={() => setTeamOpen(true)}>
              <UsersRound className="h-4 w-4" /><span className="hidden md:inline">Equipe</span>
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
          <div className="lg:col-span-2 min-w-0">
            <MonthlyChart series={seriesQ.data} activeMonth={month === ALL ? null : month} />
          </div>
          <div className="lg:col-span-1 min-w-0 space-y-6">
            <RankingCard />
            <GoalsCard goals={goalsQ.data} onManage={() => setGoalsOpen(true)} />
          </div>
        </div>

        <SalesSection
          sales={salesQ.data}
          loading={salesQ.isLoading}
          onAdd={() => { setEditing(null); setFormOpen(true); }}
          onEdit={(s) => { setEditing(s); setFormOpen(true); }}
          onDuplicate={(s) => { setEditing({ ...s, id: undefined, quadra: "", lote: "", installments: [] }); setFormOpen(true); }}
          onDelete={(id) => deleteMut.mutate(id)}
          onOpenInstallments={(s) => setInstSale(s)}
          onImport={() => setImportOpen(true)}
          onExport={handleExport}
          onOpenAttachments={(s) => setAttachSale(s)}
        />
      </main>

      <SaleFormDialog
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setEditing(null); }}
        onSubmit={(payload) => createMut.mutate(payload)}
        initial={editing}
        brokers={brokers}
        loteamentos={loteamentos}
        clients={clientsQ.data || []}
      />

      <InstallmentsDialog
        open={!!instSale}
        onOpenChange={(v) => { if (!v) setInstSale(null); }}
        sale={instSale}
        onToggle={(saleId, number) => toggleMut.mutate({ saleId, number })}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={invalidateAll}
      />

      <AttachmentsDialog
        open={!!attachSale}
        onOpenChange={(v) => { if (!v) setAttachSale(null); }}
        sale={attachSale}
      />

      <TeamDialog open={teamOpen} onOpenChange={setTeamOpen} />
      <ClientsDialog open={clientsOpen} onOpenChange={setClientsOpen} />
      <GoalsDialog open={goalsOpen} onOpenChange={setGoalsOpen} />
    </div>
  );
}
