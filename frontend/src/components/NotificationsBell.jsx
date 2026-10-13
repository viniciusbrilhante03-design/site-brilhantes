import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, CheckCheck, TrendingUp, Target, Receipt, Cake, AlertTriangle } from "lucide-react";

const iconFor = (t) => (t === "goal" ? Target : t === "ranking" ? TrendingUp : t === "birthday" ? Cake : t === "installment" ? AlertTriangle : Receipt);

function timeAgo(iso) {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}

export default function NotificationsBell() {
  const qc = useQueryClient();
  const notifQ = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get("/notifications")).data,
    refetchInterval: 30000,
  });
  const readAllMut = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const items = notifQ.data?.items || [];
  const unread = notifQ.data?.unread || 0;

  return (
    <DropdownMenu onOpenChange={(o) => { if (o && unread > 0) readAllMut.mutate(); }}>
      <DropdownMenuTrigger asChild>
        <Button data-testid="notifications-bell" type="button" variant="outline" size="icon" className="h-9 w-9 relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span data-testid="notifications-badge"
              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[hsl(var(--rose))] text-white text-[10px] font-bold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[70vh] overflow-y-auto" data-testid="notifications-menu">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notificações</span>
          {items.length > 0 && (
            <button data-testid="notifications-read-all" onClick={() => readAllMut.mutate()}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <CheckCheck className="h-3.5 w-3.5" /> Marcar lidas
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Sem notificações por enquanto.
          </div>
        ) : (
          items.map((n) => {
            const Icon = iconFor(n.type);
            return (
              <div key={n.id} data-testid={`notification-${n.id}`}
                className={`flex gap-2.5 px-3 py-2.5 text-sm ${n.read ? "" : "bg-primary/5"}`}>
                <Icon className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="leading-snug">{n.message}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</div>
                </div>
                {!n.read && <span className="h-2 w-2 rounded-full bg-[hsl(var(--rose))] mt-1.5 shrink-0" />}
              </div>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
