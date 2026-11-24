import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSpectrumAnalyzer } from "@capsule-wave/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const goldenVectorsDir = path.resolve(__dirname, "../../spec/golden-vectors");

interface GoldenStep {
  stepIndex: number;
  pcm: number[];
  output: number[];
}

interface GoldenVectorFile {
  name: string;
  signal: string;
  bandCount: number;
  sampleRate: number;
  dt: number;
  stepCount: number;
  steps: GoldenStep[];
}

describe("Golden Vectors Cross-Platform Parity", () => {
  const vectorFiles = [
    "log_chirp_6bands.json",
    "log_chirp_36bands.json",
    "pink_noise_6bands.json",
    "pink_noise_36bands.json",
    "short_pulse_6bands.json",
    "short_pulse_36bands.json",
  ];

  for (const filename of vectorFiles) {
    it(`aligns with Swift vDSP golden vector: ${filename}`, () => {
      const filePath = path.join(goldenVectorsDir, filename);
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, "utf-8");
      const data: GoldenVectorFile = JSON.parse(content);

      const analyzer = createSpectrumAnalyzer({
        bandCount: data.bandCount,
        sampleRate: data.sampleRate,
      });

      let maxAbsoluteError = 0.0;

      for (let s = 0; s < data.steps.length; s++) {
        const step = data.steps[s];
        analyzer.pushSamples(step.pcm);
        const actual = analyzer.step(data.dt);

        expect(actual.length).toBe(data.bandCount);

        for (let b = 0; b < data.bandCount; b++) {
          const expected = step.output[b];
          const err = Math.abs(actual[b] - expected);
          if (err > maxAbsoluteError) {
            maxAbsoluteError = err;
          }
        }
      }

      console.log(`[Golden Vector] ${filename}: max absolute error = ${maxAbsoluteError.toExponential(4)}`);
      expect(maxAbsoluteError).toBeLessThan(1e-5);
    });
  }
});
