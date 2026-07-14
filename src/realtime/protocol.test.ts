import { describe, expect, it } from "vitest";
import {
	ControllerMessageSchema,
	HostMessageSchema,
	parseJsonMessage,
} from "./protocol";

describe("realtime protocol", () => {
	it("accepts valid aim messages", () => {
		expect(
			parseJsonMessage(
				'{"type":"aim","normalizedAim":0.4,"timestamp":1}',
				ControllerMessageSchema,
			),
		).toEqual({ type: "aim", normalizedAim: 0.4, timestamp: 1 });
	});

	it("rejects out-of-range input", () => {
		expect(
			parseJsonMessage(
				'{"type":"flick","intensity":2,"source":"button","timestamp":1}',
				ControllerMessageSchema,
			),
		).toBeNull();
	});

	it("requires a known flick source", () => {
		expect(
			parseJsonMessage(
				'{"type":"flick","intensity":0.75,"source":"unknown","timestamp":1}',
				ControllerMessageSchema,
			),
		).toBeNull();
	});

	it("accepts motion status without requiring motion for ready", () => {
		expect(
			parseJsonMessage(
				'{"type":"motion-status","enabled":false}',
				ControllerMessageSchema,
			),
		).toEqual({ type: "motion-status", enabled: false });
	});

	it("rejects oversized payloads", () => {
		expect(
			parseJsonMessage("x".repeat(3000), ControllerMessageSchema),
		).toBeNull();
	});

	it("accepts a controller ready message", () => {
		expect(
			parseJsonMessage(
				'{"type":"ready","ready":true}',
				ControllerMessageSchema,
			),
		).toEqual({ type: "ready", ready: true });
	});

	it("accepts an assignment sent to a controller", () => {
		expect(
			parseJsonMessage(
				'{"type":"assignment","player":{"playerId":"00000000-0000-4000-8000-000000000001","playerNumber":2,"color":"red"}}',
				HostMessageSchema,
			)?.type,
		).toBe("assignment");
	});
});
