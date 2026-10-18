/**
 * Canonical book list (66 books, Protestant order) with English and French
 * names, chapter counts and common abbreviations used for reference parsing.
 */
export interface CanonBook {
  number: number;
  en: string;
  fr: string;
  chapters: number;
  aliases: string[];
}

export const CANON: CanonBook[] = [
  { number: 1, en: 'Genesis', fr: 'Genèse', chapters: 50, aliases: ['gen', 'ge', 'gn'] },
  { number: 2, en: 'Exodus', fr: 'Exode', chapters: 40, aliases: ['ex', 'exo', 'exod'] },
  { number: 3, en: 'Leviticus', fr: 'Lévitique', chapters: 27, aliases: ['lev', 'lv', 'le'] },
  { number: 4, en: 'Numbers', fr: 'Nombres', chapters: 36, aliases: ['num', 'nu', 'nb', 'nm'] },
  { number: 5, en: 'Deuteronomy', fr: 'Deutéronome', chapters: 34, aliases: ['deut', 'dt', 'de'] },
  { number: 6, en: 'Joshua', fr: 'Josué', chapters: 24, aliases: ['josh', 'jos'] },
  { number: 7, en: 'Judges', fr: 'Juges', chapters: 21, aliases: ['judg', 'jdg', 'jg', 'jug'] },
  { number: 8, en: 'Ruth', fr: 'Ruth', chapters: 4, aliases: ['ru', 'rt', 'rth'] },
  { number: 9, en: '1 Samuel', fr: '1 Samuel', chapters: 31, aliases: ['1sam', '1sa', '1s', '1sm'] },
  { number: 10, en: '2 Samuel', fr: '2 Samuel', chapters: 24, aliases: ['2sam', '2sa', '2s', '2sm'] },
  { number: 11, en: '1 Kings', fr: '1 Rois', chapters: 22, aliases: ['1kgs', '1ki', '1k', '1r', '1rs'] },
  { number: 12, en: '2 Kings', fr: '2 Rois', chapters: 25, aliases: ['2kgs', '2ki', '2k', '2r', '2rs'] },
  { number: 13, en: '1 Chronicles', fr: '1 Chroniques', chapters: 29, aliases: ['1chr', '1ch', '1chron'] },
  { number: 14, en: '2 Chronicles', fr: '2 Chroniques', chapters: 36, aliases: ['2chr', '2ch', '2chron'] },
  { number: 15, en: 'Ezra', fr: 'Esdras', chapters: 10, aliases: ['ezr', 'esd'] },
  { number: 16, en: 'Nehemiah', fr: 'Néhémie', chapters: 13, aliases: ['neh', 'ne'] },
  { number: 17, en: 'Esther', fr: 'Esther', chapters: 10, aliases: ['est', 'esth'] },
  { number: 18, en: 'Job', fr: 'Job', chapters: 42, aliases: ['job', 'jb'] },
  { number: 19, en: 'Psalms', fr: 'Psaumes', chapters: 150, aliases: ['ps', 'psa', 'psalm', 'pss', 'psaume'] },
  { number: 20, en: 'Proverbs', fr: 'Proverbes', chapters: 31, aliases: ['prov', 'pr', 'prv', 'pro'] },
  { number: 21, en: 'Ecclesiastes', fr: 'Ecclésiaste', chapters: 12, aliases: ['eccl', 'ecc', 'ec', 'qo'] },
  { number: 22, en: 'Song of Solomon', fr: 'Cantique des cantiques', chapters: 8, aliases: ['song', 'sos', 'ss', 'ct', 'cant', 'songofsongs'] },
  { number: 23, en: 'Isaiah', fr: 'Ésaïe', chapters: 66, aliases: ['isa', 'is', 'es', 'esa', 'isaie'] },
  { number: 24, en: 'Jeremiah', fr: 'Jérémie', chapters: 52, aliases: ['jer', 'jr', 'je'] },
  { number: 25, en: 'Lamentations', fr: 'Lamentations', chapters: 5, aliases: ['lam', 'lm', 'la'] },
  { number: 26, en: 'Ezekiel', fr: 'Ézéchiel', chapters: 48, aliases: ['ezek', 'eze', 'ezk', 'ez'] },
  { number: 27, en: 'Daniel', fr: 'Daniel', chapters: 12, aliases: ['dan', 'dn', 'da'] },
  { number: 28, en: 'Hosea', fr: 'Osée', chapters: 14, aliases: ['hos', 'ho', 'os'] },
  { number: 29, en: 'Joel', fr: 'Joël', chapters: 3, aliases: ['joel', 'jl', 'joe'] },
  { number: 30, en: 'Amos', fr: 'Amos', chapters: 9, aliases: ['am', 'amo'] },
  { number: 31, en: 'Obadiah', fr: 'Abdias', chapters: 1, aliases: ['obad', 'ob', 'ab', 'abd'] },
  { number: 32, en: 'Jonah', fr: 'Jonas', chapters: 4, aliases: ['jon', 'jnh'] },
  { number: 33, en: 'Micah', fr: 'Michée', chapters: 7, aliases: ['mic', 'mi'] },
  { number: 34, en: 'Nahum', fr: 'Nahum', chapters: 3, aliases: ['nah', 'na'] },
  { number: 35, en: 'Habakkuk', fr: 'Habacuc', chapters: 3, aliases: ['hab', 'ha'] },
  { number: 36, en: 'Zephaniah', fr: 'Sophonie', chapters: 3, aliases: ['zeph', 'zep', 'so', 'soph'] },
  { number: 37, en: 'Haggai', fr: 'Aggée', chapters: 2, aliases: ['hag', 'hg', 'ag'] },
  { number: 38, en: 'Zechariah', fr: 'Zacharie', chapters: 14, aliases: ['zech', 'zec', 'za', 'zac'] },
  { number: 39, en: 'Malachi', fr: 'Malachie', chapters: 4, aliases: ['mal', 'ml'] },
  { number: 40, en: 'Matthew', fr: 'Matthieu', chapters: 28, aliases: ['matt', 'mt', 'mat'] },
  { number: 41, en: 'Mark', fr: 'Marc', chapters: 16, aliases: ['mk', 'mrk', 'mc', 'mr'] },
  { number: 42, en: 'Luke', fr: 'Luc', chapters: 24, aliases: ['lk', 'luk', 'lc', 'lu'] },
  { number: 43, en: 'John', fr: 'Jean', chapters: 21, aliases: ['jn', 'jhn', 'joh', 'jean'] },
  { number: 44, en: 'Acts', fr: 'Actes', chapters: 28, aliases: ['act', 'ac'] },
  { number: 45, en: 'Romans', fr: 'Romains', chapters: 16, aliases: ['rom', 'ro', 'rm'] },
  { number: 46, en: '1 Corinthians', fr: '1 Corinthiens', chapters: 16, aliases: ['1cor', '1co'] },
  { number: 47, en: '2 Corinthians', fr: '2 Corinthiens', chapters: 13, aliases: ['2cor', '2co'] },
  { number: 48, en: 'Galatians', fr: 'Galates', chapters: 6, aliases: ['gal', 'ga'] },
  { number: 49, en: 'Ephesians', fr: 'Éphésiens', chapters: 6, aliases: ['eph', 'ep'] },
  { number: 50, en: 'Philippians', fr: 'Philippiens', chapters: 4, aliases: ['phil', 'php', 'ph', 'phi'] },
  { number: 51, en: 'Colossians', fr: 'Colossiens', chapters: 4, aliases: ['col', 'co'] },
  { number: 52, en: '1 Thessalonians', fr: '1 Thessaloniciens', chapters: 5, aliases: ['1thess', '1th', '1ts'] },
  { number: 53, en: '2 Thessalonians', fr: '2 Thessaloniciens', chapters: 3, aliases: ['2thess', '2th', '2ts'] },
  { number: 54, en: '1 Timothy', fr: '1 Timothée', chapters: 6, aliases: ['1tim', '1ti', '1tm'] },
  { number: 55, en: '2 Timothy', fr: '2 Timothée', chapters: 4, aliases: ['2tim', '2ti', '2tm'] },
  { number: 56, en: 'Titus', fr: 'Tite', chapters: 3, aliases: ['tit', 'tt'] },
  { number: 57, en: 'Philemon', fr: 'Philémon', chapters: 1, aliases: ['phlm', 'phm', 'philem', 'phmn'] },
  { number: 58, en: 'Hebrews', fr: 'Hébreux', chapters: 13, aliases: ['heb', 'he', 'hb'] },
  { number: 59, en: 'James', fr: 'Jacques', chapters: 5, aliases: ['jas', 'jm', 'jc', 'jac', 'ja'] },
  { number: 60, en: '1 Peter', fr: '1 Pierre', chapters: 5, aliases: ['1pet', '1pe', '1pt', '1p', '1pi'] },
  { number: 61, en: '2 Peter', fr: '2 Pierre', chapters: 3, aliases: ['2pet', '2pe', '2pt', '2p', '2pi'] },
  { number: 62, en: '1 John', fr: '1 Jean', chapters: 5, aliases: ['1jn', '1jhn', '1jo', '1j'] },
  { number: 63, en: '2 John', fr: '2 Jean', chapters: 1, aliases: ['2jn', '2jhn', '2jo', '2j'] },
  { number: 64, en: '3 John', fr: '3 Jean', chapters: 1, aliases: ['3jn', '3jhn', '3jo', '3j'] },
  { number: 65, en: 'Jude', fr: 'Jude', chapters: 1, aliases: ['jud', 'jde'] },
  { number: 66, en: 'Revelation', fr: 'Apocalypse', chapters: 22, aliases: ['rev', 're', 'rv', 'ap', 'apoc', 'revelations'] },
];

export function canonBook(number: number): CanonBook | undefined {
  return CANON[number - 1];
}

/** Lower-case, accent-free, no spaces/dots. "1 Cor." -> "1cor", "Ésaïe" -> "esaie". */
export function bookKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^(iii|3rd|third|troisieme)\s*/, '3')
    .replace(/^(ii|2nd|second|deuxieme)\s*/, '2')
    .replace(/^(i|1st|first|premier|premiere)\s+/, '1')
    .replace(/[\s.]+/g, '');
}

const aliasIndex = new Map<string, number>();
for (const book of CANON) {
  for (const key of [bookKey(book.en), bookKey(book.fr), ...book.aliases.map(bookKey)]) {
    if (!aliasIndex.has(key)) aliasIndex.set(key, book.number);
  }
}

/**
 * Finds a book from free text (English or French name or abbreviation).
 * Exact aliases win; otherwise the first book whose name starts with the text.
 * `extraNames` lets imported translations contribute their own book names.
 */
export function findBook(text: string, extraNames: Array<{ number: number; name: string }> = []): number | null {
  const key = bookKey(text);
  if (!key) return null;
  for (const extra of extraNames) if (bookKey(extra.name) === key) return extra.number;
  const exact = aliasIndex.get(key);
  if (exact) return exact;
  if (key.length < 2) return null;
  for (const book of CANON) {
    if (bookKey(book.en).startsWith(key) || bookKey(book.fr).startsWith(key)) return book.number;
  }
  for (const extra of extraNames) if (bookKey(extra.name).startsWith(key)) return extra.number;
  return null;
}

/** Maps OSIS book ids (Gen, Exod, ..., Rev) to canonical numbers. */
export const OSIS_IDS = [
  'Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth', '1Sam', '2Sam', '1Kgs', '2Kgs', '1Chr', '2Chr',
  'Ezra', 'Neh', 'Esth', 'Job', 'Ps', 'Prov', 'Eccl', 'Song', 'Isa', 'Jer', 'Lam', 'Ezek', 'Dan', 'Hos', 'Joel',
  'Amos', 'Obad', 'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal', 'Matt', 'Mark', 'Luke', 'John',
  'Acts', 'Rom', '1Cor', '2Cor', 'Gal', 'Eph', 'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm',
  'Heb', 'Jas', '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rev',
];

export function osisToNumber(id: string): number | null {
  const index = OSIS_IDS.findIndex((o) => o.toLowerCase() === id.toLowerCase());
  return index >= 0 ? index + 1 : null;
}
