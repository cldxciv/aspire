import { ImageResponse } from "next/og";
import { connection, type NextRequest } from "next/server";
import type { ReactNode } from "react";
import { formatNumber } from "@/components/predictor/format";
import { siteConfig } from "@/config/site";
import { format } from "@/i18n/format";
import en from "@/i18n/messages/en/predictor";
import { portalApiError } from "@/lib/auth/responses";
import { predictorCardLimiter } from "@/lib/predictor/card-limit";
import { getPredictorData } from "@/lib/predictor/data";
import { hasSampleData, predictShareCard, scoreTableFor, type ShareCardPrediction } from "@/lib/predictor/engine";
import { getClientIp } from "@/lib/server/request-guards";

/**
 * GET /api/predictor/card?exam=jee-main&mode=score&from=180 — the predictor's share card (PNG,
 * 1200 × 630), also the page's Open Graph image (no query → a generic card).
 *
 * Only the exam and a score/percentile BUCKET come in (D-034: no name, category, state or exact
 * score); the band and options are recomputed here with the same engine, so a crafted URL cannot
 * put arbitrary claims under Aspire's brand. Sample tables → "SAMPLE DATA" watermark; no usable
 * tables (production today) → a "coming soon" card. English only: no Devanagari font is bundled
 * for image rendering.
 *
 * Request time (`connection()`): table visibility follows the running server's environment.
 * At most PREDICTOR_CARD_RATE_LIMIT renders per client IP (429 + Retry-After beyond it).
 */

const WIDTH = 1200;
const HEIGHT = 630;
const NAVY = "#0B2D5B";
const NAVY_2 = "#123A73";
const GOLD = "#F4C44E";
const MUTED = "#C9D8EC";

const t = en.card;
const range = (low: number, high: number, decimals = 0) =>
  format(en.result.range, { low: formatNumber(low, "en", decimals), high: formatNumber(high, "en", decimals) });

function Frame({ sample, children }: { sample: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        padding: "48px 64px",
        backgroundImage: `linear-gradient(120deg, ${NAVY} 0%, ${NAVY_2} 100%)`,
        color: "white",
        fontSize: 28,
      }}
    >
      {sample && (
        <div
          style={{
            position: "absolute",
            top: 250,
            left: 120,
            display: "flex",
            fontSize: 150,
            color: "rgba(255,255,255,0.07)",
            transform: "rotate(-14deg)",
            letterSpacing: 8,
          }}
        >
          SAMPLE DATA
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", color: GOLD, fontSize: 30, letterSpacing: 1 }}>{siteConfig.name}</div>
        {sample && (
          <div
            style={{
              display: "flex",
              background: GOLD,
              color: NAVY,
              fontSize: 22,
              padding: "6px 16px",
              borderRadius: 8,
            }}
          >
            {t.sample}
          </div>
        )}
      </div>
      <div style={{ display: "flex", fontSize: 36, marginTop: 12 }}>{t.title}</div>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, marginTop: 14 }}>{children}</div>
      <div style={{ display: "flex", justifyContent: "space-between", color: MUTED, fontSize: 22 }}>
        <div style={{ display: "flex" }}>{t.disclaimer}</div>
        <div style={{ display: "flex" }}>{new URL(siteConfig.url).host}</div>
      </div>
    </div>
  );
}

function Message({ text }: { text: string }) {
  return <div style={{ display: "flex", fontSize: 34, color: MUTED, marginTop: 40, maxWidth: 1000 }}>{text}</div>;
}

function Prediction({ card, maxScore }: { card: ShareCardPrediction; maxScore: number }) {
  const exam = en.form.exams[card.exam];
  const decimals = card.mode === "percentile" ? 2 : 0;
  const input =
    card.mode === "percentile"
      ? format(t.percentile, { from: formatNumber(card.bucket.low, "en", decimals), to: formatNumber(card.bucket.high, "en", decimals) })
      : format(t.score, {
          from: formatNumber(card.bucket.low, "en"),
          to: formatNumber(card.bucket.high, "en"),
          max: formatNumber(maxScore, "en"),
        });
  const boh = card.exam === "boh";
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", fontSize: 30, color: MUTED }}>{`${exam} · ${input}`}</div>
      <div style={{ display: "flex", fontSize: 24, color: MUTED, marginTop: 16 }}>{`${t.band} · ${en.result.crl[card.exam]}`}</div>
      <div style={{ display: "flex", fontSize: 80, color: GOLD, lineHeight: 1.1 }}>{range(card.crl.low, card.crl.high)}</div>
      <div style={{ display: "flex", fontSize: 22, color: MUTED, marginTop: 14 }}>{boh ? t.optionsBoh : t.options}</div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
        {card.options.length === 0 ? (
          <div style={{ display: "flex", fontSize: 26 }}>{t.noOptions}</div>
        ) : (
          card.options.map((option) => (
            <div key={option.id} style={{ display: "flex", fontSize: 25, marginTop: 4 }}>
              <span style={{ color: GOLD, width: 160, flexShrink: 0 }}>{en.result.tags[option.tag]}</span>
              <span>{option.institute.kind === "Scholarship" ? option.program : `${option.institute.name} · ${option.program}`}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export async function GET(request: NextRequest): Promise<Response> {
  await connection();
  // Rendering is CPU-heavy and junk query parameters bypass caches: cap renders per IP (QA-SEC-M6).
  const limit = predictorCardLimiter.check(getClientIp(request.headers));
  if (!limit.allowed) {
    return portalApiError("rate_limited", "Too many requests. Please wait a little and try again.", {
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }
  const data = getPredictorData();
  const query = request.nextUrl.searchParams;
  const exam = query.get("exam");
  const sample = hasSampleData(data);

  let body: ReactNode;
  if (!data) {
    body = <Message text={t.comingSoon} />;
  } else if (!exam) {
    body = <Message text={t.generic} />;
  } else {
    const card = predictShareCard({ exam, mode: query.get("mode") ?? "score", from: query.get("from") }, data);
    const table = card.status === "ok" ? scoreTableFor(card.exam, data) : undefined;
    body =
      card.status === "ok" && table ? (
        <Prediction card={card} maxScore={table.maxScore} />
      ) : (
        <Message text={card.status === "not-loaded" ? t.comingSoon : t.invalid} />
      );
  }

  return new ImageResponse(<Frame sample={sample}>{body}</Frame>, {
    width: WIDTH,
    height: HEIGHT,
    headers: {
      // No personal data, but sample cards stay out of shared caches.
      "Cache-Control": sample ? "private, max-age=600" : "public, max-age=3600",
      "X-Robots-Tag": "noindex",
    },
  });
}
