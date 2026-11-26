"use client";

import { ChevronRight, CircleCheck } from "lucide-react";
import Link from "next/link";
import { AlertList } from "./alert-list";
import type { TableAlert } from "./model";
import { useTableAlerts } from "./use-table-alerts";

export type AttentionTodo = { key: string; href: string; text: string };

// "Attention needed" on the admin home: one list for everything that wants the
// owner now. Setup to-dos first (each a link to the page where it is done),
// then the live problem tables. The all-clear line only when both are empty.
export function AttentionPanel({
  locationId,
  initial,
  todos,
  allClear,
}: {
  locationId: string | null;
  initial: TableAlert[];
  todos: readonly AttentionTodo[];
  allClear: string;
}) {
  return locationId ? (
    <LivePanel locationId={locationId} initial={initial} todos={todos} allClear={allClear} />
  ) : (
    <Panel alerts={[]} todos={todos} allClear={allClear} />
  );
}

function LivePanel({
  locationId,
  initial,
  todos,
  allClear,
}: {
  locationId: string;
  initial: TableAlert[];
  todos: readonly AttentionTodo[];
  allClear: string;
}) {
  const alerts = useTableAlerts(locationId, initial);
  return <Panel alerts={alerts} todos={todos} allClear={allClear} />;
}

function Panel({
  alerts,
  todos,
  allClear,
}: {
  alerts: TableAlert[];
  todos: readonly AttentionTodo[];
  allClear: string;
}) {
  return (
    <div data-testid="attention-panel" aria-live="polite" className="flex flex-col">
      {alerts.length === 0 && todos.length === 0 ? (
        <p
          className="text-staff-label2 m-0 flex items-center gap-2 text-[1.0625rem]"
          data-testid="attention-empty"
        >
          <CircleCheck aria-hidden="true" className="text-tarragon size-5 shrink-0" />
          {allClear}
        </p>
      ) : (
        <>
          {alerts.length > 0 && <AlertList alerts={alerts} />}
          {todos.length > 0 && (
            <ul className="m-0 flex list-none flex-col p-0" data-testid="home-todo">
              {todos.map((todo) => (
                <li key={todo.key} className="border-staff-sep border-b last:border-0">
                  <Link
                    href={todo.href}
                    data-testid={`todo-${todo.key}`}
                    className="group flex min-h-14 items-center gap-3 py-3 text-name"
                  >
                    <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center">
                      <span className="bg-amber-text size-2 rounded-full" />
                    </span>
                    <span className="min-w-0 flex-1 break-words underline-offset-4 group-hover:underline">
                      {todo.text}
                    </span>
                    <ChevronRight aria-hidden="true" className="text-staff-label2 size-5 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
