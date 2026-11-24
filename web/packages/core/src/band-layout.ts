export class BandLayout {
  public readonly edges: number[];
  public readonly parent: number[];
  public readonly binWidth: number;

  public static readonly defaultBaseEdges: readonly number[] = [
    20.0, 81.0, 170.0, 527.0, 1500.0, 4500.0, 10000.0,
  ];

  constructor(edges: number[], parent?: number[], binWidth = 0) {
    this.edges = edges;
    this.parent = parent ?? Array.from({ length: Math.max(0, edges.length - 1) }, (_, i) => i);
    this.binWidth = binWidth;
  }

  public get count(): number {
    return Math.max(0, this.edges.length - 1);
  }

  public get centres(): number[] {
    const res: number[] = new Array(this.count);
    for (let i = 0; i < this.count; i++) {
      res[i] = Math.sqrt(this.edges[i] * this.edges[i + 1]);
    }
    return res;
  }

  public get widths(): number[] {
    const res: number[] = new Array(this.count);
    for (let i = 0; i < this.count; i++) {
      res[i] = this.edges[i + 1] - this.edges[i];
    }
    return res;
  }

  public get octaves(): number[] {
    const res: number[] = new Array(this.count);
    for (let i = 0; i < this.count; i++) {
      res[i] = Math.log2(this.edges[i + 1] / this.edges[i]);
    }
    return res;
  }

  public get densityScale(): number[] {
    const res: number[] = new Array(this.count);
    const defaultBase = BandLayout.defaultBaseEdges;
    for (let i = 0; i < this.count; i++) {
      const p = Math.min(Math.max(this.parent[i], 0), 5);
      if (this.binWidth <= 0) {
        const pw = defaultBase[p + 1] - defaultBase[p];
        res[i] = pw / this.widths[i];
      } else {
        const selfBins = this.binCount(this.edges[i], this.edges[i + 1]);
        const parentLo = p === 0 ? this.edges[0] : defaultBase[p];
        const parentBins = this.binCount(parentLo, defaultBase[p + 1]);
        res[i] = parentBins / selfBins;
      }
    }
    return res;
  }

  public binCount(lo: number, hi: number): number {
    if (this.binWidth <= 0) return 1.0;
    const first = Math.ceil(lo / this.binWidth);
    const last = Math.ceil(hi / this.binWidth);
    return Math.max(1.0, last - first);
  }

  public static smoothCal(
    v: readonly number[],
    f: number,
    baseEdges: readonly number[] = BandLayout.defaultBaseEdges
  ): number {
    if (v.length < 6) return v[0] ?? 0;
    const anchors: number[] = new Array(6);
    for (let i = 0; i < 6; i++) {
      anchors[i] = Math.log2(Math.sqrt(baseEdges[i] * baseEdges[i + 1]));
    }
    const x = Math.log2(Math.max(f, 1e-9));
    if (x <= anchors[0]) return v[0];
    if (x >= anchors[5]) return v[5];

    for (let i = 0; i < 5; i++) {
      if (x < anchors[i + 1]) {
        const t = (x - anchors[i]) / (anchors[i + 1] - anchors[i]);
        const s = t * t * (3.0 - 2.0 * t);
        return v[i] + (v[i + 1] - v[i]) * s;
      }
    }
    return v[5];
  }

  public static make(
    n: number,
    binWidth: number,
    baseEdges: readonly number[] = BandLayout.defaultBaseEdges,
    lowEdge = 40.0
  ): BandLayout {
    const base = Array.from(baseEdges);
    if (n <= 6) {
      return new BandLayout(
        base,
        Array.from({ length: Math.max(0, base.length - 1) }, (_, i) => i),
        binWidth
      );
    }

    const lo0 = Math.min(Math.max(lowEdge, 20.0), base[1] * 0.9);
    const lows = Array.from({ length: 6 }, (_, i) => (i === 0 ? lo0 : base[i]));

    const firstBin = (p: number) => Math.ceil(lows[p] / binWidth - 1e-9);
    const lastBin = (p: number) => Math.ceil(base[p + 1] / binWidth - 1e-9);

    const avail = Array.from({ length: 6 }, (_, p) => Math.max(1, lastBin(p) - firstBin(p)));
    const oct = Array.from({ length: 6 }, (_, p) => Math.log2(base[p + 1] / lows[p]));
    const totalOct = oct.reduce((a, b) => a + b, 0.0);

    const ideal = oct.map((o) => (n * o) / totalOct);
    const alloc = Array.from({ length: 6 }, (_, p) =>
      Math.min(Math.max(1, Math.floor(ideal[p])), avail[p])
    );
    const carry = Array.from({ length: 6 }, (_, p) => ideal[p] - Math.floor(ideal[p]));
    let delta = n - alloc.reduce((a, b) => a + b, 0);

    while (delta > 0) {
      let bestCandidate = -1;
      let maxCarry = -Infinity;
      for (let p = 0; p < 6; p++) {
        if (alloc[p] < avail[p] && carry[p] > maxCarry) {
          maxCarry = carry[p];
          bestCandidate = p;
        }
      }
      if (bestCandidate === -1) break;
      alloc[bestCandidate] += 1;
      carry[bestCandidate] -= 1;
      delta -= 1;
    }

    while (delta < 0) {
      let bestCandidate = -1;
      let minCarry = Infinity;
      for (let p = 0; p < 6; p++) {
        if (alloc[p] > 1 && carry[p] < minCarry) {
          minCarry = carry[p];
          bestCandidate = p;
        }
      }
      if (bestCandidate === -1) break;
      alloc[bestCandidate] -= 1;
      carry[bestCandidate] += 1;
      delta += 1;
    }

    while (delta > 0) {
      let bestCandidate = -1;
      let minRatio = Infinity;
      for (let p = 0; p < 6; p++) {
        const ratio = oct[p] / alloc[p];
        if (ratio < minRatio) {
          minRatio = ratio;
          bestCandidate = p;
        }
      }
      if (bestCandidate === -1) break;
      alloc[bestCandidate] += 1;
      delta -= 1;
    }

    const edges: number[] = [];
    const parent: number[] = [];

    for (let p = 0; p < 6; p++) {
      const lo = lows[p];
      const hi = base[p + 1];
      const b0 = firstBin(p);
      const b1 = lastBin(p);
      const m = Math.max(1, Math.min(alloc[p], Math.max(1, b1 - b0)));

      const bounds: number[] = [b0];
      for (let j = 1; j < m; j++) {
        const hz = lo * Math.pow(hi / lo, j / m);
        let b = Math.ceil(hz / binWidth - 1e-9);
        const lastBound = bounds[bounds.length - 1] ?? b0;
        b = Math.max(b, lastBound + 1);
        b = Math.min(b, b1 - (m - j));
        bounds.push(b);
      }
      bounds.push(b1);

      for (let j = 0; j < m; j++) {
        const e = j === 0 ? lo : bounds[j] * binWidth;
        edges.push(Math.min(Math.max(e, lo), hi));
        parent.push(p);
      }
    }
    edges.push(base[6]);

    return new BandLayout(edges, parent, binWidth);
  }

  public isWholeParentBand(
    index: number,
    baseEdges: readonly number[] = BandLayout.defaultBaseEdges
  ): boolean {
    if (index >= this.parent.length) return false;
    const p = Math.min(Math.max(this.parent[index], 0), 5);
    return (
      Math.abs(this.edges[index] - baseEdges[p]) < 0.01 &&
      Math.abs(this.edges[index + 1] - baseEdges[p + 1]) < 0.01
    );
  }
}
