import { optimize } from "svgo";

const TARGET_HEIGHT = 600;
const SEPARATOR = 2;

function parseViewBox(img: string): [number, number, number, number] | null {
    const match = img.match(/viewBox="([^"]+)"/);
    if (!match) return null;
    const parts = match[1].split(/[\s,]+/).map(Number);
    return [parts[0], parts[1], parts[2], parts[3]];
}

function extractContent(img: string): string {
    let content = img.replace(/<svg[^>]*>/, "").replace(/<\/svg>$/, "");
    content = content.replace(/^<rect[^>]*fill="transparent"[^>]*\/>/, "");
    return content;
}

function placeAt(img: string, x: number, targetH: number, id: string): { svg: string; width: number } {
    const vb = parseViewBox(img);
    if (!vb) {
        return { svg: `<svg x="${x}" y="0" width="${targetH}" height="${targetH}">${img}</svg>`, width: targetH };
    }
    const [vbX, vbY, vbW, vbH] = vb;
    const scale = targetH / vbH;
    const paneW = Math.round(vbW * scale);

    return {
        svg: `<defs>
        <clipPath id="clip-${id}">
            <rect x="${x}" y="0" width="${paneW}" height="${targetH}" />
        </clipPath>
    </defs>
    <g clip-path="url(#clip-${id})">
        <g transform="translate(${x}, 0) scale(${scale}) translate(${-vbX}, ${-vbY})">
            ${extractContent(img)}
        </g>
    </g>`,
        width: paneW,
    };
}

export function singleSvg(img: string): string {
    const { svg, width } = placeAt(img, 0, TARGET_HEIGHT, "single");
    return optimize(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${TARGET_HEIGHT}" style="background-color: black;">
    ${svg}
    </svg>`).data;
}

export function doubleSvg(img1: string, img2: string): string {
    const { svg: svg1, width: w1 } = placeAt(img1, 0, TARGET_HEIGHT, "v1");
    const { svg: svg2, width: w2 } = placeAt(img2, w1 + SEPARATOR, TARGET_HEIGHT, "v2");
    const totalW = w1 + SEPARATOR + w2;
    return optimize(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${totalW} ${TARGET_HEIGHT}" style="background-color: black;">
    ${svg1}
    ${svg2}
    <rect width="${SEPARATOR}" height="${TARGET_HEIGHT}" x="${w1}" y="0" fill="red" />
    </svg>`).data;
}
