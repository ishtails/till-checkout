export const SPRING_TOKENS = {
	pop: { type: "spring" as const, stiffness: 500, damping: 20 },
	bouncy: { type: "spring" as const, stiffness: 345, damping: 20 },
	smooth: { type: "spring" as const, stiffness: 230, damping: 25 },
	smoothHeavy: {
		type: "spring" as const,
		stiffness: 230,
		damping: 30,
		mass: 1.2,
	},
	snappy: { type: "spring" as const, stiffness: 400, damping: 28, mass: 0.8 },
	soft: { type: "spring" as const, stiffness: 200, damping: 25 },
	glide: { type: "spring" as const, stiffness: 180, damping: 28 },
} as const;

export type SpringPreset = keyof typeof SPRING_TOKENS;

export const TWEEN_TOKENS = {
	normal: { type: "tween" as const, duration: 0.2, ease: "easeInOut" as const },
	fast: { type: "tween" as const, duration: 0.12, ease: "easeInOut" as const },
} as const;

export type TweenPreset = keyof typeof TWEEN_TOKENS;

export const LOOP_TOKENS = {
	shimmer: { repeat: Infinity, ease: "linear" as const, duration: 1.5 },
	spinner: { repeat: Infinity, ease: "linear" as const, duration: 1 },
	breath: {
		repeat: Infinity,
		ease: [0.38, 0.1, 0.72, 1] as const,
		duration: 0.9,
	},
	pendulum: { repeat: Infinity, ease: "linear" as const, duration: 1.4 },
} as const;

export type LoopPreset = keyof typeof LOOP_TOKENS;
