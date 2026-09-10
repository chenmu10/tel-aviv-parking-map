// "This data is wrong" reports to the data provider (Ahuzot HaHof): the
// report text, the Gmail compose link, and the copy-for-their-form text.
// Pure string/URL helpers -- markers.js owns the report panel DOM.
//
// Gmail's compose URL rather than mailto: mailto hands off to the OS default
// mail app, which on iPhones is often an unconfigured Apple Mail and on
// desktops is rarely the mail the user actually reads. The copy + form path
// covers everyone without Gmail.

import { AHUZOT_CONTACT_EMAIL, AHUZOT_CONTACT_FORM_URL } from "./config.js";
import { formatUpdatedAt, israelNowMs, statusInfo } from "./format.js";

// What the user says is wrong. Each category gives the subject noun and the
// sentence that opens the report body (status text filled in for the first).
export const REPORT_CATEGORIES = [
  {
    key: "status",
    label: "הסטטוס שגוי (יש מקום / מלא בפועל)",
    subject: "סטטוס שגוי",
    sentence: (status) => `מוצג כרגע סטטוס "${status}", אך בפועל המצב שונה`
  },
  {
    key: "closed",
    label: "החניון סגור בפועל",
    subject: "חניון סגור",
    sentence: () => "מוצג כפעיל, אך בפועל החניון סגור"
  },
  {
    key: "pricing",
    label: "מחיר / שעות פעילות לא נכונים",
    subject: "מחיר או שעות פעילות שגויים",
    sentence: () => "המחיר או שעות הפעילות המוצגים אינם תואמים את המצב בשטח"
  },
  {
    key: "other",
    label: "אחר",
    subject: "נתון שגוי",
    sentence: () => "יש אי-התאמה בין הנתונים המוצגים למצב בשטח"
  }
];

export function reportCategory(key) {
  return REPORT_CATEGORIES.find((c) => c.key === key) || REPORT_CATEGORIES[0];
}

// Everything the provider needs to find the record: their own lot number
// (when we can match it), the GIS layer/field/oid the app reads, and both
// timestamps. The user only adds what they actually saw.
export function buildReport(lot, categoryKey, { ahuzotId, officialLink, deepLink }) {
  const category = reportCategory(categoryKey);
  const status = statusInfo(lot.status).short;
  const name = lot.name || "חניון";
  const lotRef = [lot.address, ahuzotId ? `מס׳ חניון ${ahuzotId} באתר שלכם` : null].filter(Boolean).join(", ");

  const subject = `דיווח על ${category.subject} — חניון ${name}` + (ahuzotId ? ` (מס׳ ${ahuzotId})` : "");
  const body = [
    "שלום,",
    "",
    `בחניון ${name}${lotRef ? ` (${lotRef})` : ""} ${category.sentence(status)}.`,
    "מה ראיתי בפועל: ",
    "",
    "פרטים טכניים:",
    `· סטטוס מוצג: ${status}`,
    `· הסטטוס עודכן אצלכם לאחרונה: ${lot.updatedAt ? formatUpdatedAt(lot.updatedAt) : "לא ידוע"}`,
    `· זמן הדיווח: ${formatUpdatedAt(israelNowMs())}`,
    `· מקור הנתון: שכבת ה-GIS העירונית IView2/970, שדה status_chenyon, oid ${lot.id}`,
    officialLink ? `· עמוד החניון: ${officialLink}` : null,
    "",
    `נשלח דרך מפת החניונים: ${deepLink}`
  ].filter((line) => line !== null).join("\n");

  return { subject, body };
}

// iPadOS Safari reports a Mac user agent; the touch-point check catches it.
const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// On iOS, mail.google.com links open in Safari (Gmail for iOS registers no
// universal link for compose), so the Gmail app's own URL scheme is used
// there -- it opens the app straight into a prefilled draft. Android and
// desktop handle the web compose URL (Android hands it to the Gmail app).
export function gmailComposeUrl({ subject, body }) {
  const to = encodeURIComponent(AHUZOT_CONTACT_EMAIL);
  const su = encodeURIComponent(subject);
  const bo = encodeURIComponent(body);
  return IS_IOS
    ? `googlegmail:///co?to=${to}&subject=${su}&body=${bo}`
    : `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${su}&body=${bo}`;
}

// A custom-scheme link must open in the current tab: target=_blank on iOS
// leaves a blank Safari tab behind when the app takes over.
export const gmailLinkTarget = IS_IOS ? "_self" : "_blank";

// What lands on the clipboard for pasting into the contact form.
export function reportClipboardText({ subject, body }) {
  return `אל: ${AHUZOT_CONTACT_EMAIL}\nנושא: ${subject}\n\n${body}`;
}

export const contactFormUrl = AHUZOT_CONTACT_FORM_URL;
export const contactEmail = AHUZOT_CONTACT_EMAIL;
