// Minimal typings for the parts of `sax` used by FountainVideo.
declare module 'sax' {
  interface SaxTag {
    name: string;
    attributes: Record<string, string>;
  }
  interface SaxParser {
    onerror: (e: Error) => void;
    onopentag: (tag: SaxTag) => void;
    onclosetag: (name: string) => void;
    ontext: (text: string) => void;
    oncdata: (text: string) => void;
    write(chunk: string): SaxParser;
    close(): SaxParser;
    resume(): SaxParser;
  }
  interface SaxOptions {
    trim?: boolean;
    normalize?: boolean;
    lowercase?: boolean;
  }
  const sax: {
    parser(strict: boolean, options?: SaxOptions): SaxParser;
  };
  export default sax;
}
