// @flow

// "viewport" rectangle is { top, left, width, height }

// "scaled" means that data structure stores (0, 1) coordinates.
// for clarity reasons I decided not to store actual (0, 1) coordinates, but
// provide width and height, so user can compute ratio himself if needed

import type {T_LTWH, T_Scaled, T_VIEWPORT} from "../types";

type WIDTH_HEIGHT = { width: number, height: number };

export const viewportToScaled = (
    {left, top, width: w, height: h}: T_LTWH,
    {width: vw, height: vh}: WIDTH_HEIGHT,
    scale: number,
    rotation: number
): T_Scaled => {
    let x1 = left / scale;
    let y1 = top / scale;
    switch (rotation) {
        case -180: case 180:
            x1 = (vw - left - w) / scale;
            y1 = (vh - top - h) / scale;
            break;
        case -90:
            y1 = x1;
            x1 = (vh - top - h) / scale;
            break;
        case 90:
            x1 = y1;
            y1 = (vw - left - w) / scale;
            break;
        default:
            break;
    }
    const horizontal = Math.abs(rotation) === 90;
    const height = (horizontal ? w : h) / scale;
    const width = (horizontal ? h : w) / scale;
    const x2 = x1 + width;
    const y2 = y1 + height;
    return {x1, x2, y1, y2, width, height};
};

const pdfToViewport = (pdf, viewport, currentScaleValue: string,
                       rotation: string): T_LTWH => {
    const [x1, y1, x2, y2] = viewport.convertToViewportRectangle([
        pdf.x1,
        pdf.y1,
        pdf.x2,
        pdf.y2
    ]);

    return {
        left: x1,
        top: y1,

        width: x2 - x1,
        height: y1 - y2
    };
};

export const scaledToViewport = (
    scaled: T_Scaled,
    viewport: T_VIEWPORT,
    scale: number,
    rotation: number,
    usePdfCoordinates: boolean = false
): T_LTWH => {
    if (usePdfCoordinates) {
        return pdfToViewport(scaled, viewport, scale, rotation);
    }

    const {x1, x2, y1, y2} = scaled;
    const w = x2 - x1;
    const h = y2 - y1;
    const absRot = Math.abs(rotation);
    const {width: vWidth, height: vHeight} = viewport;
    let left = x1 * scale;
    let top = y1 * scale;
    switch (rotation) {
        case -90:
            left = top;
            top = vHeight - x2 * scale;
            break;
        case 90:
            top = left;
            left = vWidth - y2 * scale;
            break;
        case 180: case -180:
            left = vWidth - x2 * scale;
            top = vHeight - y2 * scale;
            break;
    }
    const height = (absRot === 90 ? w : h) * scale;
    const width = (absRot === 90 ? h : w) * scale;
    return {height, width, left, top};
};

export const getEmojiStyle = (boundingRect: T_LTWH, rotate: number) => ({
  left: 20,
  top: boundingRect.top + boundingRect.height / 2 - 14
});

