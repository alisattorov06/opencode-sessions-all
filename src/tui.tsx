/** @jsxImportSource @opentui/solid */

import type { JSX } from "@opentui/solid"
import type { MouseEvent } from "@opentui/core"
import type { Plugin } from "@opencode/plugin/tui"
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"

type Ctx = Plugin.Context

interface SessionInfo {
  id: string
  parentID?: string | null
  projectID?: string | null
  title?: string | null
  time: { created: number; updated: number }
  location: { directory: string }
}
interface ProjectInfo {
  id: string
  canonical: string
  name?: string | null
}

const MAX_SESSIONS = 150
const STORE_KEY = "all-sessions.collapsed"

// Module-scope reactive state shared by the slot component, refresh fns and keymap.
const [sessions, setSessions] = createSignal<SessionInfo[]>([])
const [projects, setProjects] = createSignal<ProjectInfo[]>([])
const [activeID, setActiveID] = createSignal<string | null>(null)

let fetchTimer: ReturnType<typeof setTimeout> | undefined

function scheduleRefresh(ctx: Ctx) {
  clearTimeout(fetchTimer)
  fetchTimer = setTimeout(() => void refresh(ctx), 200)
}

async function refresh(ctx: Ctx) {
  try {
    const [listRes, projectRes] = await Promise.all([
      ctx.client.session.list({ parentID: null, order: "desc", limit: MAX_SESSIONS }),
      ctx.client.project.list(),
    ])
    setSessions(listRes.data.filter((s) => !s.parentID))
    setProjects(projectRes)
  } catch {
    // Keep stale data on error; refresh will retry on next event.
  }
}

async function goto(ctx: Ctx, id: string) {
  await ctx.ui.router.navigate({ type: "session", sessionID: id })
  scheduleRefresh(ctx)
}

async function newChat(ctx: Ctx) {
  const id = activeID()
  const dir = id ? ctx.data.session.get(id)?.location.directory : undefined
  const location = dir ? { directory: dir } : { directory: ctx.data.location.default().directory }
  const created = await ctx.client.session.create({ location })
  await ctx.ui.router.navigate({ type: "session", sessionID: created.id })
  scheduleRefresh(ctx)
}

function projectLabel(projs: ProjectInfo[], s: SessionInfo): string {
  const p = projs.find((proj) => proj.id === s.projectID)
  if (p) {
    const short = p.canonical.split("/").filter(Boolean).pop()
    return p.name?.trim() || short || p.canonical
  }
  return s.location.directory.split("/").filter(Boolean).pop() || "Unknown"
}

function relTime(ts: number): string {
  const secs = Math.max(0, (Date.now() - ts) / 1000)
  if (secs < 60) return "just now"
  if (secs < 3600) return `${Math.floor(secs / 60)} min`
  if (secs < 86400) return `${Math.floor(secs / 3600)} h`
  if (secs < 604800) return `${Math.floor(secs / 86400)} d`
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

interface Group {
  key: string
  label: string
  items: SessionInfo[]
}

function AllSessions(props: { context: Ctx; sessionID: string }): JSX.Element {
  const ctx = props.context
  const theme = ctx.theme
  const [view, updateView] = ctx.storage.store(STORE_KEY, { initial: {} as Record<string, boolean> })

  const grouped = createMemo<Group[]>(() => {
    const byKey = new Map<string, Group>()
    for (const s of sessions()) {
      const key = s.projectID ?? s.location.directory
      let g = byKey.get(key)
      if (!g) {
        g = { key, label: projectLabel(projects(), s), items: [] }
        byKey.set(key, g)
      }
      g.items.push(s)
    }
    const list = [...byKey.values()]
    for (const g of list) g.items.sort((a, b) => b.time.updated - a.time.updated)
    list.sort((a, b) => b.items[0].time.updated - a.items[0].time.updated)
    return list
  })

  const toggle = (key: string) => {
    void updateView((draft: Record<string, boolean>) => {
      draft[key] = !draft[key]
    }).catch(() => {})
  }

  // Delete-arm state: first click on a row's × arms it, second click deletes.
  const [confirmDelete, setConfirmDelete] = createSignal<string | null>(null)
  const [deleteError, setDeleteError] = createSignal<{ id: string; message: string } | null>(null)
  let confirmTimer: ReturnType<typeof setTimeout> | undefined
  let errorTimer: ReturnType<typeof setTimeout> | undefined

  onCleanup(() => {
    clearTimeout(confirmTimer)
    clearTimeout(errorTimer)
  })

  async function deleteSession(e: MouseEvent, id: string) {
    // The × sits inside the row's navigate box; stop the event bubbling up to it.
    e.stopPropagation()
    if (confirmDelete() !== id) {
      setDeleteError(null)
      clearTimeout(confirmTimer)
      setConfirmDelete(id)
      confirmTimer = setTimeout(() => setConfirmDelete(null), 4000)
      return
    }
    setConfirmDelete(null)
    clearTimeout(confirmTimer)
    try {
      await ctx.client.session.remove({ sessionID: id })
      await refresh(ctx)
    } catch {
      setDeleteError({ id, message: "Delete failed" })
      clearTimeout(errorTimer)
      errorTimer = setTimeout(() => setDeleteError(null), 5000)
    }
  }

  onMount(() => {
    void refresh(ctx)
    const offs = [
      ctx.data.on("session.created", () => scheduleRefresh(ctx)),
      ctx.data.on("session.renamed", () => scheduleRefresh(ctx)),
      ctx.data.on("session.deleted", () => scheduleRefresh(ctx)),
      ctx.data.on("session.status", () => scheduleRefresh(ctx)),
    ]
    onCleanup(() => {
      clearTimeout(fetchTimer)
      for (const off of offs) off()
    })
  })

  return (
    <box paddingX={1} flexDirection="column">
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text.base}>
          <b>💬 All sessions</b>
        </text>
        <box onMouseUp={() => void newChat(ctx)}>
          <text fg={theme.text.base}>
            <b>+ New</b>
          </text>
        </box>
      </box>
      <Show
        when={grouped().length > 0}
        fallback={
          <box alignItems="center">
            <text fg={theme.text.muted}>No sessions yet</text>
          </box>
        }
      >
        <For each={grouped()}>
          {(g) => (
            <box flexDirection="column">
              <box flexDirection="row" gap={1} onMouseDown={() => toggle(g.key)}>
                <text flexShrink={0} fg={theme.text.muted}>
                  {view[g.key] ? "▸" : "▾"}
                </text>
                <text fg={theme.text.base}>{g.label}</text>
              </box>
              <Show when={!view[g.key]}>
                <For each={g.items}>
                  {(s) => {
                    const active = s.id === props.sessionID
                    const title = s.title?.trim() || projectLabel(projects(), s) || "Untitled"
                    const err = deleteError()
                    const rowError = err && err.id === s.id ? err.message : null
                    const armed = confirmDelete() === s.id
                    const label = rowError ?? (armed ? "Delete? Press again" : null)
                    return (
                      <box minWidth={0} flexDirection="row" gap={1} onMouseUp={() => goto(ctx, s.id)}>
                        <text flexShrink={0} fg={active ? theme.text.base : theme.text.muted}>
                          {active ? "▸" : " "}
                        </text>
                        <text
                          fg={active ? theme.text.base : theme.text.muted}
                          wrapMode="none"
                          truncate
                          flexGrow={1}
                          flexShrink={1}
                          minWidth={0}
                        >
                          {active ? <b>{title}</b> : title}
                        </text>
                        <text flexShrink={0} fg={theme.text.muted}>
                          {relTime(s.time.updated)}
                        </text>
                        <box flexShrink={0} onMouseUp={(e) => void deleteSession(e, s.id)}>
                          <text fg={armed || rowError ? theme.text.feedback.error.base : theme.text.muted}>
                            {armed || rowError ? <b>{label ? `× ${label}` : "×"}</b> : "×"}
                          </text>
                        </box>
                      </box>
                    )
                  }}
                </For>
              </Show>
            </box>
          )}
        </For>
      </Show>
    </box>
  )
}

const tui: Plugin.Definition = {
  id: "opencode-sessions-all",
  setup(context) {
    context.ui.slot({
      append: "sidebar.content",
      render: (input) => {
        setActiveID(input.sessionID)
        return <AllSessions context={context} sessionID={input.sessionID} />
      },
    })

    context.keymap.layer(() => ({
      mode: "base",
      commands: [
        {
          id: "all-sessions.new-chat",
          title: "All Sessions: New Chat",
          group: "All Sessions",
          bind: "<leader>s",
          palette: true,
          async run() {
            await newChat(context)
          },
        },
      ],
    }))
  },
}

export default tui