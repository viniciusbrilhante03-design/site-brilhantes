import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MESES } from "@/lib/format";
import { Cake, Phone, UserRound } from "lucide-react";

const currentMonth = new Date().getMonth() + 1;

const waLink = (phone, name) => {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return null;
  const full = digits.length <= 11 ? `55${digits}` : digits;
  const msg = `Olá ${name || ""}, eu e a Brilhante's Imóveis deseja um feliz aniversário com muitas felicidades e bençãos! 🎉🦅`;
  return `https://wa.me/${full}?text=${encodeURIComponent(msg)}`;
};

export default function BirthdaysDialog({ open, onOpenChange }) {
  const [month, setMonth] = useState(currentMonth);

  const bdayQ = useQuery({
    queryKey: ["birthdays", month],
    queryFn: async () => (await api.get("/clients/birthdays", { params: { month } })).data,
    enabled: open,
  });

  const list = Array.isArray(bdayQ.data) ? bdayQ.data : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" data-testid="birthdays-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2">
            <Cake className="h-5 w-5 text-[hsl(var(--gold))]" /> Aniversariantes do mês
          </DialogTitle>
          <DialogDescription>Clientes que fazem aniversário no mês selecionado e o corretor responsável.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger data-testid="birthdays-month-select" className="w-[180px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Badge variant="secondary" className="text-[11px]">{list.length} aniversariante(s)</Badge>
        </div>

        <div className="space-y-2 mt-1">
          {bdayQ.isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
          ) : list.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Cake className="h-10 w-10 mx-auto mb-2 opacity-40" />
              Nenhum aniversariante em {MESES[month - 1]}. Informe a data de nascimento do cliente na venda.
            </div>
          ) : (
            list.map((c) => (
              <div key={c.name.toLowerCase()} data-testid={`birthday-card-${c.name.toLowerCase()}`}
                className="flex items-center gap-3 rounded-xl border border-border/60 p-3">
                <div className="h-11 w-11 rounded-lg bg-[hsl(var(--gold)/0.12)] text-[hsl(var(--gold))] flex flex-col items-center justify-center shrink-0">
                  <span className="text-[9px] uppercase leading-none">{(MESES[c.bmonth - 1] || "").slice(0, 3)}</span>
                  <span className="font-heading font-extrabold text-base leading-tight">{String(c.bday).padStart(2, "0")}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{c.name}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                    {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                    {c.broker && <span className="flex items-center gap-1"><UserRound className="h-3 w-3" />{c.broker}</span>}
                  </div>
                </div>
                {waLink(c.phone, c.name) && (
                  <a data-testid={`birthday-whatsapp-${c.name.toLowerCase()}`} href={waLink(c.phone, c.name)}
                    target="_blank" rel="noreferrer"
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-[hsl(145_63%_42%)] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity">
                    <Phone className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
