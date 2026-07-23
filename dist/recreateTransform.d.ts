import { Transform } from "prosemirror-transform";
import type { Node, Schema } from "prosemirror-model";
export interface Options {
    complexSteps?: boolean;
    wordDiffs?: boolean;
    simplifyDiff?: boolean;
}
interface DiffResultBase {
    start: number;
    endFrom: number;
    endTo: number;
    textNodeStart: number;
}
/** Text and markup diffs are only classified as such when both nodes exist. */
interface NodeDiffResult extends DiffResultBase {
    type: "text" | "markup";
    fromNode: Node;
    toNode: Node;
}
interface StructuralDiffResult extends DiffResultBase {
    type: "structural";
    fromNode: Node | null;
    toNode: Node | null;
}
type DiffResult = NodeDiffResult | StructuralDiffResult;
export declare class RecreateTransform {
    fromDoc: Node;
    toDoc: Node;
    complexSteps: boolean;
    wordDiffs: boolean;
    simplifyDiff: boolean;
    schema: Schema;
    tr: Transform;
    constructor(fromDoc: Node, toDoc: Node, options?: Options);
    init(): Transform;
    /**
     * Iteratively find and apply structural changes (marks stripped).
     */
    recreateStructuralSteps(): void;
    /**
     * Simple mode: only ReplaceSteps.
     */
    recreateAllSteps(): void;
    /**
     * Classify the nature of a diff.
     */
    classifyDiff(fromDoc: Node, toDoc: Node, start: number, endFrom: number, endTo: number): DiffResult;
    /**
     * Apply diff based on type.
     */
    applyDiff(diff: DiffResult, fromDoc: Node, toDoc: Node): void;
    /**
     * Apply fine-grained text diff.
     */
    applyTextDiff(diff: NodeDiffResult): void;
    /**
     * Apply markup change (node type or attributes).
     */
    applyMarkupDiff(diff: NodeDiffResult): void;
    /**
     * Apply structural change using ReplaceStep.
     */
    applyStructuralDiff(fromDoc: Node, toDoc: Node): void;
    /**
     * Reconcile marks after structural changes are complete.
     */
    recreateChangeMarkSteps(): void;
}
export declare function recreateTransform(fromDoc: Node, toDoc: Node, options?: Options): Transform;
export {};
