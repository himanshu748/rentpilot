import type { Metadata } from "next";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "RentPilot | Rental pursuit control desk",
  description:
    "Turn scattered room listings into traceable pursuits with one safe next action.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <ConvexClientProvider>
          {children}
          <Toaster position="bottom-center" theme="light" offset={76} richColors />
        </ConvexClientProvider>
      </body>
    </html>
  );
}
