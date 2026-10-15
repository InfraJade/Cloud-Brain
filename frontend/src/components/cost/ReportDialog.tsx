import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ReportBuilder } from "./ReportBuilder";

/** "Generate cost report" — the report dialog from spec §5.4. */
export function ReportDialog({ trigger }: { trigger: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate cost report</DialogTitle>
          <DialogDescription>Spend for any date range, with CSV and HTML downloads.</DialogDescription>
        </DialogHeader>
        <ReportBuilder compact />
      </DialogContent>
    </Dialog>
  );
}
