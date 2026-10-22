/**
 * Namespace "leadGate" (owner: GATE-CORE; docs/lead-gate-plan.md). English is the source of truth
 * for the key shape; TypeScript requires the same keys in ../hi/leadGate.ts. Plain object, no `as const`.
 *
 * The one-time contact step before a free tool's result (<LeadGateForm>), the up-front note
 * (<LeadGateNote>) and the "Not you?" line under an unlocked result (<LeadGateIdentity>).
 * Hosts load it on the server (`getMessages("leadGate")`) and pass it to these client components.
 *
 * Honesty rules (plan §6): say up front that a number is needed; never say "verify" or "OTP
 * sent"; never pre-tick; never claim "saved" unless the server stored it; "Continue without
 * sharing" only in optional mode, with the same weight as the submit button; while the site shows
 * sample data, say so up front, before any field (`sampleData`), and that sharing does not unlock
 * official data (the privacy notice says the same: legal.privacy.toolContact.sample).
 */
const leadGate = {
  heading: "One quick step to see your result",
  lead:
    "Our tools are free. Before showing results we ask once for a contact number, so Aspire's counsellors can call or WhatsApp your family about courses and admissions.",
  remember:
    "You won't be asked again in this browser for up to 6 months, unless you clear cookies, sign out or choose “Not you?”.",
  /** `{star}` is the red asterisk. */
  requiredNote: "Fields marked {star} are required.",
  fields: {
    studentName: "Student's name",
    /** Hint under the name when it was filled in from a signed-in student or parent account. */
    studentNameFromAccount: "Filled in from your Aspire account. You can change it.",
    phone: "Parent's or guardian's mobile (WhatsApp)",
    phoneHintParent: "Aspire's counsellors may call or WhatsApp this number.",
    phoneHintStudent: "Please enter your parent's or guardian's number. Aspire will speak to them.",
    currentClass: "Class",
    selectClass: "Select class",
    /** Legend of the radio group. */
    submittedBy: "I am the",
    student: "Student",
    parent: "Parent or guardian",
  },
  /** Keyed by the enquiry contract's CLASS_OPTIONS values. */
  classOptions: {
    "class-6-8": "Class 6–8",
    "class-9": "Class 9",
    "class-10": "Class 10",
    "class-11": "Class 11",
    "class-12": "Class 12",
    dropper: "Dropper",
  },
  /**
   * `{link}` is the privacy-notice link (text: consentLink). This sentence is consent version
   * LEAD_GATE_CONSENT_VERSION (src/lib/lead-gate/contract.ts); the server stores the same text from
   * src/lib/server/enquiry-consent.ts (LEAD_GATE_CONSENT_TEXTS). Changing it needs a new version
   * there (a test enforces it). LEGAL REVIEW PENDING.
   */
  consent:
    "I am the student's parent or guardian, or I am the student and my parent or guardian agrees. Aspire may contact the number above by phone or WhatsApp about Aspire's courses and admissions, and may note which free tools are used on this browser (the tool, exam and score range, never answers, questions or photos). I have read the {link}.",
  consentLink: "privacy notice",
  smallPrint:
    "No OTP is sent, so please use a number your family really uses. Aspire never records your answers, questions or photos.",
  /**
   * Shown under `lead`, before the fields, while the site shows sample data (GET /api/lead-gate
   * `sample`; owner decision 21 Oct 2026: gate now, with an honest note). Tools add no copy of their own.
   */
  sampleData:
    "Results on this site currently use sample data while Aspire adds its official data. Sharing your details does not unlock official data: Aspire will contact you with real guidance.",
  /**
   * Shown to a signed-in student or parent account (owner decision 22 Oct 2026): the lead records
   * which account sent the details (its id and role). No "sign in instead" line any more: signing
   * in does not skip this step.
   */
  accountNote: "You're signed in, so Aspire will link these details to your account.",
  /** Submit button per tool (LEAD_GATE_TOOLS). */
  submit: {
    predictor: "Show my rank band",
    "mock-test": "Show my score",
    planner: "Make my plan",
    ask: "Ask Rancho",
  },
  /** Submit button for a planner feature (useLeadGate `usageKey`, LEAD_GATE_USAGE_KEYS). */
  submitFor: {
    countdown: "Show my countdown",
  },
  sending: "Saving…",
  /** Optional mode only. */
  skip: "Continue without sharing",
  /** Browser-only tools, after a failure that is not the visitor's (server, network, rate limit). */
  continueWithoutSaving: "Show my result without saving",
  honeypotLabel: "Leave this field empty",
  /** Field errors. The English values equal the contract's LEAD_GATE_ERRORS (a test enforces it). */
  errors: {
    studentName: "Enter the student's name (at least 2 characters)",
    studentNameTooLong: "Name is too long",
    phone: "Enter a valid 10-digit mobile number",
    phoneImplausible: "Please enter a real mobile number. Aspire may call it.",
    currentClass: "Select the class",
    submittedBy: "Choose whether you are the student or a parent",
    consent: "Please tick the box to agree before continuing",
    generic: "Please check this field",
  },
  status: {
    invalid: "Please check the highlighted fields.",
    rateLimited: "Too many tries from this connection. Please wait a few minutes and try again.",
    phoneCapped: "This number was used several times today. Please try again tomorrow or call Aspire.",
    server: "We couldn't save your details. Nothing was saved. Please try again.",
    network: "We couldn't reach Aspire. Check your internet connection and try again. Nothing was saved.",
    paused: "Sharing details is paused right now. Nothing was saved.",
    staleConsent: "This page is out of date. Please reload it and tick the box again.",
    rejected: "Your details could not be sent from this page. Please reload it and try again.",
  },
  /** <LeadGateNote>: shown before a tool is used, from the live mode (never baked in at build time). */
  note: {
    required: "Free. Before showing results we ask once for a contact number.",
    optional: "Free. You may share a contact number before results, or continue without it.",
  },
  /** <LeadGateIdentity>: under an unlocked result. No name is ever shown (shared computers). */
  identity: {
    shared: "Your contact details are shared on this browser.",
    recordsUse: "Aspire notes which tools you use here (the tool, exam and score range), never your answers.",
    notYou: "Not you?",
    stopContact: "Stop Aspire contacting me",
    confirmStop: "Aspire will stop contacting this number about the tools, and this browser will forget it. Continue?",
    confirmYes: "Yes, stop contact",
    cancel: "Cancel",
    forgotten: "This browser no longer has your contact details.",
    withdrawn: "Done. Aspire will not contact you about the tools, and this browser no longer has your details.",
    failed: "That didn't work. Please try again.",
  },
};

export default leadGate;
