import { useState, useEffect, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { brl, formatDateBR } from "@/lib/format";
import { Plus, Trash2 } from "lucide-react";

const empty = {
  property_name: "",
  client_name: "",
  broker_name: "",
  sale_date: new Date().toISOString().slice(0, 10),
  sale_value: "",
  commission_rate: "",
  commission_value: "",
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

export default function SaleFormDialog({ open, onOpenChange, onSubmit, initial, brokers }) {
  const [form, setForm] = useState(empty);
  const [numParcelas, setNumParcelas] = useState(1);

  useEffect(() => {
    if (open) {
      if (initial) {
        setForm({ ...empty, ...initial });
        setNumParcelas(initial.installments?.length || 1);
      } else {
        setForm(empty);
        setNumParcelas(1);
      }
    }
  }, [open, initial]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // auto commission value when rate or sale value changes
  useEffect(() => {
    const sv = parseFloat(form.sale_value);
    const rate = parseFloat(form.commission_rate);
    if (!isNaN(sv) && !isNaN(rate)) {
      set("commission_value", ((sv * rate) / 100).toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.sale_value, form.commission_rate]);

  const generateInstallments = () => {
    const n = Math.max(1, parseInt(numParcelas) || 1);
    const sv = parseFloat(form.sale_value) || 0;
    const ent = parseFloat(form.entrada) || 0;
    const remaining = Math.max(sv - ent, 0);
    const per = +(remaining / n).toFixed(2);
    const list = [];
    let acc = 0;
    for (let i = 0; i < n; i++) {
      let value = per;
      if (i === n - 1) value = +(remaining - acc).toFixed(2);
      acc += per;
      list.push({
        number: i + 1,
        due_date: addMonths(form.sale_date, i + 1),
        value,
        received: false,
        received_date: null,
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
      client_name: (form.client_name || "").trim(),
      broker_name: form.broker_name.trim(),
      sale_date: form.sale_date,
      sale_value: parseFloat(form.sale_value) || 0,
      commission_rate: parseFloat(form.commission_rate) || 0,
      commission_value: parseFloat(form.commission_value) || 0,
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
          <DialogDescription>Preencha os dados da venda e o fluxo a receber.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Imóvel</Label>
              <Input data-testid="sale-form-property-input" value={form.property_name}
                onChange={(e) => set("property_name", e.target.value)} placeholder="Ex: Apto 1203 - Ed. Aurora" />
            </div>
            <div className="space-y-1.5">
              <Label>Cliente (opcional)</Label>
              <Input data-testid="sale-form-client-input" value={form.client_name}
                onChange={(e) => set("client_name", e.target.value)} placeholder="Nome do comprador" />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Corretor</Label>
              <Input data-testid="sale-form-broker-select" list="brokers-list" value={form.broker_name}
                onChange={(e) => set("broker_name", e.target.value)} placeholder="Quem fez a venda" />
              <datalist id="brokers-list">
                {(brokers || []).map((b) => <option key={b} value={b} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label>Data da venda</Label>
              <Input data-testid="sale-form-date-input" type="date" value={form.sale_date}
                onChange={(e) => set("sale_date", e.target.value)} />
            </div>
          </div>

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
              <Label>Valor comissão (R$)</Label>
              <Input data-testid="sale-form-commission-value" type="number" step="0.01" value={form.commission_value}
                onChange={(e) => set("commission_value", e.target.value)} placeholder="0,00" />
            </div>
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
                <Label className="cursor-pointer">Venda parcelada (a receber)</Label>
              </div>
            </div>
          </div>

          {form.parcelado && (
            <div className="rounded-xl border border-border/60 p-4 bg-muted/30 space-y-3">
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
