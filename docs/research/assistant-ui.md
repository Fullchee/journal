# `@assistant-ui/react-native` with the log box backend

Ticket: [#7](https://github.com/Fullchee/journal-native/issues/7). Researched 2026-11-07 against assistant-ui `main` at [`f9dbafa`](https://github.com/assistant-ui/assistant-ui/tree/f9dbafab250c8ac315bfc010a30dfff62320a423). npm latest: `@assistant-ui/react-native` 0.1.51, `@assistant-ui/react` 0.15.32.

## Answer

Use **`useExternalStoreRuntime`**. Keep the log box's own `Turn[]` thread as the source of truth and map each reply to a **data part** (`data-ask`, `data-logged`). Register a renderer per name with `useAssistantDataUI`. `/api/log` needs no changes.

- **Runtime**: `useExternalStoreRuntime({ messages, convertMessage, onNew, isRunning })`. `onNew` posts the thread to `/api/log` and appends the typed reply. No streaming needed.
- **Ask and options**: an `ask` reply becomes a `data-ask` part. Its renderer draws option buttons that call `aui.thread().append(optionText)`.
- **Receipts and Undo**: a `logged` reply becomes a `data-logged` part. Undo state (`ready`/`busy`/`done`) stays on our `Turn`, not in assistant-ui.
- **Web**: the Expo web build uses `@assistant-ui/react-native` through react-native-web. Never install `@assistant-ui/react` in the same app.
- **Plain React DOM app (work)**: shares the runtime hook and the converter, not the UI. The same names exist in `@assistant-ui/react`.
- **Offline**: logging needs Workers AI, so it can't queue. Set `isSendDisabled` while offline and say why.

## How the pieces fit

### Packages

- `@assistant-ui/react-native` depends on `@assistant-ui/core`, `@assistant-ui/store`, `@assistant-ui/tap` and `assistant-stream`. Peers: `react` 18 or 19 and any `react-native` ([package.json](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/packages/react-native/package.json)).
- It re-exports the runtimes, the external store API, the tool and data UI hooks, and native primitives ([src/index.ts](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/packages/react-native/src/index.ts)).
- Its `AssistantRuntimeProvider` is the one from `@assistant-ui/core/react`, so runtime code is literally shared with web ([AssistantContext.tsx](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/packages/react-native/src/context/AssistantContext.tsx)).
- Pre-1.0 (0.1.x). Several converter helpers are marked experimental (`unstable_*`). Pin exact versions.

### Three ways to connect a backend

| Option                                    | What you own                               | Fit for the log box                                                                           |
| ----------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `useLocalRuntime(ChatModelAdapter)`       | One `run()` that returns or yields content | Weak. assistant-ui owns the thread, so the `pending` payload and Undo state need workarounds. |
| `useExternalStoreRuntime(adapter)`        | The message array and the handlers         | **Best.** Matches `log-thread.ts`: the client holds the thread and sends it each turn.        |
| `useChatRuntime` (`@assistant-ui/ai-sdk`) | A Vercel AI SDK streaming route            | No. `/api/log` returns one JSON reply, not a UI message stream.                               |

Sources: [custom-backend.mdx](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/apps/docs/content/docs/react-native/custom-backend.mdx), [external-store.mdx](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/apps/docs/content/docs/runtimes/custom/external-store.mdx).

- **`ChatModelAdapter.run`** may return a plain `Promise<ChatModelRunResult>`, so non-streaming works there too ([api-surface](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/api-surface/assistant-ui__react-native.ts), `type ChatModelAdapter`).
- **The external store docs** say to pick it when you want "full control over message state" or have "a custom message format" ([external-store.mdx](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/apps/docs/content/docs/runtimes/custom/external-store.mdx#when-to-use-it)).
- **The RN docs** list `useExternalStoreRuntime` over your own message list as a supported setup for the native elements ([existing-app.mdx](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/apps/docs/content/docs/react-native/existing-app.mdx)).

### External store runtime

- **Required**: `onNew(message: AppendMessage)`. Everything else turns on a feature.
- **Capabilities follow handlers**: `onEdit` adds Edit, `onReload` adds Regenerate, `onCancel` adds Cancel, `setMessages` adds branching ([handler matrix](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/apps/docs/content/docs/runtimes/custom/external-store.mdx#handler-matrix)).
- **The log box needs only `onNew`**. The elements then render Edit and Reload disabled, and hide the branch picker ([existing-app.mdx](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/apps/docs/content/docs/react-native/existing-app.mdx#what-stays-yours)).
- **`isRunning`** shows the typing state. It also matches `canSend`'s "one message at a time" rule.
- **`convertMessage(turn, idx)`** returns a `ThreadMessageLike`. It lets us keep the `Turn` type from `log-thread.ts` unchanged.
- **Get the `Turn` back** inside any renderer with `getExternalStoreMessages(s.message)` ([docs](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/apps/docs/content/docs/runtimes/custom/external-store.mdx#getexternalstoremessages)).
- **Pitfall**: in async handlers, build the next array from current state (functional `setState`), not the captured `messages` ([best practices](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/apps/docs/content/docs/runtimes/custom/external-store.mdx#best-practices)).

### Custom parts: data parts, not tool calls

- **A part typed `data-<name>`** in `ThreadMessageLike` converts to `{ type: "data", name, data }` ([thread-message-like.ts](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/packages/core/src/runtime/utils/thread-message-like.ts), `convertDataPrefixedPart`).
- **`MessagePrimitive.Content` and `Parts`** look up a renderer by `part.name` among registered data UIs, then a fallback ([MessageContent.tsx](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/packages/react-native/src/primitives/message/MessageContent.tsx), `DataUIDisplay`).
- **Register** with `useAssistantDataUI({ name, render })` or `makeAssistantDataUI` ([hooks.mdx](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/apps/docs/content/docs/react-native/hooks.mdx#useassistantdataui)). Or pass `components.data.by_name` to `MessagePrimitive.Parts` ([primitives.mdx](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/apps/docs/content/docs/react-native/primitives.mdx#messageprimitiveparts)).
- **Why not tool calls**: tool UIs assume a model-driven tool loop (`addResult`, approvals). Our server already decided; the reply is a finished record. Data parts carry it with no loop.
- **Tapping an option**: `aui.thread().append(text)` adds a user message and calls `onNew` ([thread.ts](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/packages/core/src/store/scopes/thread.ts)). This matches "a tapped option sends its text as your next message".
- **The `pending` payload** stays on our `Turn`. `messagesOf()` already sends it back. assistant-ui never needs to see it.
- **Options only on the latest turn**: the renderer checks its index against the thread length, as `optionsAt()` does today.

### Receipts and single-use Undo

- The `data-logged` renderer reads `undo` and `refused` from the `Turn` (via the part's `data`, or `getExternalStoreMessages`).
- Undo calls `undoTurn()` and writes the result back with a functional `setThread`. The runtime re-renders from the new array.
- This keeps all Undo rules in the copied `log-thread.ts`. Unit tests stay framework-free.
- `ActionBarPrimitive` (copy, reload, feedback) is not needed. Undo is part of the receipt, not a message action.

### Sketch

```tsx
import {
  AssistantRuntimeProvider,
  useAssistantDataUI,
  useAui,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react-native";
import { respond, undoTurn, type ReplyTurn, type Turn } from "@/lib/log-thread";

const toMessage = (turn: Turn): ThreadMessageLike =>
  turn.role === "user"
    ? { role: "user", content: turn.text }
    : {
        role: "assistant",
        content: [
          { type: "text", text: turn.reply.text },
          ...(turn.reply.type === "said" ? [] : [{ type: `data-${turn.reply.type}`, data: turn }]),
        ],
      };

export function useLogRuntime(isOnline: boolean) {
  const [thread, setThread] = useState<Turn[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const onNew = useCallback(async (message: AppendMessage) => {
    const text = message.content.find((p) => p.type === "text")?.text ?? "";
    const next = [...threadRef.current, { role: "user", text } as const];
    setThread(next);
    setIsRunning(true);
    const reply = await respond(next);
    setThread((t) => [...t, reply]);
    setIsRunning(false);
  }, []);

  return useExternalStoreRuntime({
    messages: thread,
    convertMessage: toMessage,
    onNew,
    isRunning,
    isSendDisabled: !isOnline,
  });
}
```

`threadRef` mirrors `thread` so `onNew` stays stable. The text part keeps the reply readable by the fallback renderer and screen readers.

## Sharing code across Android, Expo web and a React DOM app

- **Expo web**: the RN elements run through react-native-web; the official Expo example ships a static web export ([web-export.mdx](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/apps/docs/content/docs/react-native/web-export.mdx)).
- **One package per app**: "Install only `@assistant-ui/react-native` in a React Native app." Two copies of core break `useAui` ([index.mdx](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/apps/docs/content/docs/react-native/index.mdx)).
- **Web limits**: `maintainVisibleContentPosition` is missing on react-native-web, so loading older history jumps. Not a concern: the log thread is short.
- **Web hydration**: in a static export, Uniwind CSS-variable reads return fallbacks until hydration. Gate them with `useHydrated` ([web-export.mdx](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/apps/docs/content/docs/react-native/web-export.mdx#wait-for-hydration-before-reading-the-cssom)).
- **React DOM (work's CRA app)**: "The runtime core is shared … Only the UI layer changes" ([migration.mdx](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/apps/docs/content/docs/react-native/migration.mdx)).
  - Shareable: the runtime hook, `convertMessage`, the API client, and data-part `render` logic.
  - Not shareable: primitives (`View`/`Pressable` vs DOM) and the styled elements.
  - Import names match in both packages. A shared hook can take `useExternalStoreRuntime` as a parameter, or each app keeps a two-line copy.
  - `@assistant-ui/core` is published "so that integration libraries can depend on the runtime types" ([core README](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/packages/core/README.md)). Importing it from app code is possible but not the documented path.

## Theming

- **Primitives** are unstyled `View`/`Pressable`/`TextInput`. Style them with `StyleSheet` or inline styles ([migration.mdx](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/apps/docs/content/docs/react-native/migration.mdx#what-changes)).
- **Elements** (`thread`, `thread-list`, …) install shadcn-style into your repo via `npx assistant-ui@latest add thread`. They use Tailwind classes through **Uniwind** ([index.mdx](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/apps/docs/content/docs/react-native/index.mdx#set-up-uniwind)).
- **Tokens**: sixteen `--color-*` variables and a `--radius-*` scale in `global.css`, with light and dark variants under `@layer theme`. Same names as the web kit.
- **Uniwind coexists with `StyleSheet`**. Map your theme onto the tokens so both agree ([existing-app.mdx](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/apps/docs/content/docs/react-native/existing-app.mdx#add-uniwind-next-to-stylesheet)).
- **Requirement**: Uniwind needs React Native 0.81 or newer. Expo SDK 57 meets it.
- **`asChild`** on pressable primitives lets a UI-kit button be the press target ([CHANGELOG 0.1.49, 0.1.50](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/packages/react-native/CHANGELOG.md)).
- Decide with the styling ticket: if it picks Uniwind/NativeWind, use the elements; otherwise build the log box from primitives.

## Offline

assistant-ui has no offline mode; the runtime renders whatever `messages` holds. Behaviour is ours to define.

- **Sending**: set `isSendDisabled` while offline. Input stays usable; Send and Enter do nothing ([API reference](https://github.com/assistant-ui/assistant-ui/blob/f9dbafab250c8ac315bfc010a30dfff62320a423/apps/docs/content/docs/runtimes/custom/external-store.mdx#externalstoreadapter)). Show a one-line notice.
- **Why not queue sentences**: the server needs Workers AI and may reply with a question. A queued sentence could come back hours later as an `ask`. Logging by hand on the tracker covers offline, as ADR 0011 already says.
- **The `queue` adapter** queues messages sent during a run. It is not an offline outbox.
- **Mid-request loss**: `sendLog` already turns a failed fetch into a `said` reply. Keep that.
- **Undo offline**: `undoLog` returns `LOG_FAILED`; the button stays `ready`. Keep that.
- **Thread across restarts**: not kept today (ADR 0011). The external store makes persisting it a one-liner if wanted later.

## Open points for the map

- Styling ticket decides elements (Uniwind) vs primitives.
- Whether the log box keeps Enter-to-send inside the Check-in form. `ComposerPrimitive.Input` has `submitMode: "enter" | "none"` for web.
- Prototype the `data-ask` renderer early: it is the part most unlike a stock chat.
