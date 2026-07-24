import type { Step } from "prosemirror-transform";
import type { Node } from "prosemirror-model";
/**
 * The normalized bounds of a single replace covering all differing content
 * between two regions. All positions are absolute document positions:
 * `fromStart..endB` in fromDoc is replaced by `toStart..endA` from toDoc.
 */
export interface ReplaceRegion {
    fromStart: number;
    toStart: number;
    endA: number;
    endB: number;
}
/**
 * Diff fromDoc[f0, f1) against toDoc[t0, t1) and return the trimmed replace
 * region, or null when the regions are identical. The content outside the
 * given bounds is ignored, so callers must only pass regions whose exteriors
 * are already equal.
 */
export declare function findReplaceRegion(fromDoc: Node, toDoc: Node, f0: number, f1: number, t0: number, t1: number): ReplaceRegion | null;
/** Build the ReplaceStep described by a ReplaceRegion. */
export declare function replaceStepForRegion(toDoc: Node, region: ReplaceRegion): Step;
/**
 * A single trimmed ReplaceStep turning fromDoc[f0, f1) into toDoc[t0, t1),
 * or null when the regions are already identical.
 */
export declare function trimmedReplaceStep(fromDoc: Node, toDoc: Node, f0: number, f1: number, t0: number, t1: number): Step | null;
export declare function getReplaceStep(fromDoc: Node, toDoc: Node): Step | false;
