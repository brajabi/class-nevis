import { AudioQuality, IOSOutputFormat, type RecordingOptions } from 'expo-audio';
import { Platform } from 'react-native';

/** Length of one recorded segment (time actually recorded, pauses excluded). */
export const SEGMENT_MS = 2 * 60 * 1000;

export const BIT_RATE = 64_000; // mono speech: clear enough for transcription, ~29MB per hour
export const SAMPLE_RATE = 44_100;

/**
 * Android records ADTS AAC: every frame carries its own header, so a file that was being
 * written when the app got killed is still playable/decodable up to the last frame.
 * iOS records m4a (AAC in MPEG-4), which is what AVAudioRecorder supports natively.
 */
export const SEGMENT_EXT = Platform.OS === 'ios' ? '.m4a' : '.aac';

const MIME_BY_EXT: Record<string, string> = {
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  webm: 'audio/webm',
  amr: 'audio/amr',
  '3gp': 'audio/3gpp',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
};

export function mimeForUri(uri: string): string {
  const ext = uri.toLowerCase().split('?')[0]!.split('.').pop() ?? '';
  return MIME_BY_EXT[ext] ?? 'audio/aac';
}

export function recordingOptions(fileName: string): RecordingOptions {
  return {
    extension: SEGMENT_EXT,
    sampleRate: SAMPLE_RATE,
    numberOfChannels: 1,
    bitRate: BIT_RATE,
    isMeteringEnabled: true,
    // 'document' is never purged by the OS (unlike 'cache').
    directory: 'document',
    fileName,
    android: {
      extension: '.aac',
      outputFormat: 'aac_adts',
      audioEncoder: 'aac',
      sampleRate: SAMPLE_RATE,
    },
    ios: {
      extension: '.m4a',
      outputFormat: IOSOutputFormat.MPEG4AAC,
      audioQuality: AudioQuality.HIGH,
      sampleRate: SAMPLE_RATE,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: { mimeType: 'audio/webm', bitsPerSecond: BIT_RATE },
  };
}

/** Rough duration estimate for files whose real duration we never got (crash recovery). */
export function estimateDurationMs(sizeBytes: number): number {
  return Math.round(((sizeBytes * 8) / BIT_RATE) * 1000);
}

/** Minimum free disk space we want before starting a recording (~1.5h of audio at 96kbps ≈ 65MB). */
export const MIN_FREE_BYTES = 150 * 1024 * 1024;
