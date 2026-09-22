import { StringDecoder } from 'node:string_decoder';

export type JsonRecord = Record<string, unknown>;
export function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export type StreamDiagnostic = 'malformed_json' | 'line_too_long' | 'stream_truncated' | 'non_object';

/** Bounded streaming parser. Diagnostics never expose upstream source or secrets. */
export class JsonlParser {
  private decoder = new StringDecoder('utf8');
  private pending = '';
  private dropping = false;
  private totalBytes = 0;
  private stopped = false;
  readonly diagnostics: StreamDiagnostic[] = [];
  constructor(readonly maxLineBytes = 1_048_576, readonly maxStreamBytes = 20_971_520) {
    if (maxLineBytes < 1 || maxStreamBytes < maxLineBytes) throw new Error('Invalid stream limits');
  }
  private diagnostic(reason: StreamDiagnostic): void {
    if (this.diagnostics.length < 32) this.diagnostics.push(reason);
  }
  push(chunk: string | Buffer): JsonRecord[] {
    if (this.stopped) return [];
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.totalBytes += bytes.length;
    if (this.totalBytes > this.maxStreamBytes) {
      this.stopped = true; this.pending = ''; this.diagnostic('stream_truncated'); return [];
    }
    return this.consume(this.decoder.write(bytes), false);
  }
  finish(): JsonRecord[] {
    if (this.stopped) return [];
    this.stopped = true;
    return this.consume(this.decoder.end(), true);
  }
  private consume(text: string, final: boolean): JsonRecord[] {
    const records: JsonRecord[] = [];
    const pieces = text.split('\n');
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i] ?? '';
      const ended = i < pieces.length - 1;
      if (!this.dropping) {
        if (Buffer.byteLength(this.pending) + Buffer.byteLength(piece) > this.maxLineBytes) {
          this.pending = ''; this.dropping = true; this.diagnostic('line_too_long');
        } else this.pending += piece;
      }
      if (ended || final) {
        if (!this.dropping && this.pending.trim()) {
          try {
            const value: unknown = JSON.parse(this.pending);
            if (isRecord(value)) records.push(value); else this.diagnostic('non_object');
          } catch { this.diagnostic('malformed_json'); }
        }
        this.pending = ''; this.dropping = false;
      }
    }
    return records;
  }
}
