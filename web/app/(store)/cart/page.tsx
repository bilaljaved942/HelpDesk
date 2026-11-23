import { Suspense } from "react";
import { CartPage } from "@/components/store/Checkout";

export const metadata = { title: "Your cart" };

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-[50vh]" />}>
      <CartPage />
    </Suspense>
  );
}
