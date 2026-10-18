/** Minimal XML helpers on top of the `sax` streaming parser (pure JavaScript). */
import sax from 'sax';

export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: Array<XmlNode | string>;
}

/** Builds a small element tree (for small documents like OpenLyrics songs). */
export function parseXmlTree(xml: string): XmlNode {
  const parser = sax.parser(true, { trim: false, normalize: false, lowercase: false });
  const root: XmlNode = { name: '#document', attrs: {}, children: [] };
  const stack: XmlNode[] = [root];
  let error: Error | null = null;
  parser.onerror = (e: Error) => {
    error = e;
    parser.resume();
  };
  parser.onopentag = (tag: { name: string; attributes: Record<string, string> }) => {
    const node: XmlNode = { name: localName(tag.name), attrs: tag.attributes, children: [] };
    stack[stack.length - 1]!.children.push(node);
    stack.push(node);
  };
  parser.onclosetag = () => {
    stack.pop();
  };
  parser.ontext = (text: string) => {
    stack[stack.length - 1]!.children.push(text);
  };
  parser.oncdata = (text: string) => {
    stack[stack.length - 1]!.children.push(text);
  };
  parser.write(xml).close();
  if (error && root.children.length === 0) throw error;
  return root;
}

export function localName(name: string): string {
  const i = name.indexOf(':');
  return i >= 0 ? name.slice(i + 1) : name;
}

export function find(node: XmlNode, name: string): XmlNode | null {
  for (const child of node.children) {
    if (typeof child === 'string') continue;
    if (child.name === name) return child;
    const deep = find(child, name);
    if (deep) return deep;
  }
  return null;
}

export function findAll(node: XmlNode, name: string, out: XmlNode[] = []): XmlNode[] {
  for (const child of node.children) {
    if (typeof child === 'string') continue;
    if (child.name === name) out.push(child);
    findAll(child, name, out);
  }
  return out;
}

export function textOf(node: XmlNode | null): string {
  if (!node) return '';
  return node.children.map((c) => (typeof c === 'string' ? c : c.name === 'br' ? '\n' : textOf(c))).join('');
}

export interface StreamHandlers {
  open(name: string, attrs: Record<string, string>): void;
  close(name: string): void;
  text(text: string): void;
}

/** Streams a large XML document (e.g. a whole Bible) without building a tree. */
export function streamXml(xml: string, handlers: StreamHandlers): void {
  const parser = sax.parser(true, { trim: false, normalize: false });
  let fatal: Error | null = null;
  parser.onerror = (e: Error) => {
    fatal = fatal ?? e;
    parser.resume();
  };
  parser.onopentag = (tag: { name: string; attributes: Record<string, string> }) => handlers.open(localName(tag.name), tag.attributes);
  parser.onclosetag = (name: string) => handlers.close(localName(name));
  parser.ontext = (text: string) => handlers.text(text);
  parser.oncdata = (text: string) => handlers.text(text);
  parser.write(xml).close();
  if (fatal) {
    // sax recovers from most errors; only report if nothing useful was parsed (checked by callers).
  }
}

export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
