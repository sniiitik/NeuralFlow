"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section role="alert" className="panel p-8">
      <h1 className="text-xl font-medium">Unable to load this page</h1>
      <p className="mt-2 muted">
        The workspace may be temporarily unavailable. Try again or contact your
        administrator.
      </p>
      <button className="btn mt-5" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
