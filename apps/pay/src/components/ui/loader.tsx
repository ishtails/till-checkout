

import { useMotionConfig } from "../../lib/motion";
import { motion } from "motion/react";
import { cn, useDelayedLoading } from "../../lib/utils";

const LOADER_SIZES = {
	sm: { barWidth: 2, barHeight: 12, gap: 3 },
	md: { barWidth: 2.5, barHeight: 16, gap: 3.5 },
	lg: { barWidth: 3, barHeight: 20, gap: 4 },
} as const;

export type LoaderSize = keyof typeof LOADER_SIZES;

const BAR_DELAYS = [0, 0.06, 0.12] as const;

/** Pulse in the first ~38% of the cycle; hold at rest until repeat. */
const BREATH_CYCLE = {
	scaleY: [0.38, 1, 0.38, 0.38],
	opacity: [0.5, 1, 0.5, 0.5],
	times: [0, 0.28, 0.38, 1],
};

function BreathingBars({ size }: { size: LoaderSize }) {
	const { reduced, resolveLoop } = useMotionConfig();
	const { barWidth, barHeight, gap } = LOADER_SIZES[size];
	const loop = resolveLoop("breath");

	return (
		<span
			className="inline-flex items-end justify-center"
			style={{ gap }}
			aria-hidden
		>
			{BAR_DELAYS.map((delay, index) => (
				<motion.span
					key={index}
					className="block rounded-full bg-current"
					style={{ width: barWidth, height: barHeight, originY: 1 }}
					animate={
						reduced
							? { scaleY: 0.65, opacity: 0.55 }
							: {
									scaleY: BREATH_CYCLE.scaleY,
									opacity: BREATH_CYCLE.opacity,
								}
					}
					transition={
						reduced
							? { duration: 0 }
							: { ...loop, delay, times: BREATH_CYCLE.times }
					}
				/>
			))}
		</span>
	);
}

export type InlineLoaderProps = {
	size?: LoaderSize;
	className?: string;
	label?: string;
};

export function InlineLoader({
	size = "md",
	className,
	label = "Loading",
}: InlineLoaderProps) {
	return (
		<span
			role="status"
			aria-live="polite"
			aria-busy="true"
			className={cn(
				"inline-flex items-center justify-center text-muted-foreground",
				className,
			)}
		>
			<BreathingBars size={size} />
			<span className="sr-only">{label}</span>
		</span>
	);
}

export type DelayedInlineLoaderProps = InlineLoaderProps & {
	show: boolean;
	delayMs?: number;
};

export function DelayedInlineLoader({
	show,
	delayMs,
	...props
}: DelayedInlineLoaderProps) {
	const visible = useDelayedLoading(show, delayMs);
	if (!visible) return null;
	return <InlineLoader {...props} />;
}

export type LoaderProps = {
	size?: LoaderSize;
	text?: string;
	className?: string;
};

export function Loader({ text, size = "md", className }: LoaderProps) {
	return (
		<div
			className={cn(
				"flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4",
				className,
			)}
		>
			<InlineLoader size={size} />
			{text ? (
				<p className="text-center text-sm text-muted-foreground">{text}</p>
			) : null}
		</div>
	);
}
