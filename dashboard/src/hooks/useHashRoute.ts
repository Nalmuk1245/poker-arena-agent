import { useState, useEffect, useCallback } from "react";

export type Page = "arena" | "agents";

const VALID_PAGES: Page[] = ["arena", "agents"];

function getPageFromHash(): Page {
  const hash = window.location.hash.replace("#/", "").replace("#", "");
  if (VALID_PAGES.includes(hash as Page)) return hash as Page;
  return "arena";
}

export function useHashRoute() {
  const [page, setPageState] = useState<Page>(getPageFromHash);

  useEffect(() => {
    const onHashChange = () => setPageState(getPageFromHash());
    window.addEventListener("hashchange", onHashChange);
    // Set initial hash if empty
    if (!window.location.hash) {
      window.location.hash = "#/arena";
    }
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const setPage = useCallback((p: Page) => {
    window.location.hash = `#/${p}`;
  }, []);

  return { page, setPage };
}
