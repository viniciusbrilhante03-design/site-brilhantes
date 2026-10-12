import { useState, useEffect, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { brl } from "@/lib/format";
import { Plus, Trash2 } from "lucide-react";

const empty = {
  property_name: "",
  quadra: "",
  lote: "",
  client_name: "",
  client_phone: "",
  client_email: "",
  broker_name: "",
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

function addMonths(isoDate, n) {
  const d = new Date(isoDate + "T00:00:00");
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

export default function SaleFormDialog({ open, onOpenChange, onSubmit, initial, brokers, loteamentos, lockBroker, lockBrokerName }) {
  const [form, setForm] = useState(empty);
  const [numParcelas, setNumParcelas] = useState(1);

  useEffect(() => {
    if (open) {
      if (initial) {
        setForm({ ...empty, ...initial, broker_split: initial.broker_split ?? 60 });
        setNumParcelas(initial.installments?.length || 1);
      } else {
        setForm(lockBroker && lockBrokerName ? { ...empty, broker_name: lockBrokerName } : empty);
        setNumParcelas(1);
      }
    }
  }, [open, initial, lockBroker, lockBrokerName]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const sv = parseFloat(form.sale_value);
    const rate = parseFloat(form.commission_rate);
    if (!isNaN(sv) && !isNaN(rate)) {
      set("commission_value", ((sv * rate) / 100).toFixed(2));
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

  const handleSubmit = () => {
    const payload = {
      property_name: form.property_name.trim(),
      quadra: (form.quadra || "").trim(),
      lote: (form.lote || "").trim(),
      client_name: (form.client_name || "").trim(),
      client_phone: (form.client_phone || "").trim(),
      client_email: (form.client_email || "").trim(),
      broker_name: form.broker_name.trim(),
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

  const valid = form.property_name.trim() && form.broker_name.trim() && parseFloat(form.sale_value) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="sale-form-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            {initial ? "Editar venda" : "Nova venda"}
          </DialogTitle>
          <DialogDescription>Preencha os dados do loteamento e o fluxo a receber.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Loteamento */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Loteamento</div>
            <div className="space-y-1.5">
              <Label>Loteamento</Label>
              <Input data-testid="sale-form-property-input" list="loteamentos-list" value={form.property_name}
                onChange={(e) => set("property_name", e.target.value)} placeholder="Comece a digitar o loteamento..." />
              <datalist id="loteamentos-list">
                {(loteamentos || []).map((l) => <option key={l} value={l} />)}
              </datalist>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Quadra (opcional)</Label>
                <Input data-testid="sale-form-quadra-input" value={form.quadra}
                  onChange={(e) => set("quadra", e.target.value)} placeholder="Ex: 12" />
              </div>
              <div className="space-y-1.5">
                <Label>Lote (opcional)</Label>
                <Input data-testid="sale-form-lote-input" value={form.lote}
                  onChange={(e) => set("lote", e.target.value)} placeholder="Ex: 07" />
              </div>
              <div className="space-y-1.5">
                <Label>Data da venda</Label>
                <Input data-testid="sale-form-date-input" type="date" value={form.sale_date}
                  onChange={(e) => set("sale_date", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Corretor (nome de guerra)</Label>
              {lockBroker ? (
                <Input data-testid="sale-form-broker-locked" value={form.broker_name} disabled className="opacity-90" />
              ) : (
                <>
                  <Input data-testid="sale-form-broker-select" list="brokers-list" value={form.broker_name}
                    onChange={(e) => set("broker_name", e.target.value)} placeholder="Digite o nome de guerra do corretor" />
                  <datalist id="brokers-list">
                    {(brokers || []).map((b) => <option key={b} value={b} />)}
                  </datalist>
                  <p className="text-xs text-muted-foreground">A venda é vinculada automaticamente ao corretor informado.</p>
                </>
              )}
            </div>
          </div>

          {/* Cliente */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cliente (opcional)</div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Nome do cliente</Label>
                <Input data-testid="sale-form-client-input" value={form.client_name}
                  onChange={(e) => set("client_name", e.target.value)} placeholder="Nome do comprador" />
              </div>
              <div className="space-y-1.5">
                <Label>Número do cliente</Label>
                <Input data-testid="sale-form-client-phone-input" value={form.client_phone}
                  onChange={(e) => set("client_phone", e.target.value)} placeholder="(00) 00000-0000" />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input data-testid="sale-form-client-email-input" type="email" value={form.client_email}
                  onChange={(e) => set("client_email", e.target.value)} placeholder="email@exemplo.com" />
              </div>
            </div>
          </div>

          {/* Valores e comissão */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Valores e comissão</div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Valor da venda (R$)</Label>
                <Input data-testid="sale-form-value-input" type="number" step="0.01" value={form.sale_value}
                  onChange={(e) => set("sale_value", e.target.value)} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <Label>Comissão (%)</Label>
                <Input data-testid="sale-form-commission-rate" type="number" step="0.01" value={form.commission_rate}
                  onChange={(e) => set("commission_rate", e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Comissão total (R$)</Label>
                <Input data-testid="sale-form-commission-value" type="number" step="0.01" value={form.commission_value}
                  onChange={(e) => set("commission_value", e.target.value)} placeholder="0,00" />
              </div>
            </div>

            {/* Divisão da comissão */}
            <div className="rounded-xl border border-border/60 p-4 bg-muted/30 space-y-3">
              <div className="grid sm:grid-cols-3 gap-4 items-end">
                <div className="space-y-1.5">
                  <Label>Comissão corretor (%)</Label>
                  <Input data-testid="sale-form-broker-split" type="number" step="1" min="0" max="100"
                    value={form.broker_split} onChange={(e) => set("broker_split", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Corretor</Label>
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
                Divisão automática: <strong>{form.broker_split || 0}%</strong> corretor / <strong>{agencySplit}%</strong> imobiliária.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Valor de entrada (R$)</Label>
                <Input data-testid="sale-form-entrada-input" type="number" step="0.01" value={form.entrada}
                  onChange={(e) => set("entrada", e.target.value)} placeholder="0,00" />
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
                  <Input data-testid="sale-form-num-parcelas" type="number" min="1" value={numParcelas}
                    onChange={(e) => setNumParcelas(e.target.value)} className="w-28" />
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
                      <Input type="number" step="0.01" value={inst.value}
                        onChange={(e) => updateInstallment(idx, "value", e.target.value)} className="h-9 w-32" />
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button data-testid="sale-form-submit-button" onClick={handleSubmit} disabled={!valid}>
            <Plus className="h-4 w-4 mr-1" /> {initial ? "Salvar alterações" : "Cadastrar venda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
