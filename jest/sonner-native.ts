// sonner-native animates on Reanimated's UI runtime, which Jest lacks. This stand-in keeps its API: one store of
// toasts, an id that replaces a toast in place, auto-close after `duration`, and a Toaster that shows the newest
// toast's title and action button.
import { createElement, useSyncExternalStore } from "react";
import { Pressable, Text, View } from "react-native";

type ToastId = string | number;

interface ToastData {
  id?: ToastId;
  duration?: number;
  action?: { label: string; onClick: () => void };
  onAutoClose?: (id: ToastId) => void;
  onDismiss?: (id: ToastId) => void;
}

interface Toast extends ToastData {
  id: ToastId;
  title: string;
}

let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const timers = new Map<ToastId, NodeJS.Timeout>();

const emit = () => {
  for (const listener of listeners) listener();
};

function remove(id: ToastId) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  toasts = toasts.filter((each) => each.id !== id);
  emit();
}

let counter = 0;

function showToast(title: string, data: ToastData = {}): ToastId {
  const id = data.id ?? ++counter;
  const next = { ...data, id, title };

  toasts = toasts.some((each) => each.id === id)
    ? toasts.map((each) => (each.id === id ? next : each))
    : [...toasts, next];

  clearTimeout(timers.get(id));
  timers.delete(id);
  emit();

  // As in sonner-native, an Infinity toast waits for a dismiss; setTimeout would treat it as 1 ms.
  if (data.duration === Infinity) return id;

  // Unref'd, so a toast still showing when a suite ends doesn't keep Jest from exiting.
  const timer = setTimeout(() => {
    remove(id);
    next.onAutoClose?.(id);
  }, data.duration ?? 4000);

  timer.unref();
  timers.set(id, timer);

  return id;
}

function dismiss(id?: ToastId) {
  const leaving = toasts.filter((each) => id === undefined || each.id === id);

  for (const each of leaving) {
    remove(each.id);
    each.onDismiss?.(each.id);
  }

  return id;
}

export const toast = Object.assign(showToast, { dismiss });

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => listeners.delete(listener);
};

export function Toaster() {
  const shown = useSyncExternalStore(subscribe, () => toasts).at(-1);

  return shown === undefined
    ? null
    : createElement(
        View,
        { testID: "toast", "aria-live": "polite" },
        createElement(Text, null, shown.title),
        shown.action &&
          createElement(
            Pressable,
            { role: "button", onPress: shown.action.onClick },
            createElement(Text, null, shown.action.label),
          ),
      );
}
