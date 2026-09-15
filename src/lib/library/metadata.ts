import { parseBlob } from 'music-metadata';
import type { TrackTags } from '../analysis/types';

export async function readTags(file: File): Promise<TrackTags> {
  try {
    const meta = await parseBlob(file, { duration: false, skipCovers: true });
    return {
      title: meta.common.title ?? stripExt(file.name),
      artist: meta.common.artist ?? 'Unknown artist',
      album: meta.common.album,
    };
  } catch {
    return { title: stripExt(file.name), artist: 'Unknown artist' };
  }
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}
