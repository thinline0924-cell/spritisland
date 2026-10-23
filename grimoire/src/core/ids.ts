// 決定論的な ID の発行（Math.random を使わない）
export class IdGen {
  private n = 0;
  next(prefix: string): string {
    this.n += 1;
    return `${prefix}${this.n}`;
  }
}
