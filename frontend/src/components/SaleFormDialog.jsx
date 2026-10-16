import { useState, useEffect, useMemo, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { brl } from "@/lib/format";
import { CurrencyInput } from "@/components/ui/currency-input";
import { soundEnabled, setSoundEnabled } from "@/lib/celebrate";
import api from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Users, Sparkles, Loader2 } from "lucide-react";

const empty = {
  property_name: "",
  quadra: "",
  lote: "",
  client_name: "",
  client_phone: "",
  client_email: "",
  client_cpf: "",
  client_birthdate: "",
  client_has_spouse: false,
  spouse_name: "", spouse_phone: "", spouse_email: "", spouse_cpf: "", spouse_birthdate: "",
  client_origin: "", client_origin_other: "", client_notes: "",
  brokers: [{ name: "", split_pct: 100 }],
  sale_date: new Date().toISOString().slice(0, 10),
  sale_value: "",
  commission_rate: "",
  commission_value: "",
  broker_split: 60,
  commission_received: false,
  entrada: "",
  parcelado: false,
  installments: [],
  notes: "",
};

const ORIGINS = [
  { v: "acao", label: "🎯 Ação" }, { v: "lead", label: "📲 Lead anúncio" },
  { v: "carteira", label: "📋 Carteira" }, { v: "stand", label: "🏢 Stand" },
  { v: "indicacao", label: "🤝 Indicação" }, { v: "outro", label: "✏️ Outro" },
];

function addMonths(isoDate, n) {
  const d = new Date(isoDate + "T00:00:00");
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

function initialBrokers(initial, lockBroker, lockBrokerName) {
  if (lockBroker && lockBrokerName) return [{ name: lockBrokerName, split_pct: 100 }];
  if (initial?.brokers?.length) {
    return initial.brokers.map((b) => ({ name: b.name || "", split_pct: b.split_pct ?? 0 }));
  }
  if (initial?.broker_name) return [{ name: initial.broker_name, split_pct: 100 }];
  return [{ name: "", split_pct: 100 }];
}

export default function SaleFormDialog({ open, onOpenChange, onSubmit, initial, brokers, loteamentos, clients, lockBroker, lockBrokerName }) {
  const [form, setForm] = useState(empty);
  const [numParcelas, setNumParcelas] = useState(1);
  const [aiLoading, setAiLoading] = useState(false);
  const [soundOn, setSoundOn] = useState(soundEnabled());
  const aiRef = useRef(null);

  useEffect(() => {
    if (open) {
      if (initial) {
        setForm({
          ...empty, ...initial,
          broker_split: initial.broker_split ?? 60,
          brokers: initialBrokers(initial, lockBroker, lockBrokerName),
        });
        setNumParcelas(initial.installments?.length || 1);
      } else {
        setForm({ ...empty, brokers: initialBrokers(null, lockBroker, lockBrokerName) });
        setNumParcelas(1);
      }
    }
  }, [open, initial, lockBroker, lockBrokerName]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onClientNameChange = (val) => {
    setForm((f) => {
      const match = (clients || []).find((c) => c.name.toLowerCase() === val.trim().toLowerCase());
      const next = { ...f, client_name: val };
      if (match) {
        if (!f.client_phone) next.client_phone = match.phone || "";
        if (!f.client_email) next.client_email = match.email || "";
      }
      return next;
    });
  };

  useEffect(() => {
    const sv = parseFloat(form.sale_value);
    const rate = parseFloat(form.commission_rate);
    if (!isNaN(sv) && !isNaN(rate)) {
      set("commission_value", +((sv * rate) / 100).toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.sale_value, form.commission_rate]);

  const brokerComm = useMemo(() => {
    const cv = parseFloat(form.commission_value) || 0;
    const sp = parseFloat(form.broker_split) || 0;
    return (cv * sp) / 100;
  }, [form.commission_value, form.broker_split]);

  const agencyComm = useMemo(() => {
    const cv = parseFloat(form.commission_value) || 0;
    return cv - brokerComm;
  }, [form.commission_value, brokerComm]);

  const agencySplit = 100 - (parseFloat(form.broker_split) || 0);

  const partners = form.brokers || [];
  const partnersSum = useMemo(
    () => partners.reduce((s, b) => s + (parseFloat(b.split_pct) || 0), 0),
    [partners]
  );
  const multi = partners.length > 1;
  const sumOk = !multi || Math.round(partnersSum) === 100;

  const updateBroker = (idx, key, value) => {
    setForm((f) => {
      const list = [...f.brokers];
      list[idx] = { ...list[idx], [key]: value };
      return { ...f, brokers: list };
    });
  };
  const addBroker = () => setForm((f) => ({ ...f, brokers: [...f.brokers, { name: "", split_pct: 0 }] }));
  const removeBroker = (idx) =>
    setForm((f) => ({ ...f, brokers: f.brokers.filter((_, i) => i !== idx) }));

  const generateInstallments = () => {
    const n = Math.max(1, parseInt(numParcelas) || 1);
    const remaining = parseFloat(form.commission_value) || 0;
    const per = +(remaining / n).toFixed(2);
    const list = [];
    let acc = 0;
    for (let i = 0; i < n; i++) {
      let value = per;
      if (i === n - 1) value = +(remaining - acc).toFixed(2);
      acc += per;
      list.push({
        number: i + 1, due_date: addMonths(form.sale_date, i + 1),
        value, received: false, received_date: null,
      });
    }
    set("installments", list);
  };

  const updateInstallment = (idx, key, value) => {
    setForm((f) => {
      const list = [...f.installments];
      list[idx] = { ...list[idx], [key]: key === "value" ? parseFloat(value) || 0 : value };
      return { ...f, installments: list };
    });
  };

  const removeInstallment = (idx) => {
    setForm((f) => ({
      ...f,
      installments: f.installments.filter((_, i) => i !== idx).map((it, i) => ({ ...it, number: i + 1 })),
    }));
  };

  const installmentsTotal = useMemo(
    () => (form.installments || []).reduce((s, i) => s + (i.value || 0), 0),
    [form.installments]
  );

  const handleAiFill = async (fileObj) => {
    if (!fileObj) return;
    setAiLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", fileObj);
      const res = await api.post("/sales/extract-one", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const d = res.data.extracted || {};
      setForm((fm) => ({
        ...fm,
        property_name: d.property_name || fm.property_name,
        quadra: d.quadra || fm.quadra,
        lote: d.lote || fm.lote,
        client_name: d.client_name || fm.client_name,
        client_phone: d.client_phone || fm.client_phone,
        client_email: d.client_email || fm.client_email,
        sale_date: d.sale_date || fm.sale_date,
        sale_value: d.sale_value ? String(d.sale_value) : fm.sale_value,
        commission_rate: d.commission_rate ? String(d.commission_rate) : fm.commission_rate,
        commission_value: d.commission_value ? String(d.commission_value) : fm.commission_value,
        brokers: (!lockBroker && d.broker_name) ? [{ name: d.broker_name, split_pct: 100 }] : fm.brokers,
      }));
      toast.success("Dados preenchidos pela IA. Confira antes de salvar.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Não consegui ler o arquivo.");
    } finally {
      setAiLoading(false);
      if (aiRef.current) aiRef.current.value = "";
    }
  };

  const handleSubmit = () => {
    const cleanBrokers = partners
      .filter((b) => (b.name || "").trim())
      .map((b) => ({ name: b.name.trim(), split_pct: parseFloat(b.split_pct) || 0 }));
    const payload = {
      property_name: form.property_name.trim(),
      quadra: (form.quadra || "").trim(),
      lote: (form.lote || "").trim(),
      client_name: (form.client_name || "").trim(),
      client_phone: (form.client_phone || "").trim(),
      client_email: (form.client_email || "").trim(),
      client_cpf: (form.client_cpf || "").trim(),
      client_birthdate: form.client_birthdate || "",
      client_has_spouse: !!form.client_has_spouse,
      client_spouse: form.client_has_spouse ? {
        name: (form.spouse_name || "").trim(), phone: (form.spouse_phone || "").trim(),
        email: (form.spouse_email || "").trim(), cpf: (form.spouse_cpf || "").trim(),
        birthdate: form.spouse_birthdate || "",
      } : null,
      client_origin: form.client_origin || "",
      client_origin_other: form.client_origin === "outro" ? (form.client_origin_other || "").trim() : "",
      client_notes: (form.client_notes || "").trim(),
      broker_name: cleanBrokers.map((b) => b.name).join(" + "),
      brokers: cleanBrokers,
      sale_date: form.sale_date,
      sale_value: parseFloat(form.sale_value) || 0,
      commission_rate: parseFloat(form.commission_rate) || 0,
      commission_value: parseFloat(form.commission_value) || 0,
      broker_split: parseFloat(form.broker_split) || 0,
      broker_commission: +brokerComm.toFixed(2),
      agency_commission: +agencyComm.toFixed(2),
      commission_received: form.parcelado ? false : !!form.commission_received,
      entrada: parseFloat(form.entrada) || 0,
      parcelado: form.parcelado,
      installments: form.parcelado ? form.installments : [],
      notes: form.notes || "",
    };
    onSubmit(payload);
  };

  const brokersValid = partners.some((b) => (b.name || "").trim()) && sumOk;
  const valid = form.property_name.trim() && form.quadra.trim() && form.lote.trim()
    && form.client_name.trim() && brokersValid && (parseFloat(form.sale_value) || 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="sale-form-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            {initial?.id ? "Editar venda" : "Nova venda"}
          </DialogTitle>
          <DialogDescription>Preencha os dados do loteamento e o fluxo a receber.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Preencher com IA (foto/arquivo) */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-primary shrink-0" />
            <div className="flex-1 text-xs text-muted-foreground">
              <strong className="text-foreground">Preencher com foto (IA)</strong> — envie uma foto ou arquivo do contrato/reserva e a IA preenche loteamento, cliente, valores, quadra e lote.
            </div>
            <input ref={aiRef} data-testid="sale-ai-file-input" type="file"
              accept=".png,.jpg,.jpeg,.webp,.heic,.pdf,.xlsx,.xls,.csv"
              className="hidden" onChange={(e) => handleAiFill(e.target.files?.[0])} />
            <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={aiLoading}
              data-testid="sale-ai-fill-button" onClick={() => aiRef.current?.click()}>
              {aiLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
              {aiLoading ? "Lendo..." : "Preencher com foto"}
            </Button>
          </div>

          {/* Loteamento */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Loteamento</div>
            <div className="space-y-1.5">
              <Label>Loteamento <span className="text-destructive">*</span></Label>
              <Input data-testid="sale-form-property-input" list="loteamentos-list" value={form.property_name}
                onChange={(e) => set("property_name", e.target.value)} placeholder="Comece a digitar o loteamento..." />
              <datalist id="loteamentos-list">
                {(loteamentos || []).map((l) => <option key={l} value={l} />)}
              </datalist>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Quadra <span className="text-destructive">*</span></Label>
                <Input data-testid="sale-form-quadra-input" value={form.quadra}
                  onChange={(e) => set("quadra", e.target.value)} placeholder="Ex: 12" />
              </div>
              <div className="space-y-1.5">
                <Label>Lote <span className="text-destructive">*</span></Label>
                <Input data-testid="sale-form-lote-input" value={form.lote}
                  onChange={(e) => set("lote", e.target.value)} placeholder="Ex: 07" />
              </div>
              <div className="space-y-1.5">
                <Label>Data da venda</Label>
                <Input data-testid="sale-form-date-input" type="date" value={form.sale_date}
                  onChange={(e) => set("sale_date", e.target.value)} />
              </div>
            </div>

            {/* Corretores / Parceria */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5"><Users className="h-4 w-4" /> Corretor(es)</Label>
                {!lockBroker && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1"
                    data-testid="sale-form-add-broker" onClick={addBroker}>
                    <Plus className="h-3.5 w-3.5" /> Adicionar parceiro
                  </Button>
                )}
              </div>

              {lockBroker ? (
                <Input data-testid="sale-form-broker-locked" value={partners[0]?.name || ""} disabled className="opacity-90" />
              ) : (
                <div className="space-y-2">
                  {partners.map((b, idx) => {
                    const share = multi && partnersSum ? (parseFloat(b.split_pct) || 0) / 100 : 1;
                    return (
                      <div key={idx} className="flex items-center gap-2" data-testid={`broker-row-${idx}`}>
                        <Input data-testid={`sale-form-broker-select-${idx}`} list="brokers-list" value={b.name}
                          onChange={(e) => updateBroker(idx, "name", e.target.value)}
                          placeholder="Nome de guerra do corretor" className="flex-1" />
                        {multi && (
                          <>
                            <div className="relative w-24">
                              <Input data-testid={`sale-form-broker-pct-${idx}`} type="number" min="0" max="100"
                                value={b.split_pct} onChange={(e) => updateBroker(idx, "split_pct", e.target.value)}
                                className="pr-6 text-right" />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                            </div>
                            <span className="w-24 text-right text-xs tabular text-[hsl(var(--emerald))]" data-testid={`sale-form-broker-value-${idx}`}>
                              {brl(brokerComm * share)}
                            </span>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0"
                              data-testid={`sale-form-remove-broker-${idx}`} onClick={() => removeBroker(idx)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    );
                  })}
                  <datalist id="brokers-list">
                    {(brokers || []).map((bn) => <option key={bn} value={bn} />)}
                  </datalist>
                  {multi && (
                    <p className={`text-xs ${sumOk ? "text-muted-foreground" : "text-destructive font-medium"}`}
                      data-testid="sale-form-split-sum">
                      Soma das divisões: <strong>{Math.round(partnersSum)}%</strong>{sumOk ? " ✓" : " — deve somar 100%"}
                    </p>
                  )}
                  {!multi && (
                    <p className="text-xs text-muted-foreground">A venda é vinculada automaticamente ao corretor informado.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Cliente */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cliente</div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Nome do cliente <span className="text-destructive">*</span></Label>
                <Input data-testid="sale-form-client-input" list="clients-list" value={form.client_name}
                  onChange={(e) => onClientNameChange(e.target.value)} placeholder="Nome do comprador" />
                <datalist id="clients-list">
                  {(clients || []).map((c) => <option key={c.name} value={c.name} />)}
                </datalist>
                {(() => {
                  const m = (clients || []).find((c) => c.name.toLowerCase() === (form.client_name || "").trim().toLowerCase());
                  return m ? (
                    <p data-testid="sale-client-history-hint" className="text-[11px] text-[hsl(var(--emerald))]">
                      Cliente já tem {m.qtd} compra(s) · {brl(m.volume)} em VGV
                    </p>
                  ) : null;
                })()}
              </div>
              <div className="space-y-1.5">
                <Label>Número do cliente (OPCIONAL)</Label>
                <Input data-testid="sale-form-client-phone-input" value={form.client_phone}
                  onChange={(e) => set("client_phone", e.target.value)} placeholder="(00) 00000-0000" />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail (OPCIONAL)</Label>
                <Input data-testid="sale-form-client-email-input" type="email" value={form.client_email}
                  onChange={(e) => set("client_email", e.target.value)} placeholder="email@exemplo.com" />
              </div>
              <div className="space-y-1.5">
                <Label>CPF (OPCIONAL)</Label>
                <Input data-testid="sale-form-client-cpf-input" value={form.client_cpf}
                  onChange={(e) => set("client_cpf", e.target.value)} placeholder="000.000.000-00" />
              </div>
              <div className="space-y-1.5">
                <Label>Data de nascimento (OPCIONAL)</Label>
                <Input data-testid="sale-form-client-birthdate-input" type="date" value={form.client_birthdate}
                  onChange={(e) => set("client_birthdate", e.target.value)} />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Label className="text-sm">💍 Possui cônjuge/companheiro?</Label>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant={!form.client_has_spouse ? "default" : "outline"} className="h-7"
                  data-testid="spouse-no" onClick={() => set("client_has_spouse", false)}>Não</Button>
                <Button type="button" size="sm" variant={form.client_has_spouse ? "default" : "outline"} className="h-7"
                  data-testid="spouse-yes" onClick={() => set("client_has_spouse", true)}>Sim</Button>
              </div>
            </div>
            {form.client_has_spouse && (
              <div className="grid sm:grid-cols-3 gap-4" data-testid="spouse-fields">
                <Input placeholder="Nome do cônjuge" value={form.spouse_name} onChange={(e) => set("spouse_name", e.target.value)} data-testid="spouse-name" />
                <Input placeholder="Telefone" value={form.spouse_phone} onChange={(e) => set("spouse_phone", e.target.value)} />
                <Input placeholder="E-mail" value={form.spouse_email} onChange={(e) => set("spouse_email", e.target.value)} />
                <Input placeholder="CPF" value={form.spouse_cpf} onChange={(e) => set("spouse_cpf", e.target.value)} />
                <Input type="date" value={form.spouse_birthdate} onChange={(e) => set("spouse_birthdate", e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-sm">📣 Origem (OPCIONAL)</Label>
              <div className="flex flex-wrap gap-1.5" data-testid="origin-chips">
                {ORIGINS.map((o) => (
                  <Button key={o.v} type="button" size="sm" className="h-7 text-xs"
                    variant={form.client_origin === o.v ? "default" : "outline"}
                    onClick={() => set("client_origin", form.client_origin === o.v ? "" : o.v)}>{o.label}</Button>
                ))}
              </div>
              {form.client_origin === "outro" && (
                <Input className="mt-1.5" placeholder="Qual?" value={form.client_origin_other}
                  onChange={(e) => set("client_origin_other", e.target.value)} data-testid="origin-other" />
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">📝 Observação do cliente (OPCIONAL)</Label>
              <Input value={form.client_notes} onChange={(e) => set("client_notes", e.target.value)}
                placeholder="Fica no cadastro do cliente" data-testid="client-notes" />
            </div>
          </div>

          {/* Valores e comissão */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Valores e comissão</div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Valor da venda (R$) <span className="text-destructive">*</span></Label>
                <CurrencyInput data-testid="sale-form-value-input" value={form.sale_value}
                  onChange={(v) => set("sale_value", v)} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <Label>Comissão (%)</Label>
                <Input data-testid="sale-form-commission-rate" type="number" step="0.01" value={form.commission_rate}
                  onChange={(e) => set("commission_rate", e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Comissão total (R$)</Label>
                <CurrencyInput data-testid="sale-form-commission-value" value={form.commission_value}
                  onChange={(v) => set("commission_value", v)} placeholder="0,00" />
              </div>
            </div>

            {/* Divisão da comissão corretor x imobiliária */}
            <div className="rounded-xl border border-border/60 p-4 bg-muted/30 space-y-3">
              <div className="grid sm:grid-cols-3 gap-4 items-end">
                <div className="space-y-1.5">
                  <Label>Comissão corretor (%)</Label>
                  <Input data-testid="sale-form-broker-split" type="number" step="1" min="0" max="100"
                    value={form.broker_split} onChange={(e) => set("broker_split", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Corretor(es)</Label>
                  <div data-testid="sale-form-broker-commission" className="h-10 flex items-center font-heading font-bold tabular text-[hsl(var(--emerald))]">
                    {brl(brokerComm)}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Imobiliária ({agencySplit}%)</Label>
                  <div data-testid="sale-form-agency-commission" className="h-10 flex items-center font-heading font-bold tabular text-primary">
                    {brl(agencyComm)}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Divisão: <strong>{form.broker_split || 0}%</strong> corretor(es) / <strong>{agencySplit}%</strong> imobiliária.
                {multi && " O valor dos corretores é dividido conforme os percentuais da parceria."}
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Valor de entrada (R$) (OPCIONAL)</Label>
                <CurrencyInput data-testid="sale-form-entrada-input" value={form.entrada}
                  onChange={(v) => set("entrada", v)} placeholder="0,00" />
              </div>
              <div className="flex items-end pb-2">
                <div className="flex items-center gap-3">
                  <Switch data-testid="sale-form-parcelado-switch" checked={form.parcelado}
                    onCheckedChange={(v) => set("parcelado", v)} />
                  <Label className="cursor-pointer">Comissão parcelada (a receber)</Label>
                </div>
              </div>
            </div>

            {!form.parcelado && (
              <div className="flex items-center gap-3 rounded-lg border border-border/60 p-3 bg-muted/20">
                <Switch data-testid="sale-form-commission-received-switch" checked={form.commission_received}
                  onCheckedChange={(v) => set("commission_received", v)} />
                <Label className="cursor-pointer">Comissão já recebida (à vista)</Label>
              </div>
            )}
          </div>

          {form.parcelado && (
            <div className="rounded-xl border border-border/60 p-4 bg-muted/30 space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-background/60 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Observação da comissão nesta venda parcelada:</span>
                <span className="font-semibold">
                  Corretor <span className="text-[hsl(var(--emerald))]">{brl(brokerComm)}</span> · Imobiliária <span className="text-primary">{brl(agencyComm)}</span>
                </span>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label>Nº de parcelas</Label>
                  <Input data-testid="sale-form-num-parcelas" type="text" inputMode="numeric" value={numParcelas}
                    onChange={(e) => setNumParcelas(e.target.value.replace(/\D/g, ""))} className="w-28" />
                </div>
                <Button type="button" variant="secondary" onClick={generateInstallments}
                  data-testid="sale-form-generate-installments">
                  Gerar parcelas
                </Button>
                <div className="ml-auto text-sm text-muted-foreground">
                  Total parcelas: <span className="font-semibold tabular text-foreground">{brl(installmentsTotal)}</span>
                </div>
              </div>

              {form.installments.length > 0 && (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {form.installments.map((inst, idx) => (
                    <div key={idx} className="flex items-center gap-2" data-testid={`installment-row-${idx}`}>
                      <span className="w-7 text-xs font-semibold text-muted-foreground tabular">#{inst.number}</span>
                      <Input type="date" value={inst.due_date}
                        onChange={(e) => updateInstallment(idx, "due_date", e.target.value)} className="h-9 flex-1" />
                      <CurrencyInput value={inst.value}
                        onChange={(v) => updateInstallment(idx, "value", v)} className="h-9 w-32" />
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive"
                        onClick={() => removeInstallment(idx)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <div className="flex items-center gap-2 mr-auto text-xs text-muted-foreground">
            <Switch data-testid="sale-sound-toggle" checked={soundOn}
              onCheckedChange={(v) => { setSoundOn(v); setSoundEnabled(v); }} />
            🔊 Som de comemoração
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button data-testid="sale-form-submit-button" onClick={handleSubmit} disabled={!valid}>
            <Plus className="h-4 w-4 mr-1" /> {initial?.id ? "Salvar alterações" : "Cadastrar venda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
