import {
	AnimatePresence,
	type HTMLMotionProps,
	motion,
	type TargetAndTransition,
	type VariantLabels,
} from "motion/react";
import React from "react";
import type { SpringPreset } from "./tokens";
import { SPRING_TOKENS, TWEEN_TOKENS } from "./tokens";
import { useMotionConfig } from "./use-motion";
import {
	FADE_IN_VARIANTS,
	PRESENCE_VARIANTS,
	STAGGER_CONTAINER_VARIANTS,
	STAGGER_ITEM_VARIANTS,
} from "./variants";

// 1. Pressable Component (gestures scaling without nesting DOM wrappers)
interface PressableProps {
	children: React.ReactElement;
	preset?: "snappy" | "smooth" | "soft";
	disabled?: boolean;
	whileHover?: VariantLabels | TargetAndTransition;
	whileTap?: VariantLabels | TargetAndTransition;
}

export function Pressable({
	children,
	preset = "snappy",
	disabled = false,
	whileHover,
	whileTap,
}: PressableProps) {
	const { reduced } = useMotionConfig();

	if (disabled || !React.isValidElement(children)) {
		return children;
	}

	const spring = SPRING_TOKENS[preset];
	const childType = children.type;
	const childProps = (children.props || {}) as Record<string, unknown>;

	try {
		// Dynamically construct a motion component based on the child's element type
		const MotionComponent = motion.create(
			childType as string | React.ComponentType,
		);

		const combinedProps = {
			...childProps,
			whileHover: reduced ? undefined : (whileHover ?? { scale: 1.02 }),
			whileTap: reduced ? undefined : (whileTap ?? { scale: 0.97 }),
			transition: reduced
				? { duration: 0 }
				: {
						...spring,
						...((childProps.transition || {}) as Record<string, unknown>),
					},
		};

		return React.createElement(MotionComponent, combinedProps);
	} catch (error) {
		console.warn(
			"Pressable: Dynamic motion creation failed. Element type must be a standard HTML tag or properly forward ref.",
			childType,
			error,
		);
		return children;
	}
}

// 2. MotionReveal Component (snappy first paint entry animations)
interface MotionRevealProps extends Omit<HTMLMotionProps<"div">, "transition"> {
	preset?: SpringPreset;
	delay?: number;
	onlyOnce?: boolean;
	children: React.ReactNode;
}

// Global set to keep track of mounted keys/ids for onlyOnce optimization
const revealsMountedSet = new Set<string>();

export function MotionReveal({
	preset = "smooth",
	delay = 0,
	onlyOnce = false,
	children,
	id,
	...props
}: MotionRevealProps) {
	const { resolveTransition, resolveVariants } = useMotionConfig();
	const transition = resolveTransition(preset);
	const resolvedVariants = resolveVariants(FADE_IN_VARIANTS);

	// Check if this component has already been rendered once to satisfy onlyOnce
	const revealId = id || (children ? children.toString().slice(0, 32) : "");
	const hasBeenRevealed =
		onlyOnce && revealId && revealsMountedSet.has(revealId);

	React.useEffect(() => {
		if (onlyOnce && revealId) {
			revealsMountedSet.add(revealId);
		}
	}, [onlyOnce, revealId]);

	return (
		<motion.div
			id={id}
			initial={hasBeenRevealed ? false : "hidden"}
			animate="visible"
			variants={resolvedVariants}
			transition={
				transition
					? {
							...transition,
							delay,
						}
					: undefined
			}
			{...props}
		>
			{children}
		</motion.div>
	);
}

// 3. PresenceSwap Component (crossfades state variables)
interface PresenceSwapProps {
	children: React.ReactNode;
	customKey: unknown;
	layout?: boolean;
}

export function PresenceSwap({
	children,
	customKey,
	layout = false,
}: PresenceSwapProps) {
	const { reduced, resolveVariants } = useMotionConfig();
	const resolvedVariants = resolveVariants(PRESENCE_VARIANTS);

	return (
		<AnimatePresence mode="wait">
			<motion.div
				key={String(customKey)}
				initial="initial"
				animate="animate"
				exit="exit"
				variants={resolvedVariants}
				transition={reduced ? { duration: 0 } : TWEEN_TOKENS.normal}
				layout={reduced ? false : layout}
				style={{ display: "contents" }}
			>
				{children}
			</motion.div>
		</AnimatePresence>
	);
}

// 4. Stagger Component (performance-throttled stagger animations)
interface StaggerProps extends HTMLMotionProps<"div"> {
	staggerDelay?: number;
	maxVisible?: number;
	children: React.ReactNode;
}

export function Stagger({
	staggerDelay = 0.04,
	maxVisible = 8,
	children,
	...props
}: StaggerProps) {
	const { resolveVariants } = useMotionConfig();
	const childCount = React.Children.count(children);
	const shouldStagger = childCount <= maxVisible;

	const resolvedContainer = resolveVariants(STAGGER_CONTAINER_VARIANTS);
	const resolvedItem = resolveVariants(STAGGER_ITEM_VARIANTS);

	return (
		<motion.div
			initial="hidden"
			animate="visible"
			variants={resolvedContainer}
			custom={shouldStagger ? staggerDelay : 0}
			{...props}
		>
			{React.Children.map(children, (child) => {
				if (!React.isValidElement(child)) return child;
				return (
					<motion.div variants={resolvedItem} style={{ display: "contents" }}>
						{child}
					</motion.div>
				);
			})}
		</motion.div>
	);
}
