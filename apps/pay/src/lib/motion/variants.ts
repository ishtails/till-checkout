import type { Variants } from "motion/react";

export const FADE_IN_VARIANTS: Variants = {
	hidden: { opacity: 0, y: 12 },
	visible: {
		opacity: 1,
		y: 0,
	},
};

export const PRESENCE_VARIANTS: Variants = {
	initial: { opacity: 0, y: 10 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0, y: -10 },
};

export const STAGGER_CONTAINER_VARIANTS: Variants = {
	hidden: { opacity: 0 },
	visible: (staggerChildren = 0.04) => ({
		opacity: 1,
		transition: {
			staggerChildren,
		},
	}),
};

export const STAGGER_ITEM_VARIANTS: Variants = {
	hidden: { opacity: 0, y: 8 },
	visible: {
		opacity: 1,
		y: 0,
	},
};
