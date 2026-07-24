import type { Step } from "prosemirror-transform";
import type { Node } from "prosemirror-model";
/**
 * The next single step turning fromDoc towards toDoc, or false when the docs
 * are equal.
 *
 * A plain trimmed ReplaceStep spans first-to-last difference, so two distant
 * edits produce one giant step that swallows the unchanged blocks in between
 * and destroys their position mappings. When the differing region covers
 * several top-level blocks, this instead aligns the region's blocks on
 * content equality and emits a step for only the first unaligned run:
 * whole-block inserts/deletes around the anchors, per-block trimmed replaces
 * when the run pairs up 1:1, and a single run-wide replace otherwise (which
 * keeps the good single-step handling of block splits and merges). Callers
 * loop until no step remains, so later runs are handled by later calls.
 */
export declare function getBlockAlignedStep(fromDoc: Node, toDoc: Node): Step | false;
