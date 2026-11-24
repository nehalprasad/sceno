import { Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { cacheDirectory, downloadAsync, getInfoAsync } from 'expo-file-system/legacy';
import type { InviteMedia } from '@/services';

/** Remote media must be a local file before the share sheet can attach it. */
async function localCopy(m: InviteMedia): Promise<string> {
  if (!/^https?:/.test(m.url)) return m.url;
  // Storage URLs encode the path (".../o/celebrations%2Fcid%2Fuid%2Finvite-123.jpg"); keep just the file name.
  const last = decodeURIComponent(m.url.split('?')[0]).split('/').pop() || 'invite';
  const ext = m.kind === 'video' ? 'mp4' : 'jpg';
  const target = `${cacheDirectory}${last.replace(/[^\w.-]/g, '').replace(/\.(jpe?g|png|mp4|mov)$/i, '')}.${ext}`;
  const info = await getInfoAsync(target);
  if (!info.exists) await downloadAsync(m.url, target);
  return target;
}

/**
 * Shares the invite. With an invite card or video, the file goes through the share sheet and the
 * message + link is copied too, because WhatsApp drops text attached to media; people paste it as the caption.
 * Returns true when the message was copied (so the caller can say so).
 */
export async function shareInvite(text: string, media?: InviteMedia): Promise<boolean> {
  if (!media) {
    await Share.share({ message: text });
    return false;
  }
  await Clipboard.setStringAsync(text);
  const file = await localCopy(media);
  if (Platform.OS === 'ios') {
    await Share.share({ url: file, message: text });
  } else {
    await Sharing.shareAsync(file, { mimeType: media.kind === 'video' ? 'video/mp4' : 'image/jpeg', dialogTitle: text.slice(0, 60) });
  }
  return true;
}
