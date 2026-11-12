import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Kahati",
  description: "Know your bill, manage your usage. Computed by Kahati. Not a Meralco statement.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 24, color: "#231F20", background: "#F5F4F1" }}>
        {children}
      </body>
    </html>
  );
}
