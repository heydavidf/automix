const AUDIO_EXT = /\.(mp3|m4a|aac|flac|wav|ogg|opus|aiff?)$/i;

export interface LibraryFile {
  /** Stable identity: path|size|lastModified — invalidates cached analysis when the file changes. */
  fileKey: string;
  path: string;
  name: string;
  sizeBytes: number;
  handle: FileSystemFileHandle;
}

export async function scanFolder(
  dir: FileSystemDirectoryHandle,
  onProgress?: (count: number) => void,
): Promise<LibraryFile[]> {
  const files: LibraryFile[] = [];
  await walk(dir, '', files, onProgress);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

async function walk(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: LibraryFile[],
  onProgress?: (count: number) => void,
): Promise<void> {
  for await (const entry of dir.values()) {
    if (entry.kind === 'directory') {
      await walk(entry, `${prefix}${entry.name}/`, out, onProgress);
    } else if (AUDIO_EXT.test(entry.name)) {
      const file = await entry.getFile();
      const path = `${prefix}${entry.name}`;
      out.push({
        fileKey: `${path}|${file.size}|${file.lastModified}`,
        path,
        name: entry.name,
        sizeBytes: file.size,
        handle: entry,
      });
      onProgress?.(out.length);
    }
  }
}
