export class RingBuffer {
  private readonly buffer: Float32Array;
  private readonly capacity: number;
  private writeIndex = 0;
  private filled = 0;

  constructor(capacity = 2048) {
    this.capacity = capacity;
    this.buffer = new Float32Array(capacity);
  }

  public push(samples: Float32Array | number[]): void {
    const len = samples.length;
    if (len === 0) return;

    if (len >= this.capacity) {
      // If input is larger than or equal to capacity, just take the last capacity samples
      const start = len - this.capacity;
      for (let i = 0; i < this.capacity; i++) {
        this.buffer[i] = samples[start + i];
      }
      this.writeIndex = 0;
      this.filled = this.capacity;
      return;
    }

    let srcOffset = 0;
    let remaining = len;

    while (remaining > 0) {
      const chunk = Math.min(remaining, this.capacity - this.writeIndex);
      for (let i = 0; i < chunk; i++) {
        this.buffer[this.writeIndex + i] = samples[srcOffset + i];
      }
      this.writeIndex = (this.writeIndex + chunk) % this.capacity;
      srcOffset += chunk;
      remaining -= chunk;
    }

    this.filled = Math.min(this.capacity, this.filled + len);
  }

  public getLatest(out: Float32Array): boolean {
    if (out.length !== this.capacity) {
      throw new Error(`Output buffer length (${out.length}) must match capacity (${this.capacity})`);
    }
    if (this.filled < this.capacity) {
      // Partially filled
      out.fill(0);
      const start = (this.writeIndex - this.filled + this.capacity) % this.capacity;
      const targetStart = this.capacity - this.filled;
      for (let i = 0; i < this.filled; i++) {
        out[targetStart + i] = this.buffer[(start + i) % this.capacity];
      }
      return false;
    }

    const start = this.writeIndex;
    const firstChunk = this.capacity - start;
    for (let i = 0; i < firstChunk; i++) {
      out[i] = this.buffer[start + i];
    }
    for (let i = 0; i < start; i++) {
      out[firstChunk + i] = this.buffer[i];
    }
    return true;
  }

  public reset(): void {
    this.buffer.fill(0);
    this.writeIndex = 0;
    this.filled = 0;
  }
}
