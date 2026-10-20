import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { INFRA_OPTIONS } from "@/components/LoteamentoSpecsForm";
import { Plus, Trash2, HelpCircle, Link2, FileText, MessageSquare, Sparkles, UploadCloud, Loader2, Check, X } from "lucide-react";

const TYPES = [["texto", "Texto/Nota"], ["link", "Link de site"], ["qa", "Pergunta e resposta"]];
const ICON = { texto: FileText, link: Link2, qa: MessageSquare };

export default function LoteamentoKnowledge({ lotId }) {
  const qc = useQueryClient();
  const [type, setType] = useState("texto");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [ansMap, setAnsMap] = useState({});
  const fileRef = useRef(null);
  const [extracting, setExtracting] = useState(false);
  const [sugg, setSugg] = useState(null);   // {partial, resumo}

  const SEC_LABEL = { comercial: "Valores", localizacao: "Localização", tecnicos: "Técnico", infraestrutura: "Infraestrutura", obra: "Obra" };
  const FIELD_LABEL = { valor_a_partir: "Valor a partir de", entrada_minima: "Entrada mínima", max_parcelas: "Máx. parcelas", valor_parcela_inicial: "Parcela inicial", financiamento: "Financiamento", correcao: "Correção", periodicidade: "Periodicidade", juros: "Juros", juros_pct: "Juros %", balao: "Balão", baloes_qtd: "Qtd. balões", baloes_periodicidade: "Period. balões", baloes_valor: "Valor balões", condicoes_especiais: "Condições especiais", diferenciais: "Diferenciais", cidade: "Cidade", estado: "Estado", bairro: "Bairro", endereco: "Endereço", coords: "Coordenadas", dist_centro: "Dist. centro", dist_praia: "Dist. praia", dist_pontos: "Pontos relevantes", acessos: "Acessos", metragem_min: "Metragem mín.", metragem_max: "Metragem máx.", area_total: "Área total", qtd_lotes: "Qtd. lotes", qtd_quadras: "Qtd. quadras", tipo: "Tipo", liberacao_pct: "Liberação %", prazo_construcao: "Prazo construção", restricoes: "Restrições", items: "Itens", status: "Status", percentual: "Percentual", previsao: "Previsão", data_entrega: "Data entrega", observacao: "Observação" };

  const onExtract = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setExtracting(true); setSugg(null);
    try {
      const fd = new FormData(); fd.append("file", f);
      const res = await api.post(`/loteamentos/${lotId}/ai-extract`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      const data = res.data.suggestions || {};
      const partial = {};
      ["tecnicos", "infraestrutura", "obra", "localizacao", "comercial"].forEach((sec) => {
        const v = data[sec] || {};
        Object.entries(v).forEach(([k, val]) => {
          const str = Array.isArray(val) ? val.filter(Boolean).join(", ") : String(val ?? "");
          if (str.trim()) { partial[sec] = partial[sec] || {}; partial[sec][k] = { value: str, ok: true }; }
        });
      });
      setSugg({ partial, resumo: data.resumo || "", book: res.data.book_text || "", filename: res.data.filename || f.name });
      if (Object.keys(partial).length === 0 && !data.resumo) toast.info("A IA não encontrou campos reconhecíveis no arquivo.");
    } catch (err) { toast.error(err?.response?.data?.detail || "Falha ao interpretar o arquivo."); }
    finally { setExtracting(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const applyMut = useMutation({
    mutationFn: (payload) => api.patch(`/loteamentos/${lotId}/specs-merge`, payload),
    onSuccess: () => { refresh(); setSugg(null); toast.success("Informações aplicadas ao loteamento!"); },
    onError: () => toast.error("Erro ao aplicar."),
  });
  const applySugg = () => {
    const sp = {};
    Object.entries(sugg.partial).forEach(([sec, fields]) => {
      Object.entries(fields).forEach(([k, o]) => {
        if (o.ok && o.value) { sp[sec] = sp[sec] || {}; sp[sec][k] = k === "items" ? o.value.split(",").map((x) => x.trim()).filter(Boolean) : o.value; }
      });
    });
    if (sp.infraestrutura?.items) {
      const norm = (x) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const known = [], extra = [];
      sp.infraestrutura.items.forEach((x) => { const m = INFRA_OPTIONS.find((o) => norm(o) === norm(x)); m ? known.push(m) : extra.push(x); });
      if (extra.length) known.push("Outro");
      sp.infraestrutura = { items: known, outros: extra };
    }
    applyMut.mutate({ specs_partial: sp, append_training: sugg.resumo || "", book_text: sugg.book || "", book_title: sugg.filename || "" });
  };

  const detQ = useQuery({ queryKey: ["lot-details", lotId], queryFn: async () => (await api.get(`/loteamentos/${lotId}/details`)).data, enabled: !!lotId });
  const qsQ = useQuery({ queryKey: ["lot-questions", lotId], queryFn: async () => (await api.get(`/loteamentos/${lotId}/questions`)).data, enabled: !!lotId });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["lot-details", lotId] }); qc.invalidateQueries({ queryKey: ["lot-questions", lotId] }); };

  const addMut = useMutation({
    mutationFn: () => api.post(`/loteamentos/${lotId}/knowledge`, { type, title, content, question, answer }),
    onSuccess: () => { refresh(); setTitle(""); setContent(""); setQuestion(""); setAnswer(""); toast.success("Adicionado à base da IA!"); },
  });
  const delMut = useMutation({ mutationFn: (kid) => api.delete(`/loteamentos/${lotId}/knowledge/${kid}`), onSuccess: () => { refresh(); toast.success("Removido."); } });
  const ansMut = useMutation({
    mutationFn: ({ qid, text }) => api.post(`/loteamentos/${lotId}/questions/${qid}/answer`, { answer: text }),
    onSuccess: () => { refresh(); toast.success("Respondida! Virou conhecimento da IA."); },
  });

  const items = detQ.data?.knowledge || [];
  const questions = qsQ.data || [];
  const valid = type === "qa" ? question.trim() && answer.trim() : content.trim();

  return (
    <div className="space-y-4" data-testid="lot-knowledge">
      <div className="rounded-xl border border-[hsl(var(--gold)/0.4)] bg-[hsl(var(--gold)/0.06)] p-3 space-y-2">
        <div className="font-semibold text-sm flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-[hsl(var(--gold))]" /> Enviar arquivo p/ a IA sugerir o preenchimento</div>
        <p className="text-xs text-muted-foreground">Book, tabela de preços, PDF ou memorial. A IA lê e sugere os campos — você confirma antes de aplicar.</p>
        <input ref={fileRef} type="file" accept="application/pdf,.txt,.csv,image/*" className="hidden" onChange={onExtract} data-testid="kn-extract-input" />
        <Button variant="outline" size="sm" className="gap-1.5" disabled={extracting} onClick={() => fileRef.current?.click()} data-testid="kn-extract-btn">
          {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />} {extracting ? "Lendo com a IA..." : "Enviar arquivo"}
        </Button>

        {sugg && (
          <div className="space-y-2 pt-1" data-testid="kn-suggestions">
            {Object.entries(sugg.partial).map(([sec, fields]) => (
              <div key={sec}>
                <div className="text-[11px] font-semibold uppercase text-muted-foreground">{SEC_LABEL[sec] || sec}</div>
                {Object.entries(fields).map(([k, o]) => (
                  <div key={k} className="flex items-center gap-2 mt-1" data-testid={`kn-sugg-${sec}-${k}`}>
                    <span className="text-xs w-28 shrink-0 text-muted-foreground">{FIELD_LABEL[k] || k}</span>
                    <Input value={o.value} onChange={(e) => setSugg((s) => ({ ...s, partial: { ...s.partial, [sec]: { ...s.partial[sec], [k]: { ...o, value: e.target.value } } } }))} className="h-7 text-xs" disabled={!o.ok} />
                    <Button variant="ghost" size="icon" className={`h-7 w-7 shrink-0 ${o.ok ? "text-[hsl(var(--emerald))]" : "text-muted-foreground"}`}
                      onClick={() => setSugg((s) => ({ ...s, partial: { ...s.partial, [sec]: { ...s.partial[sec], [k]: { ...o, ok: !o.ok } } } }))}
                      data-testid={`kn-sugg-toggle-${sec}-${k}`}>{o.ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}</Button>
                  </div>
                ))}
              </div>
            ))}
            {sugg.resumo && <div className="text-xs whitespace-pre-wrap max-h-60 overflow-y-auto" data-testid="kn-sugg-resumo"><span className="text-muted-foreground">Resumo p/ treino: </span>{sugg.resumo}</div>}
            {sugg.book && <div className="text-[11px] text-muted-foreground">O conteúdo completo do arquivo também será salvo na base de conhecimento da IA.</div>}
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={applySugg} disabled={applyMut.isPending} data-testid="kn-sugg-apply">Aplicar selecionados</Button>
              <Button size="sm" variant="ghost" onClick={() => setSugg(null)} data-testid="kn-sugg-cancel">Ignorar</Button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border/60 p-3 space-y-2">
        <div className="font-semibold text-sm">O que a IA sabe — adicionar</div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger data-testid="kn-type" className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
        {type === "qa" ? (
          <>
            <Input data-testid="kn-question" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Pergunta (ex: Qual o prazo de entrega?)" className="h-8" />
            <Textarea data-testid="kn-answer" value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} placeholder="Resposta" />
          </>
        ) : (
          <>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === "link" ? "Nome do site (opcional)" : "Título (opcional)"} className="h-8" />
            <Textarea data-testid="kn-content" value={content} onChange={(e) => setContent(e.target.value)} rows={2} placeholder={type === "link" ? "https://..." : "Texto que a IA deve conhecer"} />
          </>
        )}
        <div className="flex justify-end">
          <Button data-testid="kn-add" size="sm" disabled={!valid || addMut.isPending} onClick={() => addMut.mutate()}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Base de conhecimento ({items.length})</div>
          {items.map((k) => { const I = ICON[k.type] || FileText; return (
            <div key={k.id} data-testid={`kn-item-${k.id}`} className="flex items-start gap-2 rounded-lg border border-border/60 p-2.5 text-sm">
              <I className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                {k.type === "qa" ? <div><b>{k.question}</b><br />{k.answer}</div> : <div>{k.title && <b>{k.title}: </b>}{k.content}</div>}
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" data-testid={`kn-del-${k.id}`} onClick={() => delMut.mutate(k.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ); })}
        </div>
      )}

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><HelpCircle className="h-3.5 w-3.5" /> Perguntas sem resposta ({questions.length})</div>
        {questions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3 text-center">Nenhuma pergunta pendente dos corretores.</p>
        ) : questions.map((q) => (
          <div key={q.id} data-testid={`question-${q.id}`} className="rounded-lg border border-[hsl(var(--gold)/0.4)] bg-[hsl(var(--gold)/0.06)] p-2.5 space-y-1.5">
            <div className="text-sm font-medium">{q.question}</div>
            <div className="text-[11px] text-muted-foreground">perguntado por {q.asked_by}</div>
            <div className="flex gap-2">
              <Input data-testid={`question-answer-${q.id}`} value={ansMap[q.id] || ""} onChange={(e) => setAnsMap((m) => ({ ...m, [q.id]: e.target.value }))} placeholder="Responder para ensinar a IA" className="h-8 text-xs" />
              <Button size="sm" className="h-8" data-testid={`question-send-${q.id}`} disabled={!(ansMap[q.id] || "").trim()} onClick={() => ansMut.mutate({ qid: q.id, text: ansMap[q.id] })}>Responder</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
