import { Suspense } from "react";
import { AccountPage } from "@/components/store/Account";

export const metadata = { title: "My account" };

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-[50vh]" />}>
      <AccountPage />
    </Suspense>
  );
}
