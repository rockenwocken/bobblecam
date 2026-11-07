// Titles and scores for the frame footer, STARSHOT style. Add your own words!

const pick = (a) => a[Math.floor(Math.random() * a.length)];

const ADJ = ['ULTRA', 'MEGA', 'TURBO', 'HYPER', 'LEGENDARY', 'SPICY', 'KAWAII', 'FORBIDDEN', 'MUSCLE',
  'GALACTIC', 'SLIGHTLY DAMP', 'DELUXE', 'MIDNIGHT', 'NEON', 'WOBBLY', 'JELLY', 'SQUISHY', 'BOUNCY', 'GOOEY', 'STRETCHY'];
const NOUN = ['TOFU', 'PENGUIN', 'SAMURAI', 'NOODLE', 'IDOL', 'KAIJU', 'PUDDING', 'DISCO', 'PROTEIN', 'ROBOT',
  'SHRIMP', 'GRANDMA', 'BURRITO', 'DUMPLING', 'BLOBFISH', 'MOCHI', 'BUBBLEHEAD', 'MARSHMALLOW', 'SLIME'];
const SUFFIX = ['SQUAD', 'ATTACK', 'FEVER', 'REVOLUTION', 'MARCH', 'EXPLOSION', '2000', 'TURBO EDITION',
  'SAGA', 'DREAM', 'PANIC', 'PARADE', 'MELTDOWN', 'WOBBLE-O-RAMA'];

export function title() {
  return `${pick(ADJ)} ${pick(NOUN)} ${pick(SUFFIX)}`;
}

/**
 * Score from how hard (strength, px) and how much (cover, 0..1) the picture was gooed,
 * plus extras (talk: loudness and pitch) and a pinch of luck (0..1, fixed per photo).
 */
export function score({ strength, cover }, extra = 0, luck = Math.random()) {
  const goo = 0.55 * Math.min(1, strength / 45) + 0.45 * Math.min(1, cover / 0.25);
  const s = 450000 + goo * 550000 + extra + luck * 90000;
  return Math.round(s / 10) * 10;
}

export function rank(s) {
  if (s >= 1050000) return 'SSS';
  if (s >= 950000) return 'S';
  if (s >= 850000) return 'A';
  if (s >= 700000) return 'B';
  return 'F(LAT)';
}
