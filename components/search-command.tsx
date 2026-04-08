"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

type SearchResult = {
  type: string;
  id: string;
  title: string;
  url: string;
};

const typeLabels: Record<string, string> = {
  customer: "Customers",
  quote: "Quotes",
  job: "Jobs",
  invoice: "Invoices",
  component: "Components",
};

export function SearchCommand() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchResults = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.results ?? []);
      setOpen((data.results ?? []).length > 0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      fetchResults(value);
    }, 300);
  }

  function handleSelect(url: string) {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(url);
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Group results by type
  const grouped: Record<string, SearchResult[]> = {};
  for (const r of results) {
    if (!grouped[r.type]) grouped[r.type] = [];
    grouped[r.type].push(r);
  }

  return (
    <div ref={containerRef} className="relative w-64">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          className="h-9 w-full rounded-md border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm outline-none placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:ring-1 focus:ring-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-600 dark:focus:bg-gray-900 dark:focus:ring-gray-600"
        />
        {loading && (
          <div className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
        )}
      </div>

      {open && (
        <div className="absolute top-10 z-50 w-full rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {Object.entries(grouped).map(([type, items]) => (
            <div key={type}>
              <div className="px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
                {typeLabels[type] ?? type}
              </div>
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item.url)}
                  className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <span className="truncate text-gray-700 dark:text-gray-200">{item.title}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
