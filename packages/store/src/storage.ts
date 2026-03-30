import type { BusSetup, Patch, PatternData } from "@helm-audio/protocol";
import { type ChainEntry, type Cursor, Page } from "./types.ts";
import type { TrackerState } from "./types.ts";
import { createInitialState } from "./defaults.ts";

// --- Project data (persistent subset of TrackerState) ---

export interface ProjectData {
	tempo: number;
	octave: number;
	stepSize: number;
	patterns: (PatternData | null)[];
	patches: Patch[];
	patchNames: string[];
	buses: BusSetup;
	chain: ChainEntry[];
	chainLoop: boolean;
	page?: Page;
	cursor?: Cursor;
	activePatternIndex?: number;
}

/** Extract the persistent project data from full tracker state. */
export function extractProject(state: TrackerState): ProjectData {
	return {
		tempo: state.tempo,
		octave: state.octave,
		stepSize: state.stepSize,
		patterns: state.patterns,
		patches: state.patches,
		patchNames: state.patchNames,
		buses: state.buses,
		chain: state.chain,
		chainLoop: state.chainLoop,
		page: state.page,
		cursor: { ...state.cursor },
		activePatternIndex: state.activePatternIndex,
	};
}

/** Merge loaded project data into a fresh initial state. */
export function applyProject(project: ProjectData, numTracks = 8): TrackerState {
	const state = createInitialState(numTracks);
	state.tempo = project.tempo;
	state.octave = project.octave;
	state.stepSize = project.stepSize;
	state.patterns = project.patterns;
	state.patches = project.patches;
	state.patchNames = project.patchNames;
	state.buses = project.buses;
	state.chain = project.chain;
	state.chainLoop = project.chainLoop;
	state.page = project.page ?? Page.Sequence;
	state.cursor = project.cursor ?? state.cursor;
	state.activePatternIndex = project.activePatternIndex ?? 0;
	return state;
}

// --- Storage interface ---

export interface Storage {
	save(project: ProjectData): Promise<void>;
	load(): Promise<ProjectData | null>;
}

// --- OPFS implementation ---

const DIR_NAME = "helm-audio";
const FILE_NAME = "project.json";

async function getProjectFile(create: boolean): Promise<FileSystemFileHandle | null> {
	try {
		const root = await navigator.storage.getDirectory();
		const dir = await root.getDirectoryHandle(DIR_NAME, { create });
		return await dir.getFileHandle(FILE_NAME, { create });
	} catch {
		return null;
	}
}

export class OpfsStorage implements Storage {
	async save(project: ProjectData): Promise<void> {
		const handle = await getProjectFile(true);
		if (!handle) return;
		const writable = await handle.createWritable();
		await writable.write(JSON.stringify(project));
		await writable.close();
	}

	async load(): Promise<ProjectData | null> {
		const handle = await getProjectFile(false);
		if (!handle) return null;
		const file = await handle.getFile();
		const text = await file.text();
		if (!text) return null;
		return JSON.parse(text) as ProjectData;
	}
}
