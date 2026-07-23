"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.simplifyTransform = simplifyTransform;
const prosemirror_transform_1 = require("prosemirror-transform");
const getReplaceStep_1 = require("./getReplaceStep");
// join adjacent ReplaceSteps
function simplifyTransform(tr) {
    if (!tr.steps.length) {
        return undefined;
    }
    const firstDoc = tr.docs[0];
    if (firstDoc === undefined) {
        return undefined;
    }
    const newTr = new prosemirror_transform_1.Transform(firstDoc);
    const oldSteps = tr.steps.slice();
    while (oldSteps.length) {
        // The loop condition guarantees an element.
        let step = oldSteps.shift();
        let nextStep = oldSteps[0];
        while (nextStep !== undefined && step.merge(nextStep)) {
            const addedStep = oldSteps.shift();
            if (step instanceof prosemirror_transform_1.ReplaceStep &&
                addedStep instanceof prosemirror_transform_1.ReplaceStep) {
                const afterFirst = step.apply(newTr.doc).doc;
                const afterBoth = afterFirst === null ? null : addedStep.apply(afterFirst).doc;
                if (afterBoth === null) {
                    throw new Error("Failed to apply mergeable steps while simplifying transform");
                }
                step = (0, getReplaceStep_1.getReplaceStep)(newTr.doc, afterBoth);
            }
            else {
                step = step.merge(addedStep);
            }
            nextStep = oldSteps[0];
        }
        newTr.step(step);
    }
    return newTr;
}
//# sourceMappingURL=simplifyTransform.js.map