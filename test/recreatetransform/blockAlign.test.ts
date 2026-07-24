import { doc, p } from "prosemirror-test-builder";
import { strict as assert } from "assert";
import { recreateTransform, Options } from "../../src/recreateTransform";

/**
 * Position mapping across the recreated transform is the point of block
 * alignment: unchanged blocks must keep their identity so positions inside
 * them survive, instead of being swallowed by one giant ReplaceStep spanning
 * first-to-last difference.
 */
function mapRange(
    startDoc,
    endDoc,
    from: number,
    to: number,
    options: Options = {},
) {
    const tr = recreateTransform(startDoc, endDoc, options);
    assert.ok(tr.doc.eq(endDoc), "transform must produce the target doc");
    const mappedFrom = tr.mapping.mapResult(from, 1);
    const mappedTo = tr.mapping.mapResult(to, -1);
    return {
        text: tr.doc.textBetween(
            Math.min(mappedFrom.pos, mappedTo.pos),
            mappedTo.pos,
            "\n",
        ),
        collapsed: mappedTo.pos <= mappedFrom.pos,
    };
}

const CONFIGS: Options[] = [
    { complexSteps: true, wordDiffs: true },
    { complexSteps: true, wordDiffs: false },
    { complexSteps: false, wordDiffs: true },
    { complexSteps: false, wordDiffs: false },
];

describe("recreateTransform - block alignment", () => {
    it("preserves positions in a paragraph that moved (reorder)", () => {
        const start = doc(
            p("The mitochondria is the powerhouse of the cell."),
            p("Plants use photosynthesis to convert sunlight into energy."),
            p("This process releases oxygen as a byproduct."),
        );
        const end = doc(
            p("The mitochondria is the powerhouse of the cell."),
            p("This process releases oxygen as a byproduct."),
            p("Plants use photosynthesis to convert sunlight into energy."),
        );
        // "photosynthesis to convert sunlight" inside paragraph 2 of `start`.
        const from = 61;
        const to = 95;
        for (const options of CONFIGS) {
            const mapped = mapRange(start, end, from, to, options);
            assert.equal(mapped.text, "photosynthesis to convert sunlight");
        }
    });

    it("preserves positions in an untouched paragraph when its neighbours are rewritten", () => {
        const start = doc(
            p("The mitochondria is the powerhouse of the cell."),
            p("Plants use photosynthesis to convert sunlight into energy."),
            p("This process releases oxygen as a byproduct."),
        );
        const end = doc(
            p("Cells contain many organelles with different jobs."),
            p("Plants use photosynthesis to convert sunlight into energy."),
            p("Oxygen comes out at the end."),
        );
        const from = 61;
        const to = 95;
        for (const options of CONFIGS) {
            const mapped = mapRange(start, end, from, to, options);
            assert.equal(mapped.text, "photosynthesis to convert sunlight");
        }
    });

    it("keeps per-paragraph replaces when every paragraph is edited in place", () => {
        const start = doc(
            p("The mitochondria is the powerhouse of the cell."),
            p("Plants use photosynthesis to convert sunlight into energy."),
            p("This process releases oxygen as a byproduct."),
        );
        const end = doc(
            p("The mitochondria are the powerhouses of the cell."),
            p("Plants use photosynthesis to convert sunlight into chemical energy."),
            p("This process also releases oxygen as a byproduct."),
        );
        const from = 61;
        const to = 95;
        for (const options of CONFIGS) {
            const mapped = mapRange(start, end, from, to, options);
            assert.equal(mapped.text, "photosynthesis to convert sunlight");
        }
    });

    it("emits a whole-block insert for a paragraph added between an edit and unchanged blocks", () => {
        const start = doc(
            p("First paragraph."),
            p("Middle paragraph."),
            p("Last paragraph."),
        );
        const end = doc(
            p("First paragraph!"),
            p("Middle paragraph."),
            p("A brand new paragraph."),
            p("Last paragraph."),
        );
        // "Middle" and "Last" inside the unchanged paragraphs of `start`.
        for (const [from, to, expected] of [
            [19, 25, "Middle"],
            [38, 42, "Last"],
        ] as const) {
            for (const options of CONFIGS) {
                const mapped = mapRange(start, end, from, to, options);
                assert.equal(mapped.text, expected);
            }
        }
    });
});
