// Base64-encoded valid WAV audio tone for voice memo audio playback simulation
export function generateSampleAudioMemoBase64(): string {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const sampleRate = 8000;
    const durationSec = 2.2;
    const numSamples = Math.floor(sampleRate * durationSec);
    const buffer = new ArrayBuffer(44 + numSamples);
    const view = new DataView(buffer);

    // RIFF identifier
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + numSamples, true);
    writeString(view, 8, "WAVE");

    // "fmt " sub-chunk
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, 1, true); // NumChannels (Mono)
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate, true); // ByteRate
    view.setUint16(32, 1, true); // BlockAlign
    view.setUint16(34, 8, true); // BitsPerSample (8 bits)

    // "data" sub-chunk
    writeString(view, 36, "data");
    view.setUint32(40, numSamples, true);

    // Generate voice-note simulated acoustic envelope (subtle melodic harmonic hum)
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      let val = 128;
      if (t < 0.6) {
        val += 50 * Math.sin(2 * Math.PI * 440 * t) * Math.exp(-t * 2);
      } else if (t < 1.2) {
        val += 55 * Math.sin(2 * Math.PI * 554.37 * (t - 0.6)) * Math.exp(-(t - 0.6) * 2);
      } else {
        val += 60 * Math.sin(2 * Math.PI * 659.25 * (t - 1.2)) * Math.exp(-(t - 1.2) * 2);
      }
      view.setUint8(44 + i, Math.min(255, Math.max(0, Math.floor(val))));
    }

    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return "data:audio/wav;base64," + window.btoa(binary);
  } catch {
    return "";
  }
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
