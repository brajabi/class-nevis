import type { BadgeTone, IconName } from '@/components/ui';
import { toFa } from '@/lib/format';
import type { LocalRecording } from '@/lib/recorder';
import type { RecordingDTO } from '@/lib/types';

export interface BadgeSpec {
  label: string;
  tone: BadgeTone;
  icon?: IconName;
}

/** Status badges for a recording, combining what the phone and the server know. */
export function recordingBadges(local: LocalRecording | undefined, server: RecordingDTO | undefined, isActive: boolean): BadgeSpec[] {
  const out: BadgeSpec[] = [];
  if (isActive) out.push({ label: 'در حال ضبط', tone: 'record', icon: 'radio-button-on' });

  if (local) {
    const total = local.segments.length;
    const up = local.segments.filter((s) => s.uploaded).length;
    const failing = local.segments.some((s) => !s.uploaded && s.lastError && (s.attempts ?? 0) >= 3);
    if (up < total) {
      out.push(
        failing
          ? { label: `خطا در آپلود · ${toFa(up)}/${toFa(total)}`, tone: 'danger', icon: 'alert-circle-outline' }
          : { label: `در حال آپلود ${toFa(up)}/${toFa(total)}`, tone: 'warning', icon: 'cloud-upload-outline' },
      );
    } else if (total > 0 && !server && !isActive) {
      out.push({ label: 'آپلود شد', tone: 'success', icon: 'cloud-done-outline' });
    }
    if (local.status === 'interrupted' && !isActive) out.push({ label: 'بازیابی‌شده', tone: 'neutral', icon: 'bandage-outline' });
  }

  if (server) {
    const { segmentCount: n, transcribedCount: done, failedCount: failed } = server;
    if (failed > 0) out.push({ label: `خطا در رونویسی (${toFa(failed)})`, tone: 'danger', icon: 'warning-outline' });
    else if (n > 0 && done < n) out.push({ label: `در حال رونویسی ${toFa(done)}/${toFa(n)}`, tone: 'accent', icon: 'sparkles-outline' });
    else if (n > 0 && done === n) out.push({ label: 'رونویسی شد', tone: 'success', icon: 'checkmark-done' });
    if (server.noteIds.length > 0) out.push({ label: 'جزوه دارد', tone: 'primary', icon: 'document-text' });
    if (!local) out.push({ label: 'فقط روی سرور', tone: 'neutral', icon: 'cloud-outline' });
  }
  return out;
}
