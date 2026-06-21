import "./styles.css";

export const metadata = {
  title: "HelixPay Company Assistant",
  description: "Company assistant for HelixPay business context.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
