import { getMessages } from "@/i18n/server";

/** "Skip to content" link targeting `<main id="main">`, in the current locale. */
export async function SkipLink() {
  const t = await getMessages("common");
  return (
    <a
      href="#main"
      className="sr-only z-50 rounded-control bg-white px-4 py-2 font-bold text-navy focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
    >
      {t.skipLink}
    </a>
  );
}
