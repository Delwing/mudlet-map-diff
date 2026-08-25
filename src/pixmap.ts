import { createCanvas, loadImage } from "canvas";
import { MapDiff } from "./diff.js";

/**
 * A label's `pixMap` is the pre-rendered PNG Mudlet stores alongside the label.
 * Mudlet never encodes it itself — it hands the QPixmap to QDataStream and Qt's
 * PNG writer emits it — so the bytes carry whatever compression level, IDAT
 * chunk size and ancillary chunks that Qt/libpng build happened to use. Two
 * Mudlet versions therefore write byte-different PNGs for a label nobody
 * touched (real example: `7801`/4096-byte IDATs before, `789c`/8192-byte IDATs
 * plus a pHYs chunk after — same 500x83 RGBA image).
 *
 * Comparing the bytes reports those re-encodes as changes and renders an SVG
 * pair for each. Comparing the decoded pixels reports only the labels that
 * actually look different.
 */

interface DecodedImage {
    width: number;
    height: number;
    data: Uint8ClampedArray;
}

async function decode(png: Buffer): Promise<DecodedImage> {
    const image = await loadImage(png);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    return {
        width: image.width,
        height: image.height,
        data: ctx.getImageData(0, 0, image.width, image.height).data,
    };
}

function samePixels(a: DecodedImage, b: DecodedImage): boolean {
    if (a.width !== b.width || a.height !== b.height) return false;
    if (a.data.length !== b.data.length) return false;
    for (let i = 0; i < a.data.length; i++) {
        if (a.data[i] !== b.data[i]) return false;
    }
    return true;
}

/**
 * Whether two pixMap values decode to the same image. Anything that isn't a
 * decodable pair of buffers counts as different — a change we can't verify is
 * reported rather than swallowed.
 */
export async function pixMapsLookIdentical(from: unknown, to: unknown): Promise<boolean> {
    if (!Buffer.isBuffer(from) || !Buffer.isBuffer(to)) return false;
    try {
        const [a, b] = await Promise.all([decode(from), decode(to)]);
        return samePixels(a, b);
    } catch {
        // Not decodable as an image: leave the change in the report.
        return false;
    }
}

/**
 * Drop `pixMap` entries whose two PNGs decode to the same pixels, and then any
 * label whose only reported change that was. Mutates `diff` and returns how
 * many pixMap entries were dropped.
 */
export async function prunePixelIdenticalPixMaps(diff: MapDiff): Promise<number> {
    const candidates = Object.entries(diff.labels.updated).filter(([, props]) => props.pixMap);

    const verdicts = await Promise.all(
        candidates.map(([, props]) => pixMapsLookIdentical(props.pixMap.from, props.pixMap.to))
    );

    let pruned = 0;
    candidates.forEach(([key, props], index) => {
        if (!verdicts[index]) return;
        delete props.pixMap;
        pruned++;
        if (Object.keys(props).length === 0) {
            delete diff.labels.updated[key];
        }
    });
    return pruned;
}
