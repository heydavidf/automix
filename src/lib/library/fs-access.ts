import { loadLibraryHandle, saveLibraryHandle } from './db';

export function isFsAccessSupported(): boolean {
  return typeof window.showDirectoryPicker === 'function';
}

export async function pickLibraryFolder(): Promise<FileSystemDirectoryHandle> {
  const handle = await window.showDirectoryPicker({ id: 'automix-library', mode: 'read' });
  await saveLibraryHandle(handle);
  return handle;
}

/**
 * Restore the persisted folder handle. Chrome requires requestPermission()
 * on a user gesture each session, so call this from a click handler.
 */
export async function restoreLibraryFolder(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await loadLibraryHandle();
  if (!handle) return null;
  if ((await handle.queryPermission({ mode: 'read' })) === 'granted') return handle;
  if ((await handle.requestPermission({ mode: 'read' })) === 'granted') return handle;
  return null;
}

export async function hasSavedLibrary(): Promise<boolean> {
  return (await loadLibraryHandle()) !== null;
}
