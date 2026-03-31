import type { fm4, PatternData } from "@helm-audio/types";

// --- Main → Worker (single init message with all ports) ---

export interface InitMessage {
	type: "init";
	controlPort: MessagePort;
	voicePorts: MessagePort[];
	fxPorts: MessagePort[];
}

// --- Main → Worker (via controlPort) ---

export type ControlMessage =
	| { type: "loadPattern"; pattern: PatternData }
	| { type: "loadPatternImmediate"; pattern: PatternData }
	| { type: "setPatchBank"; patches: fm4.Patch[] }
	| { type: "setTempo"; bpm: number }
	| { type: "transport"; command: TransportCommand };

export type TransportCommand = "play" | "stop" | "restart";

// --- Worker → Main (via controlPort) ---

export type ReportMessage = { type: "stepReport"; step: number } | { type: "stopped" };
