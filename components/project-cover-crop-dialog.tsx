"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { Crosshair, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  clampProjectCoverPosition,
  createCroppedProjectCover,
  getProjectCoverCropRect,
  type CroppedProjectCover,
  type ProjectCoverPosition,
} from "@/lib/client/project-cover";

const PREVIEW_WIDTH = 960;
const PREVIEW_HEIGHT = 600;

type DragState = {
  pointerId: number;
  clientX: number;
  clientY: number;
  position: ProjectCoverPosition;
};

type ProjectCoverCropDialogProps = {
  open: boolean;
  file: File | null;
  returnFocusRef?: RefObject<HTMLInputElement | null>;
  onOpenChange: (open: boolean) => void;
  onConfirm: (result: CroppedProjectCover) => void;
};

function formatFileSize(size: number): string {
  return size >= 1024 * 1024
    ? `${(size / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.ceil(size / 1024))} KB`;
}

export function ProjectCoverCropDialog({
  open,
  file,
  returnFocusRef,
  onOpenChange,
  onConfirm,
}: ProjectCoverCropDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState<ProjectCoverPosition>({ x: 0, y: 0 });
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const ready = Boolean(imageRef.current && imageSize.width && imageSize.height);

  useEffect(() => {
    if (!open || !file) {
      imageRef.current = null;
      dragRef.current = null;
      setImageSize({ width: 0, height: 0 });
      setLoading(false);
      setProcessing(false);
      setError("");
      return;
    }

    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setImageSize({ width: 0, height: 0 });
    setLoading(true);
    setProcessing(false);
    setError("");

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    let active = true;
    let objectUrlRevoked = false;
    const revokeObjectUrl = () => {
      if (!objectUrlRevoked) {
        URL.revokeObjectURL(objectUrl);
        objectUrlRevoked = true;
      }
    };

    image.decoding = "async";
    image.onload = () => {
      revokeObjectUrl();
      if (!active) return;
      if (!image.naturalWidth || !image.naturalHeight) {
        setError("无法读取封面图片尺寸，请换一张图片后重试。");
        setLoading(false);
        return;
      }
      imageRef.current = image;
      setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
      setLoading(false);
    };
    image.onerror = () => {
      revokeObjectUrl();
      if (!active) return;
      setError("无法读取图片内容，请确认文件未损坏。");
      setLoading(false);
    };
    image.src = objectUrl;

    return () => {
      active = false;
      image.onload = null;
      image.onerror = null;
      imageRef.current = null;
      image.src = "";
      revokeObjectUrl();
    };
  }, [file, open]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.fillStyle = "#f1f5f9";
    context.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    if (!image || !imageSize.width || !imageSize.height) return;

    const crop = getProjectCoverCropRect(
      imageSize.width,
      imageSize.height,
      zoom,
      position
    );
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
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
      PREVIEW_WIDTH,
      PREVIEW_HEIGHT
    );
  }, [imageSize, position, zoom]);

  function resetCrop() {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setError("");
  }

  function nudgePosition(deltaX: number, deltaY: number) {
    setPosition(current => ({
      x: clampProjectCoverPosition(current.x + deltaX),
      y: clampProjectCoverPosition(current.y + deltaY),
    }));
  }

  function handleCanvasKeyDown(event: ReactKeyboardEvent<HTMLCanvasElement>) {
    const step = event.shiftKey ? 0.1 : 0.025;
    if (event.key === "ArrowLeft") nudgePosition(-step, 0);
    else if (event.key === "ArrowRight") nudgePosition(step, 0);
    else if (event.key === "ArrowUp") nudgePosition(0, -step);
    else if (event.key === "ArrowDown") nudgePosition(0, step);
    else return;
    event.preventDefault();
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!ready || processing) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      position,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !ready) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const crop = getProjectCoverCropRect(
      imageSize.width,
      imageSize.height,
      zoom,
      drag.position
    );
    const travelX = imageSize.width - crop.width;
    const travelY = imageSize.height - crop.height;
    const deltaX = event.clientX - drag.clientX;
    const deltaY = event.clientY - drag.clientY;

    setPosition({
      x: travelX > 0 && bounds.width > 0
        ? clampProjectCoverPosition(
            drag.position.x - (2 * deltaX * crop.width) / (bounds.width * travelX)
          )
        : drag.position.x,
      y: travelY > 0 && bounds.height > 0
        ? clampProjectCoverPosition(
            drag.position.y - (2 * deltaY * crop.height) / (bounds.height * travelY)
          )
        : drag.position.y,
    });
  }

  function finishPointerDrag(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  async function confirmCrop() {
    const image = imageRef.current;
    if (!file || !image || !ready) return;
    setProcessing(true);
    setError("");
    try {
      const result = await createCroppedProjectCover(file, image, zoom, position);
      onConfirm(result);
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : "封面裁剪失败，请重试。");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={nextOpen => {
        if (!processing) onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        className="max-h-[92vh] w-[calc(100%_-_2rem)] max-w-3xl overflow-y-auto"
        onOpenAutoFocus={event => {
          event.preventDefault();
          canvasRef.current?.focus();
        }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          returnFocusRef?.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crosshair className="h-5 w-5" />裁剪项目封面
          </DialogTitle>
          <DialogDescription>
            封面固定为 16:10。拖动图片或使用位置滑块调整构图，确认后会转为 JPEG 并自动压缩。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative aspect-[8/5] overflow-hidden rounded-lg border bg-muted shadow-inner">
            <canvas
              ref={canvasRef}
              width={PREVIEW_WIDTH}
              height={PREVIEW_HEIGHT}
              tabIndex={ready && !processing ? 0 : -1}
              aria-label="项目封面裁剪预览。可拖动图片，或使用方向键微调位置；按住 Shift 可加速移动。"
              className="h-full w-full cursor-grab touch-none object-cover outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:cursor-grabbing"
              onKeyDown={handleCanvasKeyDown}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishPointerDrag}
              onPointerCancel={finishPointerDrag}
            >
              当前浏览器不支持 Canvas 图片裁剪。
            </canvas>
            {(loading || !ready) && !error && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center bg-muted/80 text-sm text-muted-foreground">
                正在读取图片...
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {file ? `${file.name} · 原图 ${formatFileSize(file.size)}` : "请选择一张图片"}
            {imageSize.width > 0 ? ` · ${imageSize.width} × ${imageSize.height}` : ""}
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="project-cover-zoom">缩放</Label>
                <span className="text-xs tabular-nums text-muted-foreground">{zoom.toFixed(2)}×</span>
              </div>
              <input
                id="project-cover-zoom"
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={zoom}
                disabled={!ready || processing}
                aria-valuetext={`${zoom.toFixed(2)} 倍`}
                className="h-9 w-full cursor-pointer accent-primary disabled:cursor-not-allowed"
                onChange={event => setZoom(Number(event.target.value))}
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="project-cover-position-x">水平位置</Label>
                <span className="text-xs tabular-nums text-muted-foreground">{Math.round(position.x * 100)}</span>
              </div>
              <input
                id="project-cover-position-x"
                type="range"
                min="-1"
                max="1"
                step="0.01"
                value={position.x}
                disabled={!ready || processing}
                aria-valuetext={`${Math.round(position.x * 100)}`}
                className="h-9 w-full cursor-pointer accent-primary disabled:cursor-not-allowed"
                onChange={event => setPosition(current => ({ ...current, x: Number(event.target.value) }))}
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="project-cover-position-y">垂直位置</Label>
                <span className="text-xs tabular-nums text-muted-foreground">{Math.round(position.y * 100)}</span>
              </div>
              <input
                id="project-cover-position-y"
                type="range"
                min="-1"
                max="1"
                step="0.01"
                value={position.y}
                disabled={!ready || processing}
                aria-valuetext={`${Math.round(position.y * 100)}`}
                className="h-9 w-full cursor-pointer accent-primary disabled:cursor-not-allowed"
                onChange={event => setPosition(current => ({ ...current, y: Number(event.target.value) }))}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              裁剪框获得焦点后也可用方向键微调，Shift + 方向键可快速移动。
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetCrop}
              disabled={!ready || processing}
            >
              <RotateCcw className="h-4 w-4" />居中复位
            </Button>
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={processing}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={!ready || processing}
            onClick={() => void confirmCrop()}
          >
            {processing ? "正在裁剪压缩..." : "确认裁剪"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
