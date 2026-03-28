import {
	encodePatchBank,
	encodePattern,
	encodeBusConfig,
	encodeTransport,
	encodeTempo,
	encodeTrigger,
	decodeStateReport,
	TransportCommand,
	TrigType,
	type Patch,
	type PatternData,
	type BusSetup,
	type Step,
} from "@helm-audio/protocol";
import { send, listen } from "@helm-audio/worklet";
import { MAX_PATTERNS, MAX_UNDO } from "./constants.ts";
import { StepField, type TrackerState, type UndoGroup } from "./types.ts";

/**
 * Mutable state store for the tracker.
 *
 * Each method mutates state and sends the corresponding protocol message
 * to the engine. The store doesn't know about the display — it just holds
 * data and syncs with the engine.
 *
 * For Helm integration, wrap this in a @wordpress/data store where the
 * methods become actions and the state shape becomes selectors.
 */
export class TrackerStore {
	state: TrackerState;
	dirty = true;

	/** Timestamp of the last animation trigger. */
	animatingUntil = 0;

	private node: AudioWorkletNode | null = null;

	constructor(initialState: TrackerState) {
		this.state = initialState;
	}

	/** Connect to the audio engine. Call once after createHelmNode resolves. */
	connect(node: AudioWorkletNode): void {
		this.node = node;
		listen(node, (buf) => {
			this.handleStateReport(buf);
		});
	}

	/** Send the full current state to the engine (patches, pattern, buses, tempo). */
	syncAll(): void {
		this.sendPatches();
		this.sendActivePattern();
		this.sendBuses();
		this.sendTempo();
	}

	// --- Transport ---

	play(): void {
		this.state.playing = true;
		this.send(encodeTransport(TransportCommand.Play));
		this.markDirty();
	}

	stop(): void {
		this.state.playing = false;
		this.send(encodeTransport(TransportCommand.Stop));
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
		this.send(encodeTransport(TransportCommand.Restart));
		this.markDirty();
	}

	setTempo(bpm: number): void {
		this.state.tempo = bpm;
		this.send(encodeTempo(bpm));
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
			patchIndex: s.currentPatchIndex,
		};

		this.setStep(s.activePatternIndex, s.cursor.col, s.cursor.row, step);

		// Preview the note (immediate trigger, bypasses sequencer)
		this.send(
			encodeTrigger({
				track: s.cursor.col,
				patchIndex: s.currentPatchIndex,
				trig: { type: TrigType.NoteOn, note, velocity: 0x7f },
			}),
		);

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

		// Send to engine (once SetStep protocol message exists)
		// For now, re-send the full pattern
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

	setPatch(index: number, patch: Patch): void {
		if (index >= this.state.patches.length) {
			// Extend the bank
			while (this.state.patches.length <= index) {
				this.state.patches.push({ ...this.state.patches[0] });
				this.state.patchNames.push("init");
			}
		}
		this.state.patches[index] = patch;
		this.sendPatches();
		this.markDirty();
	}

	setPatchName(index: number, name: string): void {
		if (index < this.state.patchNames.length) {
			this.state.patchNames[index] = name;
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
		this.sendBuses();
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

		// Apply the reverse
		for (const entry of group.entries) {
			const pattern = this.state.patterns[entry.patternIndex];
			if (!pattern) continue;
			if (entry.trackIndex >= pattern.tracks.length) continue;
			const track = pattern.tracks[entry.trackIndex];

			const idx = track.events.findIndex((e) => e.stepIndex === entry.stepIndex);
			if (entry.before === null) {
				// Was an insert — remove it
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

	/** Get the currently active pattern, or null. */
	getActivePattern(): PatternData | null {
		return this.state.patterns[this.state.activePatternIndex];
	}

	/** Get the step data at a position, or null if empty. */
	getStepAt(trackIndex: number, stepIndex: number): Step | null {
		const pattern = this.getActivePattern();
		if (!pattern || trackIndex >= pattern.tracks.length) return null;
		return pattern.tracks[trackIndex].events.find((e) => e.stepIndex === stepIndex) ?? null;
	}

	// --- Internal ---

	private handleStateReport(buf: ArrayBuffer): void {
		const report = decodeStateReport(buf);
		if (!report) return;

		this.state.playbackStep = report.step;
		this.state.playing = report.playing;
		this.markDirty();
	}

	private pushUndo(entries: UndoGroup["entries"]): void {
		this.state.undoStack.push({ entries });
		if (this.state.undoStack.length > MAX_UNDO) {
			this.state.undoStack.shift();
		}
		// Clear redo on new edit
		this.state.redoStack.length = 0;
	}

	private sendPatches(): void {
		this.send(encodePatchBank(this.state.patches));
	}

	private sendActivePattern(): void {
		const pattern = this.getActivePattern();
		if (pattern) {
			this.send(encodePattern(pattern));
		}
	}

	private sendBuses(): void {
		this.send(encodeBusConfig(this.state.buses));
	}

	private sendTempo(): void {
		this.send(encodeTempo(this.state.tempo));
	}

	private send(buf: ArrayBuffer): void {
		if (this.node) {
			send(this.node, buf);
		}
	}

	private markDirty(): void {
		this.dirty = true;
	}
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}
