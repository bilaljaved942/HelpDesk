import { Suspense } from "react";
import { OrderPage } from "@/components/store/Account";

export const metadata = { title: "Order" };

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-[50vh]" />}>
      <OrderPage />
    </Suspense>
  );
}
