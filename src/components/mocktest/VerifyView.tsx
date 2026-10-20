"use client";

import { BadgeCheck, SearchX } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Badge, Button, Notice } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { formatVerifyId, normaliseVerifyId, type ScoreBand } from "@/lib/mocktest/timing";
import type { CertificateVerification } from "@/lib/mocktest/types";
import { formatDate, type MocktestMessages } from "./format";
import { apiJson } from "./hooks";

type Lookup = { id: string; status: "ready"; data: CertificateVerification } | { id: string; status: "notFound" | "error" };

/** "50–59 % of the maximum marks" / "Below 0 %". */
export function scoreBandText(band: ScoreBand, t: MocktestMessages["verify"]): string {
  if (band === "below-0") return t.bandBelow;
  const [low, high] = band.split("-");
  return format(t.bandValue, { low, high });
}

/**
 * Certificate verification (QA-SEC-M6 L7): reads `?id=`, asks GET /api/mocktest/verify/:id and
 * shows only what the server confirms — test, date, score band, and the leaderboard nickname when
 * the student opted in. Never a name.
 */
export function VerifyView({ t }: { t: MocktestMessages }) {
  const locale = useLocale();
  const router = useRouter();
  const search = useSearchParams();
  const tv = t.verify;
  const raw = search.get("id") ?? "";
  const id = raw ? normaliseVerifyId(raw) : null;
  const [typed, setTyped] = useState<string | null>(null);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [reload, setReload] = useState(0);
  const inputId = useId();
  const hintId = useId();

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    apiJson<CertificateVerification>(`/api/mocktest/verify/${id}`).then((response) => {
      if (cancelled) return;
      if (response.ok && response.data) setLookup({ id, status: "ready", data: response.data });
      else setLookup({ id, status: response.status === 404 || response.status === 400 ? "notFound" : "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [id, reload]);

  const value = typed ?? (id ? formatVerifyId(id) : raw);
  const current = lookup && lookup.id === id ? lookup : null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = normaliseVerifyId(value);
    const query = next ? formatVerifyId(next) : value.trim();
    setTyped(null);
    router.replace(`${localePath("/tools/mock-tests/verify", locale)}?id=${encodeURIComponent(query)}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <form onSubmit={submit} className="rounded-card border border-line bg-white p-5 shadow-soft" noValidate>
        <label htmlFor={inputId} className="text-sm font-bold text-navy">
          {tv.label}
        </label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <input
            id={inputId}
            value={value}
            onChange={(event) => setTyped(event.target.value)}
            maxLength={40}
            autoComplete="off"
            spellCheck={false}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            aria-describedby={hintId}
            aria-invalid={raw !== "" && id === null ? true : undefined}
            className="min-h-11 min-w-0 flex-1 rounded-control border border-line bg-white px-3 font-mono uppercase tracking-wider"
          />
          <Button type="submit">{tv.submit}</Button>
        </div>
        <p id={hintId} className={raw !== "" && id === null ? "mt-1.5 text-xs font-semibold text-danger" : "mt-1.5 text-xs text-muted"}>
          {raw !== "" && id === null ? tv.invalid : tv.hint}
        </p>
      </form>

      <div aria-live="polite">
        {id && !current && (
          <p role="status" className="py-4 text-center text-muted">
            {tv.checking}
          </p>
        )}
        {current?.status === "error" && (
          <Notice variant="error" role="alert">
            <p>{t.common.networkError}</p>
            <Button size="sm" className="mt-2" onClick={() => { setLookup(null); setReload((n) => n + 1); }}>
              {t.common.retry}
            </Button>
          </Notice>
        )}
        {current?.status === "notFound" && (
          <Notice variant="warning" title={tv.notFoundTitle}>
            <p className="flex items-start gap-2">
              <SearchX aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>{tv.notFound}</span>
            </p>
          </Notice>
        )}
        {current?.status === "ready" && (
          <section aria-labelledby="mt-verified" className="rounded-card border-2 border-[#9fd8bb] bg-white p-5 shadow-soft">
            <h2 id="mt-verified" className="flex items-center gap-2 text-lg font-extrabold text-navy">
              <BadgeCheck aria-hidden="true" className="size-6 text-success" />
              {tv.verifiedTitle}
            </h2>
            <dl className="mt-4 grid gap-y-2 text-sm">
              <div className="flex flex-wrap justify-between gap-2 border-b border-line/70 py-1.5">
                <dt className="font-semibold text-muted">{tv.test}</dt>
                <dd className="flex flex-wrap items-center gap-2 text-right font-bold text-ink">
                  {current.data.testTitle[locale]}
                  {current.data.sample && <Badge variant="demo">{t.common.sample}</Badge>}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 border-b border-line/70 py-1.5">
                <dt className="font-semibold text-muted">{tv.date}</dt>
                <dd className="text-right font-bold text-ink">{formatDate(current.data.savedAt, locale)}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 border-b border-line/70 py-1.5">
                <dt className="font-semibold text-muted">{tv.band}</dt>
                <dd className="text-right font-bold text-ink">{scoreBandText(current.data.scoreBand, tv)}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 py-1.5">
                <dt className="font-semibold text-muted">{tv.nickname}</dt>
                <dd className="text-right font-bold text-ink">{current.data.nickname ?? <span className="font-normal text-muted">{tv.noNickname}</span>}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-muted">{tv.nameNote}</p>
            <p className="mt-1 text-xs text-muted">{tv.practiceNote}</p>
          </section>
        )}
      </div>
    </div>
  );
}
