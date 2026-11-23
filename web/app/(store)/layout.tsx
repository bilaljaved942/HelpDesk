import { Suspense } from "react";
import { ChatWidget } from "@/components/ChatWidget";
import { CartDrawer, StoreFooter, StoreHeader } from "@/components/store/StoreChrome";
import { StoreProviders } from "@/components/store/StoreProviders";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreProviders>
      <div className="flex min-h-screen flex-col bg-card">
        <Suspense fallback={<div className="h-16 border-b border-line" />}>
          <StoreHeader />
        </Suspense>
        <main className="flex-1">{children}</main>
        <StoreFooter />
      </div>
      <CartDrawer />
      <ChatWidget floating />
    </StoreProviders>
  );
}
