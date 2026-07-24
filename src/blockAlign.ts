import { ReplaceStep } from "prosemirror-transform";
import type { Step } from "prosemirror-transform";
import { Fragment, Slice } from "prosemirror-model";
import type { Node } from "prosemirror-model";
import {
    findReplaceRegion,
    replaceStepForRegion,
    trimmedReplaceStep,
} from "./getReplaceStep";

/** Index of the top-level child containing `pos`, and whether `pos` sits on its start boundary. */
function childIndexAt(
    doc: Node,
    pos: number,
): { index: number; atBoundary: boolean } {
    let offset = 0;
    let index = 0;
    while (index < doc.content.childCount) {
        const size = doc.content.child(index).nodeSize;
        if (pos <= offset) {
            break;
        }
        if (pos < offset + size) {
            return { index, atBoundary: false };
        }
        offset += size;
        index++;
    }
    return { index, atBoundary: true };
}

/** Top-level child indices [first, end) of `doc` touched by positions [from, to). */
function blockSpan(
    doc: Node,
    from: number,
    to: number,
): { first: number; end: number } {
    const a = childIndexAt(doc, from);
    const b = childIndexAt(doc, to);
    // A position exactly on a block boundary does not touch the block after it.
    const end = b.atBoundary ? b.index : b.index + 1;
    return { first: a.index, end: Math.max(a.index, end) };
}

/** Absolute start position of each top-level child; offsets[childCount] = content size. */
function childOffsets(doc: Node): number[] {
    const offsets = [0];
    let pos = 0;
    doc.content.forEach((child) => {
        pos += child.nodeSize;
        offsets.push(pos);
    });
    return offsets;
}

interface BlockPair {
    f: number;
    t: number;
}

/**
 * Align two block sequences on exact node equality, maximizing the total
 * nodeSize of matched blocks (a weighted LCS). Weighting by size keeps
 * identity on the largest unchanged blocks when matches cross (e.g. two
 * blocks swapping places), which preserves the most position mappings.
 */
function alignBlocks(fromBlocks: Node[], toBlocks: Node[]): BlockPair[] {
    const m = fromBlocks.length;
    const n = toBlocks.length;
    if (m === 0 || n === 0) {
        return [];
    }

    const eq = fromBlocks.map((fb) => toBlocks.map((tb) => fb.eq(tb)));

    // dp[i][j] = best matched weight aligning fromBlocks[i..] with toBlocks[j..]
    const dp: number[][] = [];
    for (let i = 0; i <= m; i++) {
        dp.push(new Array<number>(n + 1).fill(0));
    }
    for (let i = m - 1; i >= 0; i--) {
        for (let j = n - 1; j >= 0; j--) {
            let best = Math.max(dp[i + 1][j], dp[i][j + 1]);
            if (eq[i][j]) {
                best = Math.max(
                    best,
                    fromBlocks[i].nodeSize + dp[i + 1][j + 1],
                );
            }
            dp[i][j] = best;
        }
    }

    const pairs: BlockPair[] = [];
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
        if (
            eq[i][j] &&
            dp[i][j] === fromBlocks[i].nodeSize + dp[i + 1][j + 1]
        ) {
            pairs.push({ f: i, t: j });
            i++;
            j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            i++;
        } else {
            j++;
        }
    }
    return pairs;
}

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
export function getBlockAlignedStep(fromDoc: Node, toDoc: Node): Step | false {
    const region = findReplaceRegion(
        fromDoc,
        toDoc,
        0,
        fromDoc.content.size,
        0,
        toDoc.content.size,
    );
    if (region === null) {
        return false;
    }

    const fromSpan = blockSpan(fromDoc, region.fromStart, region.endB);
    const toSpan = blockSpan(toDoc, region.toStart, region.endA);
    if (fromSpan.end - fromSpan.first <= 1 && toSpan.end - toSpan.first <= 1) {
        return replaceStepForRegion(toDoc, region);
    }

    const fromOffsets = childOffsets(fromDoc);
    const toOffsets = childOffsets(toDoc);
    const fromBlocks: Node[] = [];
    for (let i = fromSpan.first; i < fromSpan.end; i++) {
        fromBlocks.push(fromDoc.content.child(i));
    }
    const toBlocks: Node[] = [];
    for (let i = toSpan.first; i < toSpan.end; i++) {
        toBlocks.push(toDoc.content.child(i));
    }

    const pairs = alignBlocks(fromBlocks, toBlocks);
    if (pairs.length === 0) {
        if (fromBlocks.length === toBlocks.length) {
            // No anchors, but the blocks pair up positionally (e.g. every
            // paragraph edited in place): emit the first pair's own trimmed
            // replace so each block keeps its identity.
            const step = firstPairStep(
                fromDoc,
                toDoc,
                fromOffsets,
                toOffsets,
                fromSpan.first,
                toSpan.first,
                fromBlocks,
                toBlocks,
                0,
                0,
                fromBlocks.length,
            );
            if (step) {
                return step;
            }
        }
        // No usable block structure (block splits/merges, wholesale rewrites):
        // one replace over the whole differing region.
        return replaceStepForRegion(toDoc, region);
    }

    // Walk the gaps between matched anchors (including the leading and
    // trailing gaps) and emit a step for the first gap that differs.
    const gaps: { f0: number; f1: number; t0: number; t1: number }[] = [];
    let f = 0;
    let t = 0;
    for (const pair of pairs) {
        gaps.push({ f0: f, f1: pair.f, t0: t, t1: pair.t });
        f = pair.f + 1;
        t = pair.t + 1;
    }
    gaps.push({ f0: f, f1: fromBlocks.length, t0: t, t1: toBlocks.length });

    for (const gap of gaps) {
        const m = gap.f1 - gap.f0;
        const n = gap.t1 - gap.t0;
        if (m === 0 && n === 0) {
            continue;
        }
        const fPos0 = fromOffsets[fromSpan.first + gap.f0];
        const fPos1 = fromOffsets[fromSpan.first + gap.f1];
        const tPos0 = toOffsets[toSpan.first + gap.t0];
        const tPos1 = toOffsets[toSpan.first + gap.t1];

        if (m === 0) {
            const inserted = Fragment.from(toBlocks.slice(gap.t0, gap.t1));
            return new ReplaceStep(fPos0, fPos0, new Slice(inserted, 0, 0));
        }
        if (n === 0) {
            return new ReplaceStep(fPos0, fPos1, Slice.empty);
        }
        if (m === n) {
            const step = firstPairStep(
                fromDoc,
                toDoc,
                fromOffsets,
                toOffsets,
                fromSpan.first,
                toSpan.first,
                fromBlocks,
                toBlocks,
                gap.f0,
                gap.t0,
                m,
            );
            if (step) {
                return step;
            }
            continue;
        }
        const step = trimmedReplaceStep(
            fromDoc,
            toDoc,
            fPos0,
            fPos1,
            tPos0,
            tPos1,
        );
        if (step) {
            return step;
        }
    }

    // The docs differ, so some gap must have produced a step.
    throw new Error("Block alignment found no differing run");
}

/**
 * Trimmed replace for the first positionally-paired block pair that differs,
 * or null when every pair is equal.
 */
function firstPairStep(
    fromDoc: Node,
    toDoc: Node,
    fromOffsets: number[],
    toOffsets: number[],
    fromFirst: number,
    toFirst: number,
    fromBlocks: Node[],
    toBlocks: Node[],
    f0: number,
    t0: number,
    count: number,
): Step | null {
    for (let k = 0; k < count; k++) {
        const step = trimmedReplaceStep(
            fromDoc,
            toDoc,
            fromOffsets[fromFirst + f0 + k],
            fromOffsets[fromFirst + f0 + k] + fromBlocks[f0 + k].nodeSize,
            toOffsets[toFirst + t0 + k],
            toOffsets[toFirst + t0 + k] + toBlocks[t0 + k].nodeSize,
        );
        if (step) {
            return step;
        }
    }
    return null;
}
