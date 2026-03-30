/**
 * Sequencer worker entry point.
 *
 * Receives a single init message with all ports, then runs.
 * After init, all ports are non-null — no defensive checks needed.
 *
 * Message flow:
 *   Main → Worker (controlPort):
 *     loadPattern, setTempo, transport
 *   Worker → Voice worklets (voicePorts):
 *     noteOn, noteOff, fadeOut, loadPatch, paramLock
 *   Worker → Main (controlPort):
 *     stepReport
 */

import { assert } from "@helm-audio/lib";
import type { Patch } from "@helm-audio/types";
import type { InitMessage, ControlMessage, VoiceMessage } from "./messages.ts";
import { Sequencer, TICKS_PER_STEP, type SequencerListener } from "./sequencer.ts";
import { Clock } from "./clock.ts";

function boot(init: InitMessage): void {
	const { controlPort, voicePorts, fxPorts: _fxPorts } = init;

	// --- Patch bank (for loadPatch dispatch) ---

	let patchBank: Patch[] = [];

	// --- Helpers ---

	function sendVoice(track: number, msg: VoiceMessage): void {
		assert(voicePorts[track], `no voice port for track ${track}`).postMessage(msg);
	}

	// --- Listener: routes sequencer events to voice worklets ---

	const listener: SequencerListener = {
		onNoteOn(track, note, velocity) {
			sendVoice(track, { type: "noteOn", note, velocity });
		},
		onNoteOff(track) {
			sendVoice(track, { type: "noteOff" });
		},
		onFadeOut(track) {
			sendVoice(track, { type: "fadeOut" });
		},
		onLoadPatch(track, patchIndex) {
			const patch = assert(patchBank[patchIndex], `no patch at index ${patchIndex}`);
			sendVoice(track, { type: "loadPatch", patch });
		},
		onParamLock(track, lock) {
			sendVoice(track, { type: "paramLock", param: lock.param, value: lock.value });
		},
	};

	// --- Sequencer + clock ---

	const sequencer = new Sequencer(listener);
	let lastReportedStep = -1;

	const clock = new Clock({
		onTick() {
			sequencer.advance(1);
		},
		onStep() {
			const tick = sequencer.getTick();
			const step = Math.floor(tick / TICKS_PER_STEP);
			if (step !== lastReportedStep) {
				lastReportedStep = step;
				const pattern = sequencer.getPattern();
				const trackActivity: boolean[] = [];
				if (pattern) {
					for (let i = 0; i < pattern.tracks.length; i++) {
						trackActivity.push(sequencer.getTrackCursor(i) >= 0);
					}
				}
				controlPort.postMessage({ type: "stepReport", step, trackActivity });
			}
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
				}
				break;
			}

			case "loadPatternImmediate": {
				sequencer.loadPattern(data.pattern);
				lastReportedStep = -1;
				break;
			}

			case "setPatchBank": {
				patchBank = data.patches;
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
							lastReportedStep = -1;
							clock.start();
						}
						break;
					}
					case "stop": {
						clock.stop();
						for (const port of voicePorts) {
							port.postMessage({ type: "noteOff" } satisfies VoiceMessage);
						}
						lastReportedStep = -1;
						controlPort.postMessage({ type: "stopped" });
						break;
					}
					case "restart": {
						clock.stop();
						for (const port of voicePorts) {
							port.postMessage({ type: "noteOff" } satisfies VoiceMessage);
						}
						const pattern = sequencer.getPattern();
						if (pattern) {
							sequencer.loadPattern(pattern);
						}
						lastReportedStep = -1;
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
	if (msg.data.type !== "init") {
		throw new Error("first message must be init");
	}
	boot(msg.data);
	self.onmessage = null; // init is one-shot
};
