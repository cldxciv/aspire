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
        "Draft privacy notice for the Aspire IIT & Medical website: what the enquiry forms, the free student tools and portal accounts collect, why, and who can access it.",
    },
    hero: {
      title: "Privacy notice",
      lead: "How information from this website's enquiry forms, free student tools and portal accounts is handled.",
    },
    about: {
      title: "About this notice",
      p1: "This notice explains how information you enter in the enquiry forms on this website is handled: the enquiry form on the home page and the forms on the {admissionsLink} and the {contactLink}. It also explains the contact details the free student tools ask for before showing a result (see “Free student tools: contact details before results”), and what is stored for student, parent and staff portal accounts (see “Portal accounts”).",
      admissionsLink: "admissions page",
      contactLink: "contact page",
      p2: "{siteName} (“Aspire”) is the name used on this website. The organisation legally responsible for your information, and how to contact it: {tbc}",
    },
    collect: {
      title: "What the enquiry forms and student tools collect",
      intro: "The enquiry forms, and the contact step of the free student tools, ask for the following details:",
      caption: "Information collected by the enquiry forms and by the student tools' contact step",
      columnInformation: "Information",
      columnForm: "Enquiry form",
      columnRequired: "Required on the enquiry forms?",
      columnTools: "Student tools (before results)",
      /**
       * `forms` / `required` mirror src/lib/contracts/enquiry.ts exactly (D-021, D-021a); `tools`
       * mirrors the lead-gate unlock body in src/lib/lead-gate/contract.ts (docs/lead-gate-plan.md
       * §5.3, §11.3). Update whenever either contract changes.
       */
      rows: [
        {
          field: "Name (the student's name, or your name on the contact form)",
          forms: "All forms",
          required: "Required",
          tools: "Required (the student's name)",
        },
        { field: "Parent or guardian name", forms: "Home page enquiry", required: "Required", tools: "Not asked" },
        {
          field: "Phone number",
          forms: "All forms",
          required: "Required",
          tools: "Required (a parent's or guardian's mobile, WhatsApp)",
        },
        { field: "Email address", forms: "Admissions, Contact", required: "Optional", tools: "Not asked" },
        { field: "Current class", forms: "Home page enquiry, Admissions", required: "Required", tools: "Required" },
        { field: "Program or target exam", forms: "Home page enquiry, Admissions", required: "Required", tools: "Not asked" },
        { field: "Preferred district or centre", forms: "Home page enquiry, Admissions", required: "Optional", tools: "Not asked" },
        { field: "Topic of your question", forms: "Contact", required: "Required", tools: "Not asked" },
        { field: "Message", forms: "Home page enquiry, Admissions, Contact", required: "Optional", tools: "Not asked" },
        {
          field: "Whether you are the student or a parent or guardian",
          forms: "Not asked",
          required: "Not applicable",
          tools: "Required",
        },
        {
          field: "Your agreement to be contacted",
          forms: "All forms (about your enquiry)",
          required: "Required",
          tools: "Required (about Aspire's courses and admissions)",
        },
      ],
      alsoIntro: "When an enquiry is sent to Aspire, it also includes:",
      also: [
        "which form you used;",
        "the date and time the enquiry, and your agreement to be contacted, were received;",
        "a reference number, which is shown to you when the enquiry is received;",
        "the version of the consent wording you agreed to;",
        "where the enquiry came from: the page you sent it from, the campaign tags in the link you arrived by (if any), the domain of the website that referred you, and — if you came from one of our student tools — which tool (for the rank predictor, also the exam and score or percentile range you chose). These details are kept in your browser only for the visit (no cookies) until you send the form.",
      ],
      hidden:
        "The forms and the tools' contact step also contain a hidden spam-check field that people do not see or fill in. They do not ask for dates of birth, home addresses, identity documents, payment details or academic records.",
    },
    why: {
      title: "Why it is collected",
      p1: "To respond to your enquiry — for example, to discuss the programs, admissions, scholarships or centres you asked about.",
      p2: "The parent or guardian's name asked for on the home page form is used only so Aspire knows whom to ask for when responding.",
      p3: "Any other use of enquiry details: {tbc}",
    },
    access: {
      title: "Who can access it",
      p1: "Enquiries are stored on the website's own server as admission leads and are seen only by Aspire staff who handle admissions: a counsellor sees the enquiries assigned to them, a centre manager or area head those for their centre or district, and administrators all of them. Staff can record notes, calls and follow-ups on an enquiry; every view, change and export is logged. Repeat enquiries from the same phone number are combined into one record. Enquiries also come from Aspire's lead forms on Facebook and Instagram (Meta): when you send one, Aspire fetches the answers you gave there from Meta. Aspire staff may also import lists of families who agreed to be contacted. The district or town you give is used only to pass your enquiry to the nearest Aspire team.",
      p2: "Service providers that deliver or store enquiries on Aspire's behalf: {tbc}",
      p3: "If online enquiries have not been connected yet, the form tells you so on screen, and your details are not sent or stored.",
    },
    protecting: {
      title: "Protecting the form from misuse",
      p1: "To prevent abuse, the website limits how many enquiries can be sent, and how often the student tools' contact step can be used, from one internet connection in a short period. To do this, the server briefly uses your IP address; it is not saved with your enquiry or with the details you share in the tools. To limit repeat submissions, the contact step also counts for 24 hours how often each mobile number is entered, using only a scrambled (hashed) form of the number.",
      p2: "Server logs about enquiries are designed to record only the reference, which form was used, the outcome and timing — not your name, phone number, email address or message. Logs about the tools' contact step record only fixed codes, such as which tool asked and the outcome — never your name, mobile number or IP address.",
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
    /**
     * The lead gate (docs/lead-gate-plan.md §11.1, D-043): contact details once before a free tool's
     * result. Owner decision 21 Oct 2026, "on now, with an honest note" (mode `required`), so this
     * describes the step as live; p1 says "may ask" so the notice stays true if LEAD_GATE is later set
     * to `optional` or `off` (critique 0.5). `sample` is rendered only while showPlaceholderContent()
     * is on, the same switch as the form's own `leadGate.sampleData` line; remove or reword it when
     * official predictor tables, mock tests and planner content replace the samples (checklist LG-2).
     * The section title is quoted in other items here ("see “…”"); keep them identical (tested).
     * The button names match leadGate.identity / leadGate.skip.
     */
    toolContact: {
      title: "Free student tools: contact details before results",
      p1: "The free student tools (the rank & college predictor, mock-test scores, the study planner and Rancho) may ask once for contact details before showing a result or an answer, also when you are signed in to an Aspire account. They ask for: the student's name, a parent's or guardian's mobile number (WhatsApp), the class, and whether you are the student or a parent or guardian, plus your consent. Mock tests of an hour or more ask before the test starts; shorter tests ask before showing the score. Plans you have already made on this device, and mock tests started before this step began, stay open.",
      sample:
        "For now, the rank predictor's tables, the mock-test questions and the study planner's topic lists are samples while Aspire adds its official data, and the contact step says so before you share anything. Sharing your details does not unlock official data: Aspire's counsellors use them to contact you with real guidance.",
      p2: "Why: so that Aspire's counsellors can call or WhatsApp your family about Aspire's courses and admissions. The details join the same admission record as the enquiry forms (one record per mobile number), with the same staff access, logging and retention (see “Who can access it” and “How long it is kept”).",
      p3: "With the details we also keep: the date and time, the consent sentence you agreed to (its version and language), the page you were on, the campaign tags of the link you arrived by, the website that referred you, which tool asked, and for the rank predictor the exam and score or percentile range shown. If you share them while signed in to a student or parent account, we also note which account it was (its account ID and whether it is a student or parent account); nothing else is copied from the account.",
      p4: "While this browser holds your details, Aspire may note which tools are used here, merged into one entry per tool and exam (or test) per day, with the page and the number of uses: the rank predictor's exam and score or percentile range; the mock test and a 10-point score range (for example 40–49%); the study planner's exam; and that Rancho was used. We never record your answers, questions, photos, exact scores, category, state, gender or dates. These notes are deleted after 90 days. No notes are made if the tools opened because you sent an enquiry on this website.",
      p5: "No OTP is sent, so please use a number your family really uses. If you are the student, share these details only if your parent or guardian agrees. If someone used your number, tell Aspire and the record will be corrected or deleted.",
      p6: "Under a result the tools unlocked, “Not you?” makes this browser forget your details, and “Stop Aspire contacting me” withdraws your consent: every browser forgets your details, tool notes stop, and Aspire stops contacting you about the tools. Signing out also makes the browser forget them. If the step offers “Continue without sharing”, you can skip it, and this browser remembers that choice for 30 days.",
      p7: "To have your details deleted: {tbc}",
    },
    retention: {
      title: "How long it is kept",
      p1: "How long enquiry details, and contact details shared in the student tools, are kept, and how they are deleted: {tbc} When Aspire deletes a family's details on request, it keeps no name, number or message: only counts that identify no one (such as the stage, source, centre and dates), the Meta lead id and a one-way coded fingerprint of the mobile number, so that an old list cannot bring the details back. Deleting them in Aspire's system does not delete copies kept by Meta (in its Leads Center) or in sheets already downloaded from it.",
    },
    rights: {
      title: "Your choices and rights",
      p1: "How to ask to see, correct or delete your enquiry details, or contact details shared in the student tools: {tbc}",
      p2: "Who to contact with privacy questions or concerns: {tbc}",
    },
    /** Mirrors the M6 student tools (docs/m6-plan.md, D-033–D-035). Update whenever a tool's data flow changes. */
    tools: {
      title: "Student tools",
      intro: "The free student tools handle information as follows:",
      items: [
        "Rank & college predictor: your inputs are used to calculate your result in your browser. If you share contact details before the result (see “Free student tools: contact details before results”), the exam and score or percentile range shown are kept with those details; your exact score, category, state and gender are never kept. The link of a shared result card contains only the exam and a score range.",
        "Mock tests: if you are not signed in, your answers and results are kept only in this browser (the website scores your answers without storing them). If you are signed in with an Aspire student account, your attempts (answers, score and time taken) are saved to your account. When you start a test, the server records the start time (with your account if you are signed in; no internet address is kept) so that leaderboard times are measured fairly. Leaderboards are optional: if you join, your chosen nickname and district are shown publicly with your score and time; a school name you choose to give appears only in the schools table, once at least three students from that school have joined. Saved attempts get a verification code; its public page shows only the test, the date and a score range (and your nickname only if you joined the leaderboard). If you shared contact details to see your score (see “Free student tools: contact details before results”), the test and a 10-point score range are noted with them.",
        "Study planner: if you are not signed in, your plan and progress stay in this browser. If you are signed in, your plan, completed blocks, review progress and points are saved to your account. The weekly leaderboard is optional and shows only your chosen nickname. If you shared contact details to make a plan, the exam is noted with them; your dates and progress stay in this browser.",
        "Rancho (our AI doubt solver): your question and any photo are sent to Anthropic, the AI provider that writes the answer, and are not stored by Aspire. Photos are held only in memory for that one request, and location details are removed from the photo on your device before it is sent. Please do not include faces or names. For signed-in students, the subject and a short topic label of each question are saved to help with revision. To limit use, the website keeps a daily count per internet connection or account, stored only in scrambled (hashed) form and deleted after two days. If you open Rancho with an “Ask Rancho …” button in another tool (such as the predictor, mock tests or study planner), a short summary of that tool's result, such as the exam, a score range or the topics to work on, is sent with your next question. Voice typing (🎤) uses your browser's speech recognition: in Chrome, the browser's own speech service (run by Google) turns what you say into text, and Aspire receives only the text you choose to send, never the audio. Listen (🔊) reads answers aloud with your device's own voices. If you shared contact details to use the tools, Aspire notes that Rancho was used (not your question, its subject or your photo), and your family's questions also count towards the daily limit, kept in the same scrambled form.",
        "Parents linked to a student account can see that student's test results, planner consistency (counts only) and question topics in the parent portal.",
        "Signing out clears the tools' saved data from that browser, which helps on shared computers.",
      ],
      p2: "How long tool data is kept, and how to ask for it to be deleted: {tbc}",
    },
    /** p3 mirrors the aspire_tool_pass cookie and the aspire.leadgate.* browser notes (docs/lead-gate-plan.md §5.1, §6, §11.2). */
    cookies: {
      title: "Cookies and analytics",
      p1: "This website does not use analytics or advertising tools, or embedded third-party content such as maps or chat widgets. It sets only the cookies described below. If that changes, this notice will be updated first.",
      p2: "When you sign in to a portal, the website sets one essential cookie (“aspire_session”) that keeps you signed in. It holds a random code, not your password, and cannot be read by scripts on the page. It stops working when you sign out or when it expires — 7 days after you sign in (a session can never last more than 30 days).",
      p3: "Free tools: after you share contact details (or send an enquiry), the website sets a cookie (“aspire_tool_pass”) that lets the tools show results in this browser without asking again for up to 6 months. It holds a random signed code, not your details, and cannot be read by scripts on the page. It is not needed for the website to work: it links your use of the tools on this browser to the details you shared. It is removed when you choose “Not you?”, sign out, or clear your cookies. The browser also keeps a small note (“aspire.leadgate.v1”, and for 30 days “aspire.leadgate.skip.v1” if you chose to continue without sharing) that holds no personal details.",
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
