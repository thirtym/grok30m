(function () {
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const listEl = $("sessions-list");
  const footerEl = $("sessions-footer");
  const searchEl = $("sessions-search");

  const ICON = {
    plus: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
    trash: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
    pencil: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>`,
  };

  const helpers = window.GrokWebviewHelpers || {};
  const formatRelativeTime = helpers.formatRelativeTime || ((t) => String(t || ""));

  const state = {
    sessions: [],
    activeSessionId: null,
    dots: {},
    sessionSearch: "",
    renamingSessionId: null,
    sessionTotal: 0,
    sessionHasMore: false,
    sessionLoading: false,
    sessionQuery: "",
    hideAutoSessions: true,
  };

  let sessionSearchTimer = null;

  const DOT_LABEL = {
    working: "Working",
    "needs-you": "Needs you",
    unread: "Finished — unopened",
    error: "Finished with an error — unopened",
  };

  function applySessionDot(dot, value) {
    const v = DOT_LABEL[value] ? value : "none";
    dot.className = "history-row-dot dot-" + v;
    dot.title = DOT_LABEL[value] || "";
  }

  function patchSessionDot(id) {
    const sel = "[data-session-dot=\"" + (window.CSS && CSS.escape ? CSS.escape(id) : id) + "\"]";
    const dot = listEl.querySelector(sel);
    if (dot) applySessionDot(dot, state.dots[id]);
  }

  function requestSessions(offset) {
    state.sessionLoading = true;
    vscode.postMessage({ type: "listSessions", offset, query: state.sessionSearch });
  }

  function updateFooter() {
    if (!footerEl) return;
    const loadedClearable = state.sessions.some((s) => s.id !== state.activeSessionId);
    const moreUnloaded = state.sessionTotal > state.sessions.length;
    footerEl.hidden = !(loadedClearable || moreUnloaded);
  }

  function renderSessionRow(s) {
    const row = document.createElement("div");
    const active = s.id === state.activeSessionId;
    row.className = "history-row" + (active ? " active" : "");

    const dot = document.createElement("span");
    dot.setAttribute("data-session-dot", s.id);
    applySessionDot(dot, state.dots[s.id]);
    row.appendChild(dot);

    const main = document.createElement("div");
    main.className = "history-row-main";

    if (state.renamingSessionId === s.id) {
      const inp = document.createElement("input");
      inp.type = "text";
      inp.className = "history-rename";
      inp.value = s.displayName;
      inp.onclick = (e) => e.stopPropagation();
      inp.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          vscode.postMessage({ type: "renameSession", id: s.id, name: inp.value });
          state.renamingSessionId = null;
        } else if (e.key === "Escape") {
          state.renamingSessionId = null;
          renderSessionRows();
        }
      };
      inp.onblur = () => {
        if (state.renamingSessionId === s.id) {
          vscode.postMessage({ type: "renameSession", id: s.id, name: inp.value });
          state.renamingSessionId = null;
        }
      };
      main.appendChild(inp);
      setTimeout(() => { inp.focus(); inp.select(); }, 0);
    } else {
      const name = document.createElement("div");
      name.className = "history-row-name";
      name.textContent = s.displayName || "Untitled";
      name.title = s.rawSummary || s.displayName || "";
      main.appendChild(name);

      const meta = document.createElement("div");
      meta.className = "history-row-meta";
      const parts = [];
      if (s.numMessages) parts.push(`${s.numMessages} msg`);
      parts.push(formatRelativeTime(s.updatedAt));
      meta.textContent = parts.join(" · ");
      main.appendChild(meta);

      row.onclick = () => {
        if (active) return;
        vscode.postMessage({ type: "resumeSession", id: s.id });
      };
    }

    row.appendChild(main);

    const actions = document.createElement("div");
    actions.className = "history-row-actions";
    const renameBtn = document.createElement("button");
    renameBtn.className = "history-action-btn";
    renameBtn.innerHTML = ICON.pencil;
    renameBtn.title = "Rename";
    renameBtn.onclick = (e) => {
      e.stopPropagation();
      state.renamingSessionId = s.id;
      renderSessionRows();
    };
    actions.appendChild(renameBtn);
    if (!active) {
      const delBtn = document.createElement("button");
      delBtn.className = "history-action-btn history-action-danger";
      delBtn.innerHTML = ICON.trash;
      delBtn.title = "Delete";
      delBtn.onclick = (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: "deleteSession", id: s.id, name: s.displayName });
      };
      actions.appendChild(delBtn);
    }
    row.appendChild(actions);
    return row;
  }

  function renderSessionRows() {
    if (!listEl) return;
    listEl.innerHTML = "";
    if (state.sessions.length === 0) {
      const empty = document.createElement("div");
      empty.className = "sessions-empty";
      empty.textContent = state.sessionSearch.trim() ? "No matches." : "No sessions yet.";
      listEl.appendChild(empty);
    } else {
      for (const s of state.sessions) listEl.appendChild(renderSessionRow(s));
      if (state.sessionHasMore) {
        const more = document.createElement("div");
        more.className = "sessions-more";
        more.textContent = state.sessionLoading ? "Loading…" : "Scroll for more";
        listEl.appendChild(more);
      }
    }
    updateFooter();
  }

  if (listEl) {
    listEl.onscroll = () => {
      if (!state.sessionHasMore || state.sessionLoading) return;
      if (listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 48) {
        requestSessions(state.sessions.length);
      }
    };
  }

  if (searchEl) {
    searchEl.oninput = () => {
      state.sessionSearch = searchEl.value;
      if (sessionSearchTimer) clearTimeout(sessionSearchTimer);
      sessionSearchTimer = setTimeout(() => requestSessions(0), 180);
    };
    searchEl.onkeydown = (e) => e.stopPropagation();
  }

  const newBtn = $("sessions-new-btn");
  if (newBtn) {
    newBtn.innerHTML = ICON.plus;
    newBtn.title = "New session";
    newBtn.onclick = () => vscode.postMessage({ type: "newSession" });
  }

  const clearBtn = $("sessions-clear-btn");
  if (clearBtn) {
    clearBtn.innerHTML = ICON.trash + "<span>Clear all history</span>";
    clearBtn.onclick = () => vscode.postMessage({ type: "clearAllSessions" });
  }

  const hideAutoEl = $("sessions-hide-auto");
  if (hideAutoEl) {
    hideAutoEl.onchange = () => {
      state.hideAutoSessions = !!hideAutoEl.checked;
      vscode.postMessage({ type: "setHideAutoSessions", value: state.hideAutoSessions });
    };
  }

  window.addEventListener("message", (e) => {
    const msg = e.data;
    switch (msg.type) {
      case "sessions": {
        const entries = msg.entries || [];
        const offset = msg.offset || 0;
        if (offset === 0 && (msg.query || "") !== state.sessionSearch && state.sessionSearch) {
          requestSessions(0);
          break;
        }
        if (offset > 0) {
          if ((msg.query || "") !== state.sessionQuery) {
            state.sessionLoading = false;
            break;
          }
          const seen = new Set(state.sessions.map((s) => s.id));
          for (const entry of entries) if (!seen.has(entry.id)) state.sessions.push(entry);
        } else {
          state.sessions = entries;
          state.sessionQuery = msg.query || "";
        }
        if (msg.activeId !== undefined) state.activeSessionId = msg.activeId || null;
        state.dots = Object.assign({}, state.dots, msg.dots || {});
        if (msg.total !== undefined) state.sessionTotal = msg.total;
        state.sessionHasMore = !!msg.hasMore;
        state.sessionLoading = false;
        if (msg.hideAutoSessions !== undefined) {
          state.hideAutoSessions = !!msg.hideAutoSessions;
          if (hideAutoEl) hideAutoEl.checked = state.hideAutoSessions;
        }
        renderSessionRows();
        break;
      }
      case "sessionDot":
        if (msg.dot && msg.dot !== "none") state.dots[msg.id] = msg.dot;
        else delete state.dots[msg.id];
        patchSessionDot(msg.id);
        break;
    }
  });

  vscode.postMessage({ type: "sessionsReady" });
  requestSessions(0);
})();