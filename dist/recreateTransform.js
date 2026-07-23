"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecreateTransform = void 0;
exports.recreateTransform = recreateTransform;
const prosemirror_transform_1 = require("prosemirror-transform");
const diff_1 = require("diff");
const getReplaceStep_1 = require("./getReplaceStep");
const simplifyTransform_1 = require("./simplifyTransform");
const removeMarks_1 = require("./removeMarks");
const MAX_ITERATIONS = 1000;
class RecreateTransform {
    constructor(fromDoc, toDoc, options = {}) {
        const o = {
            complexSteps: true,
            wordDiffs: false,
            simplifyDiff: true,
            ...options,
        };
        this.fromDoc = fromDoc;
        this.toDoc = toDoc;
        this.complexSteps = o.complexSteps;
        this.wordDiffs = o.wordDiffs;
        this.simplifyDiff = o.simplifyDiff;
        this.schema = fromDoc.type.schema;
        this.tr = new prosemirror_transform_1.Transform(fromDoc);
    }
    init() {
        if (this.complexSteps) {
            this.recreateStructuralSteps();
            this.recreateChangeMarkSteps();
        }
        else {
            this.recreateAllSteps();
        }
        if (this.simplifyDiff) {
            this.tr = (0, simplifyTransform_1.simplifyTransform)(this.tr) || this.tr;
        }
        return this.tr;
    }
    /**
     * Iteratively find and apply structural changes (marks stripped).
     */
    recreateStructuralSteps() {
        const fromDocNoMarks = (0, removeMarks_1.removeMarks)(this.fromDoc);
        const toDocNoMarks = (0, removeMarks_1.removeMarks)(this.toDoc);
        let currentDoc = fromDocNoMarks;
        let iterations = 0;
        while (iterations < MAX_ITERATIONS) {
            const start = toDocNoMarks.content.findDiffStart(currentDoc.content);
            if (start === null)
                break;
            const diffEnd = toDocNoMarks.content.findDiffEnd(currentDoc.content);
            if (!diffEnd)
                break;
            const { a: endTo, b: endFrom } = diffEnd;
            const diff = this.classifyDiff(currentDoc, toDocNoMarks, start, endFrom, endTo);
            this.applyDiff(diff, currentDoc, toDocNoMarks);
            currentDoc = (0, removeMarks_1.removeMarks)(this.tr.doc);
            iterations++;
        }
        if (iterations >= MAX_ITERATIONS) {
            throw new Error("Max iterations reached in recreateStructuralSteps");
        }
    }
    /**
     * Simple mode: only ReplaceSteps.
     */
    recreateAllSteps() {
        let currentDoc = this.fromDoc;
        let iterations = 0;
        while (iterations < MAX_ITERATIONS) {
            const step = (0, getReplaceStep_1.getReplaceStep)(currentDoc, this.toDoc);
            if (!step)
                break;
            const result = this.tr.maybeStep(step);
            if (result.failed) {
                throw new Error(`ReplaceStep failed: ${result.failed}`);
            }
            currentDoc = this.tr.doc;
            iterations++;
        }
        if (iterations >= MAX_ITERATIONS) {
            throw new Error("Max iterations reached in recreateAllSteps");
        }
    }
    /**
     * Classify the nature of a diff.
     */
    classifyDiff(fromDoc, toDoc, start, endFrom, endTo) {
        const fromNode = fromDoc.nodeAt(start);
        const toNode = toDoc.nodeAt(start);
        // Calculate text node start position
        let textNodeStart = start;
        if (fromNode === null || fromNode === void 0 ? void 0 : fromNode.isText) {
            const $pos = fromDoc.resolve(start);
            textNodeStart = start - $pos.textOffset;
        }
        // Text change: both are text nodes with same markup AND their parent blocks are equivalent
        // This ensures we only do character-level diffs within the same logical block
        if ((fromNode === null || fromNode === void 0 ? void 0 : fromNode.isText) &&
            (toNode === null || toNode === void 0 ? void 0 : toNode.isText) &&
            fromNode.sameMarkup(toNode)) {
            const $fromPos = fromDoc.resolve(start);
            const $toPos = toDoc.resolve(start);
            // Check if parent blocks have same structure (excluding the text content we're diffing)
            // If parents are different types or at different depths, it's structural
            if ($fromPos.depth === $toPos.depth &&
                $fromPos.parent.type === $toPos.parent.type &&
                $fromPos.parent.sameMarkup($toPos.parent)) {
                // Additional check: if texts are completely different (no shared prefix/suffix),
                // treat as structural for cleaner diffs
                const fromText = fromNode.text || "";
                const toText = toNode.text || "";
                // Find common prefix length
                let commonPrefix = 0;
                while (commonPrefix < fromText.length &&
                    commonPrefix < toText.length &&
                    fromText[commonPrefix] === toText[commonPrefix]) {
                    commonPrefix++;
                }
                // If texts share some content, it's a true text diff
                if (commonPrefix > 0 || fromText.length === 0 || toText.length === 0) {
                    return {
                        type: "text",
                        start,
                        endFrom,
                        endTo,
                        fromNode,
                        toNode,
                        textNodeStart,
                    };
                }
            }
        }
        // Markup change: non-text nodes, same content, different markup
        if (fromNode &&
            toNode &&
            !fromNode.isText &&
            !toNode.isText &&
            fromNode.content.eq(toNode.content) &&
            !fromNode.sameMarkup(toNode)) {
            return {
                type: "markup",
                start,
                endFrom,
                endTo,
                fromNode,
                toNode,
                textNodeStart,
            };
        }
        // Everything else is structural
        return {
            type: "structural",
            start,
            endFrom,
            endTo,
            fromNode,
            toNode,
            textNodeStart,
        };
    }
    /**
     * Apply diff based on type.
     */
    applyDiff(diff, fromDoc, toDoc) {
        switch (diff.type) {
            case "text":
                this.applyTextDiff(diff);
                break;
            case "markup":
                this.applyMarkupDiff(diff);
                break;
            case "structural":
                this.applyStructuralDiff(fromDoc, toDoc);
                break;
        }
    }
    /**
     * Apply fine-grained text diff.
     */
    applyTextDiff(diff) {
        const fromText = diff.fromNode.text;
        const toText = diff.toNode.text;
        if (fromText === undefined || toText === undefined) {
            // classifyDiff only produces a text diff for text nodes, which
            // always carry a string.
            throw new Error(`Non-text node in text diff at position ${diff.start}`);
        }
        const textDiffs = this.wordDiffs
            ? (0, diff_1.diffWordsWithSpace)(fromText, toText)
            : (0, diff_1.diffChars)(fromText, toText);
        let offset = diff.textNodeStart;
        const marks = this.tr.doc.resolve(offset + 1).marks();
        for (let i = 0; i < textDiffs.length; i++) {
            const textDiff = textDiffs[i];
            if (textDiff.added) {
                const textNode = this.schema.text(textDiff.value, marks);
                if (i + 1 < textDiffs.length && textDiffs[i + 1].removed) {
                    const nextDiff = textDiffs[++i];
                    this.tr.replaceWith(offset, offset + nextDiff.value.length, textNode);
                }
                else {
                    this.tr.insert(offset, textNode);
                }
                offset += textDiff.value.length;
            }
            else if (textDiff.removed) {
                if (i + 1 < textDiffs.length && textDiffs[i + 1].added) {
                    const nextDiff = textDiffs[++i];
                    const textNode = this.schema.text(nextDiff.value, marks);
                    this.tr.replaceWith(offset, offset + textDiff.value.length, textNode);
                    offset += nextDiff.value.length;
                }
                else {
                    this.tr.delete(offset, offset + textDiff.value.length);
                }
            }
            else {
                offset += textDiff.value.length;
            }
        }
    }
    /**
     * Apply markup change (node type or attributes).
     */
    applyMarkupDiff(diff) {
        const nodeType = diff.fromNode.type === diff.toNode.type ? null : diff.toNode.type;
        this.tr.setNodeMarkup(diff.start, nodeType, diff.toNode.attrs, diff.toNode.marks);
    }
    /**
     * Apply structural change using ReplaceStep.
     */
    applyStructuralDiff(fromDoc, toDoc) {
        const step = (0, getReplaceStep_1.getReplaceStep)(fromDoc, toDoc);
        if (step) {
            const result = this.tr.maybeStep(step);
            if (result.failed) {
                throw new Error(`ReplaceStep failed: ${result.failed}`);
            }
        }
    }
    /**
     * Reconcile marks after structural changes are complete.
     */
    recreateChangeMarkSteps() {
        this.toDoc.descendants((tNode, tPos) => {
            if (!tNode.isInline) {
                return true;
            }
            this.tr.doc.nodesBetween(tPos, tPos + tNode.nodeSize, (fNode, fPos) => {
                if (!fNode.isInline) {
                    return true;
                }
                const from = Math.max(tPos, fPos);
                const to = Math.min(tPos + tNode.nodeSize, fPos + fNode.nodeSize);
                fNode.marks.forEach((nodeMark) => {
                    if (!nodeMark.isInSet(tNode.marks)) {
                        this.tr.removeMark(from, to, nodeMark);
                    }
                });
                tNode.marks.forEach((nodeMark) => {
                    if (!nodeMark.isInSet(fNode.marks)) {
                        this.tr.addMark(from, to, nodeMark);
                    }
                });
            });
        });
    }
}
exports.RecreateTransform = RecreateTransform;
function recreateTransform(fromDoc, toDoc, options = {}) {
    const recreator = new RecreateTransform(fromDoc, toDoc, options);
    return recreator.init();
}
//# sourceMappingURL=recreateTransform.js.map