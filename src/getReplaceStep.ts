import { ReplaceStep, Step } from "prosemirror-transform";
import { Node } from "prosemirror-model";

/**
 * Calculate a score for a potential replacement boundary.
 * Higher scores indicate better boundaries.
 */
function calculateBoundaryScore(
    fromDoc: Node,
    toDoc: Node,
    start: number,
    endA: number,
    endB: number,
): number {
    let score = 0;

    // Factor 1: Prefer shallower boundaries (lower depth = higher score)
    const fromDepth = fromDoc.resolve(start).depth;
    const toDepth = toDoc.resolve(endA).depth;
    score -= (fromDepth + toDepth) * 2;

    // Factor 2: Content identity - strong bonus for identical nodes at boundary
    const fromNode = fromDoc.nodeAt(start);
    const toNode = toDoc.nodeAt(start);
    if (fromNode && toNode && fromNode.eq(toNode)) {
        score += 20;
    } else if (fromNode && toNode && fromNode.sameMarkup(toNode)) {
        // Factor 3: Markup similarity - smaller bonus for same type/attrs
        score += 5;
    }

    // Factor 4: Node type preservation at boundary edges
    if (start > 0) {
        const fromBefore = fromDoc.resolve(start).nodeBefore;
        const toBefore = toDoc.resolve(start).nodeBefore;
        if (fromBefore && toBefore && fromBefore.type === toBefore.type) {
            score += 3;
        }
    }

    // Factor 5: Prefer smaller replacements (penalty for larger slices)
    const replacementSize = Math.abs(endB - start) + Math.abs(endA - start);
    score -= replacementSize * 0.1;

    return score;
}

export function getReplaceStep(fromDoc: Node, toDoc: Node): Step | false {
    const start$ = toDoc.content.findDiffStart(fromDoc.content);
    if (start$ === null) {
        return false;
    }
    let start = start$;

    // @ts-ignore property access to content
    let { a: endA, b: endB } = toDoc.content.findDiffEnd(fromDoc.content);
    const overlap = start - Math.min(endA, endB);

    if (overlap > 0) {
        // Calculate scores for both boundary options
        const scoreStart = calculateBoundaryScore(
            fromDoc,
            toDoc,
            start - overlap,
            endA,
            endB,
        );
        const scoreEnd = calculateBoundaryScore(
            fromDoc,
            toDoc,
            start,
            endA + overlap,
            endB + overlap,
        );

        if (scoreStart > scoreEnd) {
            start -= overlap;
        } else {
            endA += overlap;
            endB += overlap;
        }
    }

    return new ReplaceStep(start, endB, toDoc.slice(start, endA));
}
