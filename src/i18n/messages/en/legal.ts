/**
 * Namespace "legal" (owner: PAGES-B): privacy notice + terms of use (both DRAFTS pending review
 * by Aspire and legal counsel). English is the source of truth for the key shape; TypeScript
 * then requires the same keys in ../hi/legal.ts. Plain object, no `as const`.
 *
 * `{tbc}` renders the "To be confirmed" badge; `{admissionsLink}` / `{contactLink}` render links;
 * `{siteName}` is the brand name. See src/components/legal/rich-text.tsx.
 */
const legal = {
  draft: {
    title: "Draft — pending review by Aspire and legal counsel",
    body: "This page is a working draft. It has not been approved and will change before the website is published. Items marked “{tbc}” are still open.",
  },
  toc: "On this page",
  tbc: "To be confirmed",
  privacy: {
    meta: {
      title: "Privacy notice",
      description:
        "Draft privacy notice for the Aspire IIT & Medical website: what the enquiry forms and portal accounts collect, why, and who can access it.",
    },
    hero: {
      title: "Privacy notice",
      lead: "How information from this website's enquiry forms and portal accounts is handled.",
    },
    about: {
      title: "About this notice",
      p1: "This notice explains how information you enter in the enquiry forms on this website is handled: the enquiry form on the home page and the forms on the {admissionsLink} and the {contactLink}. It also explains what is stored for student, parent and staff portal accounts (see “Portal accounts”).",
      admissionsLink: "admissions page",
      contactLink: "contact page",
      p2: "{siteName} (“Aspire”) is the name used on this website. The organisation legally responsible for your information, and how to contact it: {tbc}",
    },
    collect: {
      title: "What the enquiry forms collect",
      intro: "The forms ask for the following details:",
      caption: "Information collected by the enquiry forms",
      columnInformation: "Information",
      columnForm: "Form",
      columnRequired: "Required?",
      /** Mirrors src/lib/contracts/enquiry.ts exactly (D-021, D-021a). Update whenever the contract changes. */
      rows: [
        { field: "Name (the student's name, or your name on the contact form)", forms: "All forms", required: "Required" },
        { field: "Parent or guardian name", forms: "Home page enquiry", required: "Required" },
        { field: "Phone number", forms: "All forms", required: "Required" },
        { field: "Email address", forms: "Admissions, Contact", required: "Optional" },
        { field: "Current class", forms: "Home page enquiry, Admissions", required: "Required" },
        { field: "Program or target exam", forms: "Home page enquiry, Admissions", required: "Required" },
        { field: "Preferred district or centre", forms: "Home page enquiry, Admissions", required: "Optional" },
        { field: "Topic of your question", forms: "Contact", required: "Required" },
        { field: "Message", forms: "Home page enquiry, Admissions, Contact", required: "Optional" },
        { field: "Your agreement to be contacted about the enquiry", forms: "All forms", required: "Required" },
      ],
      alsoIntro: "When an enquiry is sent to Aspire, it also includes:",
      also: [
        "which form you used;",
        "the date and time the enquiry, and your agreement to be contacted, were received;",
        "a reference number, which is shown to you when the enquiry is received;",
        "the version of the consent wording you agreed to;",
        "where the enquiry came from: the page you sent it from, the campaign tags in the link you arrived by (if any), the domain of the website that referred you, and — if you came from one of our student tools — which tool (for the rank predictor, also the exam and score range you chose). These details are kept in your browser only for the visit (no cookies) until you send the form.",
      ],
      hidden:
        "The forms also contain a hidden spam-check field that people do not see or fill in. The forms do not ask for dates of birth, home addresses, identity documents, payment details or academic records.",
    },
    why: {
      title: "Why it is collected",
      p1: "To respond to your enquiry — for example, to discuss the programs, admissions, scholarships or centres you asked about.",
      p2: "The parent or guardian's name asked for on the home page form is used only so Aspire knows whom to ask for when responding.",
      p3: "Any other use of enquiry details: {tbc}",
    },
    access: {
      title: "Who can access it",
      p1: "Enquiries are stored on the website's own server as admission leads and are seen only by Aspire staff who handle admissions: a counsellor sees the enquiries assigned to them, a centre manager those for their centre, and administrators all of them. Staff can record notes, calls and follow-ups on an enquiry; every view, change and export is logged. Repeat enquiries from the same phone number are combined into one record.",
      p2: "Service providers that deliver or store enquiries on Aspire's behalf: {tbc}",
      p3: "If online enquiries have not been connected yet, the form tells you so on screen, and your details are not sent or stored.",
    },
    protecting: {
      title: "Protecting the form from misuse",
      p1: "To prevent abuse, the website limits how many enquiries can be sent from one internet connection in a short period. To do this, the server briefly uses your IP address; it is not saved with your enquiry.",
      p2: "Server logs about enquiries are designed to record only the reference, which form was used, the outcome and timing — not your name, phone number, email address or message.",
    },
    /** Mirrors the account store in src/lib/db/connection.ts (D-029). Update whenever the schema changes. */
    portal: {
      title: "Portal accounts",
      p1: "Students, parents and Aspire staff can be given an account to sign in to the portals. Accounts are created by an Aspire administrator; there is no public sign-up.",
      intro: "For each account, the website stores:",
      items: [
        "the name shown in the portal, the login ID and the role (student, parent or administrator);",
        "the password in a scrambled (hashed) form that cannot be turned back into the password — the password itself is never stored;",
        "which student accounts a parent account is linked to;",
        "for each sign-in session: when it started, when it was last used, when it expires, and the description your browser sends about itself (its “user agent”);",
        "a log of account changes — for example an account being created, disabled, renamed or linked — with who made the change and when.",
      ],
      p2: "To stop password guessing, the website counts recent failed sign-in attempts for each login ID and each internet connection (IP address). These are stored only in hashed form and are deleted once the counting period has passed.",
      p3: "Administrators can see the list of accounts and the log of account changes. A parent account can see only the student accounts linked to it. The portals do not currently show timetables, marks or attendance: no such records are connected to this website.",
      p4: "How consent is obtained for accounts of students under 18: {tbc}",
      p5: "How long account details are kept after an account is closed, and how to ask for them to be corrected or deleted: {tbc}",
    },
    retention: {
      title: "How long it is kept",
      p1: "How long enquiry details are kept, and how they are deleted: {tbc}",
    },
    rights: {
      title: "Your choices and rights",
      p1: "How to ask to see, correct or delete your enquiry details: {tbc}",
      p2: "Who to contact with privacy questions or concerns: {tbc}",
    },
    /** Mirrors the M6 student tools (docs/m6-plan.md, D-033–D-035). Update whenever a tool's data flow changes. */
    tools: {
      title: "Student tools",
      intro: "The free student tools handle information as follows:",
      items: [
        "Rank & college predictor: your inputs are used only to calculate your result and are not stored. The link of a shared result card contains only the exam and a score range.",
        "Mock tests: if you are not signed in, your answers and results stay in this browser. If you are signed in with an Aspire student account, your attempts (answers, score and time taken) are saved to your account. When you start a test, the server records the start time (with your account if you are signed in; no internet address is kept) so that leaderboard times are measured fairly. Leaderboards are optional: if you join, your chosen nickname and district are shown publicly with your score and time; a school name you choose to give appears only in the schools table, once at least three students from that school have joined. Saved attempts get a verification code; its public page shows only the test, the date and a score range (and your nickname only if you joined the leaderboard).",
        "Study planner: if you are not signed in, your plan and progress stay in this browser. If you are signed in, your plan, completed blocks, review progress and points are saved to your account. The weekly leaderboard is optional and shows only your chosen nickname.",
        "Rancho (our AI doubt solver): your question and any photo are sent to Anthropic, the AI provider that writes the answer, and are not stored by Aspire. Photos are held only in memory for that one request, and location details are removed from the photo on your device before it is sent. Please do not include faces or names. For signed-in students, the subject and a short topic label of each question are saved to help with revision. To limit use, the website keeps a daily count per internet connection or account, stored only in scrambled (hashed) form and deleted after two days. If you open Rancho with an “Ask Rancho …” button in another tool (such as the predictor, mock tests or study planner), a short summary of that tool's result, such as the exam, a score range or the topics to work on, is sent with your next question. Voice typing (🎤) uses your browser's speech recognition: in Chrome, the browser's own speech service (run by Google) turns what you say into text, and Aspire receives only the text you choose to send, never the audio. Listen (🔊) reads answers aloud with your device's own voices.",
        "Parents linked to a student account can see that student's test results, planner consistency (counts only) and question topics in the parent portal.",
        "Signing out clears the tools' saved data from that browser, which helps on shared computers.",
      ],
      p2: "How long tool data is kept, and how to ask for it to be deleted: {tbc}",
    },
    cookies: {
      title: "Cookies and analytics",
      p1: "This website does not currently use analytics or advertising tools, tracking cookies, or embedded third-party content such as maps or chat widgets. If that changes, this notice will be updated first.",
      p2: "When you sign in to a portal, the website sets one essential cookie (“aspire_session”) that keeps you signed in. It holds a random code, not your password, and cannot be read by scripts on the page. It stops working when you sign out or when it expires — 7 days after you sign in (a session can never last more than 30 days).",
    },
    changes: {
      title: "Changes to this notice",
      p1: "This notice will carry an effective date once it is approved. Effective date: {tbc}",
    },
  },
  terms: {
    meta: {
      title: "Terms of use",
      description: "Draft terms of use for the Aspire IIT & Medical website, pending review by Aspire and legal counsel.",
    },
    hero: {
      title: "Terms of use",
      lead: "The terms that will apply to using this website.",
    },
    /**
     * Neutral skeleton only: no legal entity, address, jurisdiction or obligation is stated
     * until Aspire and its legal counsel supply approved text. Keys are the section anchors.
     */
    sections: {
      about: {
        title: "About these terms",
        covers: "This section will cover who operates this website and when these terms apply.",
      },
      "using-the-website": {
        title: "Using this website",
        covers: "This section will cover acceptable use of the website and its forms.",
      },
      information: {
        title: "Information on this website",
        covers:
          "This section will cover how program, centre, admissions and results information is prepared, verified and updated.",
      },
      enquiries: {
        title: "Enquiries and admissions",
        covers: "This section will cover how enquiries sent through this website are handled.",
      },
      portals: {
        title: "Student and parent portals",
        covers:
          "This section will cover access to the student, parent and staff portals, including who can be given an account and the account holder's responsibilities.",
      },
      "intellectual-property": {
        title: "Intellectual property",
        covers: "This section will cover ownership and permitted use of website content.",
      },
      links: {
        title: "Links to other websites",
        covers: "This section will cover links to websites that Aspire does not control.",
      },
      liability: {
        title: "Liability",
        covers: "This section will cover the limits of responsibility for use of this website.",
      },
      "governing-law": {
        title: "Governing law",
        covers: "This section will cover which laws apply to these terms.",
      },
      changes: {
        title: "Changes to these terms",
        covers: "This section will cover how and when these terms may be updated.",
      },
      contact: {
        title: "Contact",
        covers: "This section will cover how to ask questions about these terms.",
      },
    },
  },
};

export default legal;
