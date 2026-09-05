"use client";

export default function SearchError({ retry }: { retry: () => void }) {
  return (
    <main className="search-recovery" role="alert">
      <h1>Your search could not be loaded</h1>
      <p>Try again. If your session expired, reopen the app and sign in. Saved searches have not been deleted; unsaved edits may need to be re-entered.</p>
      <button type="button" className="secondary-action" onClick={() => retry()}>Try again</button>
      <a href="/app">Reopen the app</a>
    </main>
  );
}
