import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { withTransaction } from "@/lib/db/connection";

import { insertTemplateIfMissing, listTemplateKeys } from "../../repo/console-templates";
import { SEED_KEYS_1B } from "../types";

/**
 * The 8 staff WhatsApp template DRAFTS of Phase 1b (docs/admin-phase-1b-plan.md §4.4, O5; owner:
 * 1B-CALLS). Seeded with status `draft`, context `general`: nobody can use them until a super admin
 * approves them on /crm/templates. Written for staff to send as themselves (no AI disclosure); no
 * fees, claims or dates, only slots; Hindi verbs avoid the counsellor's gender. Every Hindi and
 * Hinglish body is a machine draft for docs/hindi-review-register.md.
 *
 * Seeding is per key (`INSERT OR IGNORE`), with no marker and no audit or activity rows, so Phase 2
 * can add its `booking` / `test` keys the same way.
 */

export interface SeedTemplate {
  key: (typeof SEED_KEYS_1B)[number];
  en: string;
  hi: string;
  hinglish: string;
}

export const SEED_TEMPLATES_1B: readonly SeedTemplate[] = [
  {
    key: "first_contact",
    en: "Namaste {parent_name} ji, I am {counsellor_name} from Aspire IIT & Medical, {centre}. Thank you for your enquiry about coaching for {student_first_name}. When is a good time for a short call? You can also send your questions here.",
    hi: "नमस्ते {parent_name} जी, मैं {counsellor_name}, Aspire IIT & Medical ({centre}) से। {student_first_name} की कोचिंग के बारे में पूछताछ के लिए धन्यवाद। छोटी-सी बातचीत के लिए आपको कौन-सा समय ठीक रहेगा? अपने सवाल आप यहाँ भी भेज सकते हैं।",
    hinglish:
      "Namaste {parent_name} ji, main {counsellor_name}, Aspire IIT & Medical ({centre}) se. {student_first_name} ki coaching ke baare mein enquiry ke liye dhanyavaad. Ek chhoti si baat ke liye aapko kaunsa time theek rahega? Apne sawaal aap yahan bhi bhej sakte hain.",
  },
  {
    key: "missed_call",
    en: "Namaste {parent_name} ji, I am {counsellor_name} from Aspire IIT & Medical, {centre}. I called about {student_first_name}'s enquiry but could not reach you. Please tell me a time that suits you and I will call again.",
    hi: "नमस्ते {parent_name} जी, मैं {counsellor_name}, Aspire IIT & Medical ({centre}) से। {student_first_name} की पूछताछ के सिलसिले में फ़ोन किया था, पर बात नहीं हो पाई। अपनी सुविधा का समय बता दीजिए, उसी समय दोबारा फ़ोन करेंगे।",
    hinglish:
      "Namaste {parent_name} ji, main {counsellor_name}, Aspire IIT & Medical ({centre}) se. {student_first_name} ki enquiry ke silsile mein call kiya tha, par baat nahi ho paayi. Apni suvidha ka time bata dijiye, usi time dobara call karenge.",
  },
  {
    key: "centre_location",
    en: "Namaste {parent_name} ji, here is our {centre} centre on Google Maps: {centre_map_link}. Please send me a message before you come, so that someone is there to meet you. – {counsellor_name}, Aspire IIT & Medical",
    hi: "नमस्ते {parent_name} जी, Google Maps पर हमारा {centre} सेंटर: {centre_map_link}। आने से पहले एक मैसेज कर दीजिए, ताकि आपसे मिलने के लिए कोई मौजूद रहे। – {counsellor_name}, Aspire IIT & Medical",
    hinglish:
      "Namaste {parent_name} ji, Google Maps par hamara {centre} centre: {centre_map_link}. Aane se pehle ek message kar dijiye, taaki aapse milne ke liye koi maujood rahe. – {counsellor_name}, Aspire IIT & Medical",
  },
  {
    key: "prospectus",
    en: "Namaste {parent_name} ji, here is the Aspire IIT & Medical prospectus, as promised: {prospectus_link}. If you have questions after reading it, reply here or tell me a good time to call. – {counsellor_name}, {centre}",
    hi: "नमस्ते {parent_name} जी, जैसा कहा था, Aspire IIT & Medical का प्रॉस्पेक्टस यह रहा: {prospectus_link}। पढ़ने के बाद कोई सवाल हो, तो यहीं जवाब दीजिए या फ़ोन के लिए सुविधा का समय बताइए। – {counsellor_name}, {centre}",
    hinglish:
      "Namaste {parent_name} ji, jaisa kaha tha, Aspire IIT & Medical ka prospectus yeh raha: {prospectus_link}. Padhne ke baad koi sawaal ho, to yahin reply kijiye ya call ke liye suvidha ka time bataiye. – {counsellor_name}, {centre}",
  },
  {
    key: "visit_invite",
    en: "Namaste {parent_name} ji, you are welcome to visit our {centre} centre with {student_first_name} on {date} at {time}. You can meet a counsellor, see the centre and ask anything. Location: {centre_map_link}. Please reply to confirm. – {counsellor_name}, Aspire IIT & Medical",
    hi: "नमस्ते {parent_name} जी, {date} को {time} बजे {student_first_name} के साथ हमारे {centre} सेंटर आइए। आप काउंसलर से मिल सकते हैं, सेंटर देख सकते हैं और जो चाहें पूछ सकते हैं। लोकेशन: {centre_map_link}। आने की पुष्टि के लिए जवाब दीजिए। – {counsellor_name}, Aspire IIT & Medical",
    hinglish:
      "Namaste {parent_name} ji, {date} ko {time} baje {student_first_name} ke saath hamare {centre} centre aaiye. Aap counsellor se mil sakte hain, centre dekh sakte hain aur jo chahein pooch sakte hain. Location: {centre_map_link}. Aane ki confirmation ke liye reply kijiye. – {counsellor_name}, Aspire IIT & Medical",
  },
  {
    key: "test_date",
    en: "Namaste {parent_name} ji, the next Aspire scholarship test is on {test_date}. If you would like to register {student_first_name} or have any questions, please reply here. – {counsellor_name}, Aspire IIT & Medical, {centre}",
    hi: "नमस्ते {parent_name} जी, Aspire का अगला स्कॉलरशिप टेस्ट {test_date} को है। {student_first_name} का रजिस्ट्रेशन करवाना हो या कोई सवाल हो, तो यहीं जवाब दीजिए। – {counsellor_name}, Aspire IIT & Medical, {centre}",
    hinglish:
      "Namaste {parent_name} ji, Aspire ka agla scholarship test {test_date} ko hai. {student_first_name} ka registration karwana ho ya koi sawaal ho, to yahin reply kijiye. – {counsellor_name}, Aspire IIT & Medical, {centre}",
  },
  {
    key: "batch_start",
    en: "Namaste {parent_name} ji, a new batch starts at our {centre} centre on {batch_start}. If {student_first_name} would like to join, or you want more details, reply here and I will call you. – {counsellor_name}, Aspire IIT & Medical",
    hi: "नमस्ते {parent_name} जी, हमारे {centre} सेंटर में नया बैच {batch_start} से शुरू हो रहा है। अगर {student_first_name} जुड़ना चाहें या आपको और जानकारी चाहिए, तो यहीं जवाब दीजिए, हम आपको फ़ोन करेंगे। – {counsellor_name}, Aspire IIT & Medical",
    hinglish:
      "Namaste {parent_name} ji, hamare {centre} centre mein naya batch {batch_start} se shuru ho raha hai. Agar {student_first_name} judna chahein ya aapko aur jaankari chahiye, to yahin reply kijiye, hum aapko call karenge. – {counsellor_name}, Aspire IIT & Medical",
  },
  {
    key: "after_visit",
    en: "Namaste {parent_name} ji, thank you for visiting our {centre} centre today with {student_first_name}. If any question comes up at home, just message me here. – {counsellor_name}, Aspire IIT & Medical",
    hi: "नमस्ते {parent_name} जी, आज {student_first_name} के साथ हमारे {centre} सेंटर आने के लिए धन्यवाद। घर पर कोई भी सवाल आए, तो यहीं मैसेज कर दीजिए। – {counsellor_name}, Aspire IIT & Medical",
    hinglish:
      "Namaste {parent_name} ji, aaj {student_first_name} ke saath hamare {centre} centre aane ke liye dhanyavaad. Ghar par koi bhi sawaal aaye, to yahin message kar dijiye. – {counsellor_name}, Aspire IIT & Medical",
  },
];

/** The 1b drafts all belong to the lead-page composer. */
export const SEED_CONTEXT_1B = "general";

/**
 * Inserts the missing seed drafts (`INSERT OR IGNORE`, one transaction, only when a key is missing).
 * Returns how many rows were added. Safe under concurrent first reads: a key another request added
 * meanwhile is ignored, never an error.
 */
export function seedMissingTemplates(db: DatabaseSync, missing: readonly SeedTemplate[], now: number): number {
  if (missing.length === 0) return 0;
  return withTransaction(db, () => {
    let added = 0;
    for (const template of missing) {
      const position = SEED_TEMPLATES_1B.findIndex((seed) => seed.key === template.key);
      if (
        insertTemplateIfMissing(db, {
          key: template.key,
          context: SEED_CONTEXT_1B,
          position: position < 0 ? SEED_TEMPLATES_1B.length : position,
          bodyEn: template.en,
          bodyHi: template.hi,
          bodyHinglish: template.hinglish,
          now,
        })
      ) {
        added += 1;
      }
    }
    return added;
  });
}

/**
 * Called on every templates read: a lock-free `SELECT key`; only when a seed key is missing does
 * one write transaction add it. No audit, no activity rows (seeding is not a staff action).
 */
export function ensureTemplatesSeeded(db: DatabaseSync, now: number): number {
  const present = new Set(listTemplateKeys(db));
  const missing = SEED_TEMPLATES_1B.filter((seed) => !present.has(seed.key));
  return seedMissingTemplates(db, missing, now);
}
