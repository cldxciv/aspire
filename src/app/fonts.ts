import { Inter, Noto_Sans_Devanagari, Noto_Serif_Devanagari, Source_Serif_4 } from "next/font/google";

/** Body sans for every locale (Latin). */
export const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Display serif for headings and stat numbers (D-022). Variable weight; italic for slogans.
export const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

/*
 * Hindi (D-028): Devanagari body and heading faces. Their CSS variables are only set on
 * <html> for `hi` pages; globals.css adds them after Inter / Source Serif under :lang(hi),
 * so Latin text keeps the English faces and Devanagari glyphs use Noto.
 * `preload: false`: the root layout is shared by both locales, and English pages must not
 * download Devanagari files.
 */
export const notoSansDevanagari = Noto_Sans_Devanagari({
  variable: "--font-noto-sans-devanagari",
  subsets: ["devanagari"],
  display: "swap",
  preload: false,
});

export const notoSerifDevanagari = Noto_Serif_Devanagari({
  variable: "--font-noto-serif-devanagari",
  subsets: ["devanagari"],
  display: "swap",
  preload: false,
});
