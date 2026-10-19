import { describe, expect, it } from "vitest";
import { mailtoHref, socialHref, telHref, whatsappHref } from "./contact-links";

describe("telHref", () => {
  it("strips formatting", () => {
    expect(telHref("+91 98166 23676")).toBe("tel:+919816623676");
    expect(telHref("+919816623676")).toBe("tel:+919816623676");
  });
  it("rejects values that are not phone numbers", () => {
    expect(telHref("call us")).toBeNull();
    expect(telHref("12")).toBeNull();
  });
});

describe("mailtoHref", () => {
  it("links a single plain address", () => {
    expect(mailtoHref(" admissions@aspireiitmedical.com ")).toBe("mailto:admissions@aspireiitmedical.com");
  });
  it("rejects parameters and extra recipients", () => {
    expect(mailtoHref("a@b.com?subject=hi")).toBeNull();
    expect(mailtoHref("a@b.com,c@d.com")).toBeNull();
    expect(mailtoHref("not an email")).toBeNull();
  });
});

describe("whatsappHref", () => {
  it("keeps a plain wa.me link", () => {
    expect(whatsappHref({ url: "https://wa.me/919816623676", display: "+91 98166 23676" })).toBe(
      "https://wa.me/919816623676",
    );
  });
  it("drops prefilled text", () => {
    expect(whatsappHref({ url: "https://wa.me/919816623676?text=Hello", display: "+91 98166 23676" })).toBe(
      "https://wa.me/919816623676",
    );
  });
  it("falls back to the display number for other URL forms", () => {
    expect(
      whatsappHref({ url: "https://api.whatsapp.com/send?phone=919816623676&text=Hi", display: "+91 98166 23676" }),
    ).toBe("https://wa.me/919816623676");
  });
  it("returns null without a usable number", () => {
    expect(whatsappHref({ url: "https://example.com", display: "WhatsApp us" })).toBeNull();
  });
});

describe("socialHref", () => {
  it("accepts https profile links and removes tracking parameters", () => {
    expect(socialHref("https://www.instagram.com/aspireiitmedical")).toBe("https://www.instagram.com/aspireiitmedical");
    expect(socialHref("https://www.facebook.com/aspire?utm_source=site&fbclid=x#top")).toBe(
      "https://www.facebook.com/aspire",
    );
    expect(socialHref("https://www.facebook.com/profile.php?id=123")).toBe("https://www.facebook.com/profile.php?id=123");
  });
  it("rejects non-https and malformed URLs", () => {
    expect(socialHref("http://example.com")).toBeNull();
    expect(socialHref("javascript:alert(1)")).toBeNull();
    expect(socialHref("not a url")).toBeNull();
  });
});
