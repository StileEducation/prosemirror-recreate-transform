"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findReplaceRegion = findReplaceRegion;
exports.replaceStepForRegion = replaceStepForRegion;
exports.trimmedReplaceStep = trimmedReplaceStep;
exports.getReplaceStep = getReplaceStep;
const prosemirror_transform_1 = require("prosemirror-transform");
/**
 * Calculate a score for a potential replacement boundary.
 * Higher scores indicate better boundaries.
 *
 * `fromStart`/`toStart` are absolute positions in their respective docs. They
 * coincide for whole-document diffs but differ when diffing a sub-region whose
 * blocks sit at different positions in each doc.
 */
function calculateBoundaryScore(fromDoc, toDoc, fromStart, toStart, endA, endB) {
    let score = 0;
    // Factor 1: Prefer shallower boundaries (lower depth = higher score)
    const fromDepth = fromDoc.resolve(fromStart).depth;
    const toDepth = toDoc.resolve(endA).depth;
    score -= (fromDepth + toDepth) * 2;
    // Factor 2: Content identity - strong bonus for identical nodes at boundary
    const fromNode = fromDoc.nodeAt(fromStart);
    const toNode = toDoc.nodeAt(toStart);
    if (fromNode && toNode && fromNode.eq(toNode)) {
        score += 20;
    }
    else if (fromNode && toNode && fromNode.sameMarkup(toNode)) {
        // Factor 3: Markup similarity - smaller bonus for same type/attrs
        score += 5;
    }
    // Factor 4: Node type preservation at boundary edges
    if (fromStart > 0 && toStart > 0) {
        const fromBefore = fromDoc.resolve(fromStart).nodeBefore;
        const toBefore = toDoc.resolve(toStart).nodeBefore;
        if (fromBefore && toBefore && fromBefore.type === toBefore.type) {
            score += 3;
        }
    }
    // Factor 5: Prefer smaller replacements (penalty for larger slices)
    const replacementSize = Math.abs(endB - fromStart) + Math.abs(endA - toStart);
    score -= replacementSize * 0.1;
    return score;
}
/**
 * Diff fromDoc[f0, f1) against toDoc[t0, t1) and return the trimmed replace
 * region, or null when the regions are identical. The content outside the
 * given bounds is ignored, so callers must only pass regions whose exteriors
 * are already equal.
 */
function findReplaceRegion(fromDoc, toDoc, f0, f1, t0, t1) {
    const fromFrag = fromDoc.content.cut(f0, f1);
    const toFrag = toDoc.content.cut(t0, t1);
    const start = toFrag.findDiffStart(fromFrag);
    if (start === null) {
        return null;
    }
    const diffEnd = toFrag.findDiffEnd(fromFrag);
    if (diffEnd === null) {
        // findDiffStart found a difference, so findDiffEnd must find one too.
        throw new Error("findDiffEnd returned null for differing fragments");
    }
    let fromStart = f0 + start;
    let toStart = t0 + start;
    let endA = t0 + diffEnd.a;
    let endB = f0 + diffEnd.b;
    const overlap = start - Math.min(diffEnd.a, diffEnd.b);
    if (overlap > 0) {
        // Calculate scores for both boundary options
        const scoreStart = calculateBoundaryScore(fromDoc, toDoc, fromStart - overlap, toStart - overlap, endA, endB);
        const scoreEnd = calculateBoundaryScore(fromDoc, toDoc, fromStart, toStart, endA + overlap, endB + overlap);
        if (scoreStart > scoreEnd) {
            fromStart -= overlap;
            toStart -= overlap;
        }
        else {
            endA += overlap;
            endB += overlap;
        }
    }
    return { fromStart, toStart, endA, endB };
}
/** Build the ReplaceStep described by a ReplaceRegion. */
function replaceStepForRegion(toDoc, region) {
    return new prosemirror_transform_1.ReplaceStep(region.fromStart, region.endB, toDoc.slice(region.toStart, region.endA));
}
/**
 * A single trimmed ReplaceStep turning fromDoc[f0, f1) into toDoc[t0, t1),
 * or null when the regions are already identical.
 */
function trimmedReplaceStep(fromDoc, toDoc, f0, f1, t0, t1) {
    const region = findReplaceRegion(fromDoc, toDoc, f0, f1, t0, t1);
    return region === null ? null : replaceStepForRegion(toDoc, region);
}
function getReplaceStep(fromDoc, toDoc) {
    const step = trimmedReplaceStep(fromDoc, toDoc, 0, fromDoc.content.size, 0, toDoc.content.size);
    return step === null ? false : step;
}
//# sourceMappingURL=getReplaceStep.js.map