# Lead routing, the 1-hour call rule and Meta Lead Ads (LR)

**Status:** design, revision 2, 22 Oct 2026. It answers both critiques (operations, and security/privacy/integration) point by point in **Appendix A**. Base: release `3394b3d`. Nothing is built yet.
**Proposed decisions:** D-044 – D-048 (§26). **Related:** `docs/crm.md`, `docs/m7-crm-plan.md` (D-037 – D-042), `docs/lead-gate-plan.md` (D-043).

**The owner's words (binding)**
- "so currently the enquiries or the list of the contacts lands to the cheif marketing officer in shimla, he then shares the contact to the area heads. and the details are shared with the executives who then contacts the parents or student. ... there is an excel sheet also which comes from the meta ads."
- "for the areas we can assign the areas based on the roles for area heads and the executives. should be a super admin functionality. the other things also like the calling hours and everything should be a super admin functionality for now it should be 1 hour. for meta access you can guide me what to do. we have the page admin access."
- "for now there are 12 districts in himachal."
- "integrate the meta ads to the CRM itself for realtime updates". And: "no zapier please".

---

# Part 1. For the owner

## 1. The new flow in one picture

**Today:** Meta sheet and enquiries go to the CMO in Shimla, then to the area heads, then to the executives, then to the family. Every hop is a list forwarded on WhatsApp or Excel.

**After:**

```
  Website forms ─┐
  Tool sign-ups ─┤                     ┌──────────────── Aspire CRM ────────────────┐
  Rancho ────────┤                     │ 1. one family = one enquiry (mobile number) │
  Walk-ins ──────┼───────────────────► │ 2. district → area (12 HP districts)        │
  Meta lead ads ─┤  live, in seconds   │ 3. area → centre → next free executive      │
  Meta sheet ────┘  CSV, twice a day   │ 4. the 1-hour call clock starts             │
                                       └──────────────────────┬──────────────────────┘
            ┌─────────────────────────────────────────────────┼──────────────────────────────────┐
     Executive (on the phone)                    Area head                              CMO / super admin
     "Call now" list with countdowns             district dashboard: overdue calls,     whole state: escalations,
     call → log the outcome                      who is away, reassign in one click     unassigned queue, Meta health
     no answer → retry task made for them        (alerted after 1 hour)                 (alerted after 4 working hours)
```

Nobody forwards contact lists any more. If a family is not called in time, the CRM shows it to the area head after 1 hour and to the CMO after 4 working hours. These alerts appear **inside the CRM only**: no SMS or email is sent (D-041).

## 2. Who does what each day

| Person | Opens | Does |
|---|---|---|
| **Executive** (CRM counsellor) | *Today's calls*. Staff land here after signing in. | Works the **Call now** list from the top; each family shows a countdown. Taps the number to call. On returning to the CRM, the "log call" box opens by itself. "No answer", "busy" or "switched off" creates a retry task automatically: 2 working hours later, then the next day. Sets **Away until …** before going on leave. |
| **Area head** (CRM manager) | *Dashboard*, showing their districts | Sees overdue calls per executive, enquiries not yet assigned in their districts, and who is away. Reassigns one lead, or **all uncalled leads of a person** in one click. |
| **CMO** (super admin) | *Dashboard*, showing the whole state | Sees the escalated list (4 working hours), the small **Unassigned** queue (place not recognised), **Unmatched places**, the separate **Tool sign-ups** list, and Meta health ("last lead 3 h ago"). One click on an unmatched place, e.g. "Pathankot → Kangra", maps it and re-routes the waiting families. Until the live Meta link runs, does **Import leads** twice a day (about 2 minutes each). |
| **Owner** (super admin) | *CRM → Settings* | Does the one-time setup (§3), then only changes: new people, new centres, new hours. |

**Changeover day.** Pick a date, for example the Monday after setup. From that day the CMO stops forwarding sheets and everyone works from the CRM. If both run at once, families get called twice.

## 3. One-time setup by the super admin (about an hour)

0. **Our developer:**
   - sets `INTEGRATIONS_SECRET` on the server;
   - runs `npm run auth:super-admin -- list` once;
   - if nobody is listed, runs `npm run auth:super-admin -- grant <your login id>`.
1. **Super admins.** In *Admin → Users* you are marked **Super admin**. Grant the CMO too: *Grant super admin*, then re-enter your password. Ordinary admins keep their current work; for these new settings they can only read.
2. **Areas.** In *CRM → Settings → Areas & people*, the 12 districts are already there, with their Hindi names, main towns and common spellings. Each district shows its serving centre (Solan → Shimla centre, Una → Hamirpur centre, …). Change it if it is wrong.
3. **People.** For each centre, click **Set up from centre** and choose its area head(s) and executives, or use **Create login** right there. In one step they are added to the centre's own district *and* to every district the centre serves. A red badge marks any district that has no executive or no area head. Until you fix it, the serving centre's team covers it automatically.
4. **Calling hours and the 1-hour rule.** In *Settings → Calling hours & speed*, enter the hours when executives are **actually at their phones** (IST). The default rule:
   - first call within **1 working hour**;
   - overdue calls go to the area head at 1 hour, and to the super admins at 4 working hours.
5. **Meta.** Either connect the live link (Part 2) or start with **Import leads** (§8).
6. **Changeover day** (above).

## 4. What we need from you

- [ ] **Areas:** confirm the 12 districts as areas, and the serving centre for the 8 districts that have no centre (proposal in §13.1).
- [ ] **Centres:** which centres are real. All four are still marked as placeholders on the website.
- [ ] **People:** for each person, give:
  - name;
  - mobile number or login id;
  - role (area head or executive);
  - district(s) and centre;
  - for area heads: whether they also take calls.
- [ ] **Calling hours:** the hours executives really work on each weekday, plus holidays (Q1).
- [ ] **Super admins:** you and the CMO? (Q4)
- [ ] **Meta:**
  - answers to Step 0 (§6): who owns the Page and the ad account in Business Settings;
  - who downloads "the excel sheet from meta ads" today.
- [ ] **One header row** from a Leads Center download: only the first line, no family data. It lets us confirm the column names.
- [ ] **Changeover day.**
- [ ] **Meta forms:** may we add the district question, the "parent / student" question and the consent checkbox (Step 12)? Whoever runs the ads must swap the new form into the running ads.

## 5. Questions for you (the default applies until you answer)

| # | Question | Default |
|---|---|---|
| Q1 | Calling hours: the hours executives are at their phones? | Mon–Sat 09:00–19:00 and Sun 10:00–13:00 IST, one schedule for the whole state |
| Q2 | Tool sign-ups (the contact form before tool results, and Rancho): should they start the 1-hour clock? Should that form ask for the district? | No, and no. They go to a separate **Tool sign-ups** list, not the Unassigned queue |
| Q3 | A lead arrives at 18:40 and calling closes at 19:00. Is it due at 09:40 the next day (carry over), or strictly within 1 hour? | Carry over |
| Q4 | Who is super admin? | The first admin automatically, if there is only one; then grant the CMO |
| Q5 | Add the district, parent/student and consent questions to the Meta forms? | Yes (recommended) |
| Q6 | Does a WhatsApp message count as the first contact for the 1-hour rule? | Yes. "Reached the family" is reported separately |
| Q7 | Should resetting passwords of, or disabling, **staff** (CRM) logins be super-admin only? | Yes. Ordinary admins keep doing this for students and parents |
| Q8 | Map border towns outside Himachal (Pathankot, Nangal, Kalka …) to a district? | Not seeded. The CMO maps each one with one click when it first appears |

---

# Part 2. Connect Meta Lead Ads (guide for the owner)

> The CRM connects to Meta **directly**. **No Zapier, Make or any other automation service is used or needed.** Until Meta lets the live connection run, use the CSV import (§8).
>
> Checked against Meta's developer documentation on **22 Oct 2026**, using Graph API **v26.0** (released 29 Jul 2026). Sources are in §9.

**How long it takes.** In the best case, 1–2 hours of setup. If Meta asks for Business Verification or App Review, expect 1–3 weeks or more. The CSV import works from day 1.

## 6. Step 0: before you start (10 minutes)

**Page admin access alone is not enough.** Steps 5 and 9 need **full control of the Business portfolio** that owns the Aspire Page.

1. Open business.facebook.com → **Settings** → **Accounts → Pages**. Is the Aspire Page listed as *owned* by your portfolio?
   - **Yes, and you have full control:** continue.
   - **The Page is in no portfolio:** create a portfolio and claim the Page.
   - **An agency's portfolio owns it:** the agency must either assign leads access to our app (step 9) and give our system user access to the Page, or move the Page to your portfolio.
2. **Accounts → Ad accounts:** is the ad account yours? If an agency owns it, the CRM still receives the leads but not the campaign and ad names. Our page says so.
3. **Who downloads the Meta Excel today?** That person or agency probably holds the access. Involve them.
4. **Developer account.** Registering at developers.facebook.com, and acting as portfolio admin, may ask for phone verification and **two-factor authentication**. Keep your phone at hand.
5. **System user slot.** In *Settings → Users → System users*, check whether an old integration already uses one. A portfolio can only have a limited number.

**On our side first.** Our developer sets `INTEGRATIONS_SECRET`. Then *CRM → Settings → Integrations → Meta Lead Ads* shows:
- **Ready**;
- the **Callback URL** `https://aspire.thechunkmedia.com/api/integrations/meta/webhook`;
- a **Verify token**, visible to super admins only.

## 7. Steps

1. **Create the app.**
   - Go to developers.facebook.com/apps → *Create app*.
   - Name: "Aspire CRM"; enter your email.
   - Use case: a lead-ads or Marketing API use case if one is listed; otherwise **Other**, then app type **Business**.
   - Connect **your Business portfolio**, then create the app.
2. **Basic settings** (*App settings → Basic*).
   - Copy the **App ID** and the **App Secret** (click Show) into our Integrations page.
   - Add the **Page ID** (Page → About → Page transparency).
   - Confirm with your password and **Save**. The secret is never shown again.
   - Set the **Privacy Policy URL** to `https://aspire.thechunkmedia.com/privacy`, and add an icon and a category. Fill any other field Meta marks as required for Live mode.
3. **Webhooks** (*Add product → Webhooks*).
   - Choose **Page**, then *Subscribe to this object*.
   - Paste our Callback URL and Verify token, then **Verify and save**. Our page shows "Verified by Meta at …".
   - In the field list, **Subscribe** to **leadgen** (version v26.0).
   - Optional: press **Test** next to leadgen. Our page shows "Meta sample received ✓". This only needs the App Secret from step 2.
4. **Permissions** (*App Review → Permissions and features*, or *Use cases → Customize*). Make these available: `leads_retrieval`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `pages_manage_ads`, `ads_management`. Meta lists these for reading leads with their ad data and for webhooks.
   - Business apps get **Standard Access**. It covers people with a role on the app and your own portfolio's system user.
   - If the app cannot be assigned to the system user in step 5, also request **Ads Management Standard Access** here. Meta says only apps with that access can be installed for system users.
5. **System user and token** (business.facebook.com → *Settings → Users → System users*).
   - **Add** "aspire-crm" with the role **Employee**, not Admin.
   - **Assign assets:**
     - the app "Aspire CRM" (manage app);
     - the Aspire **Page** with partial access that includes **Ads** (to read leads, Meta requires someone who can advertise on the Page);
     - the **ad account**, view only ("view performance"), for campaign and ad names.
   - **Generate new token:** choose the app Aspire CRM and expiry **Never**, and tick the permissions from step 4. Meta recommends 60-day tokens; if you choose one, or are made to, our page warns you 14 days before it expires.
   - Paste the token **once** into our page under *Access token*, confirm with your password, and Save.
6. **Switch the app to Live** (the toggle at the top of the app dashboard). Meta says leads cannot be read, and the Testing Tool cannot be used, while the app is in Development mode.
   - **6b. Only if Meta blocks Live, or reading a lead later fails with a permission error:**
     1. Complete *Business Verification* (Settings → Security Center). It needs Aspire's own documents, such as GST or registration papers and a business phone or email. Domain verification must use a domain Aspire controls; thechunkmedia.com will not work. Meta says it can take up to 14 business days.
     2. Then in *App Review*, request **Advanced Access** for the step-4 permissions. Attach a screencast of a test lead arriving in the CRM (step 11, with *Accept test leads* on). Meta's guide says to expect a decision within about a week.
     3. Use the CSV import (§8) in the meantime.
7. **Check connection** (button on our page). It shows:
   - whether the token is valid, and its type;
   - its expiry (Never or a date);
   - its permissions;
   - whether it can reach the Page.
   Every problem comes with the exact fix.
8. **Subscribe Page to app** (button on our page). It sends `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen`, then shows "Page subscribed: leadgen ✓".
9. **Leads access** (Business settings → *Integrations → Leads access*; needs full control).
   - Select the Page, then **CRMs** → **Assign CRMs**, tick **Aspire CRM**, and click Assign.
   - Under *People*, make sure the system user has access.
   - If nobody ever customised leads access, all Page admins and connected CRMs already have it. Check anyway.
10. **Page apps setting.** At https://www.facebook.com/settings?tab=applications, the App platform must be on.
11. **Test** at https://developers.facebook.com/tools/lead-ads-testing. You need the Advertiser role or higher on the Page.
    - Click **Create Lead**, then **Track Status**. "Success" means Meta delivered the lead. With dummy data, our page shows "Test lead received at … (dummy data, not added)".
    - To watch a full enquiry arrive, turn on **Accept test leads (24 h)** on our page and enter **your own mobile number**. A dummy test lead then appears in *Enquiries* as "TEST – Meta test lead" with your number. It is routed and timed like a real one, and erased automatically after 24 hours.
    - Alternatively, use **Preview Form** in the Testing Tool to type your own values. Use your own mobile number.
    - Meta allows one test lead per form. Click **Delete Lead** to test again.
12. **Your forms** (with whoever runs the ads).
    - Add a **multiple-choice** question "Which district do you live in?" with the 12 districts plus "Outside Himachal". Facebook pre-fills *city* from profiles, often with Chandigarh or Delhi, so this question is what routes the lead correctly.
    - Add "I am the: parent/guardian · student".
    - Add a **custom disclaimer checkbox** with our consent sentence plus the privacy-notice link: "I am the student's parent or guardian, or have their permission, and I agree that Aspire may contact me about this enquiry by phone, WhatsApp or email." Leads without it are flagged "confirm consent on the first call".
    - Optional: the **Higher intent** form type (it adds a review screen), if your Ads Manager offers it.
    - A published form usually **cannot be edited**: duplicate it, edit the copy, and swap the copy into the running ads.
    - On our page, click **Sync forms**. For each form, check the **field mapping**, especially district/city and the consent checkbox. Set a default programme and centre for single-purpose forms (e.g. "NEET Shimla").
13. **Leads from before the connection.** Download them from Leads Center as CSV and use *Import leads* (§8). Importing the same leads again is safe.

**What goes where.**
- *Into our page:* App ID, App Secret, Page ID, the system-user token, and optionally your mobile number for test leads.
- *Into Meta:* our Callback URL and Verify token.

**If our domain changes** (e.g. to an Aspire domain), repeat step 3 with the new Callback URL. Our page warns when the site address differs from the one Meta verified.

## 8. While Meta review is pending: the CSV import (twice a day)

1. In Meta Business Suite, open **Leads Center** (or the Page's Instant Forms library). Select the leads (e.g. "today"), then **Download → CSV**. Button names may differ slightly.
2. **Do not open the file in Excel first.** Excel turns mobile numbers into `9.19877E+11` and cuts long lead ids. If you only have an Excel file, use *File → Save as → CSV UTF-8*; our importer detects damaged numbers and tells you which rows to fix.
3. In the CRM, go to *Settings* → **Import leads**:
   - choose the file and check the column mapping;
   - choose the consent **"These families filled our Meta lead form"**;
   - leave **"Start the 1-hour call clock for new families"** on;
   - click *Import*.
4. Families already in the CRM are **not reopened or called again**; the import only adds a line to their history. Rows imported before are skipped, so overlapping files are safe. Families that were erased never come back.
5. Do it at the start of the morning shift and of the afternoon shift. Do not use Zapier, Make or similar services.

## 9. What Meta's documentation says (checked 22 Oct 2026)

| Topic | What the docs say | Source |
|---|---|---|
| Versions | v26.0 was released 29 Jul 2026 (expiry "TBD"). v25.0 expires 29 Jul 2028; v24.0 expires 18 Feb 2028. We pin `v26.0` in code; a super admin can override it (allowlist `/^v\d{2}\.0$/`). | [Graph API versions](https://developers.facebook.com/docs/graph-api/changelog/versions/) |
| Verification | Meta sends a GET with `hub.mode` (always `subscribe`), `hub.challenge` (an int to return) and `hub.verify_token` (the string entered in the App Dashboard). | [Webhooks: getting started](https://developers.facebook.com/docs/graph-api/webhooks/getting-started) |
| Signature | Payloads are signed with SHA256 using the **App Secret**, in header `X-Hub-Signature-256`. The page does **not** mention "raw body" or escaped unicode. We verify over the raw request bytes, the only form that reproduces what Meta signed. | Same page |
| Delivery | Meta retries immediately, then less often, for 36 hours; unacknowledged updates are dropped after 36 hours. Batches hold up to 1000 updates, but batching is not guaranteed. The page does not say whether repeated failures disable the subscription, so we always reply 200 fast and dedupe. | Same page |
| Lead webhook setup | Page object, field `leadgen`. Install on the Page with `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen` and a Page token. The Page must have the app installed and the App platform turned on. | [Webhooks for Leads](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-leadgen), [CRM quickstart](https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lead-ads/quickstart/webhooks-integration.md) |
| Payload | `{"object":"page","entry":[{"id","time","changes":[{"field":"leadgen","value":{"leadgen_id","page_id","form_id","adgroup_id","ad_id","created_time"}}]}]}`. Ids only; the answers need a Graph call. | Quickstart |
| Reading a lead | `GET /v26.0/{lead-id}` returns `created_time`, `id`, `ad_id`, `form_id` and `field_data`. Consent checkboxes are **not** in `field_data`; request `custom_disclaimer_responses` (gives `checkbox_key` and `is_checked`). | [Retrieving leads](https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lead-ads/retrieving) |
| Token and permissions | "A Page or User access token requested by a person who can advertise on the ad account and" on the Page. All lead plus ad-level data needs `ads_management`, `leads_retrieval`, `pages_show_list`, `pages_read_engagement` and `pages_manage_ads`. Webhooks also need `pages_manage_metadata`. Bulk reads need `leads_retrieval`. | Retrieving |
| Bulk read | `GET /{form-id}/leads` (or `/{ad-id}/leads`) with `filtering=[{"field":"time_created","operator":"GREATER_THAN","value":<unix>}]`. Operators: `LESS_THAN`, `GREATER_THAN`, `GREATER_THAN_OR_EQUAL`. Paged. | Retrieving |
| Leads access | If leads access was never customised, all Page admins have it. Assign a CRM via *Business settings → Integrations → Leads access → Assign CRMs*. | Retrieving; Meta Business Help [618808448980683](https://www.facebook.com/business/help/618808448980683), [540596413257598](https://en-gb.facebook.com/business/help/540596413257598), [888814071621487](https://www.facebook.com/business/help/888814071621487) |
| App mode | "You can't retrieve leads if your app is in Development mode." The Testing Tool can't be used in developer mode either. | [Lead Ads guide](https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lead-ads), [Testing](https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lead-ads/testing-troubleshooting) |
| Testing Tool | **Create Lead**, **Track Status**, **Delete Lead**; one test lead per form. **Preview Form** lets you "create a lead with custom content". Needs the Page role Advertiser or higher and a Page token. The Webhooks dashboard also has a **Test** button. | Testing |
| Access levels and review | Standard Access covers people with a role on the app. Advanced Access needs Business Verification plus App Review per permission. App Review is required when people without a role on the app use it. | [Access levels](https://developers.facebook.com/docs/graph-api/overview/access-levels/), [Create an app](https://developers.facebook.com/docs/development/create-an-app/), [Other app types](https://developers.facebook.com/documentation/development/create-an-app/other-app-types) |
| System users | A token can belong to an admin or a regular system user. Tokens are non-expiring or 60-day; Meta calls expiring tokens best practice. The app and the system user must belong to the same business. "Only apps with Ads Management API standard access and above can be installed." | [System users: install apps and generate tokens](https://developers.facebook.com/docs/business-management-apis/system-users/install-apps-and-generate-tokens/), [Business Help 503306463479099](https://www.facebook.com/business/help/503306463479099) |
| Rate limits | Leads: 200 × 24 × (leads created in the past 90 days) per Page per 24 h. Error codes 4, 17, 32, 613, 80001 and 80005 (LeadGen BUC). Headers `X-App-Usage` and `X-Business-Use-Case-Usage` (`estimated_time_to_regain_access`). | Retrieving; [Rate limiting](https://developers.facebook.com/docs/graph-api/overview/rate-limiting) |
| Error 100 / subcode 33 | "Unsupported get request": the object does not exist, cannot be loaded because of missing permissions, or does not support the operation. | [Error codes](https://developers.facebook.com/docs/messenger-platform/error-codes) |
| Lead id in exports | The first column, `id`. Strip the leading label (`l:`) before matching; the id has 15–17 digits. | [Find the lead id](https://developers.facebook.com/docs/marketing-api/conversions-api/conversion-leads-integration/how-to-find-the-lead-id) |
| Review times | Business Verification "may take up to 14 business days". App Review: a decision usually "within a week". | [Business Verification help](https://www.facebook.com/business/help/2058515294227817), [App Review submission guide](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide) |

**Not verifiable from public docs** (the design copes either way):
- The full Leads Center CSV column list. The importer is header-driven with a mapping step, and we ask for one real header row.
- Whether the Lead node returns `ad_name`, `adset_name`, `campaign_name`, `is_organic` and `platform`. The client falls back to basic fields on "nonexisting field".
- Whether a same-business system-user token works on a Live Business app without Advanced Access (step 6b covers both cases).
- How long Meta keeps leads.
- How many system users a portfolio may have.
- Whether Graph accepts the token in an `Authorization` header. The client tries the header first and falls back automatically (§18.6).
- Editing published Instant Forms (vendor sources say duplicate; some accounts reportedly can edit since 2026).
- The exact behaviour of the "Higher intent" form type (vendor sources only).

---

# Part 3. Technical design

## 10. Repo facts that shape the design (checked at `3394b3d`)

**Database and schema**
- Feature schemas (`src/lib/db/features/*.ts`) may contain **only** `CREATE TABLE/INDEX IF NOT EXISTS`. They load in plain Node, so they have no runtime imports.
- Core migrations run before them. `crm_leads` does not exist yet at that point, so nothing may `ALTER` it, and per-lead additions live in side tables. `SCHEMA_VERSION` stays 2 (`migration-staff.test.ts`).
- Seed data is therefore written by code, not SQL.
- `withTransaction` uses `BEGIN IMMEDIATE` (`connection.ts:258`), with `busy_timeout = 5000`. Read paths must never open a write transaction.

**Capture and assignment**
- `captureLead` (`capture.ts:127–240`), for an existing family:
  - overwrites consent;
  - reopens a `lost` lead as `new`;
  - calls `autoAssign`.
- Gate captures already keep consent, and never reopen or re-assign.
- `autoAssign` (`leads.ts:539`) returns any existing `assignedTo` without checking that the person is still active.
- The lead-gate contract has no centre or district field. `LEAD_GATE_ASSIGN=auto|none` is in `src/lib/lead-gate/config.ts`. Live runs `LEAD_GATE=required`.

**Lead visibility and reports**
- `scopeClause` (`repo/leads.ts:207`) is shared by the inbox, `leadStats` and `gateSubmissionsByDay`. The last one joins activities to leads without any routing join.

**MCP**
- MCP has **write** tools: `add_lead_note`, `change_lead_stage`, `assign_lead`, `create_lead_task`, `complete_lead_task`, `log_lead_contact`, `create_walkin_lead`.
- It builds its own admin-level viewer. The draft's "MCP CRM tools are read-only" was wrong.

**Accounts**
- `POST /api/admin/users/:id/reset-password` only checks `requireAdmin`, and returns a temporary password.
- `adminUpdateUser` has last-admin protection.
- `scripts/create-admin.mjs` imports `src/lib/db/**`, `auth/identifiers.ts` and `auth/password.ts` (under `--conditions=react-server`).
- Staff land on `/crm` (`src/lib/auth/paths.ts`, `staff: "/crm"`).

**CRM building blocks**
- `createTask` needs a viewer. Call outcomes: `connected`, `no_answer`, `busy`, `switched_off`, `wrong_number`, `call_back_requested`, `message_sent`.
- `CONSENT_METHODS` (`types.ts:95`) is used by Add enquiry's validation.
- Consent sentence v2 (D-039): "I am the student's parent or guardian, or have their permission, …".
- Messages: `hi/crm.ts` is typed `Messages<"crm">`, and `types.ts` derives it from `typeof en/crm`. Nested objects imported into `crm.ts` therefore need **no** edit to `types.ts` or `index.ts`.

**Deploy**
- `deploy/docker-compose.yml` uses `env_file: .env`, so new keys need no compose edit.
- nginx proxies to `127.0.0.1:3011` and appends `X-Forwarded-For` (`TRUSTED_PROXY_HOPS=1`).
- `deploy/aspire-web.cron` already exists and is installed into `/etc/cron.d` as a release step.
- `deploy/backup.sh` uploads only the encrypted DB snapshot, never `.env`.
- The repo does not set nginx `client_max_body_size`, so assume the 1 MB default.

**Request handling**
- Bodies are read with `readBodyWithLimit` (`src/lib/server/request-guards.ts`).
- `src/proxy.ts` exempts only `/api/mcp` from the preview gate.
- The audit sanitizer (`db/audit.ts:24`) drops detail **keys** that match `/pass|hash|token|secret|salt|cookie|credential/i`.

**Content**
- Centres (`src/content/centres.ts`, all placeholders):

  | Centre | District | Serves |
  |---|---|---|
  | `shimla` | Shimla | Shimla, Solan, Sirmaur, Kinnaur |
  | `hamirpur` | Hamirpur | Hamirpur, Una, Bilaspur |
  | `dharamshala` | Kangra | Kangra, Chamba |
  | `kullu` | Kullu | Kullu, Mandi, Lahaul |

- Desk hours are mostly Mon–Sat 8:00–20:00; Kangra is closed on Sunday.

## 11. Super admin (D-044)

**Model**
- A super admin (SA) is an **admin account** with an active row in `superadmin_grants`. It is not a new role and is not stored in the session, so `Session`, `roles.ts`, `sessions.ts` and `proxy.ts` do not change.
- *Effective SA* = an active grant **and** `users.role = 'admin'` **and** the account is enabled. It is checked per request with one indexed `SELECT`.

**Bootstrap without a write lock (H5)**
- `ensureSuperAdminBootstrap(db, now)`:
  1. Return at once if a per-process flag says grants exist.
  2. Otherwise run `SELECT EXISTS (SELECT 1 FROM superadmin_grants)`. If rows exist, set the flag and return. The flag is never set while the table is empty.
  3. Otherwise count enabled admins. **Only if exactly one exists**, open `withTransaction`, re-check, insert a `bootstrap` grant, and audit `auth.super_admin_bootstrap`.
- With zero or two or more admins, nothing happens. Every admin then sees a banner: "No super admin yet. On the server run: `npm run auth:super-admin -- grant <login id>`".
- A revoked grant keeps its row, so bootstrap never fires again.
- Every admin sees "Super admins: Name (set automatically on 23 Oct 2026)" or "(granted by X on …)".

**CLI: `scripts/super-admin.mjs`**
- Commands: `list` (also runs the bootstrap rule), `grant <loginId>`, `revoke <loginId>`, `reset-password <loginId>`.
- `reset-password` works on admin accounts only. It prints a temporary password once, forces a new password at the next sign-in and revokes sessions. It is the recovery path when the only SA forgets their password.
- Imports are the same as `create-admin.mjs`. Audit actor is `null` with `{ via: "cli" }`. It refuses to revoke the last SA.
- Command line: `node --conditions=react-server --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file-if-exists=.env.local scripts/super-admin.mjs list`.
- On the VPS: `docker compose exec app node … scripts/super-admin.mjs list`.
- Integrate adds the npm alias `auth:super-admin`.

**Invariant: at least one effective SA**
1. Revoking the last SA → 409 `last_super_admin`. The check and the update run in the same `BEGIN IMMEDIATE`, so two SAs revoking each other at once cannot leave zero (L4).
2. Disabling or demoting the last SA → 403 `last_super_admin`, in `adminUpdateUser`, checked before `self_disable` and `last_admin`.
3. Grants go only to enabled admin accounts (422 `not_admin`).
4. There is no user-delete API. The `ON DELETE CASCADE` is only a fallback.

**Protected targets (H1)**
- A non-SA actor who resets the password of, disables, or edits (name, login id, role) an effective SA gets 403 `super_admin_target`.
- Staff (CRM) accounts: create, edit, disable and reset-password are **SA only** (`super_admin_only`; Q7). Ordinary admins keep these actions for students and parents.

**Grant and revoke**
- SA only, same origin, and the **current password must be re-entered**. `verifyPassword` runs before the transaction, with a limit of 5 tries per 15 minutes.
- Audited as `auth.super_admin_grant` / `auth.super_admin_revoke` with `{ via: "admin" }`.
- An SA may revoke themselves if another SA remains.

**SA-only actions**
- Areas: create, edit, merge, deactivate, aliases, serving centre, "Set up from centre", re-route, unmatched places.
- People: area memberships and "takes leads".
- Staff logins: create, edit, disable, reset; CRM role, scope and active flag (`PUT /api/crm/staff/:userId`).
- Assignment rules (`PUT /api/crm/rules`) and routing mode.
- Calling hours, speed rule, tiers and retries.
- CSV import.
- Meta settings, secrets and actions, and the Meta inbox list.

**Read-only for others.** Ordinary admins and managers (area heads) can open every settings page and GET endpoint, except secrets and the Meta inbox. Ordinary admins keep everything else they have today, e.g. erasing leads and creating student or parent accounts.

**Badge.** A gold "Super admin" chip appears in Admin → Users (with Grant/Revoke for SAs), in the CRM header, and on settings pages ("You can change these settings" or "Read-only: only a super admin can change this").

## 12. Data model

All new tables are idempotent and have no runtime imports. The features are applied after `crm` in this order: `superadmin`, then `crm_intake`.

`src/lib/db/features/superadmin.ts`:
```sql
CREATE TABLE IF NOT EXISTS superadmin_grants (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  granted_at INTEGER NOT NULL,
  granted_by TEXT,                                    -- NULL = bootstrap / CLI
  granted_via TEXT NOT NULL CHECK (granted_via IN ('bootstrap','cli','admin')),
  revoked_at INTEGER,
  revoked_by TEXT
);
```

`src/lib/db/features/crm-intake.ts`:
```sql
CREATE TABLE IF NOT EXISTS crm_settings (             -- one JSON document per key; version = optimistic lock
  key TEXT PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 64),
  value TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS crm_areas (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64),         -- seed ids: 'kangra', 'lahaul-spiti', …
  name_en TEXT NOT NULL, name_hi TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'district' CHECK (kind IN ('district','custom')),
  default_centre_slug TEXT,                                        -- serving centre when the family named none
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  merged_into TEXT REFERENCES crm_areas (id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS crm_area_centres (                     -- a centre belongs to at most one area
  centre_slug TEXT PRIMARY KEY,
  area_id TEXT NOT NULL REFERENCES crm_areas (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS crm_area_centres_area_idx ON crm_area_centres (area_id);
CREATE TABLE IF NOT EXISTS crm_area_aliases (
  alias_key TEXT PRIMARY KEY,                                      -- normaliseAlias() output
  area_id TEXT NOT NULL REFERENCES crm_areas (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('district','town','spelling','hindi','border')),
  created_at INTEGER NOT NULL,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS crm_area_aliases_area_idx ON crm_area_aliases (area_id);
CREATE TABLE IF NOT EXISTS crm_area_members (                     -- role comes from crm_staff.crm_role
  area_id TEXT NOT NULL REFERENCES crm_areas (id) ON DELETE CASCADE,   -- manager = area head, counsellor = executive
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  centre_slug TEXT,                                                -- optional tie to one centre
  takes_leads INTEGER NOT NULL DEFAULT 0 CHECK (takes_leads IN (0,1)),  -- managers only: also in the call pool
  created_at INTEGER NOT NULL,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (area_id, user_id)
);
CREATE INDEX IF NOT EXISTS crm_area_members_user_idx ON crm_area_members (user_id);
CREATE TABLE IF NOT EXISTS crm_staff_scope (                      -- explicit manager scope (H2); no row = legacy
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('areas')),
  set_at INTEGER NOT NULL,
  set_by TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS crm_staff_availability (               -- "Away until …"
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  away_until INTEGER NOT NULL,
  note TEXT CHECK (note IS NULL OR length(note) <= 80),
  set_at INTEGER NOT NULL,
  set_by TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS crm_lead_routing (
  lead_id TEXT PRIMARY KEY REFERENCES crm_leads (id) ON DELETE CASCADE,
  area_id TEXT REFERENCES crm_areas (id) ON DELETE SET NULL,
  match TEXT CHECK (match IS NULL OR match IN ('centre','district','town','spelling','hindi','border','fuzzy','manual')),
  outcome TEXT NOT NULL CHECK (outcome IN ('area','unknown','ambiguous','outside_hp','empty')),
  place_input TEXT,                                                -- family's words (≤ 60); wiped on erase
  place_key TEXT,                                                  -- normalised (≤ 60), for "Unmatched places"; wiped on erase
  gate_only INTEGER NOT NULL DEFAULT 0 CHECK (gate_only IN (0,1)), -- every arrival so far was a tool sign-up
  routed_at INTEGER NOT NULL,
  routed_by TEXT REFERENCES users (id) ON DELETE SET NULL          -- NULL = automatic
);
CREATE INDEX IF NOT EXISTS crm_lead_routing_area_idx ON crm_lead_routing (area_id);
CREATE INDEX IF NOT EXISTS crm_lead_routing_unmatched_idx ON crm_lead_routing (outcome, place_key);
CREATE TABLE IF NOT EXISTS crm_sla_clocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id TEXT NOT NULL REFERENCES crm_leads (id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('new','reopened','import')),
  source TEXT NOT NULL,
  started_at INTEGER NOT NULL, due_at INTEGER NOT NULL,
  tier1_at INTEGER, tier2_at INTEGER,                              -- NULL = tier switched off
  policy_version INTEGER NOT NULL,
  resolved_at INTEGER,
  resolution TEXT CHECK (resolution IS NULL OR resolution IN ('attempt','closed','erased')),
  first_attempt_at INTEGER,
  first_attempt_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  first_attempt_channel TEXT CHECK (first_attempt_channel IS NULL OR first_attempt_channel IN ('call','whatsapp','stage')),
  assignee_at_due TEXT REFERENCES users (id) ON DELETE SET NULL,   -- who held the lead at due_at (A10)
  work_ms INTEGER,                                                 -- calling-hours time, start → first attempt
  met INTEGER CHECK (met IS NULL OR met IN (0,1)),
  attempts INTEGER NOT NULL DEFAULT 0,
  retries_created INTEGER NOT NULL DEFAULT 0,
  reached_at INTEGER                                               -- first "reached the family" (A6)
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_sla_open_uq ON crm_sla_clocks (lead_id) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_sla_started_idx ON crm_sla_clocks (started_at);
CREATE INDEX IF NOT EXISTS crm_sla_open_idx ON crm_sla_clocks (resolved_at, due_at);
CREATE INDEX IF NOT EXISTS crm_sla_lead_idx ON crm_sla_clocks (lead_id);
CREATE TABLE IF NOT EXISTS crm_external_refs (                    -- idempotency for Meta + CSV; kept after erase
  provider TEXT NOT NULL CHECK (provider IN ('meta','csv')),
  external_id TEXT NOT NULL,                                       -- Meta lead id (digits) | keyed HMAC (M5)
  lead_id TEXT REFERENCES crm_leads (id) ON DELETE SET NULL,
  batch_id TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, external_id)
);
CREATE INDEX IF NOT EXISTS crm_external_refs_lead_idx ON crm_external_refs (lead_id);
CREATE TABLE IF NOT EXISTS crm_erase_suppressions (               -- keyed HMAC of an erased phone (M5)
  phone_hash TEXT PRIMARY KEY,
  key_id TEXT NOT NULL,
  erased_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS crm_import_batches (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('meta_csv','csv')),
  file_name TEXT,                                                  -- basename, ≤ 120
  file_sha256 TEXT,
  consent_basis TEXT NOT NULL,
  start_clock INTEGER NOT NULL CHECK (start_clock IN (0,1)),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','finished')),
  rows_total INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL DEFAULT 0, attached INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0, invalid INTEGER NOT NULL DEFAULT 0,
  actor_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL, finished_at INTEGER
);
CREATE TABLE IF NOT EXISTS crm_meta_inbox (                       -- ids only, never answers
  leadgen_id TEXT PRIMARY KEY CHECK (length(leadgen_id) BETWEEN 5 AND 30),
  page_id TEXT, form_id TEXT, ad_id TEXT, adgroup_id TEXT,
  meta_created_at INTEGER,
  via TEXT NOT NULL CHECK (via IN ('webhook','sync','manual')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','held','processing','imported','duplicate','test','failed','unavailable','ignored')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  lease_until INTEGER,
  last_error TEXT,                                                 -- fixed code, never Graph text
  lead_id TEXT REFERENCES crm_leads (id) ON DELETE SET NULL,
  received_at INTEGER NOT NULL,
  processed_at INTEGER
);
CREATE INDEX IF NOT EXISTS crm_meta_inbox_due_idx ON crm_meta_inbox (status, next_attempt_at);
CREATE TABLE IF NOT EXISTS crm_integration_secrets (
  provider TEXT NOT NULL CHECK (provider IN ('meta')),
  name TEXT NOT NULL CHECK (name IN ('app_secret','access_token','page_token','verify_token')),
  sealed TEXT NOT NULL,                                            -- secret-box v1 envelope
  key_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (provider, name)
);
```

**Setting keys** (`crm_settings`; shapes in `lead-ops-types.ts`):

| Key | Written by | Content |
|---|---|---|
| `calling_hours` | SLA (SA) | `CallingHours` |
| `speed_rule` | SLA (SA) | `SpeedRule` |
| `routing` | ROUTING (SA) | `{ mode: "areas" \| "legacy" }`, default `areas` |
| `areas_seed` | ROUTING (system) | `{ seededAt, version: 1 }`; once present, the seed never runs again |
| `meta_config` | META (SA) | `MetaConfig`: non-secret settings |
| `meta_status` | META (system, not audited) | `MetaStatus` |

**Erase (D-042), extended.** Erasing a lead also:
- wipes `place_input` and `place_key`;
- closes the open clock as `erased`;
- writes `crm_erase_suppressions` (keyed HMAC of the phone, when the key is set);
- keeps `crm_external_refs`, whose `lead_id` stays pointing at the anonymised stub (they hold Meta ids and HMACs only).

## 13. Areas and routing (D-045)

### 13.1 Seed (code, lazy, once)

`ensureAreasSeeded(db, now)` runs on the first routing or areas call:
- a per-process flag skips it after the first run;
- it is guarded by `areas_seed`;
- it runs inside the caller's transaction;
- it writes **no audit and no activity rows** (P5).

The centre map is static in `routing/districts.ts`. A test asserts it matches `district` and `servesDistricts` in `src/content/centres.ts`.

| id | English | Hindi | Centre(s) | Serving centre (default) |
|---|---|---|---|---|
| bilaspur | Bilaspur | बिलासपुर | none | hamirpur |
| chamba | Chamba | चंबा | none | dharamshala |
| hamirpur | Hamirpur | हमीरपुर | hamirpur | hamirpur |
| kangra | Kangra | कांगड़ा | dharamshala | dharamshala |
| kinnaur | Kinnaur | किन्नौर | none | shimla |
| kullu | Kullu | कुल्लू | kullu | kullu |
| lahaul-spiti | Lahaul and Spiti | लाहौल और स्पीति | none | kullu |
| mandi | Mandi | मंडी | none | kullu |
| shimla | Shimla | शिमला | shimla | shimla |
| sirmaur | Sirmaur | सिरमौर | none | shimla |
| solan | Solan | सोलन | none | shimla |
| una | Una | ऊना | none | hamirpur |

### 13.2 Aliases (data; SAs edit them later)

| Area | Seeded aliases (plus the district name in English, Hindi and common spellings) |
|---|---|
| Kangra | Dharamshala, Dharamsala, Dharmshala, धर्मशाला, McLeod Ganj, Palampur (पालमपुर), Nurpur, Jawali, Dehra, Dehra Gopipur, Jawalamukhi, Baijnath, Paprola, Shahpur, Nagrota Bagwan, Indora, Fatehpur, Jaisinghpur, Gaggal, Yol, Sidhbari |
| Kullu | Kulu, Manali (मनाली), Bhuntar, Banjar, Anni, Nirmand, Naggar, Kasol, Manikaran, Shamshi |
| Sirmaur | Sirmour, Nahan (नाहन), Paonta Sahib, Ponta Sahib, पांवटा साहिब, Rajgarh, Sangrah, Shillai, Kala Amb, Dadahu, Renuka |
| Solan | Baddi (बद्दी), Nalagarh, Parwanoo, Kasauli, Arki, Kandaghat, Barotiwala, Subathu, Dagshai, Chail, Kunihar, Waknaghat, Darlaghat |
| Lahaul and Spiti | Keylong, Kyelang, केलांग, Kaza, Tandi, Sissu, Tabo, Lahaul, Lahul, Spiti, Lahaul Spiti, Lahaul & Spiti |
| Kinnaur | Reckong Peo, Recong Peo, Rekong Peo, रिकांग पिओ, Kalpa, Sangla, Nichar, Pooh, Bhabanagar, Tapri, Chitkul |
| Mandi | Sundernagar, Sundarnagar, सुंदरनगर, Jogindernagar, Joginder Nagar, Sarkaghat, Karsog, Gohar, Chachiot, Padhar, Rewalsar, Nerchowk, Thunag, Aut, Janjehli |
| Shimla | Simla, Rampur, Rampur Bushahr, Rohru, Theog, Chopal, Jubbal, Kotkhai, Narkanda, Kumarsain, Chirgaon, Sunni, Mashobra, Kufri, Dhalli, Sanjauli, New Shimla, Totu |
| Bilaspur | Ghumarwin (घुमारवीं), Jhandutta, Naina Devi, Shri Naina Devi Ji, Barmana, Talai, Swarghat |
| Chamba | चम्बा, Dalhousie (डलहौजी), Banikhet, Bharmour, Brahmaur, Tissa, Salooni, Chowari, Bhattiyat, Sihunta, Pangi, Killar, Khajjiar |
| Hamirpur | Nadaun (नादौन), Sujanpur, Sujanpur Tira, Bhoranj, Barsar, Bhota, Galore, Tauni Devi |
| Una | Amb, Gagret, Haroli, Bangana, Mehatpur, Santokhgarh, Chintpurni, Daulatpur Chowk |

- **Short names** shorter than 5 characters get no fuzzy matching, so they are seeded explicitly: Kulu, Una, Amb, Kaza, Aut, Pooh, Yol, Tabo.
- **Ambiguous on purpose** (the result is `ambiguous`, and the lead goes to the Unassigned queue): `dharampur` (Solan/Mandi), `sarahan` (Shimla/Sirmaur), `sainj` (Kullu/Shimla), `udaipur` (Lahaul/Rajasthan).
- **Border towns outside HP** are **not seeded** (Q8). The CMO maps them from *Unmatched places* as kind `border`.

### 13.3 Resolver (`routing/resolve.ts`, pure, client-safe)

`normaliseAlias(s)`:
- applies NFKC and lower case, and turns `&` into "and";
- drops the words district / distt / dist / zila / zilla / जिला / h.p. / hp / himachal / pradesh;
- drops punctuation and spaces.

`resolveDistrict(input, state, index) → AreaResolution` (A8):
1. Empty input → `empty`.
2. `outside` = a `state` was given and does not normalise to himachal/hp.
3. Try the whole input, then each part split on `,` `/` `-` `(` `)` `|` and newlines. An exact key match counts as follows:
   - if `outside`, **only `border` aliases** count;
   - otherwise every kind counts.
   This means "Bilaspur, Chhattisgarh" never lands in HP Bilaspur, while "Pathankot, Punjab" reaches Kangra once the CMO has mapped it.
4. If `outside` and nothing matched → `outside_hp`.
5. Explicit ambiguous keys → `ambiguous`.
6. Latin-only fuzzy match (Damerau-Levenshtein ≤ 1 for lengths 5–8, ≤ 2 for 9 and up):
   - a unique best match → `fuzzy`;
   - a tie → `ambiguous`.
7. Otherwise → `unknown`.

### 13.4 Routing and assignment (areas mode)

**1. Area**
- If the family chose a centre (`lead.centre_slug`), use that centre's area (`match = centre`).
- Else resolve the place: website `district`, Meta `district`/`city` answer, CSV column, or Add enquiry.
- New leads always get a routing row. Existing leads only change area when they had none and the new input resolves.
- `gate_only` is 1 while every arrival so far came through the lead gate.

**2. Assignee** (only when `onLeadArrival` decides to assign; §14.1). The **eligible** people are:
- enabled `staff` accounts;
- with `crm_staff.active`;
- **not away** (`away_until` ≤ now);
- who are counsellors, or managers with `takes_leads = 1`.

Pools are tried in this order:

| Step | Pool | `via` |
|---|---|---|
| A | The area's own eligible members. Prefer people tied to the effective centre (`lead.centre_slug ?? area.default_centre_slug`), then people with no centre tie, then everyone. | `area` |
| B | Borrow (A1): if A is empty, the members of the area that owns `area.default_centre_slug` (one hop, if it is a different, active area), preferring people tied to that centre. | `area_borrow` |
| C | Legacy `pickAssignee` (rules, then centre round-robin). Its pool **excludes** anyone with an area membership, anyone away and anyone disabled. | `rule` / `centre` |
| D | Nobody: the lead stays unassigned. If it has an area, it waits in that area's queue. With no area and `gate_only = 1`, it goes to **Tool sign-ups** (A2). With no area otherwise, it goes to the SA's **Unassigned** queue. | none |

**Picking within a pool is load-aware (A5).** The person with the fewest **open first-call clocks** on leads assigned to them wins. Ties go to the existing round-robin cursor (`crm_rr_cursors`, key `area:<poolAreaId>:<centre|*>`).

**Tool sign-ups.** Gate arrivals with no area are not auto-assigned in areas mode, whatever `LEAD_GATE_ASSIGN` says. They wait in Tool sign-ups (SAs and admins see it), and an SA can bulk-assign them. In legacy mode, today's behaviour is unchanged.

**Legacy mode** (`routing.mode = legacy`) = today's `pickAssignee`. Only the routing row is written.

### 13.5 Who sees which leads (explicit scope, H2)

- **Counsellor:** assigned leads only (unchanged).
- **Manager with a `crm_staff_scope` row (`areas`):**
  - leads assigned to them;
  - leads whose routing area is in `responsibleAreaIds(user)`;
  - leads whose `centre_slug` belongs to those areas.

  `responsibleAreaIds(user)` = the areas they are a manager member of, plus any area with **no active head of its own** whose serving centre belongs to one of those areas (one hop; A1). A manager with **zero areas sees only assigned leads**.
- **Manager without a row (legacy):** unchanged, i.e. `centre_slugs`, and an empty list means all. Every manager created or edited through the new flows gets a row. The Areas page lists legacy managers under "Review: these area heads see all leads" with **Switch to areas**.
- **SQL:** the scope uses `EXISTS (SELECT 1 FROM crm_lead_routing r WHERE r.lead_id = l.id AND r.area_id IN (…))` (M1). It therefore works in the inbox, `leadStats` and `gateSubmissionsByDay` without a join.
- `LeadRow.areaId: string | null` is **required**, and filled by the shared SELECT (`(SELECT area_id FROM crm_lead_routing WHERE lead_id = l.id)`). Every `canSeeLead` caller (`leads.ts`, `tasks.ts`, `capture.ts`) passes it, so tsc catches any that are missed.
- **Query parameters only narrow** the scope (M2): `?area=` outside the viewer's areas → 403; SLA views beyond the viewer's role → 403.
- `assignableMember` for a scoped manager: the target shares a responsible area with the lead, or the legacy centre scope covers it. `crm_staff.centre_slugs` is never edited automatically.

### 13.6 Area administration (SA)

- **Rename; set centres** (moving a centre between areas warns); **set serving centre; edit aliases; deactivate.**
- **Set up from centre** (A1): pick a centre, then its heads, executives and "heads also take calls". Memberships are written to the centre's area and to every area whose serving centre is that centre. Executives are tied to the centre.
- **People:** members with role, centre tie and "takes leads". A red badge marks "no executive" or "no head", with "covered by <serving area> team" when the fallback applies.
- **Merge A into B** (L5): moves aliases, centres and routing rows, and sets `A.active = 0, merged_into = B`. The dialog asks, **for each person in A**: move to B, or remove.
- **Split:** create an area, then move centres and aliases into it.
- **Unmatched places** (A8): the top 50 `place_key`s from routing rows with outcome `unknown`, `ambiguous` or `outside_hp` on non-erased leads in the last 90 days, each with a sample of the typed text, the count and the open count. **Map to district** adds an alias (kind `town`, or `border` when outside HP) and re-routes the open leads with that key.
- **Re-route open unassigned leads:** runs §13.4 on open leads with no area or no assignee. Audited with counts.
- **Test a place name:** runs the resolver.
- **Rules screen** (`/crm/staff`) in areas mode shows: "Rules are only used for leads with no area, or areas with no executives" (A9).

### 13.7 Away, reassign, change area

- **Away until …** (A5): set by the person themselves, by an area head for members of their areas, or by an SA. The maximum is 60 days. It is shown in the header (`AwayToggle`) and on the dashboard.
- **Reassign uncalled leads of X** (A5): area heads (only for members of their areas, and only leads in their scope) or SAs. Scope `uncalled` (open first-call clock) or `open`. Each lead is re-picked from §13.4 excluding X, or given to a chosen person. Audited with counts.
- **Change area** on a lead: an SA, or a manager who can see the lead. If the current assignee is not a member of the new area and the lead is open, a new assignee is picked. Audited (`leadReroute`).

### 13.8 Forms (contract change, D-045)

- Optional `district` field: one of the 12 HP district ids, `outside-hp`, or empty.
- Shown in hero step 3 and in the admissions and contact forms when the centre is empty or "not sure".
- The server re-checks it against `HP_DISTRICT_IDS` and passes it on as `districtInput`.
- Add enquiry (staff) gets the same optional select.
- The lead-gate and Rancho forms are unchanged (Q2).

## 14. Lead arrival pipeline and seams (CORE; frozen after CORE)

### 14.1 `src/lib/crm/arrival.ts`

```ts
export type ArrivalKind = "new" | "reopened" | "repeat" | "attached";
export interface LeadArrival {
  leadId: string;
  kind: ArrivalKind;            // attached = existing family, attach mode (history only)
  source: string;
  gate: boolean;                // lead-gate capture
  manual: boolean;              // staff-entered (walk-in, phone call, …)
  districtInput: string | null; // ≤ 60, the family's words
  stateInput: string | null;
  assignNew: boolean;           // false = LEAD_GATE_ASSIGN=none
  slaClock?: boolean;           // CSV option; undefined = policy
  clockReason?: "import";
  arrivedAt: number;            // clock start: now, or the Meta inbox received_at
  actorId: string | null;
  at: number;
}
export interface ArrivalResult { areaId: string | null; assigneeId: string | null; clockStarted: boolean }
export function onLeadArrival(db: DatabaseSync, a: LeadArrival): ArrivalResult;
```

Steps, all inside the caller's transaction:
1. `lead = findLeadById` (includes `areaId`).
2. `routing = routeLead(db, lead, { districtInput, stateInput, gate, at, actorId })`.
3. **Assign**, when `kind !== "attached"`, `assignNew` is true, and the arrival is not a gate arrival on an existing lead (the existing gate rule):
   - `firstEnquiry` = `kind === "repeat"` and `lead.stage === "new"` and not a gate arrival and the lead has no clock yet.
   - If there is no assignee, **or** `isAssignable(db, assignedTo, { now, kind, firstEnquiry, areaId })` is false, call `autoAssign(db, lead, at, routing, { replace })`. The assignment activity records `from → to` and `via`. `isAssignable` is false when:
     - the person is disabled or inactive (any kind);
     - the person is away (new, reopened or first enquiry);
     - in areas mode, the person is not in the lead's new area (reopened only).
4. **Clock**, when `kind !== "attached"` and (`new` or `reopened` or `firstEnquiry`): `startSlaClock({ …, reason: clockReason ?? (kind === "reopened" ? "reopened" : "new"), arrivedAt, override: slaClock })`.

### 14.2 `captureLead` extensions (CORE, additive)

```ts
interface CaptureLeadInput { /* existing */ district?: string | null; state?: string | null;
  consent: { /* existing */ method?: SystemConsentMethod } }        // "meta_lead_form" | "csv_import"
interface CaptureLeadOptions { /* existing gate, assignNew, account */
  origin?: { provider: "meta" | "csv"; externalId: string; batchId?: string };
  existing?: "merge" | "attach";            // default "merge" = today's behaviour
  attachIfOlderThanHistory?: { createdAt: number | null };  // Meta chronology (H3)
  suppression?: { createdAt: number | null };               // skip erased families (M5)
  submissionMeta?: Meta;                    // ≤ 12 primitive keys, existing key rules
  answers?: string | null;                  // ≤ 1000; submission body when message is empty; erased like a message
  slaClock?: boolean; clockReason?: "import"; arrivedAt?: number;
}
type CaptureLeadResult =
  | { ok: true; leadId: string; isNew: boolean; assigneeId: string | null; attached?: true; alreadyImported?: true }
  | { ok: false; error: "consent_missing" | "invalid_phone" | "invalid_input" | "erased_family" };
```

- **`origin`:**
  - If `(provider, externalId)` already exists, return `alreadyImported` without writing anything.
  - Otherwise insert the ref after the lead is resolved.
  - `repo/intake.hasExternalRef` is exported so META checks it **before** any Graph call (M9).
- **`existing: "attach"`** (H3, A4). For an existing family, this:
  - adds a `submission` activity (meta `attached: true`) and increments `submission_count`;
  - fills empty fields that no staff member has edited;
  - **never** touches consent, stage, `lost_reason`, assignee or message;
  - starts **no** clock.
  For new families it behaves like `merge`.
- **`attachIfOlderThanHistory`.** For Meta leads, switch to attach mode when `createdAt` is earlier than the lead's last `stage_change` to `lost` or `enrolled`, or earlier than its last `consent_withdrawn` activity. CORE provides `repo/activities.lastActivityAt(db, leadId, types)`.
- **`suppression`.** If `keyedHash("phone", phoneE164)` is in `crm_erase_suppressions` and (`createdAt` is null or `createdAt` < `erased_at`), return `erased_family` and write nothing.
- **System consent methods** live in `SYSTEM_CONSENT_METHODS`, separate from `CONSENT_METHODS`, so Add enquiry still rejects them (H4).
- **New sources:** `meta_lead_ad` and `csv_import`. `leadInputFromEnquiry` and `ManualLeadInput` gain `district`.
- `captureLead` and `createManualLead` call `onLeadArrival` instead of `autoAssign`. The counsellor self-assign on manual entry stays.

### 14.3 Seams (stubs written by CORE, replaced by the owning package)

```ts
// @/lib/crm/routing  (owner LR-ROUTING)
export function ensureAreasSeeded(db: DatabaseSync, now: number): void;
export function routeLead(db: DatabaseSync, lead: LeadRow, input: { districtInput: string | null; stateInput: string | null; gate: boolean; at: number; actorId: string | null }): RoutingResult;
export function pickAssigneeForLead(db: DatabaseSync, lead: LeadRow, routing: RoutingResult, now: number, opts?: { exclude?: string[] }): { userId: string; via: "rule" | "centre" | "area" | "area_borrow"; areaId?: string } | null;
export function isAssignable(db: DatabaseSync, userId: string, ctx: { now: number; kind: ArrivalKind; firstEnquiry: boolean; areaId: string | null }): boolean;
export function setUserAreas(db: DatabaseSync, userId: string, areaIds: string[], opts: { actorId: string; now: number }): { ok: true } | { ok: false; error: "unknown_area" | "inactive_area" | "not_staff" };
// @/lib/crm/sla  (owner LR-SLA)
export function startSlaClock(db: DatabaseSync, a: { leadId: string; source: string; gate: boolean; manual: boolean; reason: "new" | "reopened" | "import"; arrivedAt: number; at: number; override?: boolean }): boolean;
export function onContactLogged(db: DatabaseSync, c: { leadId: string; channel: "call" | "whatsapp" | "stage"; outcome: ContactOutcome | null; stage?: LeadStage; actorId: string; via: "ui" | "mcp"; at: number }): void;
export function closeSlaClock(db: DatabaseSync, c: { leadId: string; resolution: "closed" | "erased"; at: number }): void;
export function recomputeOpenClocks(db: DatabaseSync, now: number): number;
// @/lib/crm/meta  (owner LR-META)
export function kickMetaProcessing(reason: "summary" | "status" | "manual"): void; // throttled, never throws
```

**What the stubs do**
- `ensureAreasSeeded` is a no-op.
- `routeLead` returns `{ areaId: null, outcome: "empty", match: null }` and writes nothing.
- `pickAssigneeForLead` = today's `pickAssignee`.
- `isAssignable` = enabled + active + not away.
- `setUserAreas` validates the ids against `crm_areas`, so an unknown id gives `unknown_area` (→ 422, never 500; P2).
- The SLA and META functions are no-ops.
- **No CORE test depends on stub outputs** (P5).

**CORE wiring**
- `logContact` → `onContactLogged` (channel `call` / `whatsapp`).
- `changeStage`:
  - to `contacted` or beyond (not `lost`) → `onContactLogged` with channel `stage`;
  - to `lost` → `closeSlaClock(closed)`.
  The `via` comes from `viewer.channel`, which MCP sets to `"mcp"` (L3).
- `eraseLead` → `closeSlaClock(erased)`, wipes the routing input, writes the suppression.
- There are **no new activity types**: routing and SLA have their own tables, so timeline and meta `toEqual` tests do not move.

## 15. Speed rule, calling hours, escalation (D-046)

```ts
type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
interface CallingHours {
  timezone: "Asia/Kolkata";
  week: Record<Weekday, { open: boolean; start: "HH:MM"; end: "HH:MM" }>;
  closedDates: string[];                                   // YYYY-MM-DD, ≤ 60
}
interface SpeedRule {
  firstCallMinutes: number;                                // working minutes, 5–480, default 60
  countOnly: "any_attempt" | "connected";                  // default any_attempt (Q6)
  tiers: { areaHead: { enabled: boolean; afterMinutes: number };    // default true, 60
           superAdmin: { enabled: boolean; afterMinutes: number } }; // default true, 240; > areaHead; ≤ 4320
  retry: { enabled: boolean; firstAfterMinutes: number; maxAttempts: number }; // default true, 120, 3
  reachedOutcomes: ContactOutcome[];                       // default connected, call_back_requested
  reachedTargetMinutes: number;                            // "reached within": default 600 (≈ one working day)
  sources: string[];  // default hero, admissions, contact, quick, tool, meta_lead_ad, csv_import, referral, other
  leadGate: boolean;  // default false (Q2)
}
```

**Calling hours**
- **Default (Q1):** Mon–Sat 09:00–19:00, Sun 10:00–13:00 IST, no closed dates. The screen is labelled "Hours when executives are at their phones" (A7).
- One window per day; at least one open day; start < end. One statewide schedule; per-area hours can come later.

**Arithmetic** (`sla/calling-hours.ts`, pure, fixed UTC+05:30, iteration capped at 400 days)
- Functions: `isOpenAt`, `nextOpening`, `addWorkingMinutes`, `workingMsBetween`.
- `due = addWorkingMinutes(start, firstCallMinutes)`, which carries the remainder over to the next opening (Q3). `tier1` and `tier2` work the same way.
- Required test cases:
  - 10:00 → 11:00;
  - 18:30 → 09:30 the next open day;
  - 19:30 → 10:00 the next day;
  - Saturday 18:45 → Sunday 10:45;
  - Sunday 12:30 → Monday 09:30;
  - a closed date is skipped.

**Clock lifecycle**
- **Start** (§14.1) when the source is in `sources`.
  - Gate arrivals start a clock only if `leadGate` is on.
  - Walk-in and phone call are excluded by default.
  - The import option overrides the policy.
  - Start time = `arrivedAt`. Meta uses the inbox `received_at`, so a lead processed late is honestly late.
- **Resolve** on the first qualifying **human** contact (`via: "ui"`): any logged call or WhatsApp (or `connected` only, if so set), or a stage move to `contacted` or beyond. It stores `first_attempt_*`, `work_ms`, `met` and `assignee_at_due`.
  - **Assignee at due time** (A10) = the `to` of the last `assignment` activity at or before `due_at`, otherwise the lead's first assignee. Views compute the same for open overdue clocks.
- **After resolution** the clock row keeps counting `attempts` and sets `reached_at` (first reached outcome, or a stage at `counselling_booked` or beyond) until the lead is reached or closed.
- **Retry tasks** (A6). When a human logs `no_answer`, `busy` or `switched_off` before the lead is reached and `retries_created < maxAttempts`, `createFollowUpTask` makes "Call again":
  - the first one due `addWorkingMinutes(now, 120)`;
  - later ones due at the next opening + 60 minutes;
  - assigned to the lead's assignee;
  - skipped if the lead already has an open task.
- **Close:** `lost` → `closed`; erase → `erased`. Reassignment never resets the clock.
- **Policy change:** recomputes due and tier times of open clocks from `started_at` in the same transaction and bumps `policy_version`.
- MCP actions never resolve a clock (L3). Existing leads are not backfilled.

**State** (`src/lib/crm/sla-state.ts`, CORE, pure). `slaStateOf(clock, now)` returns:
- `"due"` before `due_at`;
- `"overdue"` from `due_at` or `tier1_at`;
- `"escalated"` from `tier2_at`;
- `null` if resolved.

**Who is alerted**
- **Tier 1** goes to the lead's **responsible heads**: the area's own heads, else the heads of the serving area, else the SAs. No-area leads go to the SAs.
- **Tier 2** goes to the SAs.
- The area-head strip is a **digest per executive** ("Kangra: 4 overdue · Ravi 3, Meena 1"), not one alert per lead (A7).

**In-app only (D-041); nothing is sent**
- `SlaChip` in the inbox and on lead detail.
- A **Call now** section at the top of *Today's calls*, with countdowns.
- An alert strip under every CRM header. It fetches `/api/crm/sla/summary` on render and every 60 s.
- The tab title shows a count ("(3) Today's calls"); `navigator.setAppBadge(n)` where the browser supports it.
- An optional chime when "Call now" grows: off by default, remembered per browser, wrapped in try/catch (A23).
- Escalation lists on the dashboard.
- **Imported clocks** (`reason = import`) are reported separately from live ones (A7).

```ts
interface SlaSummary {
  generatedAt: string;
  mine: { callNow: number; overdue: number; nextDueAt: string | null; retriesDue: number };
  area?: { areas: { id: string; name: string; overdue: number; unassigned: number }[];
           byExecutive: { userId: string; name: string; overdue: number; away: boolean }[] };            // heads
  sa?: { escalated: number; unassignedNoArea: number; toolSignups: number; unmatchedPlaces: number;
         meta: { pending: number; failed: number; paused: "auth" | "permission" | null; silentHours: number | null } | null };
}
```

## 16. Dashboard (`/crm/dashboard`; managers scoped, admins and SAs see all)

`GET /api/crm/dashboard?from&to&area` → `DashboardData`:
```ts
interface DashboardData {
  range: { from: string; to: string };
  scope: { areaIds: string[] | "all" };
  today: { newLeads: number; bySource: { key: string; count: number }[] };     // IST day, CRM arrival
  now: { callNow: number; overdue: number; escalated: number; unassignedInAreas: number;
         unassignedNoArea?: number; toolSignups?: number; unmatchedPlaces?: number;   // SA / admin only
         away: { userId: string; name: string; until: string }[] };
  speed: { live: SpeedStats; imported: SpeedStats };
  byArea: SpeedRow[]; byExecutive: SpeedRow[]; bySource: SpeedRow[];
  byCampaign: { key: string; total: number; contacted: number; reached: number; enrolled: number; junk: number }[];
  meta?: { lastWebhookAt: string | null; lastImportAt: string | null; pending: number; failed: number;
           paused: "auth" | "permission" | null; silentHours: number | null };    // SA only
}
interface SpeedStats { clocks: number; met: number; metRate: number | null; reached: number; reachedRate: number | null; medianWorkMinutes: number | null }
interface SpeedRow { key: string; label?: string; leads: number; attempted: number; met: number; missed: number;
                     reached: number; medianWorkMinutes: number | null; open: number; overdue: number }
```

- `byExecutive` credits `met` to `first_attempt_by` and charges `missed` to `assignee_at_due` (A10).
- `junk` = leads with a `wrong_number` outcome or `lost_reason` `wrong_number`/`duplicate` (A27).
- Medians are computed in JS.
- Each tile links to a filtered inbox, e.g. `/crm?area=none&assignee=unassigned&stage=open` or `/crm?sla=overdue`.
- Charts follow the dataviz skill and the project tokens.
- **Navigation.** Managers and admins get **Dashboard** in the nav. Reports stays: counsellors use it, it has the CSV export, and the Dashboard header links to it (A9).

## 17. CSV import (D-048; SA only)

**In the browser** (M3, M4)
1. Read the bytes and call `decodeCsvBytes()`, which:
   - recognises UTF-8, UTF-16LE and UTF-16BE BOMs, and NUL patterns (UTF-16 without a BOM);
   - otherwise tries `TextDecoder("utf-8", { fatal: true })`, then falls back to windows-1252 with a warning;
   - flags cells that are only `?` or contain U+FFFD.
2. Parse with a **character state machine**: RFC 4180 quotes and escaped quotes, CRLF/LF, a delimiter sniff (`,` `\t` `;` outside quotes on the header line), trimming, dropping empty rows. No backtracking regexes.
3. Map with `guessTarget(header)` (CORE `intake/fields.ts`; synonyms as in Meta exports: `id`, `created_time`, `form_id`/`form_name`, `ad_*`/`adset_*`/`campaign_*`, `platform`, `is_organic`, `full_name`, `phone_number`, `city`, "which district…", consent checkbox columns, …). The SA can adjust the mapping.
4. Normalise each value:
   - `parseMetaLeadId` accepts only `^(l:)?(\d{15,17})$`, and **never strips other characters** (A3);
   - strip one leading `'` and a trailing `.0`;
   - `p:+91…` → `+91…`;
   - class and programme normalisers;
   - `matchCentre`.
5. **Excel-damage detector** (`excel-damage.ts`):
   - scientific notation (`E+`) in id or phone columns;
   - ids of 15 digits ending in `00`;
   - mojibake (garbled characters).
   Affected rows are blocked (`damaged`). A banner says: "This file went through Excel and some numbers are damaged. Download the CSV straight from Leads Center and don't open it in Excel."
6. Build `ImportRowInput` objects (mapped values only), and send them in **chunks of ≤ 250 rows and ≤ 256 KB** (under nginx's 1 MB default).

```ts
interface ImportRowInput {
  row: number;
  metaLeadId?: string | null; createdTime?: string | null; formId?: string | null; formName?: string | null;
  adId?: string | null; adName?: string | null; adsetName?: string | null; campaignId?: string | null; campaignName?: string | null;
  platform?: string | null; isOrganic?: boolean | null;
  contactName?: string | null; studentName?: string | null; guardianName?: string | null; phone?: string | null; email?: string | null;
  district?: string | null; state?: string | null; currentClass?: string | null; programInterest?: string | null; centre?: string | null;
  submittedBy?: "student" | "parent" | null; consentChecked?: boolean | null; answers?: string | null;
  damaged?: ("phone_sci" | "id_sci" | "id_truncated" | "text_mojibake")[];
}
type ImportRowStatus = "created" | "attached" | "already_imported" | "erased_family" | "invalid_phone" | "missing_phone"
  | "damaged" | "consent_mismatch" | "duplicate_in_file";
```

**Flow**
1. **Preview:** `POST /api/crm/import/preview { rows ≤ 250, consentBasis? }`. A dry run with no writes. The server re-validates every value and returns per-row status, the resolved area and a masked phone (`+91 98•••••210`). The client totals the chunks and shows the counts:
   - valid, invalid, damaged;
   - already imported, existing families (attach), **lost families that reappear**;
   - unknown place, and counts per area.
2. **Consent basis** (required, H4):
   - **"These families filled our Meta lead form"**: method `meta_lead_form`; `textVersion` `meta:<form_id>` (`:cb` when the consent column is ticked); `at = created_time`; source `meta_lead_ad`. **Only rows with a valid Meta lead id**; any other row gets `consent_mismatch`.
   - **"They agreed to be contacted (in person / phone / written / message)"**: source `csv_import`, `staff-recorded` plus the method.
   - No basis means no import.
3. **"Start the 1-hour call clock for new families"**, on by default (clock reason `import`).
4. `POST /api/crm/import/batches` creates the batch (audit `crm.import_start`). Then `POST …/batches/:id/rows` for each chunk, **each in its own transaction**. Finally `POST …/batches/:id/finish` totals the batch (audit `crm.import` with counts).
   - Every row goes through `captureLead(input, now, { origin, existing: "attach", suppression: { createdAt }, submissionMeta: { importBatch, metaCreatedAt?, formId?, adId?, campaignId? }, answers, slaClock, clockReason: "import" })`.
   - **Resuming** after a dropped connection is safe because of the external refs.
5. `GET /api/crm/import/batches` lists the history (admins can read it).

**Idempotency** (A4, M5)
- A row with a valid Meta id uses `(meta, <id>)`, so ids already imported by the webhook or CSV are skipped.
- Other rows use `(csv, keyedHash("csv-ref", phoneE164 | createdTime | formId))`, with **no file fingerprint**, so overlapping cumulative sheets only add new rows.
- Existing families are attached, never reopened. The result lists "N families marked lost appear again" with links to check by hand.

**Limits:** 20 batches per hour per user; 400 row-chunks per hour; 5,000 rows and 60 columns per file; cells ≤ 2,000 characters.

**XLSX:** not parsed in this release (see Appendix A, A3).

## 18. Live Meta (D-047)

### 18.1 `GET /api/integrations/meta/webhook`
- Requires `hub.mode === "subscribe"` and a `hub.verify_token` that constant-time-equals the opened `verify_token`.
- Then returns `200 text/plain` with `hub.challenge` (only `[0-9A-Za-z_-]{1,128}`, otherwise 400). Anything else → 403.
- Records `lastVerifyAt` and `verifiedSiteUrl`.
- Headers: `Cache-Control: no-store`, `X-Robots-Tag: noindex`.

### 18.2 `POST /api/integrations/meta/webhook`
1. `INTEGRATIONS_SECRET` missing, or the app secret is missing or cannot be opened → 503 (nothing can be verified).
2. Read the body with `readBodyWithLimit` (2 MB) → 413 if larger (L1).
3. Per-IP limiter: 600 per minute.
4. Signature: the header must match `^sha256=[0-9a-f]{64}$`, otherwise 401. Compute HMAC-SHA256(appSecret, raw bytes) and compare with `timingSafeEqual` on equal-length buffers. On failure: 401, `lastSignatureFailureAt`, a fixed-code log, nothing processed.
5. Quote large ids before `JSON.parse`: `/"(leadgen_id|page_id|form_id|ad_id|adgroup_id)"\s*:\s*(\d{6,})/g` → `"$1":"$2"`. A parse error → 400.
6. For each `object === "page"` change with `field === "leadgen"`:
   - **First** detect Meta's dashboard sample (all-4s ids) → `lastTestAt`, and stop (M7).
   - If `page_id` differs from `config.pageId` → counted as `ignored`.
   - If `crm_external_refs` has `(meta, leadgen_id)` → counted as a duplicate (M9).
   - Otherwise `INSERT OR IGNORE` into the inbox:
     - status `pending` when the integration is enabled and a token exists;
     - otherwise status **`held`** (ids only; still 200; M10). Held rows become pending when the token is saved and the integration is enabled.
7. Reply `200 {"ok":true}` at once, then `after(() => safely(processMetaInbox({ limit: 25, budgetMs: 20000 })))`. `safely` catches everything and logs a fixed code (M11).

### 18.3 `processMetaInbox` (`meta/inbox.ts`)

**Claiming**
- An atomic per-row lease: `UPDATE … SET status='processing', lease_until=now+60s WHERE leadgen_id=? AND (status='pending' OR (status='processing' AND lease_until<now)) AND next_attempt_at<=now`.
- Plus an in-process mutex.
- The refs are checked again before the Graph call.

**Graph call**
- `GET /{v}/{leadgen_id}?fields=<full>&appsecret_proof=…`, where `<full>` = `id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data,custom_disclaimer_responses,is_organic,platform`.
- The **basic** field set is `id,created_time,ad_id,form_id,field_data,custom_disclaimer_responses`. It keeps the consent responses (H4).

**Mapping** (`meta/mapping.ts`, using CORE `intake/fields.ts`)
- `field_data` → the first value per name → `fieldMap` → `CaptureLeadInput`.
- `full_name` → `contactName` (or as mapped).
- Phone via `normalizePhoneE164`; city/district → `district`; state → `state`; class and programme normalised.
- Form defaults (programme, centre) fill blanks. Unmapped answers → `answers` (≤ 1000).

**Consent**
- `{ textVersion: "meta:<form_id>" + (checkbox ticked ? ":cb" : ""), at: created_time, method: "meta_lead_form" }`.
- Without the form's configured checkbox, the submission meta gets `consentConfirmed: false`. Lead detail then shows "Confirm consent and parent/guardian on the first call".

**Context**
- `utmSource` = platform (fb → facebook, ig → instagram, else meta); `utmMedium = "lead_ad"`.
- `utmCampaign = campaign_name ?? campaign_id`; `utmContent = ad_name ?? ad_id`; `utmTerm = adset_name`.

**Capture call:** `captureLead(input, now, { origin: { provider: "meta", externalId }, attachIfOlderThanHistory: { createdAt }, suppression: { createdAt }, submissionMeta, answers, arrivedAt: received_at })`, with source `meta_lead_ad`.

**Outcomes**

| Case | Result |
|---|---|
| Lead created or merged | `imported` |
| `alreadyImported` | `duplicate` |
| Dummy test values (`<test lead…`) with test mode off | `test` (not stored) |
| Erased family | `ignored` (`erased_family`); the fetched answers are discarded at once |
| Invalid phone | `failed` (`invalid_phone`), listed with the lead id for the SA |

### 18.4 Errors (`meta/errors.ts`, classified by `code` + `error_subcode`; M6)

| Error | Action |
|---|---|
| Network, 5xx, codes 1, 2, 4, 17, 32, 341, 613, 80001, 80005 | Retry with backoff: `min(2^attempts min, 360 min)` + 0–30 s jitter, honouring `estimated_time_to_regain_access` and slowing down at ≥ 90 % usage. After 10 attempts → `failed`. |
| 190 (invalid or expired token) | **Pause** the queue (`paused: "auth"`). Items stay pending. Guidance: "paste a new token". |
| 10, 200, 283 (permission) | Retry the item. **Pause** (`"permission"`) only after 5 consecutive permission failures on **different** leads, or when `check` confirms lost access. Guidance: Leads access / Live / App Review. |
| 100 with subcode 33 (missing or deleted, e.g. "Delete Lead" in the Testing Tool) | Item retry up to 3 times, then `unavailable`. Never pauses the queue. |
| 100 "nonexisting field" | Switch to basic fields for 24 h (`fieldsMode`), retry at once. |
| Other | `failed` with a fixed code. |

Every request has a 10 s timeout (`AbortSignal.timeout(10_000)`).

### 18.5 Triggers (A21, M8)

1. The webhook's `after()`.
2. **Opportunistic:** `kickMetaProcessing()` from `/api/crm/sla/summary` (every open CRM tab polls it every 60 s) and from the Integrations GET. Throttled to once per 60 s per process. It also reconciles when `lastSyncAt` is more than 60 minutes old.
3. The **Process pending now** button (SA).
4. **Optional loopback cron** (M12): `POST /api/integrations/meta/sync`.
   - Requires `Authorization: Bearer $INTEGRATIONS_CRON_TOKEN` (≥ 32 characters, constant-time compare). Returns 404 when the token is unset.
   - **Rejects** requests carrying `X-Forwarded-For` or `X-Real-IP`, and requires `Host` to be `127.0.0.1:*` or `localhost:*`.
   - `deploy/aspire-web.cron` gets: `*/10 * * * * root curl -fsS -m 60 -X POST -H @/opt/aspire-web/meta-sync.header http://127.0.0.1:3011/api/integrations/meta/sync >/dev/null`. The header file is mode 600. It is installed with the owner's approval, like the existing jobs.

**Reconciliation:** for each form, a bulk read of `fields=id,created_time` only (M9), since `lastSyncAt − 1 h` (7 days on the first run). New ids go into the inbox (`via: "sync"`).

**Silence alert:** SAs see "No Meta leads for N hours, check the connection" when the integration is enabled and `lastImportAt` is older than `silenceAlertHours` (default 48; 0 switches it off).

**Housekeeping** (runs inside processing):
- `imported`, `duplicate`, `test` and `ignored` rows deleted after 30 days;
- `failed` and `unavailable` rows after 90 days;
- **TEST leads erased after 24 h** (reason `wrong_or_test`, actor null).

### 18.6 Graph client (`meta/graph.ts`)

- `createGraphClient({ fetchImpl, version, appSecret, now, tokenTransport })`.
- **Token transport:**
  - The token goes in the `Authorization: Bearer` header by default (M11). This form is not confirmed in public docs, so on error 2500 or 104 ("access token required") the client retries once using the query form and stores `tokenTransport: "query"` in `meta_config`.
  - `appsecret_proof = HMAC_SHA256(appSecret, accessToken)` is always a query parameter.
  - For `debug_token`, `appId|appSecret` follows the same transport rule.
- Parses the usage headers.
- Classifies errors into `{ kind: "retry" | "pause_auth" | "permission" | "unavailable" | "downgrade_fields" | "fatal"; code; subcode; retryAfterMs? }`.
- **Never logs** tokens, URLs with tokens, bodies or Graph text.
- Tests inject `fetchImpl`. A guard fails any test that reaches the global `fetch`.

### 18.7 Configuration, secrets, actions

```ts
interface MetaConfig {
  enabled: boolean; appId: string | null; pageId: string | null; graphVersion: string;   // default "v26.0"
  tokenTransport: "header" | "query";
  fieldMap: Record<string, ImportTarget>;
  forms: MetaFormConfig[];             // { id, name, status, defaults: { programInterest?, centreSlug? }, consentCheckboxKey: string | null }
  testPhone: string | null; acceptTestLeadsUntil: string | null;   // ≤ 24 h window
  silenceAlertHours: number;           // default 48
}
interface MetaStatus {
  lastVerifyAt, verifiedSiteUrl, lastWebhookAt, lastSignatureFailureAt, lastImportAt, lastTestAt, lastSyncAt: string | null;
  paused: "auth" | "permission" | null; pausedAt: string | null; lastErrorCode: string | null;
  consecutivePermissionFailures: number;
  tokenInfo: { type: string; expiresAt: string | null; scopes: string[]; checkedAt: string } | null;
  pageSubscribed: boolean | null; fieldsMode: { mode: "full" | "basic"; until: string | null };
}
```

**Secrets**
- `app_secret`, `access_token`, the derived `page_token` and `verify_token` are sealed in `crm_integration_secrets` (AAD `meta:<name>:v1`).
- They are **never returned**. The API returns `{ set, updatedAt, updatedBy, keyOk: "current" | "previous" | false }`.
- Saving or deleting needs the SA's **current password** (L4).
- Audits `crm.meta_secret_set` / `crm.meta_secret_delete` carry `{ slot: "<name>" }` (L2).
- The verify token (32 random bytes, base64url) is generated by the server, shown to SAs only, and can be regenerated.

**Actions** (`POST /api/crm/integrations/meta/actions`, SA):

| Action | What it does |
|---|---|
| `check` | `debug_token` (valid, type, expiry, scopes). For USER or SYSTEM_USER tokens, `GET /{page-id}?fields=access_token,name` seals the Page token; then `GET /{page-id}/subscribed_apps`. |
| `subscribe_page` | `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen` |
| `process_now`, `retry_failed` | Process the queue now; retry failed items |
| `sync_forms` | `GET /{page-id}/leadgen_forms?fields=id,name,status,questions` |
| `sync_leads` | Reconcile now |
| `regenerate_verify_token` | New verify token |
| `reseal` | Re-encrypt with the current key (M13) |
| `test_mode` | `{ on, phone }`: accept test leads for 24 h |

**Test leads** (A14). While `acceptTestLeadsUntil` is in the future:
- dummy-data test leads, and any Meta lead whose phone equals `testPhone`, are captured with the name "TEST – Meta test lead" and the phone `testPhone`, tagged `submissionMeta.test = true`;
- they are routed and timed normally;
- they are erased after 24 h.

**Proxy:** `src/proxy.ts` exempts **exactly** `/api/integrations/meta/webhook` and `/api/integrations/meta/sync` from the preview gate (M12).

**Not D-041 sending:** fetching leads is inbound; nothing is ever sent to families.

## 19. Encryption helper and environment variables

**`src/lib/server/secret-box.ts`** (server-only, CORE)
- **Key (M13):** `INTEGRATIONS_SECRET` is an **opaque string of at least 43 characters**, with no format guessing. Generate it with `openssl rand -base64 48`.
  - `key = HKDF-SHA256(utf8(secret), salt "aspire.integrations", info "secret-box/v1", 32)`.
  - `keyId` = the first 8 hex characters of `sha256(key)`.
- **Cipher:** AES-256-GCM with a 12-byte random IV. AAD = `"<provider>:<name>:v1"`.
- **Envelope:** `v1.<keyId>.<iv>.<ct>.<tag>` (base64url).
- **Rotation:** optional `INTEGRATIONS_SECRET_PREVIOUS`. `openSecret` picks the key by the envelope's `keyId`; the `reseal` action re-encrypts with the current key.
- **API:**
  - `secretBoxStatus()` → `{ configured, keyId, previousKeyId }`
  - `sealSecret(plain, aad)`, `openSecret(sealed, aad)`
  - `keyedHash(purpose, value)`, which also offers a `previous` variant for lookups
  - errors: `SecretBoxError("not_configured" | "key_mismatch" | "corrupt" | "weak_key")`
- **Without the key:**
  - Meta and CSV import show "Server key not set" (503 `not_configured`);
  - erase still works but writes no suppression (it logs a fixed code).
  Integrate makes setting the key a deploy step.
- **Backups:** `backup.sh` uploads only the encrypted DB and never `.env`. Keep it that way. A restore on a new server needs the same key, or the Meta credentials entered again.

| Variable | Required | Use |
|---|---|---|
| `INTEGRATIONS_SECRET` | Yes, before CSV import or Meta | Seals Meta secrets; keyed hashes for CSV refs and erase suppressions |
| `INTEGRATIONS_SECRET_PREVIOUS` | Only during rotation | Opens old envelopes and hashes until resealed |
| `INTEGRATIONS_CRON_TOKEN` | Optional (≥ 32 characters) | Enables the loopback `/api/integrations/meta/sync` |

`docker-compose.yml` needs **no** change (`env_file: .env`; L6).

## 20. Screens

| Page | Who sees it | Who edits | Package |
|---|---|---|---|
| `/crm/dashboard` (nav "Dashboard") | manager (scoped), admin, SA | none | SLA |
| `/crm/settings` hub (nav "Settings"): Areas & people · Calling hours & speed · Import leads · Integrations → Meta · Staff & rules | manager, admin | SA | CORE |
| `/crm/settings/areas` (incl. Unmatched places, legacy-scope review) | manager, admin | SA | ROUTING |
| `/crm/settings/speed` | manager, admin | SA | SLA |
| `/crm/settings/import` | admin (history), SA | SA | IMPORT |
| `/crm/settings/integrations` | admin and manager see status only; SA sees all (no secrets) | SA | META |
| Inbox: area column, `area` filter ("No area", "Tool sign-ups"), `sla` filter, SLA chip | all | none | CORE |
| Lead detail: area, how matched, place typed, SLA chip, Meta origin, consent method + "confirm consent" flag, **Change area**, prompt to log the call after returning from a `tel:` call | per record | SA or a manager who can see it | CORE (button calls the ROUTING API) |
| Header: SA chip, **Away until …** | all | self, head, SA | CORE |
| Today: **Call now** + retry tasks | all | none | SLA |
| Alert strip on every CRM page | all | none | SLA |

- **Staff land on `/crm/today`** (A6).
- Every page follows the `CrmGate` pattern, has en/hi strings, a 16 px gutter at phone width, and keyboard access.

## 21. API (JSON envelope D-007; `no-store` + `noindex`; same-origin writes, zod, body limits)

| Method & path | Who | Body / query → data |
|---|---|---|
| GET `/api/admin/super-admins` | admin | → `{ items: SuperAdminEntry[], youAreSuperAdmin, bootstrapPending }` |
| PUT `/api/admin/super-admins/:userId` | SA | `{ superAdmin, currentPassword }` → items; 409 `last_super_admin`, 422 `not_admin` |
| POST `/api/admin/users` (role `staff`), PATCH/reset of staff | **SA** (Q7) | adds `crm.areaIds?: string[]` → `setUserAreas` |
| PATCH/reset of an effective SA by a non-SA | refused | 403 `super_admin_target` |
| GET `/api/crm/areas`, GET `/api/crm/areas/resolve?q=&state=` | manager, admin | `CrmArea[]` / `AreaResolution` |
| POST `/api/crm/areas`; PATCH `/api/crm/areas/:areaId`; PUT `…/:areaId/members`; POST/DELETE `…/:areaId/aliases`; POST `/api/crm/areas/merge`; POST `/api/crm/areas/setup-from-centre`; POST `/api/crm/areas/reroute`; GET `/api/crm/areas/unmatched` | SA | as in §13.6 |
| POST `/api/crm/areas/reassign` | SA; area head for their own members | `{ fromUserId, scope: "uncalled" \| "open", toUserId? }` → `{ moved }` |
| PUT `/api/crm/availability` | self; area head for their own members; SA | `{ userId, awayUntil: string \| null, note? }` |
| PATCH `/api/crm/leads/:leadId/area` | SA; a manager who can see the lead | `{ areaId: string \| null }` |
| GET/PUT `/api/crm/settings/routing` | read: manager/admin; write: SA | `{ mode, expectedVersion }` → `SettingEnvelope<RoutingSettings>` |
| GET/PUT `/api/crm/settings/speed` | read: manager/admin; write: SA | `{ callingHours?, speedRule?, expectedVersion }` → `{ callingHours, speedRule, recomputed? }` |
| GET `/api/crm/sla?view=mine\|area\|escalated\|unassigned\|tool_signups`; GET `/api/crm/sla/summary` | scoped; a view beyond the role → 403 | `SlaQueuePage` / `SlaSummary` |
| GET `/api/crm/dashboard?from&to&area` | manager (area must be in scope), admin | `DashboardData` |
| POST `/api/crm/import/preview`; POST `/api/crm/import/batches`; POST `…/batches/:batchId/rows`; POST `…/batches/:batchId/finish`; GET `/api/crm/import/batches` | SA (GET: admin) | §17; ≤ 256 KB per request |
| GET/PUT `/api/crm/integrations/meta`; PUT/DELETE `…/meta/secrets`; POST `…/meta/actions`; GET `…/meta/inbox?status=` | GET: admin/manager (status only); everything else SA | §18 |
| GET/POST `/api/integrations/meta/webhook` | Meta (public, signed) | §18.1–18.2 |
| POST `/api/integrations/meta/sync` | loopback + bearer | `{ processed, enqueued }` |

Changes to existing routes:
- `/api/crm/leads` gains `area` (an id, `none` or `tool_signups`) and `sla` (`open`, `overdue` or `escalated`).
- `PUT /api/crm/staff/:userId` and `PUT /api/crm/rules` become SA-only.

## 22. Permissions

| | counsellor (executive) | manager (area head) | admin | super admin |
|---|---|---|---|---|
| See leads | assigned | responsible areas ∪ their centres ∪ assigned (legacy: unchanged) | all | all |
| Dashboard | none | own areas | all | all + Meta health, Unassigned, Tool sign-ups |
| SLA lists | own | area overdue + area unassigned | all | all + escalated + no-area queues |
| Away | self | self + own members | none | anyone |
| Bulk reassign | none | own members | none | ✓ |
| Change a lead's area | none | leads they see | none | ✓ |
| Settings pages | none | read | read | edit |
| Staff logins, roles, areas, people, rules, routing mode | none | read | read | ✓ |
| Calling hours, speed rule, tiers | none | read | read | ✓ |
| CSV import | none | none | history | ✓ |
| Meta | none | status | status | ✓ (secrets never shown) |
| Grant / revoke super admin | none | none | none | ✓ (password) |
| Erase lead | none | none | ✓ | ✓ |

`crmPermissions(viewer)` keeps its flags; `canManageStaff` and `canEditRules` move to SA. It adds: `isSuperAdmin`, `canViewDashboard`, `canViewSettings`, `canEditSettings`, `canImport`, `canViewImportHistory`, `canManageIntegrations`, `canViewIntegrationStatus`, `canReassignBulk`, `canSetAvailability(targetId)`.

## 23. Privacy, audit, logs

**Consent**
- Meta: `meta_lead_form` + form id + `created_time` + disclaimer responses. A lead without the checkbox gets the "confirm on first call" flag.
- CSV: the chosen basis.
- The "parent / student" answer → `submittedBy`.

**New audit actions**
- `CRM_AUDIT`: `areaCreate`, `areaUpdate`, `areaMerge`, `areaMembers`, `areaAlias`, `areaSetupFromCentre`, `areaReroute`, `leadReroute`, `bulkReassign`, `availability`, `settingsUpdate` `{ key, version }`, `importStart`, `import`, `metaConfig`, `metaSecretSet`/`metaSecretDelete` `{ slot }`, `metaAction` `{ action }`.
- Auth: `auth.super_admin_grant`, `auth.super_admin_revoke`, `auth.super_admin_bootstrap`, plus `auth.password_reset` with `{ via: "cli" }`.
- Details never contain names, phones, typed places or tokens.
- A test checks that `{ slot: "access_token" }` survives the key sanitizer.

**Logs:** fixed codes only (`crmLog` style, plus `metaLog(event, outcome, reason)`). Never payloads, ids, tokens, URLs or Graph text.

**Privacy notice** (`legal.ts`) — say:
- Leads also come from Meta (Facebook/Instagram) lead forms, and from lists that Aspire staff import with the family's consent.
- Aspire fetches the answers from Meta.
- After erasure, Aspire keeps the Meta lead id and a one-way coded fingerprint of the phone number, so an old list cannot bring the family back.
- A CRM erase does **not** delete copies in Meta Leads Center or in downloaded sheets (L7). The erase dialog says the same.

---

# Part 4. Delivery

## 24. Packages: split, files, order, tests

**Order.** `LR-CORE` runs alone first. Then `LR-ROUTING`, `LR-SLA`, `LR-IMPORT` and `LR-META` are file-disjoint and can run in parallel; on the owner's PC, run at most two at once (ROUTING + IMPORT, then SLA + META). Integrate runs last.

**Rules for every package**
1. No `tsc`, `next build`, dev server or browser. Run only the vitest files listed for your package, with `--maxWorkers=1`, and eslint on the files you touched.
2. No npm dependencies. No real Meta calls: inject `fetchImpl`, and a guard fails any test that reaches the global `fetch`. Do not commit.
3. Never edit:
   - `src/i18n/messages/types.ts`, `src/i18n/messages/index.ts`, `package.json`;
   - `src/lib/mocktest/**`, `src/app/[lang]/(portal)/admin/questions/**`, `src/app/api/admin/mocktest/**`;
   - `src/components/home/HomeTools*`, `src/components/ui/*carousel*`, `src/components/home/ResultRail.tsx`.
4. Shared files: re-read immediately before a minimal edit of only your lines. They are `src/components/portal/areas.ts`, `src/lib/auth/**`, `src/proxy.ts`, `src/lib/db/features/index.ts` and `deploy/**`.
5. Read the relevant page under `node_modules/next/dist/docs/` before writing a page or route handler (AGENTS.md).
   - Pages follow the `CrmGate` pattern (Suspense + `requireCrmPage`).
   - Routes use: the D-007 envelope; `no-store` and `X-Robots-Tag: noindex`; same-origin writes; zod; a body limit; `requireCrm` / `requireCrmSuperAdmin`.
6. These contracts are frozen after CORE:
   - `src/lib/crm/lead-ops-types.ts`;
   - `src/lib/crm/arrival.ts`;
   - the seam signatures in §14.3;
   - the client builders in `src/components/crm/lead-ops-api.ts`.
   A package that needs a change reports it in its status report and does not make it.
7. Messages:
   - Only CORE edits `{en,hi}/crm.ts`, `forms.ts`, `portal.ts` and `legal.ts`.
   - Each parallel package owns exactly one set of nested message files that CORE created (named below), and adds its keys there in English and Hindi.
   - Hindi lines are listed in the package report for `docs/hindi-review-register.md`.
8. Do not edit `src/lib/crm/index.ts` or `src/components/crm/api.ts`. Reach other packages only through the seams: `@/lib/crm/routing`, `@/lib/crm/sla`, `@/lib/crm/meta`. A package may add an `api.ts` in its own component folder, for endpoints only its own UI calls.
9. Audit every write without personal data (§23). Every log line is a fixed code.

### LR-CORE (first, alone)

**Schema**
- NEW `src/lib/db/features/superadmin.ts` and `src/lib/db/features/crm-intake.ts`, exactly as in §12.
- EDIT `src/lib/db/features/index.ts`: append `superadmin`, then `crm_intake`, after `crm` (re-read first).

**Super admin and accounts**
- NEW files:
  - `src/lib/db/super-admins.ts`: SQL only, no `@/` imports, safe for the CLI.
  - `src/lib/auth/super-admin.ts`: `isSuperAdmin`, `listSuperAdmins`, `ensureSuperAdminBootstrap`, `grantSuperAdmin`, `revokeSuperAdmin`, `isLastSuperAdmin`, `requireSuperAdmin`, `SUPER_ADMIN_AUDIT`.
  - `scripts/super-admin.mjs`: `list | grant | revoke | reset-password`.
  - `src/app/api/admin/super-admins/route.ts` and `src/app/api/admin/super-admins/[userId]/route.ts`.
- EDIT:
  - `src/lib/auth/accounts.ts`: in `adminUpdateUser` and `adminResetPassword`, add `last_super_admin`, `super_admin_target`, and `super_admin_only` for staff targets.
  - `src/lib/auth/messages.ts`.
  - `src/lib/auth/paths.ts`: staff land on `/crm/today`.
  - `src/app/api/admin/users/route.ts`: staff creation is SA-only; `crm.areaIds` goes to the `setUserAreas` seam.
  - `src/app/api/admin/users/[userId]/route.ts` and `src/app/api/admin/users/[userId]/reset-password/route.ts`.
  - `src/components/portal/UserManager.tsx`: badge; Grant/Revoke with a password prompt; the "set automatically" line; the no-super-admin banner.
  - `src/lib/mcp/tools/crm.ts`: the viewer gets `channel: "mcp"` and is never a super admin.

**CRM core**
- EDIT:
  - `src/lib/crm/types.ts`.
  - `src/lib/crm/access.ts`: explicit scope, `responsibleAreaIds`, `canSeeLead` with `areaId`, `assignableMember`, the new `CRM_AUDIT` keys.
  - `src/lib/crm/http.ts`: `requireCrmSuperAdmin`, `bodyLimit`, the `area` and `sla` filters.
  - `src/lib/crm/capture.ts`: the §14.2 options (incl. `existing: "attach"`, `origin`, suppression, chronology) and the arrival seam.
  - `src/lib/crm/leads.ts`: `autoAssign(db, row, now, routing?, { replace })`; `logContact` and `changeStage` call the SLA seam with `via`.
  - `src/lib/crm/tasks.ts`: a system helper `createFollowUpTask(db, …)`.
  - `src/lib/crm/admin.ts`: SA gating; erase wipes the routing input, closes the clock and writes the suppression.
  - `src/lib/crm/repo/activities.ts`: `lastActivityAt(db, leadId, types)`.
  - `src/lib/crm/repo/leads.ts`: the `areas` scope through `EXISTS`; the `area` and `sla` filters; `LeadRow.areaId: string | null` in the shared SELECT.
  - `src/lib/crm/index.ts`: re-exports.
- NEW:
  - `src/lib/crm/lead-ops-types.ts`: every type and constant in §11–§18, client-safe.
  - `src/lib/crm/arrival.ts`, `src/lib/crm/settings.ts`, `src/lib/crm/sla-state.ts`.
  - `src/lib/crm/intake/fields.ts`: header synonyms and normalisers, shared by IMPORT and META.
  - `src/lib/crm/repo/settings.ts`: settings and secrets SQL.
  - `src/lib/crm/repo/intake.ts`: external refs, batches, suppressions.
  - `src/lib/crm/repo/areas-core.ts`: `listMemberAreaIds`, `responsibleAreaIds`, `areaIdOfCentre`, `centresOfAreas`, `findLeadRouting`, `upsertLeadRouting`, `wipeRoutingInput`, `listAreaNames`.
  - `src/lib/crm/repo/sla-core.ts`: `findOpenClock`, `insertClock`, `resolveClock`, `closeClock`, `hasAnyClock`.
  - `src/lib/crm/repo/staff-ops.ts`: scope mode and availability.
  - `src/lib/server/secret-box.ts`.
- NEW stubs whose ownership passes to another package (their behaviour is in §14.3):

  | Stub | Passes to |
  |---|---|
  | `src/lib/crm/routing/index.ts` | ROUTING |
  | `src/lib/crm/sla/index.ts` | SLA |
  | `src/lib/crm/meta/index.ts` | META |
  | `src/components/crm/sla/SlaAlertStrip.tsx` (renders nothing) | SLA |

**UI**
- EDIT:
  - `src/components/crm/InboxView.tsx`: area column; area filter with "No area" and "Tool sign-ups"; SLA filter and chip.
  - `src/components/crm/LeadDetailView.tsx`: routing, SLA, Meta origin, consent flag, **Change area**, and the prompt to log the call after returning from a `tel:` call.
  - `src/components/crm/CrmBlocks.tsx`: SA chip and `AwayToggle`.
  - `src/components/crm/CrmGate.tsx`: renders `SlaAlertStrip`.
  - `src/components/crm/format.ts`.
- NEW:
  - `src/components/crm/SlaChip.tsx`, `src/components/crm/SuperAdminBadge.tsx`, `src/components/crm/AwayToggle.tsx`, `src/components/crm/call-return.ts`.
  - `src/components/crm/lead-ops-api.ts`: typed client builders for every endpoint in §21, using `sendCrm` and `useCrmAction`.
  - `src/components/crm/settings/SettingsHub.tsx`, `src/components/crm/settings/ReadOnlyNotice.tsx`, `src/app/[lang]/(portal)/crm/settings/page.tsx`.
- EDIT `src/components/portal/areas.ts`: add `dashboard` (`/crm/dashboard`, managersOnly) and `settings` (`/crm/settings`, managersOnly). Re-read first.

**Messages and docs**
- EDIT:
  - `src/i18n/messages/{en,hi}/crm.ts`: nav, superAdmin, sources, consent methods, inbox/lead/SLA-chip keys, settings hub, errors; imports the nested files below.
  - `{en,hi}/forms.ts`: the district field.
  - `{en,hi}/portal.ts`: super admin on the users screen.
  - `{en,hi}/legal.ts`: the §23 privacy additions.
- NEW nested message files, each with the keys the hub and CORE screens need:

  | Files | Passes to |
  |---|---|
  | `src/i18n/messages/{en,hi}/crm-areas.ts` | ROUTING |
  | `crm-speed.ts` and `crm-dashboard.ts` | SLA |
  | `crm-import.ts` | IMPORT |
  | `crm-meta.ts` | META |

- EDIT `docs/hindi-review-register.md`.

**Tests**
- NEW: `src/lib/auth/super-admin.test.ts`, `src/app/api/admin/super-admins/super-admins-api.test.ts`, `src/lib/server/secret-box.test.ts`, `src/lib/crm/intake/fields.test.ts`, `src/lib/crm/lead-ops-core.test.ts`, `src/lib/db/intake-schema.test.ts`.
- UPDATE: `src/lib/crm/crm-pure.test.ts`, `src/lib/crm/crm-console.test.ts`, `src/lib/crm/crm-services.test.ts`, `src/app/api/crm/crm-api.test.ts`, `src/app/api/admin/users/admin-users.test.ts`, `src/lib/auth/paths.test.ts`, `src/app/api/mcp/mcp-crm.test.ts`, `src/components/crm/crm-ui.test.ts`, `src/components/crm/crm-console-ui.test.ts`.
- **Must cover:**
  - Bootstrap:
    - fires only with zero grant rows and exactly one enabled admin;
    - no `BEGIN` on the read path once grants exist.
  - Account protection:
    - the last-SA invariant: revoke, disable, and two revokes at once;
    - `super_admin_target` on reset, disable and edit;
    - staff targets are SA-only;
    - grant and revoke need the password;
    - CLI `reset-password`.
  - Lead scope:
    - an area head's scope through `EXISTS` in the inbox, Reports and the lead-gate counts;
    - an `areas`-scope manager with zero areas sees only assigned leads;
    - legacy managers are unchanged;
    - query parameters only narrow.
  - Capture:
    - `existing: "attach"` leaves consent, stage, assignee and clock untouched;
    - Meta chronology;
    - refs are idempotent;
    - an erased family is suppressed.
  - MCP:
    - the viewer is never an SA;
    - MCP contact logs reach the SLA seam with `via: "mcp"`.
  - Secrets and audit:
    - secret-box round trip; swapped AAD fails; the previous key opens envelopes and `reseal` works; a short key is rejected;
    - the audit row keeps `{ slot }`.
  - No test depends on stub outputs.
- **Run:** `npx vitest run src/lib/auth/super-admin.test.ts src/lib/auth/paths.test.ts src/lib/server/secret-box.test.ts src/lib/db/intake-schema.test.ts src/lib/db/migration-staff.test.ts src/lib/db/db.test.ts src/lib/crm src/app/api/crm src/app/api/admin/users src/app/api/admin/super-admins src/app/api/mcp/mcp-crm.test.ts src/components/crm --maxWorkers=1`, then eslint on the touched files.

### LR-ROUTING (parallel)

- **Owns:** `src/lib/crm/routing/**` (replaces the stub: `index.ts`, `districts.ts`, `resolve.ts`, `seed.ts`, `pool.ts`, `areas-service.ts`, `unmatched.ts`, tests), `src/lib/crm/repo/areas.ts`, `src/lib/crm/assignment.ts`, `src/i18n/messages/{en,hi}/crm-areas.ts`.
- **Routes:**
  - `src/app/api/crm/areas/route.ts`;
  - under `src/app/api/crm/areas/`: `[areaId]/route.ts`, `[areaId]/members/route.ts`, `[areaId]/aliases/route.ts`, `merge/route.ts`, `setup-from-centre/route.ts`, `resolve/route.ts`, `unmatched/route.ts`, `reroute/route.ts`, `reassign/route.ts`;
  - `src/app/api/crm/availability/route.ts`;
  - `src/app/api/crm/leads/[leadId]/area/route.ts`;
  - `src/app/api/crm/settings/routing/route.ts`.
- **UI:**
  - `src/app/[lang]/(portal)/crm/settings/areas/page.tsx`;
  - `src/components/crm/areas/**`: `AreasManager`, `AreaEditor`, `SetupFromCentre`, `PeoplePicker` (with inline "Create login" via `/api/admin/users`), `AliasEditor`, `MergeDialog` (move or remove each person), `PlaceTester`, `UnmatchedPlaces`, `LegacyScopeReview`, tests;
  - `src/components/crm/StaffManager.tsx`: the "rules apply only to leads with no area" notice in areas mode.
- **Forms:** `src/lib/contracts/enquiry.ts` (optional `district`), `src/components/forms/HeroEnquiryForm.tsx`, `src/components/forms/EnquiryForm.tsx`, `src/components/forms/enquiry-payload.ts`, `src/components/forms/field-errors.ts`, `src/lib/server/lead-sink.ts`, `src/lib/server/enquiry-service.ts`, `src/components/crm/AddLeadForm.tsx`, `src/components/crm/lead-forms.ts`, plus their existing tests.
- **Must:**
  - **Seed:** exactly §13.1–13.2; idempotent, lazy, with no audit or activity rows; a test that the centre map matches `src/content/centres.ts`.
  - **Resolver tests:**
    - every seeded alias and short name;
    - Dharamshala→Kangra, Manali→Kullu, Nahan→Sirmaur, Baddi→Solan, Keylong→Lahaul and Spiti, Reckong Peo→Kinnaur;
    - Hindi names, "Shimla, HP", "Distt. Kangra", `kulu`;
    - `dharampur`→ambiguous;
    - "Bilaspur, Chhattisgarh"→outside_hp;
    - a `border` alias with state Punjab → its area;
    - a fuzzy tie → ambiguous.
  - **Pool tests:**
    - order: own → borrow → legacy (which excludes area members, away and disabled people) → queue;
    - centre tie;
    - `takes_leads`;
    - load-aware choice with the round-robin tie-break; fairness over 100 leads;
    - gate leads with no area → Tool sign-ups;
    - re-picking an unavailable assignee per §14.1.
  - **Admin actions:**
    - setup-from-centre;
    - merge with the per-person choice;
    - unmatched → alias → re-route;
    - bulk reassign rights (a head only for their own members);
    - availability rights.
  - **Guards and seams:**
    - the SA guard on every write;
    - `setUserAreas` replaces the stub and sets scope `areas` for managers.
- **Run:** `npx vitest run src/lib/crm/routing src/components/crm/areas src/app/api/crm/areas src/app/api/crm/availability src/app/api/crm/leads src/app/api/crm/settings/routing src/lib/contracts/enquiry.test.ts src/components/forms src/lib/server/lead-sink.test.ts src/lib/server/enquiry-service.test.ts --maxWorkers=1`.

### LR-SLA (parallel)

- **Owns:** `src/lib/crm/sla/**` (replaces the stub: `index.ts`, `calling-hours.ts`, `policy.ts`, `followups.ts`, `holder.ts`, `views.ts`, tests), `src/lib/crm/repo/sla.ts`, `src/lib/crm/dashboard.ts`, `src/lib/crm/repo/dashboard.ts`, `src/components/crm/sla/**` (replaces the `SlaAlertStrip` stub), `src/components/crm/dashboard/**`, and `src/i18n/messages/{en,hi}/crm-speed.ts` + `crm-dashboard.ts`.
- **Routes:** `src/app/api/crm/settings/speed/route.ts`, `src/app/api/crm/sla/route.ts`, `src/app/api/crm/sla/summary/route.ts` (also runs `after(() => kickMetaProcessing("summary"))`), `src/app/api/crm/dashboard/route.ts`.
- **UI:**
  - `src/app/[lang]/(portal)/crm/settings/speed/page.tsx` and `src/app/[lang]/(portal)/crm/dashboard/page.tsx`;
  - `CallingHoursEditor`, `SpeedRuleSettings`;
  - `SlaAlertStrip`: per-executive digest, tab-title count, `setAppBadge`, an optional chime;
  - `CallNowList`, `EscalationList`, dashboard tiles, tables and charts.
- **Edits:** `src/components/crm/TodayView.tsx` and `src/app/[lang]/(portal)/crm/today/page.tsx`.
- **Must test:**
  - Calling hours: every §15 case, plus closed dates.
  - Clocks:
    - tier recompute on a policy change;
    - met or late;
    - resolution by call, WhatsApp and stage;
    - MCP ignored;
    - `lost` → closed; erase.
  - Starting a clock:
    - the first enquiry of a gate-only lead starts one;
    - gate leads are off by default;
    - the source list applies;
    - the import override and the `import` reason;
    - Meta `arrivedAt`.
  - Follow-up:
    - retry tasks: `no_answer` → +2 working hours, then the next opening + 1 h, at most 3, no duplicate task;
    - `reached_at`;
    - `assignee_at_due` from the assignment history.
  - Alerts and dashboard:
    - the responsible-head chain for tier 1;
    - the summary per role;
    - dashboard scope (`?area` outside the scope → 403);
    - medians; live vs import split; junk per campaign.
- **Run:** `npx vitest run src/lib/crm/sla src/lib/crm/dashboard.test.ts src/components/crm/sla src/components/crm/dashboard src/app/api/crm/sla src/app/api/crm/dashboard src/app/api/crm/settings/speed --maxWorkers=1`.

### LR-IMPORT (parallel)

- **Owns:** `src/lib/crm/intake/decode.ts`, `csv.ts`, `excel-damage.ts`, `rows.ts`, `import.ts`, `fixtures/**` and their tests; `src/i18n/messages/{en,hi}/crm-import.ts`.
- **Routes:** `src/app/api/crm/import/preview/route.ts`, `src/app/api/crm/import/batches/route.ts`, `src/app/api/crm/import/batches/[batchId]/rows/route.ts`, `src/app/api/crm/import/batches/[batchId]/finish/route.ts`.
- **UI:** `src/app/[lang]/(portal)/crm/settings/import/page.tsx`; `src/components/crm/import/**` (`ImportWizard`, `MappingTable`, `ConsentBasisPicker`, `DamageBanner`, `ImportProgress`, `ImportResultView`, `ImportHistory`).
- **Fixtures:**
  - UTF-8 with commas;
  - UTF-16LE with tabs and `l:`/`p:` prefixes;
  - an Excel export with semicolons;
  - a windows-1252 export;
  - an Excel-damaged file (`9.19877E+11`, `1.23457E+15`, `'+91…`, `….0`);
  - two overlapping daily files;
  - a mixed-quality file.
- **Must:**
  - Decoding and parsing:
    - decode as in §17 (BOM, UTF-16 sniff, fatal UTF-8 then 1252 with a warning, `?`-only cells flagged);
    - the state-machine parser;
    - strict lead ids.
  - Damage: damaged rows are blocked and the banner shows; one leading `'` and a trailing `.0` are stripped.
  - Transport: chunks of ≤ 250 rows / 256 KB, each its own transaction; resume is safe.
  - Consent: a basis is required; the Meta basis only accepts rows with a valid lead id.
  - Existing families:
    - `existing: "attach"` for known families;
    - the "lost families reappear" list.
  - Idempotency:
    - the same file twice → 0 created;
    - overlapping files → only new rows;
    - webhook-imported ids are skipped;
    - erased families are skipped.
  - Safety:
    - masked phones in the preview;
    - the SA guard;
    - limits;
    - audit counts only;
    - no direct lead SQL (only `captureLead`).
- **Run:** `npx vitest run src/lib/crm/intake src/components/crm/import src/app/api/crm/import --maxWorkers=1`.

### LR-META (parallel)

- **Owns:** `src/lib/crm/meta/**` (replaces the stub: `index.ts`, `graph.ts`, `errors.ts`, `webhook.ts`, `inbox.ts`, `mapping.ts`, `config.ts`, `status.ts`, `test-mode.ts`, `housekeeping.ts`, `fixtures/**`, tests), `src/lib/crm/repo/meta.ts`, `src/i18n/messages/{en,hi}/crm-meta.ts`.
- **Routes:** `src/app/api/integrations/meta/webhook/route.ts`, `src/app/api/integrations/meta/sync/route.ts`, `src/app/api/crm/integrations/meta/route.ts`, `src/app/api/crm/integrations/meta/secrets/route.ts`, `src/app/api/crm/integrations/meta/actions/route.ts`, `src/app/api/crm/integrations/meta/inbox/route.ts`.
- **UI:** `src/app/[lang]/(portal)/crm/settings/integrations/page.tsx`; `src/components/crm/integrations/**`:
  - `MetaIntegrationPage`;
  - `SetupChecklist`: Step 0 and steps 1–13 of §6–7, with live ticks;
  - `CredentialsForm`: write-only fields, password confirmation;
  - `FieldMappingEditor`;
  - `FormsTable`: defaults and the consent checkbox key;
  - `ConnectionStatus`, `TestLeadsPanel`, `FailedLeadsList`.
- **Edits:**
  - `src/proxy.ts`: exempt exactly the two paths; re-read first.
  - `deploy/README.md`: env vars, key rotation and reseal, the loopback cron and its header file, set the key before deploy.
  - `deploy/aspire-web.cron`: one loopback line.
  - **No** `deploy/docker-compose.yml` edit.
- **Fixtures:**
  - the docs' webhook payload;
  - Meta's all-4s dashboard sample;
  - a foreign-page payload;
  - a unicode-escaped body;
  - a lead GET with `field_data` and `custom_disclaimer_responses`;
  - a dummy test lead;
  - errors: 190; 4; 80005 with the BUC header; 100 "nonexisting field"; 100/33; 200; 2500.
- **Must test:**
  - Handshake: the right token, a wrong token, a malformed challenge.
  - Webhook:
    - the signature over raw bytes (incl. the unicode-escaped body); a tampered body → 401; a malformed header → 401;
    - big-number quoting;
    - the sample is detected before the page filter;
    - a foreign `page_id` is ignored;
    - a known ref is not re-queued;
    - disabled or no token → `held` + 200;
    - no app secret → 503.
  - Queue:
    - duplicate delivery → one lead;
    - the lease prevents double processing;
    - the backoff schedule;
    - pause on 190;
    - a permission pause only after 5 different leads;
    - 100/33 → `unavailable` after 3;
    - the basic-fields fallback keeps consent responses;
    - the header→query token fallback.
  - Mapping and capture:
    - `full_name`, city→district, `+91` phone, class and programme, form defaults;
    - the consent version with and without the checkbox;
    - chronology → attach;
    - an erased family is ignored;
    - `arrivedAt` = `received_at`.
  - Test mode: capture and erase after 24 h.
  - Sync endpoint: loopback-only rules and the bearer token.
  - Triggers: opportunistic kick throttling.
  - Secrets:
    - never returned;
    - the password is required;
    - audit `{ slot }`;
    - `appsecret_proof` present;
    - no global `fetch`.
- **Run:** `npx vitest run src/lib/crm/meta src/components/crm/integrations src/app/api/integrations src/app/api/crm/integrations src/proxy.test.ts --maxWorkers=1`.

**File disjointness.** After CORE, every path above has exactly one owner. The parallel packages share only CORE files, read-only: types, `arrival.ts`, `settings.ts`, `intake/fields.ts`, the repos, `secret-box.ts`, `lead-ops-api.ts`, and messages other than their own pair. A stub becomes its package's file when that package starts.

## 25. Integrate stage (one agent, after all four)

1. Run `npx tsc --noEmit`, the full vitest suite, and eslint.
2. Re-read `package.json`, then add `"auth:super-admin"`. Record **D-044 – D-048** in `docs/agent-decisions.md`, renumbering if the question-bank workflow took any of those numbers.
3. Docs:
   - `docs/crm.md`: §1 roles (super admin, area head, executive), §3 API, §4 model, §5 routing, §9 staff via SA.
   - `docs/api.md`: the enquiry `district` field and the new routes.
   - `docs/integration-status.md`.
   - `docs/aspire-approval-checklist.md`: Q1–Q8 as LR-1…LR-8.
   - The privacy notice check.
4. **Deploy notes:**
   - set `INTEGRATIONS_SECRET` **before** deploying;
   - after deploying, run CLI `list` (then `grant` if needed);
   - re-install the cron file only if the owner approves the sync line, and create `INTEGRATIONS_CRON_TOKEN` and the header file;
   - no nginx change.
5. **Smoke test** as an integration test over the route handlers, on a temporary `AUTH_DB_PATH`, with a fake Graph client:
   1. One admin → CLI `list` shows a bootstrap SA. A second, ordinary admin gets 403 on area writes, settings writes, staff creation, and resetting the SA (`super_admin_target`).
   2. The SA opens the settings → 12 areas; "Set up from centre" for Dharamshala fills Kangra and Chamba.
   3. A signed webhook fixture → a lead routed to Kangra, assigned to the Dharamshala executive with the fewest open clocks, due one working hour later. A redelivery creates no second lead.
   4. A Solan lead with no Solan people → borrowed by the Shimla team; the Shimla head sees it.
   5. The fixture CSV imported twice → 0 created the second time. An overlapping file → only the new rows. A lost family is attached, not reopened.
   6. Erase that family → re-import → `erased_family`.
   7. `no_answer` logged → a retry task exists; `connected` → `reached_at` is set.

## 26. Decisions (proposed)

- **D-044 Super admin.**
  - An admin account with a grant row. A one-time, audited bootstrap happens only when exactly one admin exists; otherwise the CLI is used.
  - At least one SA must always exist. Grant and revoke need the password.
  - Non-SAs cannot reset, disable or edit an SA. Staff logins are SA-only (Q7).
  - The SA-only list is in §11. Ordinary admins and managers are read-only for these settings.
- **D-045 Areas are HP districts.**
  - 12 are seeded (en/hi, aliases and towns, ambiguity rules, border aliases honoured even with a non-HP state). Routing: centre, then place, then Unassigned / Tool sign-ups.
  - Assignment order: own area → serving-centre team → legacy rules → queue, with load-aware picking, away status and re-picking of unavailable assignees.
  - Manager scope is stored explicitly; a manager with no areas sees only assigned leads.
  - The enquiry contract gets an optional `district`. Staff land on Today's calls.
- **D-046 Speed rule.**
  - First call within 1 working hour in IST calling hours, carried over across closing. Tiers: 1 h → responsible heads (digest), 4 working hours → SAs.
  - First contact = a human call/WhatsApp log or a move to contacted. Retry tasks for unanswered calls. "Reached" is reported separately.
  - In-app only (D-041).
- **D-047 Native Meta Lead Ads.**
  - Graph v26.0 webhook + fetch. HMAC over the raw bytes. Ids are held when the integration is not ready.
  - An inbox with lease, backoff and subcode classification. Opportunistic processing plus an optional loopback cron.
  - AES-256-GCM credentials (`INTEGRATIONS_SECRET`, rotation).
  - Consent `meta_lead_form` with the recommended checkbox. Idempotent by lead id. Chronology-aware attach. Erase suppression.
  - Test mode. No third-party automation.
- **D-048 CSV/TSV import.**
  - No XLSX in this release. The browser decodes and parses and sends normalised chunks; the server re-validates.
  - SA only. A consent basis is required. Idempotent through keyed refs. Attach-only for existing families. Excel-damage detection.

## 27. Risks

| Risk | Mitigation |
|---|---|
| Meta may require App Review or Business Verification even for an in-house app | The CSV import covers the gap |
| Leads Center header names are unconfirmed | Header-driven mapping; owner sends one header row |
| A Page or ad account owned by an agency blocks steps 5 and 9 | Step 0 surfaces it before any setup |
| `Authorization` header for Graph tokens is unconfirmed | Automatic fallback to the query form |
| Area heads remain on legacy see-all scope | Listed for review until switched |
| All limiters and the Meta processing throttle are in-memory on one node | Existing constraint |
| Without `INTEGRATIONS_SECRET`, erase writes no suppression | Integrate makes the key a deploy prerequisite |
| Calling hours set wider than real working hours cause false escalations | Q1 and the screen wording |

---

# Appendix A. How each critique point was resolved

**A = operations critique; S = security, privacy and integration critique.**

| ID | Point | Decision | What we do / why | Where |
|---|---|---|---|---|
| A1 | 8 centre-less districts have no executives, so leads wait unseen | **Accept** | Borrow the serving centre's team when an area is empty (one hop). Tier 1 goes to responsible heads (own → serving area's → SAs), who also see those leads. "Set up from centre" in one step; red badges. | §13.4–13.6, §15 |
| A2 | Tool sign-ups flood the Unassigned queue | **Accept** (bucket) / **Reject** (gate district field for now) | Gate arrivals with no area go to a separate **Tool sign-ups** list with no clock. Adding a field to the gate form changes the contract of the conversion form the owner just approved (D-043), and the bucket already removes the flood. Q2 keeps the option open. | §13.4, Q2 |
| A3 | Excel damages phones and lead ids; digit-stripping collapses ids | **Accept** / **Reject** XLSX reader | Strict `^(l:)?\d{15,17}$`; no digit stripping; damage detector + banner; "don't open in Excel" first; "Save as CSV UTF-8" only as a fallback. An XLSX reader is excluded from this run by the binding constraint "XLSX → staff save as CSV"; it would be our own code (node:zlib + sheet XML), so it is a candidate follow-up. | §8, §17 |
| A4 | Cumulative sheets reopen lost leads | **Accept** | No file fingerprint in refs; imports use attach mode (no reopen, consent, reassign or clock); the preview and result list "lost families reappear". | §14.2, §17 |
| A5 | Leave, leavers, a reopened lead stuck on a disabled account, uneven shares | **Accept** | Away until …; re-pick when the assignee is disabled, inactive, away or (on reopen) outside the area; bulk "reassign uncalled leads of X"; load-aware picking with round-robin tie-break. | §13.4, §13.7, §14.1 |
| A6 | The 1-hour metric rewards logging, not reaching; `tel:` users forget to log | **Accept** | Retry tasks for no_answer/busy/switched_off; "reached within one working day" reported next to "first attempt within 1 h"; call-return prompt; staff land on Today. | §15, §16, §20 |
| A7 | Tier 1 = due time; hours wider than real shifts; CSV batches all due at once | **Partly** | Hours are labelled "when executives are at their phones" (Q1); imported clocks are reported separately; import twice a day; area heads get a per-executive digest. Tier 1 stays at 1 h because the owner/task set it ("overdue at 1 h → area head"); the digest removes the noise. | §2, §8, §15 |
| A8 | Meta's pre-filled city misroutes; border towns can't be mapped | **Accept** (with a correction) | `border` aliases are honoured even with a non-HP state, while other aliases respect the state, so "alias before state" cannot send "Bilaspur, Chhattisgarh" to HP. The district question is the primary recommendation; note on forms that can't be edited; Unmatched places with one-click mapping and re-route; `kulu` and other short names explicit. | §7 step 12, §13.2–13.6 |
| A9 | Two assignment systems; managers fail open; two analytics screens | **Accept** / **Partly** | Rules screen notice in areas mode; explicit scope (new managers see nothing until given an area). Dashboard becomes the managers' screen; Reports stays (counsellors use it, it has the CSV export) and is linked, not merged. | §13.5–13.6, §16 |
| A10 | Charge a miss to the holder at due time | **Accept** | `assignee_at_due` from the assignment history; `met` is credited to the first attempter. | §12, §15, §16 |
| A11 | What each person does each morning | **Accept** | Owner section. | §2 |
| A12 | Import is SA-only, so the CMO must be an SA | **Accept** | Recommend granting the CMO (Q4); import stays SA-only per the owner's words. | §3, Q4 |
| A13 | Page admin isn't enough for Meta | **Accept** | Step 0 pre-flight (portfolio ownership, agency, ad account, who downloads the sheet). | §6 |
| A14 | Screencast contradicts "test leads discarded"; Preview Form unverified | **Partly** | Meta's Testing page says Preview Form "create[s] a lead with custom content", so that claim stands. We add **Accept test leads (24 h)** with the owner's own mobile; those leads run end to end and are auto-erased — this also gives the App Review screencast. | §7 steps 6b, 11; §18.7 |
| A15 | Ordering bugs: Test before token; Page ID; disabled → 503 | **Accept** | Page ID collected in step 2; only the App Secret is needed to verify and store ids; not ready → `held` + 200; 503 only when nothing can be verified. | §7, §18.2 |
| A16 | Employee system user; system-user cap | **Accept** | Employee role with partial assets. The cap is not stated on Meta's system-users page, so the guide says to check for a free slot. | §6, §7 step 5 |
| A17 | Callback domain change | **Accept** | `verifiedSiteUrl`, plus a warning when the site URL differs. | §7, §18.1 |
| A18 | Business Verification documents; domain | **Accept** | Step 6b wording. | §7 |
| A19 | Developer account, 2FA | **Accept** | Step 0. | §6 |
| A20 | Realistic time | **Accept** | Stated at the top of the guide. | Part 2 |
| A21 | No crontab; `after()` may die; silence alert | **Partly** | Opportunistic processing (summary poll, status GET) is the primary fallback. The repo already ships `deploy/aspire-web.cron`, installed at release with the owner's approval, so we add one optional loopback line rather than require it. The silence alert is accepted. | §18.5 |
| A22 | Bootstrap could pick a developer account | **Accept** | Only when exactly one admin exists; visible "set automatically" line; banner + CLI as a deploy step. | §11, §25 |
| A23 | No real-time nudge | **Accept** / **Reject** Web Push now | Tab-title count, app badge, optional chime. Web Push needs a service worker, keys and a separate decision under D-041. | §15 |
| A24 | Area heads can't take leads | **Accept** | `takes_leads` per membership. | §12, §13.4 |
| A25 | "Take next" pull model | **Reject** (for now) | Away + borrow + bulk reassign + load-aware picking already cover leave; letting counsellors pull from an unassigned pool widens who can see children's data. | — |
| A26 | Same family on two numbers | **Reject** (for now) | Name matching across Hindi/English spellings is unreliable and a wrong hint invites wrong merges; staff can search by name. Revisit with real data. | — |
| A27 | Junk per campaign; Higher intent forms | **Accept** | `junk` in `byCampaign`; Higher intent mentioned as optional (vendor-sourced, hedged). | §16, §7 step 12 |
| A28 | Changeover date | **Accept** | Owner section. | §2, §4 |
| S-H1 | An ordinary admin can take over an SA via password reset | **Accept** | `super_admin_target` on reset, disable and edit; CLI `reset-password` as recovery; staff targets SA-only (Q7). | §11 |
| S-H2 | Manager scope fails open | **Accept** | Explicit `crm_staff_scope`; zero areas = only assigned; legacy accounts listed for review; tests for each scenario. | §12, §13.5 |
| S-H3 | Imports and late Meta leads reopen lost leads and overwrite consent | **Accept** | `existing: "attach"`; Meta chronology (`created_time` older than the last lost/enrolled change or consent withdrawal → attach); no file fingerprint — all in CORE. | §14.2 |
| S-H4 | Meta consent doesn't meet D-039 for minors; the Meta basis can be claimed for any list; the method leaks into Add enquiry | **Accept** | Consent checkbox with the v2 sentence recommended; key stored per form; responses kept even in basic mode; "confirm consent on first call" flag; Meta basis only for rows with a valid lead id; `SYSTEM_CONSENT_METHODS` kept apart from `CONSENT_METHODS`. Leads without the checkbox are not blocked: they came from a Meta form with Aspire's privacy link, and the first call records the confirmation. | §7, §14.2, §17, §18.3 |
| S-H5 | Bootstrap takes the write lock on every read; wrong person | **Accept** | Lock-free `EXISTS` + process flag; transaction only with zero grants and exactly one admin; banner; CLI. | §11 |
| S-M1 | `areas` scope breaks Reports for heads | **Accept** | `EXISTS` subquery; `LeadRow.areaId` required. | §13.5 |
| S-M2 | Query parameters must narrow scope; Meta inbox is statewide | **Accept** | 403 tests; inbox SA-only. | §13.5, §21 |
| S-M3 | nginx 1 MB; 5,000 captures in one transaction | **Accept** | Browser parsing; chunks of ≤ 250 rows / 256 KB, one transaction each; resumable. | §17 |
| S-M4 | Excel damage undetected; `'+91`; ANSI | **Accept** | Detector, `'` and `.0` stripping, fatal UTF-8 then 1252, `?`-cells flagged, state-machine parser. | §17 |
| S-M5 | Unkeyed CSV hash after erase; same family returns via the next sheet | **Accept** | Keyed HMAC refs; erase suppression checked by imports and older Meta leads; privacy wording. | §12, §14.2, §23 |
| S-M6 | Error 100 is not one case | **Accept** | Subcode classification; `unavailable` after 3; permission pause only after 5 different leads or a failed `check`. | §18.4 |
| S-M7 | Dashboard sample filtered before detection | **Accept** | Sample detected first. | §18.2 |
| S-M8 | Nothing reliably processes pending leads | **Partly** | Same as A21: opportunistic triggers + optional cron. Clocks start at `received_at`, so a late lead shows as honestly late. | §18.5 |
| S-M9 | Erased families' answers re-fetched | **Accept** | Refs checked before inbox insert and before any Graph call; the reconciler reads `id,created_time` only. The residual case (a different, older lead id from an erased family) is fetched once and discarded immediately — documented. | §18.2–18.5 |
| S-M10 | A disabled integration returns 503 forever | **Accept** | `held` + 200. | §18.2 |
| S-M11 | Token blast radius; tokens in URLs; raw `after()` errors | **Accept** | Employee user, partial Page (Ads), view-only ad account; `business_management`/`ads_read` dropped (not in Meta's Retrieving list); token in the header with fallback; `after()` wrapped. | §7, §18.6 |
| S-M12 | Cron token visible on a shared host | **Accept** | Loopback only (no `X-Forwarded-For`/`X-Real-IP`; loopback `Host`); header file mode 600; exact proxy paths. | §18.5 |
| S-M13 | Key rotation; ambiguous key format; backups | **Accept** | `INTEGRATIONS_SECRET_PREVIOUS` + reseal; opaque key ≥ 43 characters; backup checked (DB only). | §19 |
| S-L1 | Body limit; malformed signature | **Accept** | `readBodyWithLimit`; header regex → 401. | §18.2 |
| S-L2 | Audit keys dropped by the sanitizer | **Accept** | `{ slot }` + test. | §18.7, §23 |
| S-L3 | MCP is not read-only | **Accept** | §10 corrected; `channel: "mcp"`; never an SA; MCP never resolves clocks. | §10, §14.3 |
| S-L4 | Concurrent revokes; re-auth | **Accept** | Check inside `BEGIN IMMEDIATE`; password for grant, revoke and secrets. | §11, §18.7 |
| S-L5 | Merge moves heads silently | **Accept** | Per-person choice. | §13.6 |
| S-L6 | docker-compose edit unnecessary and risky | **Accept** | README and cron only. | §19, §24 |
| S-L7 | Copies outside the CRM | **Accept** | Erase dialog + privacy copy. | §23 |
| S-P1 | Message keys bottleneck | **Accept** | Nested `crm-*.ts` pairs, one per package. | §24 |
| S-P2 | Membership seam missing; empty areas → 500 | **Accept** | `setUserAreas` seam; the stub returns `unknown_area` (422). | §14.3 |
| S-P3 | Attach/chronology and refs-before-Graph must be in CORE | **Accept** | In `capture.ts` and `repo/intake.ts`. | §14.2 |
| S-P4 | CORE test command reaches into the other workflow | **Accept** | Explicit paths; `src/app/api/admin/mocktest/**` excluded. | §24 |
| S-P5 | Seeding changes existing tests | **Accept** | Lazy seed with no audit or activity rows; CORE tests independent of stubs. | §13.1, §14.3 |
