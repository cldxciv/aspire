import { ButtonLink, Container } from "@/components/ui";

/** 404 body shared by the root not-found (adds its own chrome) and the (site) not-found (inherits the layout's chrome). */
export function NotFoundContent() {
  return (
    <div className="py-20">
      <Container className="max-w-xl text-center">
        <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue">404</p>
        <h1 className="mt-2 text-3xl font-extrabold text-navy">We couldn&apos;t find that page</h1>
        <p className="mt-3 text-muted">The page may have moved, or the link may be incorrect.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/">Go to home</ButtonLink>
          <ButtonLink href="/contact" variant="outline">
            Contact us
          </ButtonLink>
        </div>
      </Container>
    </div>
  );
}
