export const PROJECT_COVER_ASPECT = 16 / 10;
export const PROJECT_COVER_MAX_BYTES = 5 * 1024 * 1024;
export const PROJECT_COVER_TARGET_BYTES = 1024 * 1024;
export const PROJECT_COVER_MAX_WIDTH = 1600;
export const PROJECT_COVER_MAX_HEIGHT = 1000;

export type ProjectCoverPosition = {
  /** Normalized crop centre: -1 is the far left/top and 1 is far right/bottom. */
  x: number;
  y: number;
};

export type ProjectCoverCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CroppedProjectCover = {
  file: File;
  width: number;
  height: number;
  quality: number;
};

const MIN_OUTPUT_WIDTH = 640;
const OUTPUT_WIDTH_STEP = 16;
const JPEG_QUALITIES = [0.82, 0.76, 0.7, 0.64, 0.58];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function clampProjectCoverPosition(value: number): number {
  return clamp(value, -1, 1);
}

/**
 * Convert the editor's zoom and normalized centre position into source-image
 * pixels. The returned rectangle always has a 16:10 aspect ratio and remains
 * fully inside the source image.
 */
export function getProjectCoverCropRect(
  sourceWidth: number,
  sourceHeight: number,
  zoom: number,
  position: ProjectCoverPosition
): ProjectCoverCropRect {
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  ) {
    throw new Error("无法读取封面图片尺寸。");
  }

  const safeZoom = clamp(zoom, 1, 3);
  const sourceAspect = sourceWidth / sourceHeight;
  const baseWidth = sourceAspect >= PROJECT_COVER_ASPECT
    ? sourceHeight * PROJECT_COVER_ASPECT
    : sourceWidth;
  const baseHeight = baseWidth / PROJECT_COVER_ASPECT;
  const width = baseWidth / safeZoom;
  const height = baseHeight / safeZoom;
  const travelX = Math.max(0, sourceWidth - width);
  const travelY = Math.max(0, sourceHeight - height);
  const normalizedX = (clampProjectCoverPosition(position.x) + 1) / 2;
  const normalizedY = (clampProjectCoverPosition(position.y) + 1) / 2;

  return {
    x: travelX * normalizedX,
    y: travelY * normalizedY,
    width,
    height,
  };
}

function outputSizeForCrop(cropWidth: number): { width: number; height: number } {
  const boundedWidth = Math.min(
    PROJECT_COVER_MAX_WIDTH,
    PROJECT_COVER_MAX_HEIGHT * PROJECT_COVER_ASPECT,
    Math.floor(cropWidth)
  );
  const width = Math.max(
    OUTPUT_WIDTH_STEP,
    Math.floor(boundedWidth / OUTPUT_WIDTH_STEP) * OUTPUT_WIDTH_STEP
  );
  return { width, height: (width / 16) * 10 };
}

function nextOutputWidth(width: number): number {
  return Math.floor((width * 0.8) / OUTPUT_WIDTH_STEP) * OUTPUT_WIDTH_STEP;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (!blob || blob.type !== "image/jpeg") {
          reject(new Error("当前浏览器无法生成 JPEG 封面，请更换浏览器后重试。"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality
    );
  });
}

function renderCrop(
  image: HTMLImageElement,
  crop: ProjectCoverCropRect,
  width: number,
  height: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法处理图片，请更换浏览器后重试。");

  // JPEG has no alpha channel. Painting a white base prevents transparent PNG
  // pixels from becoming black during conversion.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    width,
    height
  );
  return canvas;
}

function croppedFileName(originalName: string): string {
  const stem = originalName.replace(/\.[^.]+$/, "").trim() || "project-cover";
  return `${stem}-cropped.jpg`;
}

/**
 * Render and compress the selected crop. We first preserve the largest useful
 * resolution and lower JPEG quality gradually; only unusually detailed/noisy
 * images are downscaled further to reach the approximately 1 MiB target.
 */
export async function createCroppedProjectCover(
  original: File,
  image: HTMLImageElement,
  zoom: number,
  position: ProjectCoverPosition
): Promise<CroppedProjectCover> {
  const crop = getProjectCoverCropRect(
    image.naturalWidth,
    image.naturalHeight,
    zoom,
    position
  );
  let { width, height } = outputSizeForCrop(crop.width);
  let smallest: { blob: Blob; width: number; height: number; quality: number } | null = null;

  while (true) {
    const canvas = renderCrop(image, crop, width, height);
    for (const quality of JPEG_QUALITIES) {
      const blob = await canvasToJpeg(canvas, quality);
      if (!smallest || blob.size < smallest.blob.size) {
        smallest = { blob, width, height, quality };
      }
      if (blob.size <= PROJECT_COVER_TARGET_BYTES) {
        return {
          file: new File([blob], croppedFileName(original.name), {
            type: "image/jpeg",
            lastModified: Date.now(),
          }),
          width,
          height,
          quality,
        };
      }
    }

    if (width <= MIN_OUTPUT_WIDTH) break;
    const candidateWidth = Math.max(MIN_OUTPUT_WIDTH, nextOutputWidth(width));
    if (candidateWidth === width) break;
    width = candidateWidth;
    height = (width / 16) * 10;
  }

  if (!smallest || smallest.blob.size > PROJECT_COVER_MAX_BYTES) {
    throw new Error("封面压缩后仍然过大，请换一张图片后重试。");
  }

  return {
    file: new File([smallest.blob], croppedFileName(original.name), {
      type: "image/jpeg",
      lastModified: Date.now(),
    }),
    width: smallest.width,
    height: smallest.height,
    quality: smallest.quality,
  };
}
