import { MatterCreateForm } from "@/components/matters/matter-create-form";
import { MattersShell } from "@/components/matters/matters-shell";

export default function NewMatterPage() {
  return (
    <MattersShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-[#0A0F14]">
          Шинэ хэрэг үүсгэх
        </h1>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">
          Хэргийн нэр, төрлөө оруулаад AI-тай ажиллаж эхэлье.
        </p>
        <MatterCreateForm />
      </div>
    </MattersShell>
  );
}
