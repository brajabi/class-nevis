import { Badge } from '@/components/ui';
import { toFa } from '@/lib/format';
import { useSyncStatus } from '@/lib/recorder';

/** "همه صداها امن ذخیره شده‌اند" / "در صف آپلود: N" */
export function SyncBadge() {
  const s = useSyncStatus();
  if (s.pending === 0) return <Badge label="همه صداها امن ذخیره شده‌اند" tone="success" icon="shield-checkmark" />;
  if (!s.online) return <Badge label={`بدون اینترنت · در صف آپلود: ${toFa(s.pending)}`} tone="warning" icon="cloud-offline-outline" />;
  if (s.uploading) return <Badge label={`در حال آپلود · در صف: ${toFa(s.pending)}`} tone="accent" icon="cloud-upload" />;
  if (s.serverReachable === false) return <Badge label={`اتصال برقرار نیست · در صف: ${toFa(s.pending)}`} tone="warning" icon="cloud-offline-outline" />;
  return <Badge label={`در صف آپلود: ${toFa(s.pending)}`} tone="warning" icon="time-outline" />;
}
