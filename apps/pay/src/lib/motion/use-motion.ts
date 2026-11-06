import { useReducedMotion, type Variants } from "motion/react";
import type { LoopPreset, SpringPreset } from "./tokens";
import { LOOP_TOKENS, SPRING_TOKENS } from "./tokens";

export function useMotionConfig() {
	const reduced = useReducedMotion();

	const resolveTransition = <T extends SpringPreset | undefined>(preset: T) => {
		if (reduced) {
			return { type: "tween" as const, duration: 0 };
		}
		if (preset === undefined) return undefined;
		return SPRING_TOKENS[preset];
	};

	const resolveLoop = (preset: LoopPreset) => {
		if (reduced) {
			return { repeat: 0 };
		}
		return LOOP_TOKENS[preset];
	};

	const resolveVariants = (variants: Variants): Variants => {
		if (!reduced) return variants;
		const resolved: Variants = {};
		for (const [key, value] of Object.entries(variants)) {
			if (typeof value === "object" && value !== null) {
				resolved[key] = {
					...value,
					x: 0,
					y: 0,
					scale: 1,
					rotate: 0,
					transition: { duration: 0 },
				};
			} else {
				resolved[key] = value;
			}
		}
		return resolved;
	};

	return {
		reduced,
		resolveTransition,
		resolveLoop,
		resolveVariants,
	};
}
