// Hand-maintained data snapshots keyed to ahuzot.co.il, kept apart from
// the app logic so refreshing them never touches code. Each table's
// comment says where it came from and how to regenerate it.

// Generated from ahuzot-parking-lots.csv (id/name/link scraped from
// https://www.ahuzot.co.il/Parking/All/). Keys are normalizeLotName()
// applied to the CSV's name column, values are the lot's ahuzot.co.il ID
// (build the full link with AHUZOT_LINK_BASE); re-generate this whole
// block by hand if that CSV is ever regenerated.
export const AHUZOT_LINK_BASE = "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=";
export const AHUZOT_LINKS = {
  "ארלוזורובחנהוסע": 1,
  "בוגרשוב": 2,
  "בזל": 3,
  "חברהחדשה": 4,
  "בנידן": 7,
  "ברוריה": 8,
  "גולדה": 10,
  "גליגיל": 12,
  "גןהכובשים1מזרח": 13,
  "דובנוב": 15,
  "הארד": 16,
  "החשמל": 18,
  "הצפירה1": 19,
  "הצפירה2": 20,
  "ביתהאצ\"ל": 21,
  "פנחסרוזן": 23,
  "כרמל1": 24,
  "הלוחמים": 25,
  "לולאה": 26,
  "התחנה": 28,
  "מונטיפיורי": 29,
  "מפעלהפיס": 31,
  "מרכזים": 32,
  "מרד": 33,
  "נחושת": 34,
  "סינרמה": 37,
  "סעדיהגאון": 38,
  "פלמ\"ח": 39,
  "רבניצקי": 40,
  "רידינגמערב": 41,
  "שרתון": 42,
  "התקומה": 44,
  "תלנורדאו": 45,
  "מירשם": 48,
  "מדעיהחברה": 50,
  "רפואתשיניים": 53,
  "גליצה\"ל": 54,
  "הבעש\"ט": 55,
  "אבולעפיה": 56,
  "הרבקוק": 57,
  "ידאבנר": 58,
  "מיומי": 62,
  "מכללהלמינהלומכללתלוינסקי1": 63,
  "אחימאיר": 64,
  "סלודור": 65,
  "צבינישרי": 67,
  "רפידים": 68,
  "שלונסקי": 69,
  "מבצעקדש": 70,
  "ביתהחייל": 72,
  "פליטיהספר": 75,
  "טירתצבי": 76,
  "המערכה": 77,
  "טאגור": 79,
  "מכללתיפו": 80,
  "עירשמש": 81,
  "ביתצורי": 85,
  "ברזאני": 87,
  "בןיוסף2": 88,
  "וולפסון2": 89,
  "מכללהלמינהלומכללתלוינסקי3": 90,
  "מכללהלמינהלומכללתלוינסקי2": 91,
  "ביתהדר": 93,
  "התרבות": 94,
  "סמולרש": 95,
  "כלכלה": 96,
  "גולפיטק": 98,
  "גנייהושע": 99,
  "סוציאליתמעונות": 108,
  "אלוף": 110,
  "כרמל2": 114,
  "לסקוב": 119,
  "ליבר": 120,
  "המוזיאונים": 121,
  "אסותא": 122,
  "ארלוזורוב17": 123,
  "גולדמן": 124,
  "רידינגמזרח": 126,
  "צמרות": 127,
  "גןהכובשים2מערב": 129,
  "רמזארלוזורוב": 131,
  "כיכרעליה": 132,
  "המשתלה": 133,
  "חוףתלברוך": 134,
  "קצההשדרהרוטשילד1": 135,
  "כיתן": 137,
  "בןיוסף": 138,
  "סוללים": 140
};

// The GIS feed's own tariff-notes text (hearot_taarif) drifts out of sync
// with the real discount (e.g. it said 75% for lot 42/"שרתון" when
// ahuzot.co.il's own page said 50%). Keyed by ahuzot.co.il ID, this is a
// one-time snapshot of each lot's actual resident discount taken directly
// from ahuzot.co.il. Resident discounts change rarely, so this is
// refreshed by hand occasionally rather than fetched live.
export const RESIDENT_DISCOUNT_BY_AHUZOT_ID = {
  1: 75, 2: 50, 3: 50, 4: 75, 7: 50, 8: 75, 10: 50, 12: 75, 13: 75, 15: 75,
  16: 75, 18: 75, 19: 75, 20: 75, 21: 75, 23: 75, 24: 50, 25: 75, 26: 75,
  28: 75, 29: 75, 31: 75, 32: 75, 33: 75, 34: 75, 37: 75, 38: 75, 39: 75,
  40: 75, 41: 75, 42: 50, 44: 75, 45: 50, 48: 50, 50: 50, 53: 50, 93: 75,
  94: 75, 95: 50, 96: 50, 98: 75, 99: 75, 108: 50, 114: 50, 119: 75,
  120: 75, 121: 50, 122: 75, 123: 75, 124: 75, 126: 75, 127: 75, 129: 75,
  131: 75, 132: 75, 134: 75, 135: 75, 137: 75, 140: 75
};

// Parking-spot counts per lot, keyed by ahuzot.co.il ID. The GIS feed's
// capacity field (mispar_mekomot_bchenyon) is 0/null for ~90 of 94 lots,
// so this is a one-time snapshot of "מס' מקומות חנייה בחניון" scraped from
// each lot's ahuzot.co.il page (2026-09-08). Capacities change rarely;
// refresh by hand occasionally, like RESIDENT_DISCOUNT_BY_AHUZOT_ID.
// Lot 138 (בן יוסף) shows no capacity on their site.
export const CAPACITY_BY_AHUZOT_ID = {
  1: 250, 2: 50, 3: 196, 4: 68, 7: 60, 8: 235, 10: 937, 12: 319,
  13: 69, 15: 110, 16: 84, 18: 36, 19: 53, 20: 113, 21: 260, 23: 143,
  24: 243, 25: 260, 26: 186, 28: 590, 29: 18, 31: 83, 32: 191, 33: 51,
  34: 448, 37: 311, 38: 66, 39: 135, 40: 102, 41: 485, 42: 49, 44: 20,
  45: 165, 48: 62, 50: 263, 53: 121, 54: 50, 55: 80, 56: 90, 57: 70,
  58: 40, 62: 70, 63: 21, 64: 70, 65: 68, 67: 18, 68: 100, 69: 84,
  70: 350, 72: 53, 75: 27, 76: 20, 77: 55, 79: 153, 80: 400, 81: 65,
  85: 200, 87: 40, 88: 60, 89: 100, 90: 214, 91: 114, 93: 558, 94: 997,
  95: 490, 96: 114, 98: 297, 99: 1310, 108: 104, 110: 115, 114: 124, 119: 53,
  120: 50, 121: 567, 122: 100, 123: 162, 124: 82, 126: 147, 127: 168, 129: 41,
  131: 185, 132: 260, 133: 100, 134: 1495, 135: 390, 137: 60, 140: 240
};

