import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UploadCloud, Trash2, Loader2, ImageIcon, GripVertical } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

function compress(file, max = 1600, q = 0.82) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > max || h > max) { const s = Math.min(max / w, max / h); w = Math.round(w * s); h = Math.round(h * s); }
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        c.toBlob((b) => resolve(new File([b], (file.name || "img").replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" })), "image/jpeg", q);
      };
      img.onerror = reject; img.src = e.target.result;
    };
    r.onerror = reject; r.readAsDataURL(file);
  });
}

export default function LoteamentoGallery({ lotId, readOnly = false }) {
  const qc = useQueryClient();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [order, setOrder] = useState(null);

  const listQ = useQuery({
    queryKey: ["lot-images", lotId],
    queryFn: async () => { const d = (await api.get(`/loteamentos/${lotId}/images`)).data; setOrder(null); return d; },
    enabled: !!lotId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["lot-images", lotId] });

  const patchMut = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/loteamentos/images/${id}`, data),
    onSuccess: invalidate,
  });
  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/loteamentos/images/${id}`),
    onSuccess: () => { invalidate(); toast.success("Imagem removida."); },
  });

  const handleFiles = async (files) => {
    const arr = Array.from(files || []);
    if (!arr.length) return;
    setUploading(true);
    try {
      for (const f of arr) {
        const img = f.type.startsWith("image/") ? await compress(f) : f;
        const fd = new FormData();
        fd.append("file", img);
        fd.append("type", "foto");
        fd.append("caption", "");
        await api.post(`/loteamentos/${lotId}/images`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      }
      invalidate();
      toast.success(`${arr.length} imagem(ns) enviada(s)! Descreva cada uma para a IA e as copys.`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erro ao enviar imagem.");
    } finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  const images = order || listQ.data || [];

  const reorderMut = useMutation({
    mutationFn: (ids) => api.post(`/loteamentos/${lotId}/images/reorder`, { ids }),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["loteamentos"] }); toast.success("Ordem das fotos salva!"); },
    onError: () => { setOrder(null); toast.error("Erro ao salvar a ordem."); },
  });
  const onDrop = (targetId) => {
    if (!dragId || dragId === targetId) return setDragId(null);
    const arr = [...images];
    const from = arr.findIndex((x) => x.id === dragId), to = arr.findIndex((x) => x.id === targetId);
    arr.splice(to, 0, arr.splice(from, 1)[0]);
    setOrder(arr); setDragId(null);
    reorderMut.mutate(arr.map((x) => x.id));
  };

  return (
    <div className="space-y-3" data-testid="lot-gallery">
      {!readOnly && (
        <>
          <button data-testid="lot-gallery-dropzone" onClick={() => inputRef.current?.click()} disabled={uploading}
            className="w-full border-2 border-dashed border-primary/40 rounded-xl p-6 flex flex-col items-center gap-2 hover:border-primary/60 hover:bg-primary/5 transition-colors disabled:opacity-60">
            {uploading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <UploadCloud className="h-6 w-6 text-primary" />}
            <span className="text-sm font-semibold">{uploading ? "Enviando..." : "Enviar fotos e plantas"}</span>
            <span className="text-xs text-muted-foreground">JPG/PNG — descreva cada imagem para a IA citar os diferenciais visuais</span>
          </button>
          <input ref={inputRef} data-testid="lot-gallery-input" type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => handleFiles(e.target.files)} />
        </>
      )}

      {images.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-6">
          <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-40" /> Nenhuma imagem ainda.
        </div>
      ) : (
        <>
        {!readOnly && images.length > 1 && <p className="text-xs text-muted-foreground flex items-center gap-1"><GripVertical className="h-3.5 w-3.5" /> Arraste as fotos para reordenar — a primeira é a capa.</p>}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((im, idx) => (
            <div key={im.id} data-testid={`lot-image-${im.id}`}
              draggable={!readOnly}
              onDragStart={() => setDragId(im.id)}
              onDragOver={(e) => { if (!readOnly) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); onDrop(im.id); }}
              onDragEnd={() => setDragId(null)}
              className={`rounded-xl border overflow-hidden bg-card transition-opacity ${!readOnly ? "cursor-grab active:cursor-grabbing" : ""} ${dragId === im.id ? "opacity-40 border-primary" : "border-border/60"}`}>
              <div className="relative aspect-video bg-muted">
                <img src={`${BACKEND}/api/loteamentos/images/${im.id}/raw`} alt={im.caption || "imagem"} className="w-full h-full object-cover pointer-events-none" loading="lazy" />
                {!readOnly && <span className="absolute top-1.5 left-1.5 rounded-md bg-black/60 text-white text-[10px] font-semibold px-1.5 py-0.5" data-testid={`lot-image-pos-${im.id}`}>{idx === 0 ? "Capa" : `#${idx + 1}`}</span>}
                {!readOnly && (
                  <Button data-testid={`lot-image-del-${im.id}`} variant="destructive" size="icon"
                    className="absolute top-1.5 right-1.5 h-7 w-7" onClick={() => delMut.mutate(im.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="p-2 space-y-1.5">
                {readOnly ? (
                  <>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{im.type === "planta" ? "Planta" : "Foto"}</span>
                    {im.caption && <p className="text-xs">{im.caption}</p>}
                  </>
                ) : (
                  <>
                    <Select defaultValue={im.type || "foto"} onValueChange={(val) => patchMut.mutate({ id: im.id, data: { type: val } })}>
                      <SelectTrigger data-testid={`lot-image-type-${im.id}`} className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="foto">Foto</SelectItem>
                        <SelectItem value="planta">Planta</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input data-testid={`lot-image-caption-${im.id}`} defaultValue={im.caption} placeholder="Descrição (ex: piscina com raia)"
                      className="h-7 text-xs" onBlur={(e) => { if (e.target.value !== im.caption) patchMut.mutate({ id: im.id, data: { caption: e.target.value } }); }} />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  );
}
