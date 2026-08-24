"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          background: "#0a0b0d",
          color: "#e8e9eb",
          display: "flex",
          minHeight: "100dvh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: "0.875rem", fontWeight: 500 }}>Tattava hit an unexpected error</p>
        <button
          onClick={reset}
          style={{
            background: "#5b6cff",
            color: "#fff",
            border: "none",
            borderRadius: "0.375rem",
            padding: "0.5rem 1rem",
            fontSize: "0.8125rem",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
