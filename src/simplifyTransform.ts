import { Transform, ReplaceStep, Step } from "prosemirror-transform";
import { getReplaceStep } from "./getReplaceStep";

// join adjacent ReplaceSteps
export function simplifyTransform(tr: Transform) {
    if (!tr.steps.length) {
        return undefined;
    }

    const firstDoc = tr.docs[0];
    if (firstDoc === undefined) {
        return undefined;
    }
    const newTr = new Transform(firstDoc);
    const oldSteps = tr.steps.slice();

    while (oldSteps.length) {
        // The loop condition guarantees an element.
        let step = oldSteps.shift() as Step;
        let nextStep = oldSteps[0];
        while (nextStep !== undefined && step.merge(nextStep)) {
            const addedStep = oldSteps.shift() as Step;
            if (
                step instanceof ReplaceStep &&
                addedStep instanceof ReplaceStep
            ) {
                const afterFirst = step.apply(newTr.doc).doc;
                const afterBoth =
                    afterFirst === null ? null : addedStep.apply(afterFirst).doc;
                if (afterBoth === null) {
                    throw new Error(
                        "Failed to apply mergeable steps while simplifying transform",
                    );
                }
                step = getReplaceStep(newTr.doc, afterBoth) as Step;
            } else {
                step = step.merge(addedStep) as Step;
            }
            nextStep = oldSteps[0];
        }
        newTr.step(step);
    }
    return newTr;
}
