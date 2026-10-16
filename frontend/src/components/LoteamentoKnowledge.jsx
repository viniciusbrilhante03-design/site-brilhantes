import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, HelpCircle, Link2, FileText, MessageSquare } from "lucide-react";

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
