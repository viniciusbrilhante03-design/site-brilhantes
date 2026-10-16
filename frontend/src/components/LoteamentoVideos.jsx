import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UploadCloud, Trash2, Loader2, Youtube, Video, Link2, Plus } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

export default function LoteamentoVideos({ lotId }) {
  const qc = useQueryClient();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");

  const listQ = useQuery({ queryKey: ["lot-videos", lotId], queryFn: async () => (await api.get(`/loteamentos/${lotId}/videos`)).data, enabled: !!lotId });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["lot-videos", lotId] });

  const linkMut = useMutation({
    mutationFn: () => api.post(`/loteamentos/${lotId}/videos/link`, { url: url.trim(), title: title.trim() }),
    onSuccess: () => { invalidate(); setUrl(""); setTitle(""); toast.success("Vídeo adicionado!"); },
    onError: () => toast.error("Erro ao adicionar link."),
  });
  const delMut = useMutation({ mutationFn: (id) => api.delete(`/loteamentos/videos/${id}`), onSuccess: () => { invalidate(); toast.success("Vídeo removido."); } });

  const handleFile = async (files) => {
    const f = (files || [])[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("title", f.name);
      await api.post(`/loteamentos/${lotId}/videos/upload`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      invalidate();
      toast.success("Vídeo enviado!");
    } catch (e) { toast.error(e?.response?.data?.detail || "Erro ao enviar vídeo."); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  const videos = listQ.data || [];

  return (
    <div className="space-y-3" data-testid="lot-videos">
      <div className="rounded-xl border border-border/60 p-3 space-y-2">
        <div className="font-semibold text-sm flex items-center gap-1.5"><Youtube className="h-4 w-4 text-[hsl(var(--gold))]" /> Adicionar link (YouTube ou URL)</div>
        <Input data-testid="video-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (opcional)" className="h-8" />
        <div className="flex gap-2">
          <Input data-testid="video-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/..." className="h-8"
            onKeyDown={(e) => { if (e.key === "Enter" && url.trim()) linkMut.mutate(); }} />
          <Button data-testid="video-add-link" size="sm" disabled={!url.trim() || linkMut.isPending} onClick={() => linkMut.mutate()}><Plus className="h-4 w-4" /></Button>
        </div>
      </div>

      <button data-testid="video-upload-dropzone" onClick={() => inputRef.current?.click()} disabled={uploading}
        className="w-full border-2 border-dashed border-primary/40 rounded-xl p-5 flex flex-col items-center gap-2 hover:border-primary/60 hover:bg-primary/5 transition-colors disabled:opacity-60">
        {uploading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <UploadCloud className="h-6 w-6 text-primary" />}
        <span className="text-sm font-semibold">{uploading ? "Enviando..." : "Enviar arquivo de vídeo"}</span>
        <span className="text-xs text-muted-foreground">MP4/MOV — até 200 MB</span>
      </button>
      <input ref={inputRef} data-testid="video-upload-input" type="file" accept="video/*" className="hidden" onChange={(e) => handleFile(e.target.files)} />

      {videos.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-6"><Video className="h-8 w-8 mx-auto mb-2 opacity-40" /> Nenhum vídeo ainda.</div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {videos.map((v) => (
            <div key={v.id} data-testid={`video-${v.id}`} className="rounded-xl border border-border/60 overflow-hidden bg-card">
              <div className="aspect-video bg-black">
                {v.kind === "youtube" ? (
                  <iframe title={v.title || v.id} src={`https://www.youtube.com/embed/${v.youtube_id}`} className="w-full h-full" allowFullScreen />
                ) : v.kind === "file" ? (
                  <video controls className="w-full h-full" src={`${BACKEND}/api/loteamentos/videos/${v.id}/raw`} />
                ) : (
                  <a href={v.url} target="_blank" rel="noreferrer" className="w-full h-full flex items-center justify-center text-white text-sm gap-2"><Link2 className="h-4 w-4" /> Abrir vídeo</a>
                )}
              </div>
              <div className="p-2 flex items-center gap-2">
                <div className="flex-1 min-w-0 text-sm truncate">{v.title || (v.kind === "youtube" ? "YouTube" : "Vídeo")}</div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" data-testid={`video-del-${v.id}`} onClick={() => delMut.mutate(v.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
