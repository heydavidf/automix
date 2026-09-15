import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CamelotKey, TrackAnalysis } from '../analysis/types';

interface HistoryTrackRef {
  fileKey: string;
  title: string;
  artist: string;
  bpm: number | null;
  camelot: CamelotKey | null;
  gridConfidence: number;
}

/** One recorded DJ transition (persisted so good pairings are findable later). */
export interface PlayHistoryEntry {
  id?: number; // autoIncrement key
  at: number; // epoch ms
  source: 'auto' | 'manual';
  from: HistoryTrackRef;
  to: HistoryTrackRef;
  /** The UI's bar setting at the time (a max — see effectiveBlendBars). */
  requestedBars: number;
  /** Actual blend length from the plan, after confidence tiering. */
  durationSec: number;
  rate: number;
  /** True = plain crossfade, false = beatmatched blend. */
  fallback: boolean;
  starred: boolean;
  note: string;
}

interface AutomixDB extends DBSchema {
  tracks: { key: string; value: TrackAnalysis };
  settings: { key: string; value: unknown };
  transitions: { key: number; value: PlayHistoryEntry };
}

let dbPromise: Promise<IDBPDatabase<AutomixDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<AutomixDB>> {
  dbPromise ??= openDB<AutomixDB>('automix', 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('tracks');
        db.createObjectStore('settings');
      }
      if (oldVersion < 2) {
        db.createObjectStore('transitions', { keyPath: 'id', autoIncrement: true });
      }
    },
  });
  return dbPromise;
}

export async function saveLibraryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await getDb();
  await db.put('settings', handle, 'libraryDir');
}

export async function loadLibraryHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await getDb();
  const handle = await db.get('settings', 'libraryDir');
  return (handle as FileSystemDirectoryHandle | undefined) ?? null;
}

export async function getAnalysis(fileKey: string): Promise<TrackAnalysis | undefined> {
  const db = await getDb();
  return db.get('tracks', fileKey);
}

export async function putAnalysis(analysis: TrackAnalysis): Promise<void> {
  const db = await getDb();
  await db.put('tracks', analysis, analysis.fileKey);
}

export async function getAllAnalyses(): Promise<TrackAnalysis[]> {
  const db = await getDb();
  return db.getAll('tracks');
}

export async function addHistoryEntry(entry: PlayHistoryEntry): Promise<number> {
  const db = await getDb();
  return db.add('transitions', entry);
}

export async function putHistoryEntry(entry: PlayHistoryEntry): Promise<void> {
  const db = await getDb();
  await db.put('transitions', entry);
}

/** Newest first. AutoIncrement keys are chronological, so getAll is ordered. */
export async function getRecentHistory(limit = 100): Promise<PlayHistoryEntry[]> {
  const db = await getDb();
  const all = await db.getAll('transitions');
  return all.slice(-limit).reverse();
}
