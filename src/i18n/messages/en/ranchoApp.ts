/**
 * Namespace "ranchoApp" — Rancho as the installable app (owner: PWA): the /rancho app home, the
 * "Get the Rancho app" install bar on phones and tablets, its instruction sheet, the desktop
 * install card, the /tools card and the footer link. Rancho is Aspire's snow leopard mascot and
 * the AI doubt solver; the copy always keeps clear that Rancho is an AI.
 * English defines the shape; ../hi/ranchoApp.ts must match it. Plain object, no `as const`.
 */
const ranchoApp = {
  meta: {
    title: "Rancho — AI doubt solver and study app",
    description:
      "Rancho, Aspire IIT & Medical's AI doubt solver, with the rank predictor, mock tests and study planner in one app for your phone. In English and Hindi.",
  },
  home: {
    eyebrow: "The Rancho app",
    title: "Hi, I'm Rancho!",
    lead: "Aspire's AI doubt solver for JEE, NEET and school science. Type your doubt or send a photo — in English or Hindi.",
    aiNote: "I'm an AI, not a teacher, so I can make mistakes — check important answers with your teacher.",
    mascotLabel: "Rancho, Aspire's snow leopard mascot",
  },
  tools: {
    title: "Rancho can also help with",
    predictor: {
      title: "Rank predictor",
      body: "Score or percentile → rank band and colleges.",
    },
    mockTests: {
      title: "Mock tests",
      body: "Timed CBT practice with analysis.",
    },
    leaderboard: "Leaderboard",
    planner: {
      title: "Study planner",
      body: "A day-by-day plan to your exam.",
    },
    allTools: {
      title: "All tools",
      body: "Every free tool for JEE, NEET and BOH.",
    },
  },
  account: {
    title: "Your Aspire account",
    checking: "Checking whether you're signed in…",
    signedOut: "Students and parents with an Aspire login can sign in to open their portal.",
    student: "Student sign-in",
    parent: "Parent sign-in",
    noAccount: "No login yet? Aspire creates accounts for enrolled students and their parents.",
    signedInAs: "Signed in as {name}",
    roleLine: "{role} account",
    openPortal: "Open my portal",
  },
  install: {
    bar: {
      /** Accessible name of the bar (a labelled region). */
      label: "Get the Rancho app",
      title: "Get the Rancho app",
      /** Kept short: it shares one row with the icon and two buttons on a 360 px phone (wraps to 2 lines at most). */
      value: "AI doubt solver + study tools",
      install: "Install",
      dismiss: "Hide for a week",
    },
    card: {
      title: "Install Rancho on this computer",
      body: "Rancho opens in its own window, with the predictor, mock tests and planner one click away.",
      install: "Install Rancho",
    },
    sheet: {
      close: "Close",
      ios: {
        title: "Add Rancho to your Home Screen",
        stepShareSafari: "Tap the Share button (a square with an arrow) in Safari's toolbar.",
        stepShareOther: "Tap the Share button (a square with an arrow) in the address bar.",
        stepAdd: "Scroll down and tap “Add to Home Screen”.",
        stepConfirm: "Tap “Add”. Rancho appears on your Home Screen.",
        notListed: "Don't see “Add to Home Screen”? Open this page in Safari and try again.",
      },
      menu: {
        title: "Install Rancho",
        chrome: "Tap ⋮ (top right), then “Install app” or “Add to Home screen”.",
        edge: "Open Edge's menu (⋯ or ≡ at the bottom), then “Add to phone”.",
        samsung: "Tap ≡ (bottom right), then “Add page to” → “Home screen”.",
        firefox: "Tap ⋮, then “Install” or “Add to Home screen”.",
        opera: "Tap ⋮, then “Add to” → “Home screen”.",
        other: "Open your browser's menu (⋮ or ≡), then “Install app” or “Add to Home screen”.",
        confirm: "Confirm with “Install” or “Add”. Rancho appears with your other apps.",
      },
      inApp: {
        title: "Open in Chrome or Safari to install Rancho",
        body: "{app}'s built-in browser can't install apps.",
        openChrome: "Open in Chrome",
        androidMenu: "Tap ⋮ (top right) and choose “Open in browser” or “Open in Chrome”.",
        iosMenu: "Tap ⋯ (or the Share button) and choose “Open in Safari” or “Open in browser”.",
        copy: "Copy link",
        copied: "Link copied — paste it into Chrome or Safari.",
        copyFailed: "Couldn't copy. Press and hold the link to copy it.",
        apps: {
          instagram: "Instagram",
          facebook: "Facebook",
          messenger: "Messenger",
          linkedin: "LinkedIn",
          snapchat: "Snapchat",
          x: "X",
          line: "LINE",
          tiktok: "TikTok",
          pinterest: "Pinterest",
          google: "The Google app",
          webview: "This app",
        },
      },
    },
  },
  toolsCard: {
    eyebrow: "On your phone",
    title: "The Rancho app",
    body: "Ask Rancho your doubts and open the predictor, mock tests and planner from one app. Add it to your home screen — no app store needed.",
    cta: "Open the Rancho app",
    iconLabel: "Rancho app icon",
  },
  footerLink: "Rancho app",
};

export default ranchoApp;
