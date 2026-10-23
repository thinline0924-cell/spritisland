// 構文解析：デッキ → 詠唱ごとの AST（SPEC §4.2〜§4.5）
//
//   unit    := primary ( TRIGGER unit )?
//   primary := MODIFIER primary | MULTICAST(n) unit×n | SPELL
//
import type { AstNode, DeckEntry, Diagnostic } from './ast';
import { diag, MESSAGES } from './diagnostics';
import { tierValue } from '../runes/types';

export interface ParseOptions {
  /** 多重詠唱の塊数への加算（秘宝） */
  multicastCountAdd: number;
  /** 環詠の塊数への加算（秘宝） */
  ringCountAdd: number;
}

export interface ParsedCast {
  readonly ast: AstNode | null;
  readonly slotsRead: number[];
  readonly wrappedSlots: number[];
  readonly ignoredSlots: number[];
  readonly diagnostics: Diagnostic[];
  readonly wrapped: boolean;
  /** 次の詠唱が始まるデッキ位置 */
  readonly nextPos: number;
}

class CastParser {
  private pos: number;
  private limit: number;
  private wrappedFlag = false;
  readonly slotsRead: number[] = [];
  readonly wrappedSlots: number[] = [];
  readonly ignoredSlots: number[] = [];
  readonly diagnostics: Diagnostic[] = [];

  constructor(
    private readonly deck: readonly DeckEntry[],
    private readonly start: number,
    private readonly castIndex: number,
    private readonly opts: ParseOptions,
  ) {
    this.pos = start;
    this.limit = deck.length;
  }

  get wrapped(): boolean {
    return this.wrappedFlag;
  }

  get nextPos(): number {
    return this.wrappedFlag ? this.deck.length : this.pos;
  }

  /** 折り返しできるのは1回だけ。読めるのはこの詠唱の開始位置より前まで */
  private canWrap(): boolean {
    return !this.wrappedFlag && this.start > 0;
  }

  /** 状態を変えずに次の要素を覗く（覗いただけでは折り返さない） */
  private peek(): DeckEntry | null {
    if (this.pos < this.limit) return this.deck[this.pos] ?? null;
    if (this.canWrap()) return this.deck[0] ?? null;
    return null;
  }

  private take(): { entry: DeckEntry; wrapped: boolean } | null {
    if (this.pos >= this.limit) {
      if (!this.canWrap()) return null;
      this.wrappedFlag = true;
      this.pos = 0;
      this.limit = this.start;
    }
    const entry = this.deck[this.pos++];
    if (!entry) return null;
    this.slotsRead.push(entry.slot);
    if (this.wrappedFlag) this.wrappedSlots.push(entry.slot);
    return { entry, wrapped: this.wrappedFlag };
  }

  private report(d: Diagnostic): void {
    this.diagnostics.push(d);
  }

  parseUnit(): AstNode | null {
    const primary = this.parsePrimary();
    if (!primary) return null;
    const next = this.peek();
    if (!next || next.def.kind !== 'trigger') return primary;
    const taken = this.take();
    if (!taken) return primary;
    const { entry, wrapped } = taken;
    const def = entry.def;
    if (def.kind !== 'trigger') return primary;
    const payload = this.parseUnit();
    if (!payload) {
      this.report(diag('W201', MESSAGES.W201(def.name), entry.slot, this.castIndex));
    }
    return {
      type: 'trigger', slot: entry.slot, rune: entry.rune, wrapped,
      def, carrier: primary, payload,
    };
  }

  private parsePrimary(): AstNode | null {
    for (;;) {
      const taken = this.take();
      if (!taken) return null;
      const { entry, wrapped } = taken;
      const def = entry.def;
      switch (def.kind) {
        case 'trigger':
          // 引き金になる顕現がない契機は読み飛ばす（マナも消費しない）
          this.ignoredSlots.push(entry.slot);
          this.report(diag('E101', MESSAGES.E101(def.name), entry.slot, this.castIndex));
          continue;
        case 'spell':
          return { type: 'spell', slot: entry.slot, rune: entry.rune, wrapped, def };
        case 'modifier':
        case 'curse': {
          const child = this.parsePrimary();
          if (!child) {
            this.ignoredSlots.push(entry.slot);
            this.report(diag('E102', MESSAGES.E102(def.name), entry.slot, this.castIndex));
            return null;
          }
          return { type: 'modifier', slot: entry.slot, rune: entry.rune, wrapped, def, child };
        }
        case 'multicast': {
          const count =
            tierValue(def.count, entry.rune.tier) +
            this.opts.multicastCountAdd +
            (def.pattern === 'ring' ? this.opts.ringCountAdd : 0);
          const children: AstNode[] = [];
          for (let i = 0; i < count; i++) {
            const child = this.parseUnit();
            if (!child) break;
            children.push(child);
          }
          const missing = count - children.length;
          if (missing > 0) {
            this.report(diag('W202', MESSAGES.W202(def.name, count, children.length), entry.slot, this.castIndex));
          }
          return { type: 'multicast', slot: entry.slot, rune: entry.rune, wrapped, def, children, count, missing };
        }
      }
    }
  }
}

/** デッキの1周ぶんを詠唱ごとに解析する */
export function parseCycle(deck: readonly DeckEntry[], opts: ParseOptions): ParsedCast[] {
  const casts: ParsedCast[] = [];
  let pos = 0;
  while (pos < deck.length) {
    const parser = new CastParser(deck, pos, casts.length, opts);
    const ast = parser.parseUnit();
    if (parser.wrappedSlots.length > 0) {
      const first = parser.wrappedSlots[0] as number;
      const last = parser.wrappedSlots[parser.wrappedSlots.length - 1] as number;
      parser.diagnostics.push(diag('I401', MESSAGES.I401(first + 1, last + 1), first, casts.length));
    }
    casts.push({
      ast,
      slotsRead: parser.slotsRead,
      wrappedSlots: parser.wrappedSlots,
      ignoredSlots: parser.ignoredSlots,
      diagnostics: parser.diagnostics,
      wrapped: parser.wrapped,
      nextPos: parser.nextPos,
    });
    // 進まない解析は文法上ありえないが、無限ループだけは確実に防ぐ
    if (parser.nextPos <= pos) break;
    pos = parser.nextPos;
  }
  return casts;
}
