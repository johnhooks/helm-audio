/**
 * Sequencer worker entry point.
 *
 * Receives a single init message with all ports, then runs.
 * After init, all ports are non-null — no defensive checks needed.
 *
 * Message flow:
 *   Main → Worker (controlPort):
 *     loadPattern, setTempo, transport, setPatchBank
 *   Worker → Voice worklets (voicePorts):
 *     binary ArrayBuffers (VoiceMessageType protocol)
 *   Worker → Main (controlPort):
 *     stepReport, stopped
 */

import { assert } from "@helm-audio/lib";
import { encodeVoicePatch, encodeVoiceTrig, encodeVoiceNoteOff } from "@helm-audio/protocol";
import type { PatternData } from "@helm-audio/types";
import type { InitMessage, ControlMessage } from "./messages.ts";
import { Sequencer, type SequencerListener } from "./sequencer.ts";
import { Clock } from "./clock.ts";

function boot(init: InitMessage): void {
	const { controlPort, voicePorts, fxPorts: _fxPorts } = init;

	// --- Patch bank (pre-encoded for fast dispatch) ---

	let encodedPatches: ArrayBuffer[] = [];
	const trackPatch: number[] = new Array<number>(voicePorts.length).fill(-1);

	// --- Helpers ---

	function sendVoice(track: number, buf: ArrayBuffer): void {
		assert(voicePorts[track], `no voice port for track ${String(track)}`).postMessage(buf, [buf]);
	}

	/**
	 * Push required patches to voices for a pattern. Scans each track for
	 * the first patchIndex, falling back to patch 0.
	 */
	function primeVoices(pattern: PatternData): void {
		for (let t = 0; t < pattern.tracks.length; t++) {
			let patchIndex = 0;
			for (const step of pattern.tracks[t].events) {
				if (step.patchIndex !== undefined) {
					patchIndex = step.patchIndex;
					break;
				}
			}
			listener.onLoadPatch(t, patchIndex);
		}
	}

	// --- Listener: routes sequencer events to voice worklets ---

	const listener: SequencerListener = {
		onLoadPatch(track, patchIndex) {
			if (trackPatch[track] === patchIndex) return;
			const buf = assert(encodedPatches[patchIndex], `no patch at index ${String(patchIndex)}`);
			sendVoice(track, buf.slice(0));
			trackPatch[track] = patchIndex;
		},
		onTrig(track, trig, locks) {
			sendVoice(
				track,
				encodeVoiceTrig({
					trig,
					locks: locks?.map((l) => ({ param: l.param, value: l.value })),
				}),
			);
		},
	};

	// --- Sequencer + clock ---

	const sequencer = new Sequencer(listener);

	const clock = new Clock({
		onTick() {
			sequencer.advance(1);
		},
		onStep() {
			const step = sequencer.getStep();
			controlPort.postMessage({ type: "stepReport", step });
		},
	});

	// --- Control message handling ---

	controlPort.onmessage = (msg: MessageEvent<ControlMessage>) => {
		const data = msg.data;

		switch (data.type) {
			case "loadPattern": {
				if (clock.isRunning()) {
					sequencer.setPendingPattern(data.pattern);
				} else {
					sequencer.loadPattern(data.pattern);
					primeVoices(data.pattern);
				}
				break;
			}

			case "loadPatternImmediate": {
				sequencer.loadPattern(data.pattern);
				primeVoices(data.pattern);

				break;
			}

			case "setPatchBank": {
				encodedPatches = data.patches.map((p) => encodeVoicePatch(p));
				trackPatch.fill(-1);
				// Re-prime voices if a pattern is already loaded
				const current = sequencer.getPattern();
				if (current) primeVoices(current);
				break;
			}

			case "setTempo": {
				clock.setBpm(data.bpm);
				break;
			}

			case "transport": {
				switch (data.command) {
					case "play": {
						if (!clock.isRunning()) {
							clock.start();
						}
						break;
					}
					case "stop": {
						clock.stop();
						for (const port of voicePorts) {
							const buf = encodeVoiceNoteOff();
							port.postMessage(buf, [buf]);
						}

						controlPort.postMessage({ type: "stopped" });
						break;
					}
					case "restart": {
						clock.stop();
						for (const port of voicePorts) {
							const buf = encodeVoiceNoteOff();
							port.postMessage(buf, [buf]);
						}
						const pattern = sequencer.getPattern();
						if (pattern) {
							sequencer.loadPattern(pattern);
						}

						clock.start();
						break;
					}
				}
				break;
			}
		}
	};
}

// --- Worker entry point ---

self.onmessage = (msg: MessageEvent<InitMessage>) => {
	boot(msg.data);
	self.onmessage = null; // init is one-shot
};
