import { useState, useEffect } from "react";

export function useThemeMode() {
  const [dark, setDark] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("bi-theme") === "dark" : false
  );

  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("bi-theme", dark ? "dark" : "light");
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}
