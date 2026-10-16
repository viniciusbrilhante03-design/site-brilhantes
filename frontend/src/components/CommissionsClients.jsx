import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api, { API } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { brl, formatDateBR, apiErr } from "@/lib/format";
import { Search, User, ChevronLeft, Wallet, Receipt, Pencil, Paperclip, CheckCircle2, Loader2 } from "lucide-react";

const STCLS = {
  pago: "bg-[hsl(var(--emerald))] text-white",
  parcial: "bg-[hsl(var(--amber))] text-white",
  vencida: "bg-[hsl(var(--rose))] text-white",
  pendente: "bg-muted text-foreground",
};
const STLABEL = { pago: "Pago", parcial: "Parcial", vencida: "Vencida", pendente: "Pendente" };

function Kpi({ label, value, tone, testid }) {
  return (
    <div className={`rounded-lg p-3 bg-[hsl(var(--${tone})/0.1)]`} data-testid={testid}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-heading font-bold tabular text-sm text-[hsl(var(--${tone}))]`}>{value}</div>
    </div>
  );
}

export default function CommissionsClients({ isMaster = false }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null); // {name, cpf}
  const [baixa, setBaixa] = useState(null); // {sale_id, number, saldo}
  const [editP, setEditP] = useState(null); // {sale_id, number}

  const listQ = useQuery({
    queryKey: ["fin-clients", q],
    queryFn: async () => (await api.get(`/commissions/clients${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`)).data,
    enabled: !selected,
  });

  const detailQ = useQuery({
    queryKey: ["fin-client-detail", selected?.name, selected?.cpf],
    queryFn: async () => {
      const p = new URLSearchParams({ name: selected.name });
      if (selected.cpf) p.set("cpf", selected.cpf);
      return (await api.get(`/commissions/client-detail?${p}`)).data;
    },
    enabled: !!selected,
  });

  const refreshAll = () => {
    ["fin-clients", "fin-client-detail", "extrato", "agenda", "comm-report", "stats", "sales"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }));
  };

  const clients = listQ.data || [];
  const detail = detailQ.data;

  if (selected) {
    return (
      <div className="space-y-3" data-testid="fin-clients-detail">
        <button className="inline-flex items-center gap-1 text-sm text-primary hover:underline" onClick={() => setSelected(null)} data-testid="fin-client-back">
          <ChevronLeft className="h-4 w-4" /> Voltar para a busca
        </button>

        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0"><User className="h-5 w-5" /></div>
          <div className="min-w-0">
            <div className="font-heading font-bold truncate">{selected.name}</div>
            <div className="text-xs text-muted-foreground">{selected.cpf ? `CPF ${selected.cpf}` : "Sem CPF cadastrado"}</div>
          </div>
        </div>

        {detailQ.isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Carregando fluxo do cliente...</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Kpi label="Comissão gerada" value={brl(detail?.totals?.gerada || 0)} tone="gold" testid="fcd-kpi-gerada" />
              <Kpi label="Recebida" value={brl(detail?.totals?.recebida || 0)} tone="emerald" testid="fcd-kpi-recebida" />
              <Kpi label="A receber" value={brl(detail?.totals?.a_receber || 0)} tone="amber" testid="fcd-kpi-areceber" />
              <Kpi label="Vencida" value={brl(detail?.totals?.vencida || 0)} tone="rose" testid="fcd-kpi-vencida" />
            </div>

            {(detail?.sales || []).map((s) => (
              <div key={s.sale_id} className="rounded-xl border border-border/60 p-3 space-y-2" data-testid={`fcd-sale-${s.sale_id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{s.property_name} {s.quadra ? `· Q ${s.quadra}` : ""} {s.lote ? `· L ${s.lote}` : ""}</div>
                    <div className="text-xs text-muted-foreground">Venda {formatDateBR(s.sale_date)} · {brl(s.sale_value)} · Corretor: {s.broker_name || "—"} · Comissão {brl(s.commission_value)}</div>
                  </div>
                  <div className="text-xs text-right">
                    <div className="text-muted-foreground">A receber</div>
                    <div className="font-heading font-bold tabular text-[hsl(var(--amber))]">{brl(s.totals.a_receber)}</div>
                  </div>
                </div>

                {s.parcelado ? (
                  <div className="overflow-x-auto rounded-lg border border-border/50">
                    <table className="w-full text-sm" data-testid={`fcd-table-${s.sale_id}`}>
                      <thead>
                        <tr className="bg-muted/60 text-[10px] uppercase tracking-wide text-muted-foreground">
                          <th className="px-2 py-1.5 text-left">#</th>
                          <th className="px-2 py-1.5 text-left">Vencimento</th>
                          <th className="px-2 py-1.5 text-right">Líquido</th>
                          <th className="px-2 py-1.5 text-right">Pago</th>
                          <th className="px-2 py-1.5 text-right">Saldo</th>
                          <th className="px-2 py-1.5 text-left">Status</th>
                          {isMaster && <th className="px-2 py-1.5 text-right">Ações</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {s.installments.map((p) => (
                          <tr key={p.number} className="border-t border-border/40" data-testid={`fcd-inst-${s.sale_id}-${p.number}`}>
                            <td className="px-2 py-1.5">{p.number}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">{formatDateBR(p.due_date)}</td>
                            <td className="px-2 py-1.5 text-right tabular">{brl(p.net)}</td>
                            <td className="px-2 py-1.5 text-right tabular text-[hsl(var(--emerald))]">{brl(p.paid)}</td>
                            <td className="px-2 py-1.5 text-right tabular">{brl(p.saldo)}</td>
                            <td className="px-2 py-1.5"><Badge className={`${STCLS[p.status]} text-[10px]`}>{STLABEL[p.status] || p.status}</Badge></td>
                            {isMaster && (
                              <td className="px-2 py-1.5">
                                <div className="flex items-center justify-end gap-1">
                                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar parcela"
                                    onClick={() => setEditP({ sale_id: s.sale_id, number: p.number, value: p.value ?? p.net, due_date: p.due_date })}
                                    data-testid={`fcd-edit-${s.sale_id}-${p.number}`}><Pencil className="h-3.5 w-3.5" /></Button>
                                  {p.status !== "pago" && (
                                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" title="Dar baixa"
                                      onClick={() => setBaixa({ sale_id: s.sale_id, number: p.number, saldo: p.saldo })}
                                      data-testid={`fcd-baixa-${s.sale_id}-${p.number}`}><Receipt className="h-3.5 w-3.5" /> Baixar</Button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {s.installments.some((p) => (p.payments || []).length > 0) && (
                      <div className="border-t border-border/40 p-2 space-y-1">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Comprovantes / baixas</div>
                        {s.installments.flatMap((p) => (p.payments || []).map((pay, i) => (
                          <div key={`${p.number}-${i}`} className="flex items-center justify-between text-xs">
                            <span>Parc #{p.number} · {brl(pay.amount)} · {formatDateBR(pay.date)}{pay.method ? ` · ${pay.method}` : ""}{pay.by ? ` · por ${pay.by}` : ""}</span>
                            {pay.receipt && <a href={`${API.replace(/\/api$/, "")}${pay.receipt}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline" data-testid={`fcd-receipt-${s.sale_id}-${p.number}-${i}`}><Paperclip className="h-3 w-3" /> {pay.receipt_name || "comprovante"}</a>}
                          </div>
                        )))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-lg border border-border/50 p-2 text-sm">
                    <span className="text-muted-foreground">Comissão à vista (sem parcelamento)</span>
                    <Badge className={`${s.commission_received ? STCLS.pago : STCLS.pendente} text-[10px]`}>{s.commission_received ? "Recebida" : "A receber"}</Badge>
                  </div>
                )}
              </div>
            ))}
            {(detail?.sales || []).length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma venda ativa para este cliente.</p>}
          </>
        )}

        {baixa && <BaixaDialog baixa={baixa} onClose={() => setBaixa(null)} onDone={() => { setBaixa(null); refreshAll(); }} />}
        {editP && <EditDialog editP={editP} onClose={() => setEditP(null)} onDone={() => { setEditP(null); refreshAll(); }} />}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="fin-clients-list">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar cliente por nome ou CPF..." className="pl-9" data-testid="fin-clients-search" />
      </div>
      {listQ.isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
      ) : clients.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Nenhum cliente encontrado.</p>
      ) : (
        <div className="space-y-2">
          {clients.map((c) => (
            <button key={c.name} onClick={() => setSelected({ name: c.name, cpf: c.cpf || "" })}
              className="w-full flex items-center gap-3 rounded-xl border border-border/60 p-3 text-left hover:bg-muted/40 transition-colors" data-testid={`fin-client-${c.name}`}>
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0"><User className="h-5 w-5" /></div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.vendas} venda(s) · {c.parcelas_pendentes} parcela(s) a receber{c.proximo_venc ? ` · próx. venc. ${formatDateBR(c.proximo_venc)}` : ""}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] text-muted-foreground uppercase">A receber</div>
                <div className="font-heading font-bold tabular text-[hsl(var(--amber))]">{brl(c.a_receber)}</div>
                {c.vencida > 0 && <div className="text-[10px] text-[hsl(var(--rose))]">Vencido {brl(c.vencida)}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BaixaDialog({ baixa, onClose, onDone }) {
  const [amount, setAmount] = useState(String(baixa.saldo || ""));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("");
  const [receipt, setReceipt] = useState(null); // {url, name}
  const [uploading, setUploading] = useState(false);

  const uploadMut = useMutation({
    mutationFn: async (file) => {
      const fd = new FormData();
      fd.append("file", file);
      return (await api.post("/commissions/upload-receipt", fd, { headers: { "Content-Type": "multipart/form-data" } })).data;
    },
    onMutate: () => setUploading(true),
    onSettled: () => setUploading(false),
    onSuccess: (d) => { setReceipt(d); toast.success("Comprovante anexado."); },
    onError: (e) => toast.error(apiErr(e?.response?.data?.detail, "Falha ao enviar comprovante.")),
  });

  const baixaMut = useMutation({
    mutationFn: () => api.post(`/sales/${baixa.sale_id}/installments/${baixa.number}/baixa`, {
      amount: parseFloat(String(amount).replace(",", ".")) || 0, date, method,
      kind: "repasse", receipt: receipt?.url || "", receipt_name: receipt?.name || "",
    }),
    onSuccess: () => { toast.success("Baixa registrada!"); onDone(); },
    onError: (e) => toast.error(apiErr(e?.response?.data?.detail, "Erro ao dar baixa.")),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md" data-testid="fcd-baixa-dialog">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" /> Dar baixa — Parcela #{baixa.number}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Valor recebido <span className="text-destructive">*</span></Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" data-testid="fcd-baixa-amount" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data do pagamento</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="fcd-baixa-date" />
            </div>
            <div className="space-y-1.5">
              <Label>Forma</Label>
              <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Pix, boleto..." data-testid="fcd-baixa-method" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Comprovante <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            {receipt ? (
              <div className="flex items-center justify-between rounded-md border border-border/60 p-2 text-sm">
                <span className="inline-flex items-center gap-1 truncate"><CheckCircle2 className="h-4 w-4 text-[hsl(var(--emerald))]" /> {receipt.name}</span>
                <button className="text-xs text-muted-foreground underline" onClick={() => setReceipt(null)}>remover</button>
              </div>
            ) : (
              <label className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm cursor-pointer hover:bg-muted/40" data-testid="fcd-baixa-upload-label">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                {uploading ? "Enviando..." : "Anexar comprovante (PDF/imagem)"}
                <input type="file" className="hidden" accept="image/*,application/pdf" data-testid="fcd-baixa-file"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMut.mutate(f); }} />
              </label>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={baixaMut.isPending || uploading || !(parseFloat(String(amount).replace(",", ".")) > 0)} onClick={() => baixaMut.mutate()} data-testid="fcd-baixa-confirm">Registrar baixa</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ editP, onClose, onDone }) {
  const [value, setValue] = useState(String(editP.value ?? ""));
  const [dueDate, setDueDate] = useState(editP.due_date || "");

  const mut = useMutation({
    mutationFn: () => api.patch(`/sales/${editP.sale_id}/installments/${editP.number}/edit`, {
      value: parseFloat(String(value).replace(",", ".")) || 0, due_date: dueDate,
    }),
    onSuccess: () => { toast.success("Parcela atualizada!"); onDone(); },
    onError: (e) => toast.error(apiErr(e?.response?.data?.detail, "Erro ao editar parcela.")),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm" data-testid="fcd-edit-dialog">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5" /> Editar parcela #{editP.number}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Valor da parcela</Label>
            <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" data-testid="fcd-edit-value" />
          </div>
          <div className="space-y-1.5">
            <Label>Vencimento</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} data-testid="fcd-edit-due" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={mut.isPending} onClick={() => mut.mutate()} data-testid="fcd-edit-confirm">Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
