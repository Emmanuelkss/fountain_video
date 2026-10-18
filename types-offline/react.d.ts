// Offline stand-in for @types/react (only used by tsconfig.offline.json).
declare module 'react' {
  export type ReactNode = ReactElement | string | number | boolean | null | undefined | Iterable<ReactNode>;
  export interface ReactElement {
    type: unknown;
    props: unknown;
    key: string | null;
  }
  export type Key = string | number;
  export type SetStateAction<S> = S | ((prev: S) => S);
  export type Dispatch<A> = (value: A) => void;
  export interface MutableRefObject<T> {
    current: T;
  }
  export interface RefObject<T> {
    current: T;
  }
  export type CSSProperties = { [key: string]: string | number | undefined };
  export function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>];
  export function useEffect(effect: () => void | (() => void) | undefined, deps?: readonly unknown[]): void;
  export function useLayoutEffect(effect: () => void | (() => void) | undefined, deps?: readonly unknown[]): void;
  export function useRef<T>(initial: T): MutableRefObject<T>;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: readonly unknown[]): T;
  export interface Context<T> {
    Provider: (props: { value: T; children?: ReactNode }) => ReactElement;
  }
  export function createContext<T>(defaultValue: T): Context<T>;
  export function useContext<T>(context: Context<T>): T;
  export const Fragment: unknown;
}
declare namespace JSX {
  type Element = import('react').ReactElement;
  interface ElementChildrenAttribute {
    children: {};
  }
  interface IntrinsicAttributes {
    key?: string | number | null;
  }
  interface IntrinsicElements {
    [name: string]: any;
  }
}
