import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Clock, GitBranch, ShieldCheck } from "lucide-react";
import { ProvisionForm } from "@/components/cloud/ProvisionForm";
import { RequestBadge } from "@/components/requests/RequestBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRequests } from "@/contexts/RequestsContext";
import type { ResourceType } from "@/lib/api";
import { timeAgo } from "@/lib/format";

const CREATED: Record<ResourceType, string[]> = {
  ec2: [
    "Named <project>-<env>-<n> (n counts up per project and environment)",
    "Default VPC and security group",
    "20 GB encrypted gp3 root volume, IMDSv2 only",
    "Tagged project_code, project_owner, request_id, managed_by=chat-ops",
  ],
  s3: [
    "Named <project>-<env>-<n>, plus an account-wide suffix if the backend sets one",
    "Versioning on, public access blocked",
    "AES-256 encryption",
  ],
};

export default function Provision() {
  const [params] = useSearchParams();
  const [type, setType] = useState<ResourceType>(params.get("resource_type") === "s3" ? "s3" : "ec2");
  const { requests } = useRequests();
  const recent = requests.filter((r) => r.delete_requested_at === undefined).slice(0, 4);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <ProvisionForm type={type} onTypeChange={setType} />

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">What happens next</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>The request is accepted straight away and becomes a Terraform file in the GitOps repo.</span>
              </li>
              <li className="flex gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>CodeBuild runs Terraform. The resource usually appears within a few minutes — you'll follow it on the request tracker.</span>
              </li>
              <li className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>If nothing appears within 20 minutes, the tracker tells you to contact the platform team with your request ID.</span>
              </li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">What gets created ({type === "ec2" ? "EC2" : "S3"})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              {CREATED[type].map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {recent.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Your recent requests</CardTitle>
              <Link to="/requests" className="flex items-center gap-1 text-xs text-primary hover:underline">
                All <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {recent.map((r) => (
                  <li key={r.request_id}>
                    <Link to={`/requests/${encodeURIComponent(r.request_id)}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-[13px]">{r.request_id}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {r.summary} · {timeAgo(r.submitted_at)}
                        </div>
                      </div>
                      <RequestBadge request={r} />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
