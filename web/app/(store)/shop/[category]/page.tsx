import { Suspense } from "react";
import { Shop } from "@/components/store/Shop";
import { ProductGridSkeleton } from "@/components/store/ProductCard";

export const metadata = { title: "Shop" };

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-10 sm:px-6"><ProductGridSkeleton /></div>}>
      <Shop />
    </Suspense>
  );
}
