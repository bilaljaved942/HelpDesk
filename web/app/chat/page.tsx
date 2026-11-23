import Link from "next/link";
import { ChatWidget } from "@/components/ChatWidget";

export const metadata = { title: "Chat with Northwind Support" };

export default function ChatPage() {
  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col px-0 sm:px-4 sm:py-6">
      <Link href="/" className="hidden px-1 pb-3 text-sm text-muted hover:text-ink sm:block">← Back to the store</Link>
      <div className="min-h-0 flex-1">
        <ChatWidget />
      </div>
    </div>
  );
}
