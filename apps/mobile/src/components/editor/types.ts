export type EditorCommand =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'paragraph'
  | 'quote'
  | 'ul'
  | 'ol'
  | 'fontUp'
  | 'fontDown'
  | 'mark'
  | 'alignRight'
  | 'alignCenter'
  | 'alignLeft'
  | 'undo'
  | 'redo'
  | 'hr'
  | 'clear';

export interface SelectionState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  ul: boolean;
  ol: boolean;
  heading: 'h1' | 'h2' | 'h3' | null;
  quote: boolean;
  mark: boolean;
  align: 'right' | 'center' | 'left';
  fontSize: number;
  collapsed: boolean;
}

export const emptySelectionState: SelectionState = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  ul: false,
  ol: false,
  heading: null,
  quote: false,
  mark: false,
  align: 'right',
  fontSize: 17,
  collapsed: true,
};

export interface RichEditorHandle {
  exec(command: EditorCommand): void;
  /** Replace the whole document (does not trigger onChange). */
  setHtml(html: string): void;
  /** Flushes pending edits and resolves with the current HTML. */
  getHtml(): Promise<string>;
  focus(): void;
  blur(): void;
}

export type WebToNative =
  | { type: 'ready' }
  | { type: 'dirty' }
  | { type: 'change'; html: string; silent?: boolean }
  | { type: 'state'; state: SelectionState }
  | { type: 'html'; id: string; html: string }
  | { type: 'focus'; focused: boolean }
  | { type: 'hint'; text: string };
