import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, ToBeConfirmed, type LegalSectionContent } from "@/components/legal/LegalDocument";
import { PageHero, Section } from "@/components/ui";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Privacy notice",
  description:
    "Draft privacy notice for the Aspire IIT & Medical website: what the enquiry forms collect, why, and who can access it.",
  alternates: { canonical: "/privacy" },
};

// Mirrors src/lib/contracts/enquiry.ts exactly. Update this table whenever the contract changes.
const COLLECTED_FIELDS: { field: string; forms: string; required: string }[] = [
  { field: "Name (the student's name, or your name on the contact form)", forms: "All forms", required: "Required" },
  { field: "Phone number", forms: "All forms", required: "Required" },
  { field: "Email address", forms: "Admissions, Contact", required: "Optional" },
  { field: "Current class", forms: "Quick enquiry, Admissions", required: "Required" },
  { field: "Program of interest", forms: "Quick enquiry, Admissions", required: "Required" },
  { field: "Enquiry type (general enquiry or scholarship interest)", forms: "Quick enquiry", required: "Required" },
  { field: "Preferred district or centre", forms: "Admissions", required: "Optional" },
  { field: "Topic of your question", forms: "Contact", required: "Required" },
  { field: "Message", forms: "Admissions, Contact", required: "Optional" },
  { field: "Your agreement to be contacted about the enquiry", forms: "All forms", required: "Required" },
];

const sections: LegalSectionContent[] = [
  {
    id: "about",
    title: "About this notice",
    body: (
      <>
        <p>
          This notice explains how information you enter in the enquiry forms on this website is handled: the quick
          enquiry form (for example on the home page) and the forms on the{" "}
          <Link href="/admissions" className="text-blue underline">
            admissions page
          </Link>{" "}
          and the{" "}
          <Link href="/contact" className="text-blue underline">
            contact page
          </Link>
          .
        </p>
        <p>
          {siteConfig.name} (&ldquo;Aspire&rdquo;) is the name used on this website. The organisation legally
          responsible for your information, and how to contact it: <ToBeConfirmed />
        </p>
      </>
    ),
  },
  {
    id: "what-we-collect",
    title: "What the enquiry forms collect",
    body: (
      <>
        <p>The forms ask for the following details:</p>
        <div className="overflow-hidden rounded-control border border-line">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Information collected by the enquiry forms</caption>
            <thead className="bg-surface text-[#40536b]">
              <tr>
                <th scope="col" className="px-3 py-2.5 font-bold">
                  Information
                </th>
                <th scope="col" className="px-3 py-2.5 font-bold">
                  Form
                </th>
                <th scope="col" className="px-3 py-2.5 font-bold">
                  Required?
                </th>
              </tr>
            </thead>
            <tbody>
              {COLLECTED_FIELDS.map((row) => (
                <tr key={row.field} className="border-t border-line">
                  <th scope="row" className="px-3 py-2.5 font-semibold text-ink">
                    {row.field}
                  </th>
                  <td className="px-3 py-2.5 text-muted">{row.forms}</td>
                  <td className="px-3 py-2.5 text-muted">{row.required}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>When an enquiry is sent to Aspire, it also includes:</p>
        <ul>
          <li>which form you used;</li>
          <li>the date and time the enquiry, and your agreement to be contacted, were received;</li>
          <li>a reference number, which is shown to you when the enquiry is received.</li>
        </ul>
        <p>
          The forms also contain a hidden spam-check field that people do not see or fill in. The forms do not ask for
          dates of birth, home addresses, identity documents, payment details or academic records.
        </p>
      </>
    ),
  },
  {
    id: "why",
    title: "Why it is collected",
    body: (
      <>
        <p>
          To respond to your enquiry — for example, to discuss the programs, admissions, scholarships or centres you
          asked about.
        </p>
        <p>
          Any other use of enquiry details: <ToBeConfirmed />
        </p>
      </>
    ),
  },
  {
    id: "access",
    title: "Who can access it",
    body: (
      <>
        <p>Enquiries are intended to be seen only by Aspire staff who handle admissions and enquiries.</p>
        <p>
          Service providers that deliver or store enquiries on Aspire&apos;s behalf: <ToBeConfirmed />
        </p>
        <p>
          If online enquiries have not been connected yet, the form tells you so on screen, and your details are not
          sent or stored.
        </p>
      </>
    ),
  },
  {
    id: "protecting-the-form",
    title: "Protecting the form from misuse",
    body: (
      <>
        <p>
          To prevent abuse, the website limits how many enquiries can be sent from one internet connection in a short
          period. To do this, the server briefly uses your IP address; it is not saved with your enquiry.
        </p>
        <p>
          Server logs about enquiries are designed to record only the reference, which form was used, the outcome and
          timing — not your name, phone number, email address or message.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "How long it is kept",
    body: (
      <p>
        How long enquiry details are kept, and how they are deleted: <ToBeConfirmed />
      </p>
    ),
  },
  {
    id: "your-rights",
    title: "Your choices and rights",
    body: (
      <>
        <p>
          How to ask to see, correct or delete your enquiry details: <ToBeConfirmed />
        </p>
        <p>
          Who to contact with privacy questions or concerns: <ToBeConfirmed />
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and analytics",
    body: (
      <p>
        This website does not currently use analytics or advertising tools, tracking cookies, or embedded third-party
        content such as maps or chat widgets. If that changes, this notice will be updated first.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this notice",
    body: (
      <p>
        This notice will carry an effective date once it is approved. Effective date: <ToBeConfirmed />
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <>
      <PageHero
        title="Privacy notice"
        lead="How information from this website's enquiry forms is handled."
        crumbs={[{ label: "Privacy notice" }]}
      />
      <Section>
        <LegalDocument sections={sections} />
      </Section>
    </>
  );
}
