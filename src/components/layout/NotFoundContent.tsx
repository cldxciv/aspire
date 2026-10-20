import { ButtonLink, Container } from "@/components/ui";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";

/** 404 body shared by the [lang] not-found (adds its own chrome) and the (site) not-found (inherits the layout's chrome). */
export async function NotFoundContent() {
  const [locale, t] = await Promise.all([getLocale(), getMessages("common")]);
  return (
    <div className="py-20">
      <Container className="max-w-xl text-center">
        <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue">{t.notFound.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-extrabold text-navy">{t.notFound.title}</h1>
        <p className="mt-3 text-muted">{t.notFound.body}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <ButtonLink href={localePath("/", locale)}>{t.notFound.home}</ButtonLink>
          <ButtonLink href={localePath("/contact", locale)} variant="outline">
            {t.notFound.contact}
          </ButtonLink>
        </div>
      </Container>
    </div>
  );
}
