"use client";

import {
  CircleCheck,
  Copy,
  Globe2,
  LoaderCircle,
  RefreshCcw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DomainSetup } from "@/app/dashboard/dashboard-types";

function PageHeading({
  eyebrow,
  title,
  copy,
}: {
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
    </div>
  );
}

export function DomainPanel({
  domain,
  domainSetup,
  domainError,
  domainNotice,
  domainLoading,
  onDomainChange,
  onConnect,
  onCheck,
  onRemove,
}: {
  domain: string;
  domainSetup: DomainSetup | null;
  domainError: string | null;
  domainNotice: string | null;
  domainLoading: boolean;
  onDomainChange: (value: string) => void;
  onConnect: () => void;
  onCheck: () => void;
  onRemove: () => void;
}) {
  return (
    <>
      <PageHeading
        eyebrow="Go live"
        title="Connect the restaurant's domain."
        copy="The old website stays live until these records are changed. Email and booking systems remain untouched."
      />
      <div className="mt-8 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Restaurant domain</CardTitle>
          </CardHeader>
          <CardContent>
            <Label htmlFor="domain">Domain name</Label>
            <Input
              id="domain"
              value={domain}
              onChange={(event) => onDomainChange(event.target.value)}
              placeholder="restaurant.com"
              className="mt-2 h-11"
            />
            {domainError ? (
              <p className="mt-3 text-xs text-destructive" role="alert">
                {domainError}
              </p>
            ) : null}
            {domainNotice ? (
              <p className="mt-3 text-xs text-muted-foreground" role="status">
                {domainNotice}
              </p>
            ) : null}
            <Button
              className="mt-4 w-full"
              onClick={onConnect}
              disabled={!domain || domainLoading}
            >
              {domainLoading ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Globe2 />
              )}
              Add domain
            </Button>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Cornershopdev authorizes the domain for automatic SSL before asking
              for DNS changes.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {domainSetup ? "DNS records to copy" : "What happens next"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {domainSetup ? (
              <div className="space-y-3">
                {domainSetup.records.map((record) => (
                  <div
                    key={`${record.type}-${record.name}`}
                    className="grid grid-cols-[70px_1fr_auto] items-center gap-3 rounded-xl border bg-muted/35 p-3"
                  >
                    <Badge variant="outline">{record.type}</Badge>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {record.name}
                      </p>
                      <p className="truncate font-mono text-xs">
                        {record.value}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() =>
                        navigator.clipboard.writeText(record.value)
                      }
                    >
                      <Copy />
                    </Button>
                  </div>
                ))}
                <div className="grid gap-2 rounded-xl border bg-muted/20 p-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      DNS
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-xs font-medium">
                      {domainSetup.verified ? (
                        <CircleCheck className="size-4 text-emerald-500" />
                      ) : (
                        <RefreshCcw className="size-4 text-muted-foreground" />
                      )}
                      {domainSetup.verified
                        ? "Verified"
                        : "Waiting for records"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      HTTPS
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-xs font-medium">
                      {domainSetup.tls.status === "READY" ? (
                        <CircleCheck className="size-4 text-emerald-500" />
                      ) : domainSetup.tls.status === "ERROR" ? (
                        <TriangleAlert className="size-4 text-amber-500" />
                      ) : (
                        <RefreshCcw className="size-4 text-muted-foreground" />
                      )}
                      {domainSetup.tls.status === "READY"
                        ? "Secure connection ready"
                        : domainSetup.tls.status === "ERROR"
                          ? "Needs attention"
                          : "Certificate pending"}
                    </p>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">
                    {domainSetup.tls.message}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={onCheck}
                  disabled={domainLoading}
                >
                  <RefreshCcw
                    className={domainLoading ? "animate-spin" : ""}
                  />
                  {domainSetup.verified
                    ? "Check HTTPS again"
                    : "Check DNS again"}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={onRemove}
                  disabled={domainLoading}
                >
                  <Trash2 />
                  Remove domain
                </Button>
                <p className="text-xs leading-5 text-muted-foreground">
                  Removing the domain immediately revokes public routing. Your
                  private preview and published version are kept.
                </p>
              </div>
            ) : (
              <ol className="space-y-5 text-sm">
                {[
                  "Cornershopdev authorizes the domain on the production host.",
                  "The exact DNS record appears here for copying into your DNS provider.",
                  "Once DNS resolves, SSL is issued and the new site becomes live.",
                ].map((step, index) => (
                  <li key={step} className="flex gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full border font-mono text-[10px]">
                      {index + 1}
                    </span>
                    <span className="leading-6 text-muted-foreground">
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
