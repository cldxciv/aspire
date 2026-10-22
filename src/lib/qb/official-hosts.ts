/**
 * Official issuer hosts (owner: QB-CORE; §B2, §B3). Pure, shared by the schemas, the taxonomy and the
 * question rules: an official question's evidence and a syllabus unit's citation must be on one of
 * these https sites. Anything else (a coaching site, a mirror, a file-sharing link) is third-party.
 *
 * - NTA: nta.ac.in and its *.nic.in exam sites (jeemain.nta.nic.in, neet.nta.nic.in, exams.nta.ac.in);
 * - government: *.nic.in (NCERT and ministry pages), s3waas.gov.in (NIC-hosted ministry sites);
 * - NMC: nmc.org.in;
 * - JEE (Advanced): jeeadv.ac.in and the organising IITs' own sites (iitXX.ac.in).
 */

/** The IITs' own domains (the organising IIT publishes JEE (Advanced) papers and keys some years). */
export const IIT_DOMAINS: readonly string[] = [
  "iitb", "iitd", "iitk", "iitm", "iitkgp", "iitr", "iitg", "iith", "iitbhu", "iitism", "iiti", "iitp",
  "iitj", "iitrpr", "iitbbs", "iitgn", "iitmandi", "iittp", "iitpkd", "iitdh", "iitjammu", "iitbhilai", "iitgoa",
];

export const OFFICIAL_SOURCE_HOSTS = new RegExp(
  `(^|\\.)(nta\\.ac\\.in|nic\\.in|nmc\\.org\\.in|jeeadv\\.ac\\.in|s3waas\\.gov\\.in|(?:${IIT_DOMAINS.join("|")})\\.ac\\.in)$`,
  "i",
);

/** The hint shown when a link is not on an official site. */
export const OFFICIAL_HOSTS_HINT = "nta.ac.in, *.nic.in (for example jeemain.nta.nic.in), nmc.org.in, jeeadv.ac.in or an IIT's own .ac.in site";

export function isOfficialSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && OFFICIAL_SOURCE_HOSTS.test(url.hostname);
  } catch {
    return false;
  }
}
