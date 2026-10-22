"use client";

import { Download } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Notice } from "@/components/ui";
import { format } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import type { ImportJobView } from "@/lib/qb/import/types";

import { ImportList, Panel, smallButton } from "./ImportBlocks";
import { type ImportSummaryView, type ImportViewerInfo, listImports, TEMPLATE_PATHS } from "./import-api";
import { formatUsd, type ImportMessages } from "./import-view";
import { UploadForm } from "./UploadForm";

type Loaded = { summary: ImportSummaryView; viewer: ImportViewerInfo; imports: ImportJobView[] };

/**
 * /admin/questions/import: AI status and today's spend, the upload form, honesty rules, templates
 * and the recent imports. Data comes from GET /api/admin/qb/imports (which re-checks the viewer).
 */
export function ImportHome({ t, locale }: { t: ImportMessages; locale: Locale }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback(
    (result: Awaited<ReturnType<typeof listImports>>) => {
      if (result.ok) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error === "network" ? t.errors.network : result.status === 401 ? t.errors.signIn : result.status === 403 ? t.errors.forbidden : t.errors.generic);
      }
    },
    [t],
  );

  useEffect(() => {
    // Loads once on mount (the list comes from the API, which re-checks the viewer).
    let cancelled = false;
    void (async () => {
      const result = await listImports();
      if (!cancelled) apply(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [apply]);

  if (error) {
    return (
      <Notice variant="error" role="alert">
        {error}
      </Notice>
    );
  }
  if (!data) {
    return (
      <p role="status" className="text-sm text-muted">
        {t.page.loading}
      </p>
    );
  }
  const { summary, viewer, imports } = data;
  return (
    <div className="grid min-w-0 gap-6">
      <Notice variant={summary.ai.enabled ? "success" : "info"} role="status">
        <p className="font-bold">{summary.ai.enabled ? t.ai.on : summary.ai.reason ? t.ai.off[summary.ai.reason] : t.ai.on}</p>
        <p>{format(t.ai.spend, { spent: formatUsd(summary.spentTodayUsd, locale), cap: formatUsd(summary.dailyCapUsd, locale) })}</p>
        {summary.ai.enabled ? <p>{format(t.ai.model, { model: summary.model })}</p> : <p>{t.ai.tabularOnly}</p>}
      </Notice>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel id="import-upload" title={t.form.title}>
          <UploadForm t={t} locale={locale} summary={summary} canAi={viewer.can.importAi} papers={imports} />
        </Panel>
        <div className="grid content-start gap-6">
          <Panel id="import-honesty" title={t.honesty.title}>
            <ul className="grid list-disc gap-2 pl-5 text-sm text-ink">
              {t.honesty.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Panel>
          <Panel id="import-templates" title={t.templates.title} description={t.templates.note}>
            <div className="grid gap-2">
              <a href={TEMPLATE_PATHS.bank} className={smallButton} download>
                <Download aria-hidden="true" className="size-4" />
                {t.templates.bank}
              </a>
              <a href={TEMPLATE_PATHS.key} className={smallButton} download>
                <Download aria-hidden="true" className="size-4" />
                {t.templates.key}
              </a>
            </div>
          </Panel>
        </div>
      </div>
      <Panel id="import-list" title={t.list.title}>
        <ImportList imports={imports} t={t} locale={locale} />
      </Panel>
    </div>
  );
}
