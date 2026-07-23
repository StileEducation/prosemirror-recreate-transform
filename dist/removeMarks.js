"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeMarks = removeMarks;
const prosemirror_transform_1 = require("prosemirror-transform");
function removeMarks(doc) {
    const tr = new prosemirror_transform_1.Transform(doc);
    tr.removeMark(0, doc.nodeSize - 2);
    return tr.doc;
}
//# sourceMappingURL=removeMarks.js.map