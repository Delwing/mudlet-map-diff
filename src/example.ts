import {createDiff} from "./index.js";

createDiff("maps/v1.dat", "maps/v2.dat", "diff").then(diff => {
    console.log("Diff created successfully");
    for (const key in diff.labels.updated) {
        const change = diff.labels.updated[key];
        for (const prop in change) {
            const { from, to } = change[prop];
            console.log(`Label ${key} property ${prop} changed from ${Buffer.isBuffer(from) ? 'Buffer' : from} to ${Buffer.isBuffer(to) ? 'Buffer' : to}`);
        }
    }
}).catch(err => {
    console.error("Error creating diff:", err);
});