/**
 * Namespace "forms" (owner: PAGES-A). English is the source of truth for the key shape;
 * TypeScript then requires the same keys in ../hi/forms.ts. Plain object, no `as const`.
 * See src/i18n/README.md.
 *
 * - `shared`: everything both enquiry forms use (option labels, field errors, status notices).
 * - `enquiry`: the admissions / contact (and legacy quick) form, `<EnquiryForm>`.
 * - `hero`: the home hero 3-step form, `<HeroEnquiryForm>`.
 *
 * Field errors are keyed by field (+ "too long"): the contract's English zod messages
 * (src/lib/contracts/enquiry.ts) are mapped onto these on the client (field-errors.ts).
 * The English values below equal the contract's messages word for word.
 */
const forms = {
  shared: {
    /** `{star}` is the red asterisk. */
    requiredNote: "Fields marked {star} are required.",
    /** Suffix after an optional field's label. */
    optionalSuffix: "(optional)",
    /** Key next to the red asterisk in the hero step header. */
    requiredKey: "Required",
    /**
     * `{link}` is the privacy-notice link (text: consentLink). D-039: this sentence is consent
     * version CONSENT_VERSION (src/lib/contracts/enquiry.ts); the server stores the same text from
     * src/lib/server/enquiry-consent.ts. Changing it needs a new version there (a test enforces it).
     * LEGAL REVIEW PENDING.
     */
    consent:
      "I am the student's parent or guardian, or have their permission, and I agree that Aspire may contact me about this enquiry by phone, WhatsApp or email. I have read the {link}.",
    consentLink: "privacy notice",
    honeypotLabel: "Leave this field empty",
    /** Centre select option for "no preference yet". */
    notSureCentre: "Not sure yet",
    /** Centre option label for an unverified (placeholder) centre. Pages build the options. */
    centreUnverified: "{name} (verify availability)",
    sending: "Sending…",
    options: {
      /** Keyed by the contract's CLASS_OPTIONS values. */
      class: {
        "class-6-8": "Class 6–8",
        "class-9": "Class 9",
        "class-10": "Class 10",
        "class-11": "Class 11",
        "class-12": "Class 12",
        dropper: "Dropper",
      },
      /** Keyed by PROGRAM_INTEREST_OPTIONS values. */
      program: {
        jee: "IIT JEE",
        neet: "NEET",
        foundation: "Foundation",
        integrated: "Integrated program",
        "not-sure": "Not sure yet",
      },
      /** Keyed by CONTACT_TOPIC_OPTIONS values. */
      topic: {
        "course-information": "Course information",
        admissions: "Admissions",
        scholarship: "Scholarship",
        "centre-information": "Centre information",
        other: "Other",
      },
      /** Keyed by HERO_CLASS_EXAM_OPTIONS values. Each label must make sense alone (closed select). */
      classExam: {
        "jee-class-11": "IIT JEE – Class 11",
        "jee-class-12": "IIT JEE – Class 12",
        "jee-dropper": "IIT JEE – Dropper",
        "neet-class-11": "NEET – Class 11",
        "neet-class-12": "NEET – Class 12",
        "neet-dropper": "NEET – Dropper",
        "foundation-class-6-8": "Foundation – Class 8",
        "foundation-class-9": "Foundation – Class 9",
        "foundation-class-10": "Foundation – Class 10",
        "not-sure-class-11": "Not sure yet – Class 11",
        "not-sure-class-12": "Not sure yet – Class 12",
        "not-sure-dropper": "Not sure yet – Dropper",
      },
      /** <optgroup> labels, keyed by the option's programInterest. */
      classExamGroup: {
        jee: "IIT JEE",
        neet: "NEET",
        foundation: "Foundation",
        "not-sure": "Not sure yet",
      },
    },
    errors: {
      name: "Enter a name (at least 2 characters)",
      nameTooLong: "Name is too long",
      phone: "Enter a valid 10-digit mobile number",
      email: "Enter a valid email address",
      messageTooLong: "Message must be 1000 characters or fewer",
      consent: "Please confirm you agree to be contacted about this enquiry",
      currentClass: "Select the current class",
      programInterest: "Select a program",
      preferredCentre: "Select a centre from the list",
      guardianName: "Enter the parent or guardian's name",
      guardianNameTooLong: "Parent or guardian name is too long",
      classOrExam: "Select a class / target exam",
      topic: "Select a topic",
      /** Any other field error (should not happen). */
      generic: "Please check this field",
    },
    /** How to reach Aspire when the form cannot deliver ({phone} / {email} are links). */
    directContact: {
      byPhone: "Please contact Aspire directly by phone on {phone}.",
      byEmail: "Please contact Aspire directly by email at {email}.",
      byPhoneOrEmail: "Please contact Aspire directly by phone on {phone} or by email at {email}.",
      onContactPage:
        "Please contact Aspire directly. Official contact details will be listed on this page once verified.",
      seeContactPage: "Please contact Aspire directly — see the {link}.",
      contactPageLink: "contact page",
    },
    /** Waiting time in the rate-limit notice. */
    wait: {
      fewMinutes: "a few minutes",
      oneMinute: "about a minute",
      minutes: "about {count} minutes",
      /** Long waits (the per-mobile-number daily limit). */
      hours: "about {count} hours",
    },
    /** Live-region notices. `{contact}` is the directContact sentence; `{reference}` is shown in bold. */
    status: {
      submitting: "Sending your enquiry, please wait.",
      invalidClientTitle: "Please check the highlighted fields",
      invalidClientOne: "1 field needs attention. Nothing has been sent yet.",
      invalidClientMany: "{count} fields need attention. Nothing has been sent yet.",
      invalidServerTitle: "Some details need correcting",
      invalidServerOne:
        "Your enquiry was not sent. 1 field was not accepted — please check the highlighted fields and try again.",
      invalidServerMany:
        "Your enquiry was not sent. {count} fields were not accepted — please check the highlighted fields and try again.",
      receivedTitle: "Enquiry received",
      receivedBody:
        "Thank you — Aspire has received your enquiry and the admissions team will contact you. Your reference is {reference}. Please keep it for any follow-up.",
      notConfiguredTitle: "Your enquiry has not been sent",
      notConfiguredBody:
        "Your details passed our checks, but online enquiries aren't connected yet, so nothing was sent or stored. {contact} Your details are still in the form.",
      rateLimitedTitle: "Too many attempts",
      rateLimitedBody:
        "Your enquiry was not sent because several enquiries were sent recently from this connection or for this mobile number. Please wait {wait} and try again. Your details are still in the form.",
      rejectedTitle: "Your enquiry couldn't be sent",
      rejectedBody:
        "The request couldn't be verified, so nothing was sent. Please refresh the page and try again. {contact}",
      unavailableTitle: "Online enquiries are unavailable right now",
      unavailableBody: "We couldn't reach the enquiry service, so nothing was sent. Please try again later. {contact}",
      serverErrorTitle: "Something went wrong",
      serverErrorBody:
        "We couldn't confirm that your enquiry was received. Please try again in a few minutes. {contact}",
      timeoutTitle: "No response from the server",
      timeoutBody:
        "The server took too long to reply, so we can't confirm that your enquiry was received. Please try again in a moment. Your details are still in the form.",
      networkTitle: "Connection problem",
      networkBody:
        "We couldn't connect to the server, so your enquiry may not have been sent. Check your internet connection and try again. Your details are still in the form.",
    },
  },

  /** `<EnquiryForm>` (admissions, contact, legacy quick). */
  enquiry: {
    intentLegend: "What would you like to ask about?",
    intentEnquiry: "Enquiry",
    intentScholarship: "Scholarship interest",
    scholarshipNote:
      "Scholarship availability and eligibility are decided by Aspire and confirmed when the team responds.",
    labels: {
      studentName: "Student name",
      yourName: "Your name",
      currentClass: "Current class",
      interestedProgram: "Interested program",
      program: "Program",
      phone: "Phone number",
      studentOrParentPhone: "Student or parent phone",
      email: "Email",
      preferredCentre: "Preferred district or centre",
      message: "Message",
      topic: "What can we help with?",
    },
    placeholders: {
      selectClass: "Select class",
      selectProgram: "Select program",
      selectTopic: "Select a topic",
    },
    hints: {
      quickPhone: "Parent or student mobile number.",
      phone: "10-digit mobile number.",
      centre: "Centre availability is confirmed by Aspire.",
      admissionsMessage: "Anything the admissions team should know. Up to {max} characters.",
      contactMessage: "Your question or any details that will help us respond. Up to {max} characters.",
    },
    submit: "Send enquiry",
    submitScholarship: "Ask about scholarships",
    /** Shown when the visitor followed the College Predictor's CTA (D-039): say what is added. */
    fromPredictor:
      "You came from the rank & college predictor. Your exam and score band (not your exact score) will be added to this enquiry so a counsellor can prepare.",
    referenceNote: "A reference number is shown here only once Aspire has received your enquiry.",
  },

  /** `<HeroEnquiryForm>` (home hero, 3 steps, D-021a). */
  hero: {
    title: "Enquire Now",
    intro: "Get information about our programs, admissions and centres.",
    progressLabel: "Enquiry steps",
    completedSuffix: "(completed)",
    stepLabel: "Step {current} of {total}",
    steps: {
      student: { title: "Student Information", description: "Tell us a bit about the student.", short: "Student" },
      contact: {
        title: "Contact Details",
        description: "Who should Aspire contact about this enquiry?",
        short: "Contact",
      },
      preferences: {
        title: "Preferences",
        description: "Anything else that would help us respond.",
        short: "Preferences",
      },
    },
    labels: {
      studentName: "Student Name",
      classOrExam: "Class / Target Exam",
      guardianName: "Parent / Guardian Name",
      mobile: "Mobile Number",
      preferredCentre: "Preferred Centre",
      message: "Message",
    },
    placeholders: {
      studentName: "Enter student name",
      classOrExam: "Select class / target exam",
      guardianName: "Enter parent / guardian name",
      mobile: "Enter mobile number",
      message: "How can we help you?",
    },
    hints: {
      mobile: "10-digit mobile",
      message: "Up to {max} characters.",
    },
    notConnectedTitle: "Online enquiries aren’t connected yet",
    /** `{check}` is the "Check my details" button label. */
    notConnectedBody: "“{check}” checks what you’ve entered, but nothing is sent to Aspire or stored.",
    notConnectedShort: "Online enquiries aren’t connected yet — details won’t be sent.",
    back: "Back",
    next: "Next Step",
    submit: "Submit Enquiry",
    check: "Check my details",
    checking: "Checking…",
    privacyNote: "We use these details to respond to your enquiry.",
    privacyLink: "Privacy notice",
    startOver: "Make another enquiry",
  },
};

export default forms;
