import { Loader2, RotateCcw } from "lucide-react";
import { ChatThread } from "@/components/chat/ChatThread";
import { Button } from "@/components/ui/button";
import { useChat } from "@/contexts/ChatContext";

export default function Assistant() {
  const { messages, reset, sending, tracking } = useChat();

  return (
    <div className="mx-auto flex h-[calc(100dvh-7.5rem)] max-w-3xl flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <p className="text-sm text-muted-foreground">
          Talks to the AWS ChatOps agent. Provision and delete requests always wait for your confirmation.
        </p>
        <div className="flex items-center gap-2">
          {tracking.length > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Watching {tracking.length} request{tracking.length > 1 ? "s" : ""}
            </span>
          )}
          {messages.length > 0 && (
            <Button variant="outline" size="sm" onClick={reset} disabled={sending}>
              <RotateCcw className="h-3.5 w-3.5" /> New chat
            </Button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <ChatThread variant="page" />
      </div>
    </div>
  );
}
