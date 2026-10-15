import { Link } from "react-router-dom";
import { LogoMark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <LogoMark className="h-20 drop-shadow-[0_6px_18px_rgba(0,159,248,0.35)]" />
      <div>
        <div className="text-sm font-semibold text-muted-foreground">404</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">This page drifted off into the cloud</h1>
        <p className="mt-2 text-sm text-muted-foreground">The page you're looking for doesn't exist.</p>
      </div>
      <Button asChild>
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
