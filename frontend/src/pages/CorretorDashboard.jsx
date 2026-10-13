import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useThemeMode } from "@/hooks/useTheme";
import { brl, MESES } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import RankingCard from "@/components/RankingCard";
import GoalsCard from "@/components/GoalsCard";
import SalesSection from "@/components/SalesSection";
import SaleFormDialog from "@/components/SaleFormDialog";
import InstallmentsDialog from "@/components/InstallmentsDialog";
import AttachmentsDialog from "@/components/AttachmentsDialog";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import BirthdaysDialog from "@/components/BirthdaysDialog";
import NotificationsBell from "@/components/NotificationsBell";
import { celebrate, randomPhrase } from "@/lib/celebrate";
import { LogOut, Moon, Sun, CalendarDays, KeyRound, TrendingUp, Wallet, Clock, Hash, UserRound, Cake } from "lucide-react";

const ALL = "all";
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => currentYear - i);

export default function CorretorDashboard() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const theme = useThemeMode();
  const [month, setMonth] = useState(ALL);
  const [year, setYear] = useState(currentYear);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [instSale, setInstSale] = useState(null);
  const [attachSale, setAttachSale] = useState(null);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [birthdaysOpen, setBirthdaysOpen] = useState(false);

  const params = useMemo(() => (month === ALL ? { year } : { month, year }), [month, year]);

  const salesQ = useQuery({ queryKey: ["sales", params], queryFn: async () => (await api.get("/sales", { params })).data });
  const statsQ = useQuery({ queryKey: ["stats", params], queryFn: async () => (await api.get("/stats", { params })).data });
  const rankingQ = useQuery({ queryKey: ["ranking", params], queryFn: async () => (await api.get("/ranking", { params })).data, enabled: false });
  const goalsQ = useQuery({ queryKey: ["goals", params], queryFn: async () => (await api.get("/goals", { params })).data });
  const loteamentosQ = useQuery({ queryKey: ["loteamentos"], queryFn: async () => (await api.get("/loteamentos")).data });
  const loteamentos = useMemo(() => (loteamentosQ.data || []).map((l) => l.name), [loteamentosQ.data]);
  const clientsQ = useQuery({ queryKey: ["clients"], queryFn: async () => (await api.get("/clients")).data });

  const invalidateAll = () => ["sales", "stats", "ranking", "clients"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const createMut = useMutation({
    mutationFn: (payload) => (editing?.id ? api.put(`/sales/${editing.id}`, payload) : api.post("/sales", payload)),
    onSuccess: () => { invalidateAll(); setFormOpen(false); const wasEdit = editing?.id; setEditing(null); if (wasEdit) { toast.success("Venda atualizada!"); } else { celebrate(); toast.success(randomPhrase(), { description: "🎉 Venda cadastrada com sucesso!" }); } },
    onError: () => toast.error("Erro ao salvar venda."),
  });
  const deleteMut = useMutation({ mutationFn: (id) => api.delete(`/sales/${id}`), onSuccess: () => { invalidateAll(); toast.success("Venda movida para o histórico."); } });
  const toggleMut = useMutation({
    mutationFn: ({ saleId, number }) => api.patch(`/sales/${saleId}/installments/${number}`),
    onSuccess: (res) => { invalidateAll(); if (instSale) setInstSale(res.data); toast.success("Parcela atualizada!"); },
  });

  const handleExport = async (type) => {
    try {
      const res = await api.get(`/export/${type}`, { params, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a"); a.href = url; a.download = `minhas-vendas.${type}`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Erro ao exportar."); }
  };

  const s = statsQ.data || {};
  const kpis = [
    { label: "Minhas Vendas", value: (s.qtd_vendas ?? 0).toLocaleString("pt-BR"), icon: Hash, tone: "primary" },
    { label: "Meu Volume (VGV)", value: brl(s.total_vendido), icon: TrendingUp, tone: "primary" },
    { label: "Minha Comissão", value: brl(s.comissao_corretor), icon: UserRound, tone: "emerald" },
    { label: "Comissão Recebida", value: brl(s.comissao_recebida), icon: Wallet, tone: "emerald" },
    { label: "Comissão a Receber", value: brl(s.comissao_a_receber), icon: Clock, tone: "amber" },
  ];
  const toneMap = {
    primary: "text-primary bg-primary/10", gold: "text-[hsl(var(--gold))] bg-[hsl(var(--gold)/0.12)]",
    emerald: "text-[hsl(var(--emerald))] bg-[hsl(var(--emerald)/0.12)]", amber: "text-[hsl(var(--amber))] bg-[hsl(var(--amber)/0.12)]",
  };
  const display = user?.war_name || user?.name || "Corretor";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 glass border-b border-border/60">
        <div className="flex flex-wrap items-center gap-3 px-4 md:px-6 min-h-16 py-2">
          <img src={theme.dark ? "/logo-dark.jpg" : "/logo-light.jpg"} alt="Brilhante's Imóveis" className="h-11 w-auto rounded-lg shrink-0" />
          <div className="hidden md:block"><div className="text-[11px] text-muted-foreground tracking-[0.2em] uppercase">Área do Corretor</div></div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Select value={String(month)} onValueChange={(v) => setMonth(v === ALL ? ALL : Number(v))}>
              <SelectTrigger data-testid="filter-month-select" className="w-[130px] h-9"><CalendarDays className="h-4 w-4 mr-1 text-muted-foreground" /><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>Ano inteiro</SelectItem>{MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger data-testid="filter-year-select" className="w-[90px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={theme.toggle}>{theme.dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>
            <Button data-testid="btn-open-birthdays" variant="outline" className="h-9 gap-1.5" onClick={() => setBirthdaysOpen(true)}>
              <Cake className="h-4 w-4" /><span className="hidden md:inline">Aniversariantes</span>
            </Button>
            <NotificationsBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button data-testid="user-menu" className="outline-none"><Avatar className="h-9 w-9 border border-border"><AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{display.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel><div className="font-semibold">{display}</div><div className="text-xs text-muted-foreground font-normal truncate">{user?.email}</div></DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem data-testid="change-password-menu" onClick={() => setPwdOpen(true)}><KeyRound className="h-4 w-4 mr-2" /> Trocar senha</DropdownMenuItem>
                <DropdownMenuItem data-testid="logout-button" onClick={logout} className="text-destructive"><LogOut className="h-4 w-4 mr-2" /> Sair</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="p-4 md:p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-extrabold tracking-tight">Olá, {display} 👋</h1>
          <p className="text-muted-foreground text-sm">{month === ALL ? `Ano ${year}` : `${MESES[month - 1]} de ${year}`} · suas vendas e comissões</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
          {kpis.map((c, i) => (
            <Card key={c.label} data-testid={`corretor-kpi-${i}`} className="p-4 rounded-xl border-border/60 fade-up" style={{ animationDelay: `${i * 40}ms` }}>
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center mb-3 ${toneMap[c.tone]}`}><c.icon className="h-5 w-5" strokeWidth={2.2} /></div>
              <div className="text-xs text-muted-foreground font-medium">{c.label}</div>
              <div className="font-heading font-extrabold text-lg md:text-xl tracking-tight mt-0.5 tabular">{statsQ.isLoading ? "—" : c.value}</div>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 min-w-0">
            <SalesSection
              sales={salesQ.data} loading={salesQ.isLoading}
              onAdd={() => { setEditing(null); setFormOpen(true); }}
              onEdit={(x) => { setEditing(x); setFormOpen(true); }}
              onDuplicate={(x) => { setEditing({ ...x, id: undefined, quadra: "", lote: "", installments: [] }); setFormOpen(true); }}
              onDelete={(id) => deleteMut.mutate(id)}
              onOpenInstallments={(x) => setInstSale(x)}
              onImport={() => toast.info("Importação disponível no painel do gestor.")}
              onExport={handleExport}
              onOpenAttachments={(x) => setAttachSale(x)}
            />
          </div>
          <div className="space-y-6 min-w-0"><RankingCard /><GoalsCard goals={goalsQ.data} /></div>
        </div>
      </main>

      <SaleFormDialog open={formOpen} onOpenChange={(v) => { setFormOpen(v); if (!v) setEditing(null); }}
        onSubmit={(p) => createMut.mutate(p)} initial={editing} brokers={[display]}
        loteamentos={loteamentos} clients={clientsQ.data || []} lockBroker lockBrokerName={display} />
      <InstallmentsDialog open={!!instSale} onOpenChange={(v) => { if (!v) setInstSale(null); }} sale={instSale}
        onToggle={(saleId, number) => toggleMut.mutate({ saleId, number })} />
      <AttachmentsDialog open={!!attachSale} onOpenChange={(v) => { if (!v) setAttachSale(null); }} sale={attachSale} />
      <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
      <BirthdaysDialog open={birthdaysOpen} onOpenChange={setBirthdaysOpen} />
    </div>
  );
}
