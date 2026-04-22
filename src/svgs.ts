import { optimize } from "svgo";

function wrapInPane(img: string, width: number, height: number, x: number, y: number, id: string): string {
    const viewBoxMatch = img.match(/viewBox="([^"]+)"/);
    if (!viewBoxMatch) {
        return `<svg width="${width}" height="${height}" x="${x}" y="${y}">${img}</svg>`;
    }

    const viewBox = viewBoxMatch[1].split(/[\s,]+/).map(Number);
    const [vbX, vbY, vbW, vbH] = viewBox;

    const scale = Math.min(width / vbW, height / vbH) * 0.9; // 90% of pane size
    const scaledW = vbW * scale;
    const scaledH = vbH * scale;
    const offsetX = x + (width - scaledW) / 2;
    const offsetY = y + (height - scaledH) / 2;

    let content = img.replace(/<svg[^>]*>/, "").replace(/<\/svg>$/, "");
    content = content.replace(/^<rect[^>]*fill="transparent"[^>]*\/>/, "");

    return `<defs>
        <clipPath id="clip-${id}">
            <rect x="${x}" y="${y}" width="${width}" height="${height}" />
        </clipPath>
    </defs>
    <g clip-path="url(#clip-${id})">
        <g transform="translate(${offsetX}, ${offsetY}) scale(${scale}) translate(${-vbX}, ${-vbY})">
            ${content}
        </g>
    </g>`;
}

export function singleSvg(img: string): string {
    const content = wrapInPane(img, 600, 600, 0, 0, "single");
    return optimize(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0,0,600,600" style="background-color: black;">
    ${content}
    </svg>`).data;
}

export function doubleSvg(img1: string, img2: string): string {
    const content1 = wrapInPane(img1, 600, 600, 0, 0, "v1");
    const content2 = wrapInPane(img2, 600, 600, 602, 0, "v2");
    return optimize(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0,0,1202,600" style="background-color: black;">
    ${content1}
    ${content2}
    <rect width="2" height="600" x="600" y="0" fill="red" />
    </svg>`).data;
}
