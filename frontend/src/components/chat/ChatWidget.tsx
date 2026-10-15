import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Maximize2, MessageCircle, RotateCcw, X } from "lucide-react";
import { LogoAvatar } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { useChat } from "@/contexts/ChatContext";
import { ChatThread } from "./ChatThread";

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const { messages, reset, sending } = useChat();
  const navigate = useNavigate();

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="CLOUD BRAIN assistant"
          className="glass-popover animate-rise fixed inset-x-3 bottom-24 z-50 flex h-[min(600px,calc(100dvh-8rem))] flex-col overflow-hidden rounded-3xl sm:inset-x-auto sm:right-6 sm:w-[420px]"
        >
          <div className="sidebar-surface flex items-center gap-3 px-4 py-3 text-sidebar-foreground">
            <LogoAvatar className="h-9 w-9" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Cloud Assistant</div>
              <div className="text-xs text-sidebar-muted">EC2 · S3 · costs · recommendations</div>
            </div>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-sidebar-muted hover:bg-sidebar-accent hover:text-white"
                onClick={reset}
                disabled={sending}
                aria-label="New conversation"
                title="New conversation"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-sidebar-muted hover:bg-sidebar-accent hover:text-white"
              onClick={() => {
                setOpen(false);
                navigate("/assistant");
              }}
              aria-label="Open full page"
              title="Open full page"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-sidebar-muted hover:bg-sidebar-accent hover:text-white"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            <ChatThread variant="widget" />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close assistant" : "Open assistant"}
        aria-expanded={open}
        className="btn-primary-grad fab-halo fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </>
  );
}
