"use client";

import {
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type DragEvent,
} from "react";

import {
  adminClearHomepageSectionImageAction,
  adminSetHomepageSectionImageAction,
} from "@/application/actions/admin-homepage.actions";
import { Button } from "@/components/ui/button";
import {
  HOMEPAGE_IMAGE_ALLOWED_TYPES,
  HOMEPAGE_IMAGE_MAX_BYTES,
} from "@/application/validators/homepage.schema";
import type { HomepageSectionKey } from "@/domain/entities/homepage-section";
import { cn } from "@/lib/utils";

export function HomepageImageDropzone({
  sectionKey,
  label,
  imageUrl,
  copy,
  onImageChange,
}: {
  sectionKey: HomepageSectionKey;
  label: string;
  imageUrl: string | null;
  copy: {
    noImage: string;
    upload: string;
    change: string;
    remove: string;
    uploaded: string;
    removed: string;
  };
  onImageChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function releasePreview() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }

  function handleFile(file: File) {
    setLocalError(null);
    if (
      !HOMEPAGE_IMAGE_ALLOWED_TYPES.includes(
        file.type as (typeof HOMEPAGE_IMAGE_ALLOWED_TYPES)[number],
      )
    ) {
      setLocalError("Зөвхөн JPEG, PNG эсвэл WebP зураг байршуулна уу");
      return;
    }
    if (file.size > HOMEPAGE_IMAGE_MAX_BYTES) {
      setLocalError("Зураг 5MB-с бага байх ёстой");
      return;
    }

    releasePreview();
    const localUrl = URL.createObjectURL(file);
    objectUrlRef.current = localUrl;
    setPreview(localUrl);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("key", sectionKey);
      formData.set("image", file);
      const result = await adminSetHomepageSectionImageAction({}, formData);
      if (result.success) {
        onImageChange(result.imageUrl ?? null);
      } else {
        setLocalError(result.error ?? "Зураг байршуулахад алдаа гарлаа");
        releasePreview();
        setPreview(null);
      }
    });
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
    e.target.value = "";
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  }

  function handleRemove() {
    setLocalError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("key", sectionKey);
      const result = await adminClearHomepageSectionImageAction({}, formData);
      if (result.success) {
        releasePreview();
        setPreview(null);
        onImageChange(null);
      } else {
        setLocalError(result.error ?? "Устгахад алдаа гарлаа");
      }
    });
  }

  const displayUrl = preview ?? imageUrl;

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
          нүүр хуудсанд энд харагдана
        </span>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative flex aspect-video w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-input",
          pending && "opacity-60",
        )}
      >
        {displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 px-4 text-center text-xs text-muted-foreground">
            <span>{copy.noImage}</span>
            <span>Чирж оруулах эсвэл дарж сонгох</span>
          </div>
        )}
        {pending ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs font-medium">
            Хадгалж байна…
          </div>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleInputChange}
        className="hidden"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          {imageUrl ? copy.change : copy.upload}
        </Button>
        {imageUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={handleRemove}
          >
            {copy.remove}
          </Button>
        ) : null}
      </div>

      {localError ? (
        <p className="text-xs text-destructive">{localError}</p>
      ) : null}
    </div>
  );
}
