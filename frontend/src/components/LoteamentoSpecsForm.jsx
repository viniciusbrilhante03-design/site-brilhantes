import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Ruler, Building2, HardHat, MapPin, DollarSign } from "lucide-react";

export const INFRA_OPTIONS = [
  "Água", "Energia elétrica", "Pavimentação", "Esgotamento sanitário", "Drenagem",
  "Iluminação pública", "Arborização", "Calçadas", "Área de lazer", "Clube", "Piscina",
  "Academia", "Playground", "Pet Place", "Beach Tennis", "Quadra esportiva", "Portaria",
  "Controle de acesso", "Área verde", "Lago", "Outro",
];

export const EMPTY_SPECS = {
  tecnicos: { metragem_min: "", metragem_max: "", area_total: "", qtd_lotes: "", qtd_quadras: "", tipo: "", liberacao_pct: "", prazo_construcao: "", restricoes: "" },
  infraestrutura: { items: [], outro: "" },
  obra: { status: "", percentual: "", previsao: "", data_entrega: "", observacao: "" },
  localizacao: { cidade: "", estado: "", bairro: "", endereco: "", maps: "", coords: "", dist_centro: "", dist_praia: "", dist_pontos: "", acessos: "" },
  comercial: { valor_a_partir: "", valor_ref: "", entrada_minima: "", max_parcelas: "", valor_parcela_inicial: "", financiamento: "Próprio do loteamento", correcao: "", correcao_outro: "", periodicidade: "", periodicidade_outra: "", juros: "", juros_pct: "", juros_tipo: "", balao: "", baloes_qtd: "", baloes_periodicidade: "", baloes_valor: "", baloes_vencimentos: "", condicoes_especiais: "", diferenciais: "" },
};

export function mergeSpecs(loaded) {
  const s = loaded || {};
  return {
    tecnicos: { ...EMPTY_SPECS.tecnicos, ...(s.tecnicos || {}) },
    infraestrutura: { ...EMPTY_SPECS.infraestrutura, ...(s.infraestrutura || {}) },
    obra: { ...EMPTY_SPECS.obra, ...(s.obra || {}) },
    localizacao: { ...EMPTY_SPECS.localizacao, ...(s.localizacao || {}) },
    comercial: { ...EMPTY_SPECS.comercial, ...(s.comercial || {}) },
  };
}

const F = ({ label, children, className = "" }) => (
  <div className={`space-y-1.5 ${className}`}>
    <Label className="text-xs">{label}</Label>
    {children}
  </div>
);

export default function LoteamentoSpecsForm({ value, onChange }) {
  const v = value;
  const up = (sec, key, val) => onChange({ ...v, [sec]: { ...v[sec], [key]: val } });

  const toggleInfra = (opt) => {
    const items = v.infraestrutura.items || [];
    const next = items.includes(opt) ? items.filter((x) => x !== opt) : [...items, opt];
    onChange({ ...v, infraestrutura: { ...v.infraestrutura, items: next } });
  };

  const t = v.tecnicos, o = v.obra, loc = v.localizacao, c = v.comercial;

  return (
    <Accordion type="multiple" defaultValue={["tecnicos"]} className="w-full">
      {/* DADOS TÉCNICOS */}
      <AccordionItem value="tecnicos" data-testid="spec-sec-tecnicos">
        <AccordionTrigger className="text-sm font-semibold"><span className="flex items-center gap-2"><Ruler className="h-4 w-4 text-[hsl(var(--gold))]" /> Dados Técnicos</span></AccordionTrigger>
        <AccordionContent className="space-y-3 pt-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <F label="Metragem mínima"><Input data-testid="spec-metragem-min" className="h-8" value={t.metragem_min} onChange={(e) => up("tecnicos", "metragem_min", e.target.value)} placeholder="200 m²" /></F>
            <F label="Metragem máxima"><Input className="h-8" value={t.metragem_max} onChange={(e) => up("tecnicos", "metragem_max", e.target.value)} placeholder="450 m²" /></F>
            <F label="Área total"><Input className="h-8" value={t.area_total} onChange={(e) => up("tecnicos", "area_total", e.target.value)} placeholder="Ex: 80.000 m²" /></F>
            <F label="Qtd. de lotes"><Input className="h-8" value={t.qtd_lotes} onChange={(e) => up("tecnicos", "qtd_lotes", e.target.value)} /></F>
            <F label="Qtd. de quadras"><Input className="h-8" value={t.qtd_quadras} onChange={(e) => up("tecnicos", "qtd_quadras", e.target.value)} /></F>
            <F label="Tipo de loteamento">
              <Select value={t.tipo || undefined} onValueChange={(val) => up("tecnicos", "tipo", val)}>
                <SelectTrigger data-testid="spec-tipo" className="h-8"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aberto">Loteamento aberto</SelectItem>
                  <SelectItem value="fechado">Loteamento fechado</SelectItem>
                </SelectContent>
              </Select>
            </F>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Liberação de construção (% do lote pago)"><Input className="h-8" type="number" value={t.liberacao_pct} onChange={(e) => up("tecnicos", "liberacao_pct", e.target.value)} placeholder="Ex: 30" /></F>
            <F label="Prazo para construção (se houver)"><Input className="h-8" value={t.prazo_construcao} onChange={(e) => up("tecnicos", "prazo_construcao", e.target.value)} placeholder="Ex: 24 meses" /></F>
          </div>
          <F label="Restrições / padrão construtivo (se houver)"><Textarea rows={2} value={t.restricoes} onChange={(e) => up("tecnicos", "restricoes", e.target.value)} /></F>
        </AccordionContent>
      </AccordionItem>

      {/* INFRAESTRUTURA */}
      <AccordionItem value="infra" data-testid="spec-sec-infra">
        <AccordionTrigger className="text-sm font-semibold"><span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-[hsl(var(--gold))]" /> Infraestrutura</span></AccordionTrigger>
        <AccordionContent className="pt-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {INFRA_OPTIONS.map((opt) => (
              <label key={opt} data-testid={`infra-${opt}`} className="flex items-center gap-2 text-sm cursor-pointer rounded-md px-2 py-1.5 hover:bg-muted/50">
                <Checkbox checked={(v.infraestrutura.items || []).includes(opt)} onCheckedChange={() => toggleInfra(opt)} />
                <span>{opt}</span>
              </label>
            ))}
          </div>
          {(v.infraestrutura.items || []).includes("Outro") && (
            <div className="mt-2"><Input data-testid="infra-outro" value={v.infraestrutura.outro} onChange={(e) => up("infraestrutura", "outro", e.target.value)} placeholder="Especifique a infraestrutura" /></div>
          )}
        </AccordionContent>
      </AccordionItem>

      {/* STATUS DA OBRA */}
      <AccordionItem value="obra" data-testid="spec-sec-obra">
        <AccordionTrigger className="text-sm font-semibold"><span className="flex items-center gap-2"><HardHat className="h-4 w-4 text-[hsl(var(--gold))]" /> Status da Obra</span></AccordionTrigger>
        <AccordionContent className="space-y-3 pt-1">
          <F label="Status">
            <Select value={o.status || undefined} onValueChange={(val) => up("obra", "status", val)}>
              <SelectTrigger data-testid="spec-obra-status" className="h-8"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nao_iniciada">Não iniciada</SelectItem>
                <SelectItem value="em_andamento">Em andamento</SelectItem>
                <SelectItem value="fase_final">Fase final</SelectItem>
                <SelectItem value="concluida">Concluída</SelectItem>
                <SelectItem value="entregue">Entregue</SelectItem>
              </SelectContent>
            </Select>
          </F>
          {o.status && (
            <div className="grid grid-cols-2 gap-3">
              <F label="Percentual da obra (%)"><Input className="h-8" type="number" value={o.percentual} onChange={(e) => up("obra", "percentual", e.target.value)} /></F>
              <F label="Previsão de entrega"><Input className="h-8" value={o.previsao} onChange={(e) => up("obra", "previsao", e.target.value)} placeholder="Ex: dez/2026" /></F>
              <F label="Data de entrega"><Input className="h-8" type="date" value={o.data_entrega} onChange={(e) => up("obra", "data_entrega", e.target.value)} /></F>
              <F label="Observação" className="col-span-2"><Input className="h-8" value={o.observacao} onChange={(e) => up("obra", "observacao", e.target.value)} /></F>
            </div>
          )}
        </AccordionContent>
      </AccordionItem>

      {/* LOCALIZAÇÃO */}
      <AccordionItem value="localizacao" data-testid="spec-sec-localizacao">
        <AccordionTrigger className="text-sm font-semibold"><span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-[hsl(var(--gold))]" /> Localização</span></AccordionTrigger>
        <AccordionContent className="space-y-3 pt-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <F label="Cidade"><Input className="h-8" value={loc.cidade} onChange={(e) => up("localizacao", "cidade", e.target.value)} /></F>
            <F label="Estado"><Input className="h-8" value={loc.estado} onChange={(e) => up("localizacao", "estado", e.target.value)} /></F>
            <F label="Bairro/localidade"><Input className="h-8" value={loc.bairro} onChange={(e) => up("localizacao", "bairro", e.target.value)} /></F>
          </div>
          <F label="Endereço/referência"><Input className="h-8" value={loc.endereco} onChange={(e) => up("localizacao", "endereco", e.target.value)} /></F>
          <F label="Link do Google Maps"><Input className="h-8" value={loc.maps} onChange={(e) => up("localizacao", "maps", e.target.value)} placeholder="https://maps.google.com/..." /></F>
          <F label="Coordenadas (lat, long) — p/ aparecer no mapa"><Input data-testid="spec-coords" className="h-8" value={loc.coords} onChange={(e) => up("localizacao", "coords", e.target.value)} placeholder="Ex: -27.5954, -48.5480" /></F>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <F label="Distância do centro"><Input className="h-8" value={loc.dist_centro} onChange={(e) => up("localizacao", "dist_centro", e.target.value)} placeholder="Ex: 5 km" /></F>
            <F label="Distância da praia"><Input className="h-8" value={loc.dist_praia} onChange={(e) => up("localizacao", "dist_praia", e.target.value)} /></F>
            <F label="Pontos relevantes"><Input className="h-8" value={loc.dist_pontos} onChange={(e) => up("localizacao", "dist_pontos", e.target.value)} /></F>
          </div>
          <F label="Principais acessos/rodovias"><Input className="h-8" value={loc.acessos} onChange={(e) => up("localizacao", "acessos", e.target.value)} /></F>
        </AccordionContent>
      </AccordionItem>

      {/* COMERCIAL */}
      <AccordionItem value="comercial" data-testid="spec-sec-comercial">
        <AccordionTrigger className="text-sm font-semibold"><span className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-[hsl(var(--gold))]" /> Informações Comerciais</span></AccordionTrigger>
        <AccordionContent className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <F label="Valor a partir de (R$)"><Input data-testid="spec-valor" className="h-8" value={c.valor_a_partir} onChange={(e) => up("comercial", "valor_a_partir", e.target.value)} placeholder="Ex: 85.000" /></F>
            <F label="Referente a (mês/ano)"><Input data-testid="spec-valor-ref" className="h-8" value={c.valor_ref} onChange={(e) => up("comercial", "valor_ref", e.target.value)} placeholder="Ex: jun/2026" /></F>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <F label="Entrada mínima"><Input className="h-8" value={c.entrada_minima} onChange={(e) => up("comercial", "entrada_minima", e.target.value)} /></F>
            <F label="Máx. de parcelas"><Input className="h-8" value={c.max_parcelas} onChange={(e) => up("comercial", "max_parcelas", e.target.value)} placeholder="Ex: 180" /></F>
            <F label="Valor inicial da parcela"><Input className="h-8" value={c.valor_parcela_inicial} onChange={(e) => up("comercial", "valor_parcela_inicial", e.target.value)} /></F>
          </div>
          <F label="Financiamento"><Input className="h-8" value={c.financiamento} onChange={(e) => up("comercial", "financiamento", e.target.value)} /></F>

          {/* Correção monetária */}
          <div className="rounded-lg border border-border/50 p-3 space-y-2">
            <F label="Correção monetária">
              <Select value={c.correcao || undefined} onValueChange={(val) => up("comercial", "correcao", val)}>
                <SelectTrigger data-testid="spec-correcao" className="h-8"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sem">Sem correção</SelectItem>
                  <SelectItem value="ipca">IPCA</SelectItem>
                  <SelectItem value="igpm">IGP-M</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </F>
            {c.correcao === "outro" && <Input data-testid="spec-correcao-outro" className="h-8" value={c.correcao_outro} onChange={(e) => up("comercial", "correcao_outro", e.target.value)} placeholder="Informe o índice" />}
            {c.correcao && c.correcao !== "sem" && (
              <F label="Periodicidade da correção">
                <Select value={c.periodicidade || undefined} onValueChange={(val) => up("comercial", "periodicidade", val)}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="anual">Anual</SelectItem>
                    <SelectItem value="outra">Outra</SelectItem>
                  </SelectContent>
                </Select>
              </F>
            )}
            {c.periodicidade === "outra" && <Input className="h-8" value={c.periodicidade_outra} onChange={(e) => up("comercial", "periodicidade_outra", e.target.value)} placeholder="Informe a periodicidade" />}
          </div>

          {/* Juros */}
          <div className="rounded-lg border border-border/50 p-3 space-y-2">
            <Label className="text-xs">Juros</Label>
            <RadioGroup data-testid="spec-juros" value={c.juros} onValueChange={(val) => up("comercial", "juros", val)} className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer"><RadioGroupItem value="sem" /> Sem juros</label>
              <label className="flex items-center gap-2 text-sm cursor-pointer"><RadioGroupItem value="com" /> Com juros</label>
            </RadioGroup>
            {c.juros === "com" && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <F label="Percentual de juros (%)"><Input data-testid="spec-juros-pct" className="h-8" type="number" value={c.juros_pct} onChange={(e) => up("comercial", "juros_pct", e.target.value)} /></F>
                </div>
                <RadioGroup value={c.juros_tipo} onValueChange={(val) => up("comercial", "juros_tipo", val)} className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer"><RadioGroupItem value="embutidos" /> Embutidos</label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer"><RadioGroupItem value="nao_embutidos" /> Não embutidos</label>
                </RadioGroup>
                {c.juros_tipo === "embutidos" && <p className="text-xs text-[hsl(var(--emerald))] font-medium">Sistema: Tabela Price</p>}
                {c.juros_tipo === "nao_embutidos" && <p className="text-xs text-[hsl(var(--emerald))] font-medium">Sistema: Tabela SAC</p>}
              </div>
            )}
          </div>

          {/* Balão */}
          <div className="rounded-lg border border-border/50 p-3 space-y-2">
            <Label className="text-xs">Balão</Label>
            <RadioGroup data-testid="spec-balao" value={c.balao} onValueChange={(val) => up("comercial", "balao", val)} className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer"><RadioGroupItem value="nao" /> Não possui</label>
              <label className="flex items-center gap-2 text-sm cursor-pointer"><RadioGroupItem value="possui" /> Possui</label>
            </RadioGroup>
            {c.balao === "possui" && (
              <div className="grid grid-cols-2 gap-3">
                <F label="Quantidade de balões"><Input className="h-8" value={c.baloes_qtd} onChange={(e) => up("comercial", "baloes_qtd", e.target.value)} /></F>
                <F label="Periodicidade"><Input className="h-8" value={c.baloes_periodicidade} onChange={(e) => up("comercial", "baloes_periodicidade", e.target.value)} placeholder="Ex: anual" /></F>
                <F label="Valor ou percentual"><Input className="h-8" value={c.baloes_valor} onChange={(e) => up("comercial", "baloes_valor", e.target.value)} /></F>
                <F label="Vencimentos"><Input className="h-8" value={c.baloes_vencimentos} onChange={(e) => up("comercial", "baloes_vencimentos", e.target.value)} /></F>
              </div>
            )}
          </div>

          <F label="Condições especiais"><Textarea rows={2} value={c.condicoes_especiais} onChange={(e) => up("comercial", "condicoes_especiais", e.target.value)} /></F>
          <F label="Diferenciais"><Textarea rows={2} value={c.diferenciais} onChange={(e) => up("comercial", "diferenciais", e.target.value)} /></F>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
