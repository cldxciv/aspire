# Product Requirements — Aspire IIT & Medical

## 1. Product vision
Create a credible, visually rich, responsive digital front door for Aspire IIT & Medical that supports admissions growth and builds trust with students and parents. The public website should explain the institution, available coaching programmes, verified outcomes, centre options, and the admissions journey. Portal concepts should make student/parent information and administrative workflows easier without compromising privacy.

## 2. Audiences
- Prospective students researching coaching options.
- Parents/guardians comparing programmes, outcomes, locations, and support.
- Current students accessing approved learning and account information.
- Parents/guardians accessing only information they are authorized to see.
- Admissions/admin staff managing enquiries, content, and approved operational data.

## 3. Business goals
- Increase qualified enquiries and admission conversations.
- Make programmes and centre information easy to discover.
- Present verified results and institutional history transparently.
- Improve trust through authentic imagery, clear contact paths, and useful FAQs/resources.
- Provide a foundation for secure student and parent services.

## 4. Non-goals for the first public release
- Replacing a full learning management system unless explicitly scoped.
- Taking payments or storing financial/student sensitive information without approved requirements and secure backend design.
- Publishing unverified results, rankings, testimonials, fees, centre data, or staff credentials.
- Treating prototype-only interactions as live operations.

## 5. Functional requirements
### Public website
- Global navigation, footer, clear primary CTA, mobile menu, and persistent contact/enquiry route.
- Home page: welcoming hero, value proposition, programme discovery, verified achievement feature, learning/support highlights, centre discovery, testimonials only if approved, FAQs, and final CTA.
- About: institutional story, approach, values, leadership/faculty content only when approved.
- Programmes: searchable/filterable programme cards and detail views with target audience, delivery mode, syllabus/highlights, duration/fees only when confirmed, and CTA.
- Results: year/filter navigation and result cards only for approved data; include methodology/context and avoid unsupported superlatives.
- Centres: directory/list and map or map links based on verified addresses; search by district/location; call/directions actions where data exists.
- Admissions: process, enquiry/application form, clear required fields, consent/privacy notice, validation, and explicit success/error states.
- Resources/news: article listing/detail and exam preparation resources, only where content exists.
- Contact: verified phone/email/address/hours, enquiry options, map/directions, and accessible form.
- Legal: privacy notice and terms approved by the organization before production.

### Portal concepts
- Student portal: dashboard shell for timetable, learning resources, announcements, attendance/progress only if the backend supports them.
- Parent portal: authorized learner overview, announcements, and contact/support route only if backend permissions support them.
- Admin: protected dashboard shell for enquiry management and approved content/data operations. Sensitive operations require server authorization and auditability.
- Unavailable data should produce an honest empty or unavailable state, not fake live metrics.

## 6. Content requirements
Owner must supply/approve: logo/brand files, official description/history, programme names and descriptions, centre addresses/phones, verified results and permitted student names/photos, faculty profiles, testimonials/consents, fee details, admissions dates, contact details, privacy/terms, and authentic image permissions.

## 7. Conversion and measurement
- Primary conversion: enquiry/admissions contact.
- Secondary conversions: call, centre directions, programme detail view, callback request.
- Instrument analytics only with approved consent/privacy configuration. Never send sensitive portal data to marketing analytics.

## 8. Success criteria
- Users can find programme, results, and centre information quickly on mobile and desktop.
- Enquiry forms are accessible, validated, secure, and connected to a real destination before being labelled live.
- No unverified content is published as factual.
- Build, tests, accessibility checks, and responsive QA pass or remaining exceptions are documented.
