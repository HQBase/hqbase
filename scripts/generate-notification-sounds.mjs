import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sampleRate = 22_050;
const outputDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public/sounds"
);

const sounds = {
  "incoming-email": [
    { from: 660, to: 660, duration: 90 },
    { gap: 45 },
    { from: 880, to: 880, duration: 150 }
  ],
  "outgoing-email": [{ from: 420, to: 920, duration: 180 }],
  "toast-error": [{ from: 260, to: 170, duration: 170 }],
  "toast-information": [{ from: 700, to: 700, duration: 100 }],
  "toast-success": [
    { from: 520, to: 520, duration: 75 },
    { gap: 35 },
    { from: 780, to: 780, duration: 120 }
  ],
  "toast-warning": [
    { from: 440, to: 440, duration: 65 },
    { gap: 45 },
    { from: 440, to: 440, duration: 65 }
  ],
  "update-ready": [
    { from: 520, to: 620, duration: 90 },
    { gap: 40 },
    { from: 660, to: 820, duration: 150 }
  ],
  unlock: [{ gap: 30 }]
};

function renderPcm(segments) {
  const samples = [];
  for (const segment of segments) {
    const sampleCount = Math.ceil(((segment.duration ?? segment.gap ?? 0) / 1000) * sampleRate);
    for (let index = 0; index < sampleCount; index += 1) {
      if ("gap" in segment) {
        samples.push(0);
        continue;
      }

      const progress = index / Math.max(1, sampleCount - 1);
      const frequency = segment.from + (segment.to - segment.from) * progress;
      const seconds = index / sampleRate;
      const fade = Math.min(1, progress * 14, (1 - progress) * 10);
      samples.push(Math.sin(2 * Math.PI * frequency * seconds) * fade * 0.24);
    }
  }
  return samples;
}

function encodeWav(samples) {
  const bytesPerSample = 2;
  const buffer = Buffer.alloc(44 + samples.length * bytesPerSample);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples.length * bytesPerSample, 40);

  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    buffer.writeInt16LE(Math.round(value * 32_767), 44 + index * bytesPerSample);
  }
  return buffer;
}

await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  Object.entries(sounds).map(([name, segments]) =>
    writeFile(path.join(outputDirectory, `${name}.wav`), encodeWav(renderPcm(segments)))
  )
);
