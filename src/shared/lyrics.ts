/**
 * Lyrics text format (documented in docs/FORMATS.md):
 *
 *   [Verse 1]
 *   Amazing grace, how sweet the sound
 *   That saved a wretch like me
 *
 *   I once was lost, but now am found      <- blank line = new slide
 *   Was blind, but now I see
 *
 *   [Chorus]
 *   ...
 *
 * Headers may be written in brackets ("[Chorus]") or, for common names in
 * English and French, alone on a line ("Chorus", "Refrain 2:", "Couplet 1").
 * Text without any header becomes one verse per paragraph.
 */
import type { SectionType, SongArrangement, SongSection } from './types';
import { newId } from './util';

interface TypeRule {
  type: SectionType;
  prefix: string;
  words: string[];
}

const TYPE_RULES: TypeRule[] = [
  { type: 'pre-chorus', prefix: 'P', words: ['pre-chorus', 'prechorus', 'pre chorus', 'pré-refrain', 'pre-refrain', 'prérefrain'] },
  { type: 'chorus', prefix: 'C', words: ['chorus', 'refrain', 'choeur', 'chœur'] },
  { type: 'verse', prefix: 'V', words: ['verse', 'couplet', 'strophe', 'v'] },
  { type: 'bridge', prefix: 'B', words: ['bridge', 'pont'] },
  { type: 'tag', prefix: 'T', words: ['tag'] },
  { type: 'intro', prefix: 'I', words: ['intro', 'introduction'] },
  { type: 'outro', prefix: 'E', words: ['outro', 'ending', 'end', 'fin', 'final', 'coda'] },
];

const BRACKET_HEADER = /^\s*\[(.+?)\]\s*$/;
const PLAIN_HEADER = new RegExp(
  '^\\s*(' +
    TYPE_RULES.flatMap((r) => r.words)
      .filter((w) => w.length > 1)
      .map((w) => w.replace(/[-]/g, '\\-'))
      .join('|') +
    ')\\s*(\\d+)?\\s*:?\\s*$',
  'i',
);

/** Classifies a header name such as "Verse 2" or "Refrain" or "V1". */
export function classifyHeader(rawName: string): { type: SectionType; prefix: string; number: number | null } {
  const name = rawName.trim();
  // Short labels like "V1", "C", "C2", "B", "P", "T"
  const short = /^([VCBPTIE])(\d+)?$/i.exec(name);
  if (short) {
    const prefix = (short[1] as string).toUpperCase();
    const rule = TYPE_RULES.find((r) => r.prefix === prefix);
    return { type: rule ? rule.type : 'other', prefix, number: short[2] ? Number(short[2]) : null };
  }
  const match = /^(.*?)\s*(\d+)?\s*:?$/.exec(name);
  const word = (match?.[1] ?? name).toLowerCase().trim();
  const number = match?.[2] ? Number(match[2]) : null;
  for (const rule of TYPE_RULES) {
    if (rule.words.includes(word)) return { type: rule.type, prefix: rule.prefix, number };
  }
  const letter = (word.match(/\p{L}/u)?.[0] ?? 'X').toUpperCase();
  return { type: 'other', prefix: letter, number };
}

function trimBlankLines(text: string): string {
  return text.replace(/^\s*\n/, '').replace(/\n\s*$/, '').replace(/^(\s*\n)+|(\n\s*)+$/g, '');
}

/** Ensures every section has a unique, short label. */
export function assignLabels(sections: Array<{ name: string; type: SectionType; prefix: string; number: number | null }>): string[] {
  const used = new Set<string>();
  const verseCounter = { n: 0 };
  return sections.map((s) => {
    let candidate: string;
    if (s.type === 'verse') {
      verseCounter.n = s.number ?? verseCounter.n + 1;
      candidate = `V${verseCounter.n}`;
    } else {
      candidate = s.number ? `${s.prefix}${s.number}` : s.prefix;
    }
    let label = candidate;
    let i = 2;
    while (used.has(label.toUpperCase())) {
      label = `${s.prefix}${s.type === 'verse' ? '' : ''}${i}`;
      if (s.type === 'verse') label = `V${i}`;
      i += 1;
    }
    used.add(label.toUpperCase());
    return label;
  });
}

export function parseLyrics(input: string): SongSection[] {
  const text = input.replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  type Raw = { name: string; lines: string[] };
  const raws: Raw[] = [];
  let current: Raw | null = null;
  let sawHeader = false;

  for (const line of lines) {
    const bracket = BRACKET_HEADER.exec(line);
    const plain = bracket ? null : PLAIN_HEADER.exec(line);
    if (bracket || plain) {
      sawHeader = true;
      const name = bracket ? (bracket[1] as string).trim() : line.trim().replace(/:$/, '').trim();
      current = { name, lines: [] };
      raws.push(current);
      continue;
    }
    if (!current) {
      current = { name: '', lines: [] };
      raws.push(current);
    }
    current.lines.push(line.replace(/\s+$/, ''));
  }

  let blocks: Raw[];
  if (!sawHeader) {
    // No headers: one verse per paragraph.
    const paragraphs = text
      .split(/\n\s*\n/)
      .map((p) => trimBlankLines(p))
      .filter((p) => p.trim().length > 0);
    blocks = paragraphs.map((p, i) => ({ name: `Verse ${i + 1}`, lines: p.split('\n') }));
  } else {
    blocks = raws
      .map((r) => ({ ...r, lines: trimBlankLines(r.lines.join('\n')).split('\n') }))
      .filter((r) => r.name !== '' || r.lines.join('').trim() !== '')
      .map((r) => (r.name === '' ? { ...r, name: 'Verse' } : r));
  }

  const classified = blocks.map((b) => ({ ...classifyHeader(b.name), name: b.name }));
  const labels = assignLabels(classified);
  return blocks.map((b, i) => {
    const c = classified[i]!;
    // Collapse 2+ blank lines into one slide break.
    const body = b.lines.join('\n').replace(/\n\s*\n(\s*\n)+/g, '\n\n');
    return {
      id: newId(),
      label: labels[i]!,
      name: c.type === 'verse' && !/\d/.test(b.name) ? `Verse ${labels[i]!.slice(1)}` : b.name,
      type: c.type,
      text: body,
    };
  });
}

export function serializeLyrics(sections: SongSection[]): string {
  return sections.map((s) => `[${s.name || s.label}]\n${s.text.trim()}`).join('\n\n');
}

/**
 * Keeps ids of sections whose label did not change, so arrangements and
 * existing service items keep working after the lyrics are re-parsed.
 */
export function mergeSectionIds(previous: SongSection[], next: SongSection[]): SongSection[] {
  const byLabel = new Map(previous.map((s) => [s.label.toUpperCase(), s.id]));
  return next.map((s) => ({ ...s, id: byLabel.get(s.label.toUpperCase()) ?? s.id }));
}

export function parseOrder(order: string): string[] {
  return order
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function validateOrder(order: string[], sections: SongSection[]): string[] {
  const labels = new Set(sections.map((s) => s.label.toUpperCase()));
  return order.filter((token) => !labels.has(token.toUpperCase()));
}

/** Resolves an arrangement (or the natural order) into a list of sections. */
export function resolveArrangement(sections: SongSection[], arrangement: SongArrangement | null | undefined): SongSection[] {
  if (!arrangement || arrangement.order.length === 0) return sections;
  const byLabel = new Map(sections.map((s) => [s.label.toUpperCase(), s]));
  const result: SongSection[] = [];
  for (const token of arrangement.order) {
    const section = byLabel.get(token.toUpperCase());
    if (section) result.push(section);
  }
  return result.length > 0 ? result : sections;
}

/**
 * Splits a section into slide texts. Blank lines are explicit slide breaks;
 * long blocks are split into balanced chunks of at most maxLines lines.
 */
export function splitIntoSlides(text: string, maxLines: number): string[] {
  const blocks = text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() !== ''))
    .filter((b) => b.length > 0);
  const slides: string[] = [];
  for (const block of blocks) {
    if (maxLines <= 0 || block.length <= maxLines) {
      slides.push(block.join('\n'));
      continue;
    }
    const chunks = Math.ceil(block.length / maxLines);
    const size = Math.ceil(block.length / chunks);
    for (let i = 0; i < block.length; i += size) slides.push(block.slice(i, i + size).join('\n'));
  }
  return slides;
}

export function firstLine(sections: SongSection[]): string {
  for (const s of sections) {
    const line = s.text.split('\n').find((l) => l.trim() !== '');
    if (line) return line.trim();
  }
  return '';
}
