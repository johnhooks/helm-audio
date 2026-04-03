import { TrigType, type PatternData, type BusSetup, type Step } from "@helm-audio/protocol";
import type { Orchestrator } from "@helm-audio/synth";
import type { fm4, Action } from "@helm-audio/types";
import { DEFAULT_NOTE_LENGTH, MAX_PATTERNS, MAX_UNDO } from "./constants.ts";
import { StepField, type TrackerState, type UndoGroup } from "./types.ts";

/**
 * Mutable state store for the tracker.
 *
 * Each method mutates state and sends the corresponding command to the
 * orchestrator. The store doesn't know about the display — it just holds
 * data and syncs with the audio engine.
 */
export class TrackerStore {
	state: TrackerState;

	/** Timestamp of the last animation trigger. */
	animatingUntil = 0;

	/*
	 * Called whenever state changes. Set by the shell to trigger redraws.
	 */
	onDirty: (() => void) | null = null;

	private orchestrator: Orchestrator | null = null;

	constructor(initialState: TrackerState) {
		this.state = initialState;
	}

	/*
	 * Connect to the audio orchestrator. Call once after Orchestrator.create resolves.
	 */
	connectOrchestrator(orch: Orchestrator): void {
		this.orchestrator = orch;
		orch.onStepReport((step) => {
			this.dispatch({ type: "stepReport", step });
		});
	}

	/*
	 * Send the full current state to the engine (patches, pattern, tempo).
	 */
	syncAll(): void {
		if (!this.orchestrator) return;
		this.orchestrator.loadPatchBank(this.state.patches);
		this.sendActivePattern();
		this.orchestrator.setTempo(this.state.tempo);
	}

	// --- Action dispatch ---

	dispatch(action: Action): void {
		switch (action.type) {
			case "setPage":
				this.setPage(action.page);
				break;
			case "moveCursor":
				this.moveCursor(action.dRow, action.dCol, action.dField);
				break;
			case "setCursor":
				this.setCursor(action.row, action.col, action.field);
				break;
			case "play":
				this.play();
				break;
			case "stop":
				this.stop();
				break;
			case "togglePlay":
				this.togglePlay();
				break;
			case "restart":
				this.restart();
				break;
			case "setTempo":
				this.setTempo(action.bpm);
				break;
			case "stepReport":
				this.state.playbackStep = action.step;
				this.markDirty();
				break;
			case "enterNote":
				this.enterNote(action.note);
				break;
			case "noteOff":
				/* TODO: not implemented yet */ break;
			case "deleteStep":
				this.deleteStep();
				break;
			case "setStep":
				this.setStep(action.patternIndex, action.trackIndex, action.stepIndex, action.step);
				break;
			case "clearStep":
				this.clearStep(action.patternIndex, action.trackIndex, action.stepIndex);
				break;
			case "toggleEditMode":
				this.toggleEditMode();
				break;
			case "setOctave":
				this.setOctave(action.octave);
				break;
			case "setStepSize":
				this.setStepSize(action.size);
				break;
			case "setCurrentPatchIndex":
				this.setCurrentPatchIndex(action.index);
				break;
			case "setChainEntry":
				this.setChainEntry(action.row, action.track, action.patternIndex);
				break;
			case "clearChainEntry":
				this.clearChainEntry(action.row, action.track);
				break;
			case "setActivePattern":
				this.setActivePattern(action.index);
				break;
			case "setCurrentBank":
				this.setCurrentBank(action.bank);
				break;
			case "setPatch":
				this.setPatch(action.index, action.patch);
				break;
			case "setPatchName":
				this.setPatchName(action.index, action.name);
				break;
			case "setBuses":
				this.setBuses(action.buses);
				break;
			case "undo":
				this.undo();
				break;
			case "redo":
				this.redo();
				break;
		}
	}

	// --- Keyjazz ---

	noteOn(track: number, note: number): void {
		this.orchestrator?.noteOn(track, note, 0x7f);
	}

	noteOff(track: number): void {
		this.orchestrator?.noteOff(track);
	}

	// --- Transport ---

	play(): void {
		this.state.playing = true;
		this.orchestrator?.play();
		this.markDirty();
	}

	stop(): void {
		this.state.playing = false;
		this.orchestrator?.stop();
		this.markDirty();
	}

	togglePlay(): void {
		if (this.state.playing) {
			this.stop();
		} else {
			this.play();
		}
	}

	restart(): void {
		this.state.playing = true;
		this.state.playbackStep = 0;
		this.orchestrator?.restart();
		this.markDirty();
	}

	setTempo(bpm: number): void {
		this.state.tempo = bpm;
		this.orchestrator?.setTempo(bpm);
		this.markDirty();
	}

	// --- Cursor ---

	moveCursor(dRow: number, dCol: number, dField: number): void {
		const s = this.state;
		const pattern = s.patterns[s.activePatternIndex];
		if (!pattern) return;

		s.cursor.row = clamp(s.cursor.row + dRow, 0, pattern.length - 1);
		s.cursor.col = clamp(s.cursor.col + dCol, 0, pattern.tracks.length - 1);
		s.cursor.field = clamp(s.cursor.field + dField, StepField.Note, StepField.Lock);
		this.markDirty();
	}

	setCursor(row: number, col: number, field: StepField): void {
		this.state.cursor.row = row;
		this.state.cursor.col = col;
		this.state.cursor.field = field;
		this.markDirty();
	}

	// --- Note entry ---

	enterNote(note: number): void {
		const s = this.state;
		const pattern = s.patterns[s.activePatternIndex];
		if (!pattern) return;

		const step: Step = {
			stepIndex: s.cursor.row,
			trig: { type: TrigType.NoteOn, note, velocity: 0x7f },
			length: DEFAULT_NOTE_LENGTH,
		};

		this.setStep(s.activePatternIndex, s.cursor.col, s.cursor.row, step);

		// Advance cursor
		if (s.stepSize > 0) {
			s.cursor.row = Math.min(s.cursor.row + s.stepSize, pattern.length - 1);
		}
		this.markDirty();
	}

	deleteStep(): void {
		const s = this.state;
		this.clearStep(s.activePatternIndex, s.cursor.col, s.cursor.row);
	}

	// --- Step editing ---

	setStep(patternIndex: number, trackIndex: number, stepIndex: number, step: Step): void {
		const pattern = this.state.patterns[patternIndex];
		if (!pattern) return;
		if (trackIndex >= pattern.tracks.length) return;

		const track = pattern.tracks[trackIndex];

		// Store undo
		const existing = track.events.find((e) => e.stepIndex === stepIndex);
		this.pushUndo([
			{
				patternIndex,
				trackIndex,
				stepIndex,
				before: existing ?? null,
				after: step,
			},
		]);

		// Update local state
		const idx = track.events.findIndex((e) => e.stepIndex === stepIndex);
		if (idx >= 0) {
			track.events[idx] = step;
		} else {
			track.events.push(step);
		}

		this.sendActivePattern();
		this.markDirty();
	}

	clearStep(patternIndex: number, trackIndex: number, stepIndex: number): void {
		const pattern = this.state.patterns[patternIndex];
		if (!pattern) return;
		if (trackIndex >= pattern.tracks.length) return;

		const track = pattern.tracks[trackIndex];
		const idx = track.events.findIndex((e) => e.stepIndex === stepIndex);
		if (idx < 0) return;

		this.pushUndo([
			{
				patternIndex,
				trackIndex,
				stepIndex,
				before: track.events[idx],
				after: null,
			},
		]);

		track.events.splice(idx, 1);
		this.sendActivePattern();
		this.markDirty();
	}

	// --- Patch editing ---

	setPatch(index: number, patch: fm4.Patch): void {
		if (index >= this.state.patches.length) {
			while (this.state.patches.length <= index) {
				this.state.patches.push({ ...this.state.patches[0] });
				this.state.patchNames.push("init");
			}
		}
		this.state.patches[index] = patch;
		this.orchestrator?.loadPatchBank(this.state.patches);
		this.markDirty();
	}

	setPatchName(index: number, name: string): void {
		if (index < this.state.patchNames.length) {
			this.state.patchNames[index] = name;
			this.markDirty();
		}
	}

	// --- Chain editing ---

	setChainEntry(row: number, track: number, patternIndex: number): void {
		const idx = row * 8 + track;
		while (this.state.chain.length <= idx) {
			this.state.chain.push({ patternIndex: -1 });
		}
		this.state.chain[idx] = { patternIndex };
		this.markDirty();
	}

	clearChainEntry(row: number, track: number): void {
		const idx = row * 8 + track;
		if (idx < this.state.chain.length) {
			this.state.chain[idx] = { patternIndex: -1 };
			this.markDirty();
		}
	}

	// --- Pattern management ---

	setActivePattern(index: number): void {
		if (index < 0 || index >= MAX_PATTERNS) return;
		this.state.activePatternIndex = index;
		this.state.cursor.row = 0;
		this.state.scrollRow = 0;
		this.sendActivePattern();
		this.markDirty();
	}

	setCurrentBank(bank: number): void {
		this.state.currentBank = clamp(bank, 0, 3);
		this.markDirty();
	}

	// --- Effect buses ---

	setBuses(buses: BusSetup): void {
		this.state.buses = buses;
		// TODO: send bus config to orchestrator when effect buses are implemented
		this.markDirty();
	}

	// --- Editing mode ---

	toggleEditMode(): void {
		this.state.editMode = !this.state.editMode;
		this.markDirty();
	}

	setOctave(octave: number): void {
		this.state.octave = clamp(octave, 0, 8);
		this.markDirty();
	}

	setStepSize(size: number): void {
		this.state.stepSize = clamp(size, 0, 16);
		this.markDirty();
	}

	setCurrentPatchIndex(index: number): void {
		this.state.currentPatchIndex = index;
		this.markDirty();
	}

	// --- Navigation ---

	setPage(page: TrackerState["page"]): void {
		this.state.page = page;
		this.markDirty();
	}

	// --- Undo / Redo ---

	undo(): void {
		const group = this.state.undoStack.pop();
		if (!group) return;

		for (const entry of group.entries) {
			const pattern = this.state.patterns[entry.patternIndex];
			if (!pattern) continue;
			if (entry.trackIndex >= pattern.tracks.length) continue;
			const track = pattern.tracks[entry.trackIndex];

			const idx = track.events.findIndex((e) => e.stepIndex === entry.stepIndex);
			if (entry.before === null) {
				if (idx >= 0) track.events.splice(idx, 1);
			} else if (idx >= 0) {
				track.events[idx] = entry.before;
			} else {
				track.events.push(entry.before);
			}
		}

		this.state.redoStack.push(group);
		this.sendActivePattern();
		this.markDirty();
	}

	redo(): void {
		const group = this.state.redoStack.pop();
		if (!group) return;

		for (const entry of group.entries) {
			const pattern = this.state.patterns[entry.patternIndex];
			if (!pattern) continue;
			if (entry.trackIndex >= pattern.tracks.length) continue;
			const track = pattern.tracks[entry.trackIndex];

			const idx = track.events.findIndex((e) => e.stepIndex === entry.stepIndex);
			if (entry.after === null) {
				if (idx >= 0) track.events.splice(idx, 1);
			} else if (idx >= 0) {
				track.events[idx] = entry.after;
			} else {
				track.events.push(entry.after);
			}
		}

		this.state.undoStack.push(group);
		this.sendActivePattern();
		this.markDirty();
	}

	// --- Helpers ---

	getActivePattern(): PatternData | null {
		return this.state.patterns[this.state.activePatternIndex];
	}

	getStepAt(trackIndex: number, stepIndex: number): Step | null {
		const pattern = this.getActivePattern();
		if (!pattern || trackIndex >= pattern.tracks.length) return null;
		return pattern.tracks[trackIndex].events.find((e) => e.stepIndex === stepIndex) ?? null;
	}

	// --- Internal ---

	private pushUndo(entries: UndoGroup["entries"]): void {
		this.state.undoStack.push({ entries });
		if (this.state.undoStack.length > MAX_UNDO) {
			this.state.undoStack.shift();
		}
		this.state.redoStack.length = 0;
	}

	private sendActivePattern(): void {
		const pattern = this.getActivePattern();
		if (pattern) {
			if (this.state.playing) {
				this.orchestrator?.updatePattern(pattern);
			} else {
				this.orchestrator?.loadPattern(pattern);
			}
		}
	}

	private markDirty(): void {
		this.onDirty?.();
	}
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}
