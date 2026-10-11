import Link from "next/link";
import { CSVImportClient } from "./CSVImportClient";

export default function ImportPage() {
  return (
    <main className="flex flex-1 justify-center">
      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-5 px-[18px] pt-5 pb-16 [padding-bottom:calc(64px+env(safe-area-inset-bottom))]">
        <Link
          href="/spend"
          className="self-start text-[0.9rem] text-text-muted hover:text-text"
        >
          ← Spend
        </Link>
        <CSVImportClient />
      </div>
    </main>
  );
}
