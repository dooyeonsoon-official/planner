import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Pen,
  Eraser,
  Type,
  Undo2,
  ChevronLeft,
  ChevronRight,
  Highlighter,
  Settings,
  ZoomIn,
  ZoomOut,
  CalendarDays,
} from "lucide-react";

// ---------- layout constants (logical page coordinates) ----------
const PAGE_W = 480;
const HEAD_H = 96;
const RULE_H = 10;
const ROW_H = 56;
const NOTE_LABEL_H = 44;
const NOTE_H = 230;
const PAGE_PAD = 24;

const TODO_N = 6;
const TODO_ROW_H = 34;
const TODO_LABEL_H = 40;
const SPACER_H = 10;
const TODO_BLOCK_H = TODO_LABEL_H + TODO_N * TODO_ROW_H + SPACER_H; // 254
const V1_SHIFT = TODO_BLOCK_H; // old(v1) day strokes: grid moved down by this much

const WEEK_ROW_H = 176;
const WEEK_H = HEAD_H + RULE_H + 7 * WEEK_ROW_H + PAGE_PAD;
const WEEK_WIDE_W = 840;  // 7-column time-grid page width (wide screens)
const WK_GUT = 40;        // time gutter width
const WK_COLHEAD = 46;    // day header row height
const WK_HR_H = 44;       // hour row height in week grid (2 lines)
const WK_TODO_ROWS = 3;   // to-do rows in week grid
const WK_TODO_ROW_H = 22;
const WK_TODO_H = WK_TODO_ROWS * WK_TODO_ROW_H;
const WK_NOTE_H = 92;     // per-day weekly note strip height
const WIDE_MIN = 720;     // container px needed for the grid layout

const M_WD_H = 30;
const M_CELL_H = 78;
const MONTH_H = HEAD_H + RULE_H + M_WD_H + 6 * M_CELL_H + PAGE_PAD;

// ---------- design tokens ----------
const INK = "#26241f";
const PAPER = "#fdfdfb";
const BG = "#f4f3ef";
const HAIR = "#e9e7e1";
const FAINT = "#aaa69d";
const RED = "#c4382d";
const BLUE = "#33518e";
const PEN_COLORS = [INK, BLUE, RED, "#3a7d44", "#d9822b"];
const HL_COLORS = ["#f6d94c", "#a8d971", "#f2a7c3"];
const HL_WIDTH = 15;
const PEN_WIDTHS = [2, 3.5];
const WD_LONG = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
const WD_SHORT = ["일", "월", "화", "수", "목", "금", "토"];

// 대한민국 공휴일 2026–2027 (대체공휴일 포함 · 제헌절/노동절 신설 반영)
const HOLIDAYS = {
  "2026-01-01": "신정",
  "2026-02-16": "설날 연휴",
  "2026-02-17": "설날",
  "2026-02-18": "설날 연휴",
  "2026-03-01": "삼일절",
  "2026-03-02": "대체공휴일",
  "2026-05-01": "노동절",
  "2026-05-05": "어린이날",
  "2026-05-24": "부처님오신날",
  "2026-05-25": "대체공휴일",
  "2026-06-06": "현충일",
  "2026-07-17": "제헌절",
  "2026-08-15": "광복절",
  "2026-08-17": "대체공휴일",
  "2026-09-24": "추석 연휴",
  "2026-09-25": "추석",
  "2026-09-26": "추석 연휴",
  "2026-10-03": "개천절",
  "2026-10-05": "대체공휴일",
  "2026-10-09": "한글날",
  "2026-12-25": "성탄절",
  "2027-01-01": "신정",
  "2027-02-06": "설날 연휴",
  "2027-02-07": "설날",
  "2027-02-08": "설날 연휴",
  "2027-02-09": "대체공휴일",
  "2027-03-01": "삼일절",
  "2027-05-01": "노동절",
  "2027-05-03": "대체공휴일",
  "2027-05-05": "어린이날",
  "2027-05-13": "부처님오신날",
  "2027-06-06": "현충일",
  "2027-07-17": "제헌절",
  "2027-07-19": "대체공휴일",
  "2027-08-15": "광복절",
  "2027-08-16": "대체공휴일",
  "2027-09-14": "추석 연휴",
  "2027-09-15": "추석",
  "2027-09-16": "추석 연휴",
  "2027-10-03": "개천절",
  "2027-10-04": "대체공휴일",
  "2027-10-09": "한글날",
  "2027-10-11": "대체공휴일",
  "2027-12-25": "성탄절",
  "2027-12-27": "대체공휴일",
};
const holidayOf = (ds) => HOLIDAYS[ds] || null;

// ---------- helpers ----------
const pad2 = (n) => String(n).padStart(2, "0");
const fmt = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseDS = (ds) => {
  const [y, m, dd] = ds.split("-").map(Number);
  return new Date(y, m - 1, dd);
};
const ymOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const addDays = (d, n) => {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
};
const startOfWeek = (d) => addDays(d, -d.getDay()); // Sunday start
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

const dayKey = (ds) => `planner:${ds}`;
const wkKey = (ds) => `planner:wk:${ds}`;
const moKey = (ym) => `planner:mo:${ym}`;
const idxKey = (ym) => `planner:idx:${ym}`;
const SETTINGS_KEY = "planner:settings";

const emptyTodos = () =>
  Array.from({ length: TODO_N }, () => ({ t: "", done: false }));

function normalizeTodos(raw) {
  return Array.from({ length: TODO_N }, (_, i) => ({
    t: (raw && raw[i] && raw[i].t) || "",
    done: !!(raw && raw[i] && raw[i].done),
  }));
}

function migrateDayRecord(parsed) {
  let strokes = (parsed && parsed.strokes) || [];
  if (parsed && parsed.v !== 2) {
    strokes = strokes.map((s) => ({
      ...s,
      points: s.points.map((pt) =>
        pt.y >= HEAD_H + RULE_H
          ? { x: pt.x, y: +(pt.y + V1_SHIFT).toFixed(1) }
          : pt
      ),
    }));
  }
  return {
    memos: (parsed && parsed.memos) || {},
    todos: normalizeTodos(parsed && parsed.todos),
    freeNote: (parsed && parsed.freeNote) || "",
    strokes,
  };
}

function buildIdxEntry(memos, freeNote, todos) {
  const p = [];
  let n = 0;
  for (let h = 0; h < 24; h++) {
    const t = (memos[h] || "").trim();
    if (!t) continue;
    n += 1;
    const t0 = t.split("\n")[0];
    if (p.length < 4) p.push(`${pad2(h)}  ${t0}`.slice(0, 22));
  }
  n += (todos || []).filter((td) => td && (td.t || "").trim()).length;
  if ((freeNote || "").trim()) n += 1;
  return n > 0 ? { n, p } : null;
}

function drawStroke(ctx, s) {
  const pts = s.points;
  if (!pts || pts.length === 0) return;
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = s.hl ? "butt" : "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (pts.length < 3) {
    ctx.moveTo(pts[0].x, pts[0].y);
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x + 0.01, last.y + 0.01);
  } else {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
  }
  ctx.stroke();
}

export default function Planner() {
  const [view, setView] = useState("day"); // "day" | "week" | "month"
  const [date, setDate] = useState(() => new Date());
  const dateStr = fmt(date);
  const todayStr = fmt(new Date());
  const isToday = todayStr === dateStr;
  const weekStartStr = fmt(startOfWeek(date));
  const monthYM = ymOf(date);

  // settings
  const [settings, setSettings] = useState({ dayStart: 6, dayEnd: 23 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsReady = useRef(false);

  // day data
  const [memos, setMemos] = useState({});
  const [todos, setTodos] = useState(emptyTodos());
  const [freeNote, setFreeNote] = useState("");
  const [dayStrokes, setDayStrokes] = useState([]);
  // week data
  const [weekStrokes, setWeekStrokes] = useState([]);
  const [weekStrokesWide, setWeekStrokesWide] = useState([]);
  const [weekNotes, setWeekNotes] = useState({}); // { dateStr: text }
  const [weekDaysData, setWeekDaysData] = useState({}); // { dateStr: full day record }
  const [weekIdx, setWeekIdx] = useState({});
  // month data
  const [monthStrokes, setMonthStrokes] = useState([]);
  const [monthIdx, setMonthIdx] = useState({});

  const [mode, setMode] = useState("text"); // "text" | "pen" | "hl" | "eraser"
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [hlColor, setHlColor] = useState(HL_COLORS[0]);
  const [width, setWidth] = useState(PEN_WIDTHS[0]);
  const [palm, setPalm] = useState(true);
  const [containerW, setContainerW] = useState(PAGE_W);
  const [zoom, setZoom] = useState(1);
  const [miniOpen, setMiniOpen] = useState(false);
  const [miniMonth, setMiniMonth] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState("idle");

  const outerRef = useRef(null);
  const canvasRef = useRef(null);
  const live = useRef(null);
  const lastErase = useRef(null);
  const timer = useRef(null);
  const dirtyRef = useRef(false);
  const skipSaveRef = useRef(true);
  const idxCache = useRef(new Map());
  const weekDirtyRef = useRef(new Set()); // day dateStrs edited from the week grid
  const zoomRef = useRef(1);
  const pinchRef = useRef({ pts: new Map(), d0: 0, z0: 1 });
  const dataRef = useRef({});

  const hours = useMemo(
    () =>
      Array.from(
        { length: settings.dayEnd - settings.dayStart + 1 },
        (_, i) => settings.dayStart + i
      ),
    [settings.dayStart, settings.dayEnd]
  );
  const DAY_H =
    HEAD_H +
    RULE_H +
    TODO_BLOCK_H +
    hours.length * ROW_H +
    NOTE_LABEL_H +
    NOTE_H +
    PAGE_PAD;
  const WEEK_WIDE_BODY =
    WK_COLHEAD + WK_TODO_H + hours.length * WK_HR_H + WK_NOTE_H;
  const WEEK_WIDE_H = HEAD_H + RULE_H + WEEK_WIDE_BODY + PAGE_PAD;

  dataRef.current = {
    view,
    dateStr,
    weekStartStr,
    monthYM,
    memos,
    todos,
    freeNote,
    dayStrokes,
    weekStrokes,
    weekStrokesWide,
    weekNotes,
    weekDaysData,
    monthStrokes,
  };
  zoomRef.current = zoom;

  const wide = view === "week" && containerW >= WIDE_MIN;
  const pageW = wide ? WEEK_WIDE_W : PAGE_W;
  const pageH =
    view === "day" ? DAY_H : view === "week" ? (wide ? WEEK_WIDE_H : WEEK_H) : MONTH_H;
  const fitScale0 = Math.min((containerW - 8) / pageW, wide ? 1.3 : 1.6);
  const fitScale = fitScale0 > 0.1 ? fitScale0 : 1;
  const scale = fitScale * zoom;
  const curStrokes =
    view === "day"
      ? dayStrokes
      : view === "week"
      ? wide
        ? weekStrokesWide
        : weekStrokes
      : monthStrokes;
  const setCurStrokes =
    view === "day"
      ? setDayStrokes
      : view === "week"
      ? wide
        ? setWeekStrokesWide
        : setWeekStrokes
      : setMonthStrokes;
  const drawMode = mode === "pen" || mode === "hl";

  // ---------- settings: load once, persist on change ----------
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(SETTINGS_KEY);
        if (r && r.value) {
          const s = JSON.parse(r.value);
          setSettings((prev) => {
            const ds = Number.isInteger(s.dayStart) ? s.dayStart : prev.dayStart;
            let de = Number.isInteger(s.dayEnd) ? s.dayEnd : prev.dayEnd;
            if (de <= ds) de = Math.min(ds + 1, 23);
            return { dayStart: Math.max(0, Math.min(22, ds)), dayEnd: Math.max(1, Math.min(23, de)) };
          });
        }
      } catch (err) {
        /* defaults */
      }
      settingsReady.current = true;
    })();
  }, []);
  useEffect(() => {
    if (!settingsReady.current) return;
    window.storage
      .set(SETTINGS_KEY, JSON.stringify(settings))
      .catch(() => {});
  }, [settings]);

  // ---------- fit page to screen ----------
  useEffect(() => {
    const update = () => {
      const w = outerRef.current ? outerRef.current.clientWidth : PAGE_W;
      setContainerW(w > 0 ? w : PAGE_W);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // ---------- canvas: (re)size per view + redraw ----------
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = pageW * dpr;
    c.height = pageH * dpr;
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    curStrokes.forEach((s) => drawStroke(ctx, s));
  }, [pageW, pageH, curStrokes]);

  // ---------- month index maintenance ----------
  const updateIdx = useCallback(async (ds, m, f, tds) => {
    const ym = ds.slice(0, 7);
    const dd = ds.slice(8);
    let idx = idxCache.current.get(ym);
    if (!idx) {
      idx = {};
      try {
        const r = await window.storage.get(idxKey(ym));
        if (r && r.value) idx = JSON.parse(r.value) || {};
      } catch (err) {
        /* no index yet */
      }
    }
    const entry = buildIdxEntry(m, f, tds);
    const before = JSON.stringify(idx[dd] || null);
    const after = JSON.stringify(entry);
    idxCache.current.set(ym, idx);
    if (before === after) return idx;
    if (entry) idx[dd] = entry;
    else delete idx[dd];
    try {
      await window.storage.set(idxKey(ym), JSON.stringify(idx));
    } catch (err) {
      /* index write failed; previews may lag */
    }
    return idx;
  }, []);

  // ---------- save ----------
  const saveNow = useCallback(async () => {
    const d = dataRef.current;
    setSaveState("saving");
    try {
      if (d.view === "day") {
        await window.storage.set(
          dayKey(d.dateStr),
          JSON.stringify({
            v: 2,
            memos: d.memos,
            todos: d.todos,
            freeNote: d.freeNote,
            strokes: d.dayStrokes,
            updatedAt: Date.now(),
          })
        );
        updateIdx(d.dateStr, d.memos, d.freeNote, d.todos);
      } else if (d.view === "week") {
        const dirtyDays = Array.from(weekDirtyRef.current);
        for (const ds2 of dirtyDays) {
          const rec = d.weekDaysData[ds2];
          if (!rec) continue;
          await window.storage.set(
            dayKey(ds2),
            JSON.stringify({
              v: 2,
              memos: rec.memos,
              todos: rec.todos,
              freeNote: rec.freeNote,
              strokes: rec.strokes,
              updatedAt: Date.now(),
            })
          );
          updateIdx(ds2, rec.memos, rec.freeNote, rec.todos);
        }
        await window.storage.set(
          wkKey(d.weekStartStr),
          JSON.stringify({
            strokes: d.weekStrokes,
            strokesWide: d.weekStrokesWide,
            notes: d.weekNotes,
            updatedAt: Date.now(),
          })
        );
        dirtyDays.forEach((ds2) => weekDirtyRef.current.delete(ds2));
      } else {
        await window.storage.set(
          moKey(d.monthYM),
          JSON.stringify({ strokes: d.monthStrokes, updatedAt: Date.now() })
        );
      }
      dirtyRef.current = false;
      setSaveState("saved");
    } catch (err) {
      console.error("save failed", err);
      setSaveState("error");
    }
  }, [updateIdx]);

  // autosave on edits (skip renders caused by loading)
  useEffect(() => {
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    dirtyRef.current = true;
    setSaveState("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => saveNow(), 900);
    return () => clearTimeout(timer.current);
  }, [
    memos,
    todos,
    freeNote,
    dayStrokes,
    weekStrokes,
    weekStrokesWide,
    weekNotes,
    weekDaysData,
    monthStrokes,
    saveNow,
  ]);

  // flush when leaving / backgrounding
  useEffect(() => {
    const flush = () => {
      if (dirtyRef.current) saveNow();
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [saveNow]);

  // ---------- load per view + anchor ----------
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      if (view === "day") {
        let d = { memos: {}, todos: null, freeNote: "", strokes: [] };
        try {
          const res = await window.storage.get(dayKey(dateStr));
          if (res && res.value) {
            const parsed = JSON.parse(res.value);
            let strokes = parsed.strokes || [];
            if (parsed.v !== 2) {
              // v1 records were saved before the to-do block existed:
              // shift handwriting below the header down to match the new layout
              strokes = strokes.map((s) => ({
                ...s,
                points: s.points.map((pt) =>
                  pt.y >= HEAD_H + RULE_H
                    ? { x: pt.x, y: +(pt.y + V1_SHIFT).toFixed(1) }
                    : pt
                ),
              }));
            }
            d = {
              memos: parsed.memos || {},
              todos: parsed.todos || null,
              freeNote: parsed.freeNote || "",
              strokes,
            };
          }
        } catch (err) {
          /* fresh day */
        }
        if (!alive) return;
        skipSaveRef.current = true;
        dirtyRef.current = false;
        setMemos({ ...d.memos });
        setTodos(normalizeTodos(d.todos));
        setFreeNote(d.freeNote);
        setDayStrokes([...d.strokes]);
        updateIdx(dateStr, d.memos, d.freeNote, normalizeTodos(d.todos));
      } else if (view === "week") {
        const ws = parseDS(weekStartStr);
        const days = Array.from({ length: 7 }, (_, i) => fmt(addDays(ws, i)));
        const yms = [...new Set(days.map((ds) => ds.slice(0, 7)))];
        let strokes = [];
        let strokesWide = [];
        let notes = {};
        const idxByYm = {};
        const dayRecs = {};
        await Promise.all([
          ...(wide
            ? days.map(async (ds2) => {
                try {
                  const r = await window.storage.get(dayKey(ds2));
                  dayRecs[ds2] = migrateDayRecord(
                    r && r.value ? JSON.parse(r.value) : null
                  );
                } catch (err) {
                  dayRecs[ds2] = migrateDayRecord(null);
                }
              })
            : []),
          (async () => {
            try {
              const r = await window.storage.get(wkKey(weekStartStr));
              if (r && r.value) {
                const parsed = JSON.parse(r.value);
                strokes = parsed.strokes || [];
                strokesWide = parsed.strokesWide || [];
                notes = parsed.notes || {};
              }
            } catch (err) {
              /* fresh week */
            }
          })(),
          ...yms.map(async (ym) => {
            try {
              const r = await window.storage.get(idxKey(ym));
              idxByYm[ym] = r && r.value ? JSON.parse(r.value) || {} : {};
            } catch (err) {
              idxByYm[ym] = {};
            }
          }),
        ]);
        if (!alive) return;
        yms.forEach((ym) => idxCache.current.set(ym, idxByYm[ym]));
        const wi = {};
        days.forEach((ds) => {
          const e = (idxByYm[ds.slice(0, 7)] || {})[ds.slice(8)];
          if (e) wi[ds] = e;
        });
        skipSaveRef.current = true;
        dirtyRef.current = false;
        setWeekIdx(wi);
        setWeekNotes({ ...notes });
        setWeekDaysData(dayRecs);
        weekDirtyRef.current = new Set();
        setWeekStrokes([...strokes]);
        setWeekStrokesWide([...strokesWide]);
      } else {
        let strokes = [];
        let idx = {};
        await Promise.all([
          (async () => {
            try {
              const r = await window.storage.get(moKey(monthYM));
              if (r && r.value) strokes = JSON.parse(r.value).strokes || [];
            } catch (err) {
              /* fresh month */
            }
          })(),
          (async () => {
            try {
              const r = await window.storage.get(idxKey(monthYM));
              idx = r && r.value ? JSON.parse(r.value) || {} : {};
            } catch (err) {
              idx = {};
            }
          })(),
        ]);
        if (!alive) return;
        idxCache.current.set(monthYM, idx);
        skipSaveRef.current = true;
        dirtyRef.current = false;
        setMonthIdx(idx);
        setMonthStrokes([...strokes]);
      }
      setSaveState("idle");
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [view, dateStr, weekStartStr, monthYM, wide, updateIdx]);

  // ---------- navigation (flush pending save first) ----------
  const flushThen = (fn) => {
    clearTimeout(timer.current);
    if (dirtyRef.current) {
      saveNow().finally(fn);
    } else {
      fn();
    }
  };
  const go = (nd) => flushThen(() => setDate(nd));
  const switchView = (v) => flushThen(() => setView(v));
  const openDay = (ds) =>
    flushThen(() => {
      setDate(parseDS(ds));
      setView("day");
      setMode("text");
    });
  const shift = (n) => {
    if (view === "day") return go(addDays(date, n));
    if (view === "week") return go(addDays(date, 7 * n));
    const y = date.getFullYear();
    const m = date.getMonth() + n;
    const dom = Math.min(date.getDate(), daysInMonth(y, m));
    go(new Date(y, m, dom));
  };
  const onPick = (e) => {
    const v = e.target.value;
    if (!v) return;
    go(parseDS(v));
  };

  // ---------- drawing ----------
  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: Math.round((((e.clientX - rect.left) * pageW) / rect.width) * 10) / 10,
      y: Math.round((((e.clientY - rect.top) * pageH) / rect.height) * 10) / 10,
    };
  };

  const eraseAt = (p) => {
    setCurStrokes((prev) => {
      const R2 = 15 * 15;
      const keep = prev.filter(
        (s) =>
          !s.points.some((pt) => {
            const dx = pt.x - p.x;
            const dy = pt.y - p.y;
            return dx * dx + dy * dy < R2;
          })
      );
      return keep.length === prev.length ? prev : keep;
    });
  };

  const onPointerDown = (e) => {
    if (mode === "text" || loading) return;
    if (drawMode && palm && e.pointerType === "touch") return;
    e.preventDefault();
    if (canvasRef.current.setPointerCapture) {
      try {
        canvasRef.current.setPointerCapture(e.pointerId);
      } catch (err) {
        /* ignore */
      }
    }
    const p = getPos(e);
    if (drawMode) {
      const hl = mode === "hl";
      live.current = {
        color: hl ? hlColor : color,
        width: hl ? HL_WIDTH : width,
        ...(hl ? { hl: true } : {}),
        points: [p],
      };
      if (!hl) {
        const ctx = canvasRef.current.getContext("2d");
        ctx.fillStyle = live.current.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, live.current.width / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      lastErase.current = null;
      eraseAt(p);
    }
  };

  const onPointerMove = (e) => {
    if (mode === "text" || loading) return;
    if (drawMode) {
      if (!live.current) return;
      const p = getPos(e);
      const pts = live.current.points;
      const last = pts[pts.length - 1];
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      if (dx * dx + dy * dy < 2) return;
      pts.push(p);
      const ctx = canvasRef.current.getContext("2d");
      ctx.strokeStyle = live.current.color;
      ctx.lineWidth = live.current.width;
      ctx.lineCap = live.current.hl ? "butt" : "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else {
      if (e.buttons === 0) return;
      const p = getPos(e);
      const le = lastErase.current;
      if (le) {
        const dx = p.x - le.x;
        const dy = p.y - le.y;
        if (dx * dx + dy * dy < 16) return;
      }
      lastErase.current = p;
      eraseAt(p);
    }
  };

  const onPointerUp = () => {
    if (live.current) {
      const s = live.current;
      live.current = null;
      if (s.points.length > 0) setCurStrokes((prev) => [...prev, s]);
    }
  };

  // ---------- two-finger pinch zoom on the page area ----------
  const onWrapPointerDown = (e) => {
    if (e.pointerType !== "touch") return;
    const P = pinchRef.current;
    P.pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (P.pts.size === 2) {
      const [a, b] = [...P.pts.values()];
      P.d0 = Math.hypot(a[0] - b[0], a[1] - b[1]);
      P.z0 = zoomRef.current;
      if (live.current) {
        live.current = null;
        setCurStrokes((s) => [...s]);
      }
    }
  };
  const onWrapPointerMove = (e) => {
    if (e.pointerType !== "touch") return;
    const P = pinchRef.current;
    if (!P.pts.has(e.pointerId)) return;
    P.pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (P.pts.size === 2 && P.d0 > 0) {
      const [a, b] = [...P.pts.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const z = Math.min(2.5, Math.max(0.6, (P.z0 * d) / P.d0));
      setZoom(+z.toFixed(3));
    }
  };
  const onWrapPointerEnd = (e) => {
    const P = pinchRef.current;
    P.pts.delete(e.pointerId);
    if (P.pts.size < 2) P.d0 = 0;
  };

  // ---------- small UI helpers ----------
  const statusText =
    saveState === "saving"
      ? "저장 중…"
      : saveState === "saved"
      ? "저장됨"
      : saveState === "error"
      ? "저장 실패"
      : "";

  const navLabel = (() => {
    if (view === "day")
      return `${date.getMonth() + 1}월 ${date.getDate()}일 (${WD_SHORT[date.getDay()]})`;
    if (view === "week") {
      const ws = startOfWeek(date);
      const we = addDays(ws, 6);
      return `${ws.getMonth() + 1}.${ws.getDate()} – ${we.getMonth() + 1}.${we.getDate()}`;
    }
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
  })();

  const segBtn = (active) => ({
    display: "flex",
    alignItems: "center",
    gap: 5,
    border: "none",
    borderRadius: 999,
    padding: "6px 11px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
    background: active ? "#fff" : "transparent",
    color: active ? INK : "#8b877e",
    boxShadow: active ? "0 1px 2px rgba(0,0,0,.08)" : "none",
  });

  const segWrap = {
    display: "flex",
    background: "#eceae4",
    borderRadius: 999,
    padding: 3,
    gap: 2,
    flexShrink: 0,
  };

  const iconBtn = {
    width: 34,
    height: 34,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    borderRadius: 8,
    cursor: "pointer",
    color: INK,
    flexShrink: 0,
  };

  const selectStyle = {
    border: `1px solid ${HAIR}`,
    background: "#fff",
    borderRadius: 6,
    padding: "4px 6px",
    fontSize: 12.5,
    color: INK,
    fontFamily: "inherit",
  };

  const wdColor = (dow) => (dow === 0 ? RED : dow === 6 ? BLUE : FAINT);

  const paperHeader = (() => {
    if (view === "day")
      return {
        big: String(date.getDate()),
        top: `${date.getFullYear()} · ${date.getMonth() + 1}월`,
        bottom: WD_LONG[date.getDay()],
        holiday: holidayOf(dateStr),
        mark: isToday,
      };
    if (view === "week") {
      const ws = startOfWeek(date);
      const we = addDays(ws, 6);
      return {
        big: `${ws.getMonth() + 1}.${ws.getDate()}–${we.getMonth() + 1}.${we.getDate()}`,
        bigSize: 30,
        top: `${date.getFullYear()}`,
        bottom: "주간",
        mark: fmt(startOfWeek(new Date())) === weekStartStr,
      };
    }
    return {
      big: String(date.getMonth() + 1),
      top: `${date.getFullYear()}`,
      bottom: "월간",
      mark: ymOf(new Date()) === monthYM,
    };
  })();

  const monthCells = (() => {
    if (view !== "month") return [];
    const y = date.getFullYear();
    const m = date.getMonth();
    const off = new Date(y, m, 1).getDay();
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(y, m, 1 - off + i);
      return { d, ds: fmt(d), inMonth: d.getMonth() === m };
    });
  })();

  const weekDays = (() => {
    if (view !== "week") return [];
    const ws = parseDS(weekStartStr);
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  })();

  const activePalette = mode === "hl" ? HL_COLORS : PEN_COLORS;
  const activeColor = mode === "hl" ? hlColor : color;
  const setActiveColor = mode === "hl" ? setHlColor : setColor;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: BG,
        color: INK,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", Pretendard, "Noto Sans KR", "Segoe UI", sans-serif',
      }}
    >
      {/* ---------- sticky toolbar ---------- */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          background: "rgba(244,243,239,.92)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderBottom: `1px solid ${HAIR}`,
          padding: "10px 10px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {/* row 1 — date navigation */}
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button style={iconBtn} onClick={() => shift(-1)} aria-label="이전">
            <ChevronLeft size={19} />
          </button>
          <div
            style={{
              position: "relative",
              padding: "5px 8px",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
            }}
          >
            {navLabel}
            <input
              type="date"
              value={dateStr}
              onChange={onPick}
              aria-label="날짜 선택"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                opacity: 0,
                cursor: "pointer",
              }}
            />
          </div>
          <button style={iconBtn} onClick={() => shift(1)} aria-label="다음">
            <ChevronRight size={19} />
          </button>
          <button
            style={{ ...iconBtn, color: miniOpen ? INK : "#8b877e" }}
            onClick={() => {
              setMiniMonth(new Date(date));
              setMiniOpen((o) => !o);
            }}
            aria-label="미니 달력"
          >
            <CalendarDays size={17} />
          </button>
          <div style={{ flex: 1 }} />
          <span
            style={{
              fontSize: 12,
              color: saveState === "error" ? RED : FAINT,
              marginRight: 8,
              whiteSpace: "nowrap",
            }}
          >
            {statusText}
          </span>
          {!isToday && (
            <button
              onClick={() => go(new Date())}
              style={{
                border: `1px solid ${HAIR}`,
                background: "#fff",
                borderRadius: 999,
                padding: "5px 12px",
                fontSize: 12.5,
                fontWeight: 600,
                color: INK,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              오늘
            </button>
          )}
        </div>

        {miniOpen && (
          <div style={{ padding: "0 6px 4px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                marginBottom: 4,
              }}
            >
              <button
                style={{ ...iconBtn, width: 26, height: 26 }}
                aria-label="미니 이전 달"
                onClick={() =>
                  setMiniMonth(
                    (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1)
                  )
                }
              >
                <ChevronLeft size={15} />
              </button>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                {miniMonth.getFullYear()}년 {miniMonth.getMonth() + 1}월
              </span>
              <button
                style={{ ...iconBtn, width: 26, height: 26 }}
                aria-label="미니 다음 달"
                onClick={() =>
                  setMiniMonth(
                    (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)
                  )
                }
              >
                <ChevronRight size={15} />
              </button>
            </div>
            <div style={{ display: "flex" }}>
              {WD_SHORT.map((w, i) => (
                <div
                  key={w}
                  style={{
                    width: `${100 / 7}%`,
                    textAlign: "center",
                    fontSize: 9.5,
                    color: wdColor(i),
                    paddingBottom: 2,
                  }}
                >
                  {w}
                </div>
              ))}
            </div>
            {(() => {
              const y = miniMonth.getFullYear();
              const m = miniMonth.getMonth();
              const off = new Date(y, m, 1).getDay();
              const rows = Math.ceil((off + daysInMonth(y, m)) / 7);
              return Array.from({ length: rows }, (_, r) => (
                <div key={r} style={{ display: "flex" }}>
                  {Array.from({ length: 7 }, (_, c) => {
                    const d = new Date(y, m, 1 - off + r * 7 + c);
                    const ds = fmt(d);
                    const inM = d.getMonth() === m;
                    const hol = holidayOf(ds);
                    const today = ds === todayStr;
                    const sel = ds === dateStr;
                    return (
                      <button
                        key={c}
                        aria-label={ds}
                        onClick={() => {
                          go(d);
                          setMiniOpen(false);
                        }}
                        style={{
                          width: `${100 / 7}%`,
                          height: 27,
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 0,
                        }}
                      >
                        <span
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            fontVariantNumeric: "tabular-nums",
                            color: sel
                              ? "#fff"
                              : !inM
                              ? "#d5d2c8"
                              : hol || d.getDay() === 0
                              ? RED
                              : d.getDay() === 6
                              ? BLUE
                              : INK,
                            background: sel ? INK : "transparent",
                            boxShadow:
                              today && !sel
                                ? `inset 0 0 0 1.5px ${RED}`
                                : "none",
                          }}
                        >
                          {d.getDate()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        )}

        {/* row 2 — view + tools */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            overflowX: "auto",
            paddingBottom: 2,
          }}
        >
          <div style={segWrap}>
            {[
              ["day", "일"],
              ["week", "주"],
              ["month", "월"],
            ].map(([v, label]) => (
              <button key={v} style={segBtn(view === v)} onClick={() => switchView(v)}>
                {label}
              </button>
            ))}
          </div>

          <div style={segWrap}>
            <button style={segBtn(mode === "text")} onClick={() => setMode("text")}>
              <Type size={14} /> 입력
            </button>
            <button style={segBtn(mode === "pen")} onClick={() => setMode("pen")}>
              <Pen size={14} /> 펜
            </button>
            <button style={segBtn(mode === "hl")} onClick={() => setMode("hl")}>
              <Highlighter size={14} /> 형광
            </button>
            <button style={segBtn(mode === "eraser")} onClick={() => setMode("eraser")}>
              <Eraser size={14} /> 지우개
            </button>
          </div>

          {drawMode && (
            <>
              <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
                {activePalette.map((c) => (
                  <button
                    key={c}
                    onClick={() => setActiveColor(c)}
                    aria-label={`색상 ${c}`}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: c,
                      border: "2px solid #fff",
                      boxShadow:
                        activeColor === c ? `0 0 0 2px ${c}` : "0 0 0 1px #d8d5cd",
                      cursor: "pointer",
                      padding: 0,
                      flexShrink: 0,
                    }}
                  />
                ))}
              </div>
              {mode === "pen" && (
                <div style={segWrap}>
                  {PEN_WIDTHS.map((w) => (
                    <button
                      key={w}
                      onClick={() => setWidth(w)}
                      aria-label={`펜 굵기 ${w}`}
                      style={{
                        width: 28,
                        height: 26,
                        borderRadius: 999,
                        border: "none",
                        background: width === w ? "#fff" : "transparent",
                        boxShadow:
                          width === w ? "0 1px 2px rgba(0,0,0,.08)" : "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                      }}
                    >
                      <span
                        style={{
                          width: w * 3,
                          height: w * 3,
                          borderRadius: "50%",
                          background: INK,
                          display: "block",
                        }}
                      />
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setPalm((p) => !p)}
                style={{
                  border: `1px solid ${palm ? "#c3cde8" : "#ddd9d0"}`,
                  background: palm ? "#e8ecf6" : "transparent",
                  color: palm ? BLUE : "#8b877e",
                  borderRadius: 999,
                  padding: "5px 11px",
                  fontSize: 12.5,
                  fontWeight: 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                펜 전용
              </button>
              <button
                style={{
                  ...iconBtn,
                  width: 32,
                  height: 30,
                  opacity: curStrokes.length ? 1 : 0.3,
                }}
                disabled={!curStrokes.length}
                onClick={() => setCurStrokes((s) => s.slice(0, -1))}
                aria-label="마지막 획 취소"
              >
                <Undo2 size={17} />
              </button>
            </>
          )}

          <div style={{ flex: 1 }} />
          <button
            style={{ ...iconBtn, width: 30, height: 30 }}
            aria-label="축소"
            onClick={() => setZoom((z) => Math.max(0.6, +(z / 1.2).toFixed(3)))}
          >
            <ZoomOut size={16} />
          </button>
          <button
            aria-label="배율 초기화"
            onClick={() => setZoom(1)}
            style={{
              border: "none",
              background: "transparent",
              fontSize: 11,
              color: zoom === 1 ? "#8b877e" : INK,
              cursor: "pointer",
              padding: "0 2px",
              fontVariantNumeric: "tabular-nums",
              fontFamily: "inherit",
              flexShrink: 0,
            }}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            style={{ ...iconBtn, width: 30, height: 30 }}
            aria-label="확대"
            onClick={() => setZoom((z) => Math.min(2.5, +(z * 1.2).toFixed(3)))}
          >
            <ZoomIn size={16} />
          </button>
          <button
            style={{ ...iconBtn, width: 32, height: 30, color: settingsOpen ? INK : "#8b877e" }}
            onClick={() => setSettingsOpen((o) => !o)}
            aria-label="설정"
          >
            <Settings size={17} />
          </button>
        </div>

        {/* row 3 — settings */}
        {settingsOpen && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              fontSize: 12.5,
              paddingTop: 2,
            }}
          >
            <span style={{ color: FAINT }}>표시 시간</span>
            <select
              value={settings.dayStart}
              onChange={(e) => {
                const ds = Number(e.target.value);
                setSettings((s) => ({
                  dayStart: ds,
                  dayEnd: Math.max(s.dayEnd, ds + 1),
                }));
              }}
              style={selectStyle}
              aria-label="시작 시간"
            >
              {Array.from({ length: 23 }, (_, h) => (
                <option key={h} value={h}>
                  {pad2(h)}시
                </option>
              ))}
            </select>
            <span style={{ color: FAINT }}>–</span>
            <select
              value={settings.dayEnd}
              onChange={(e) =>
                setSettings((s) => ({ ...s, dayEnd: Number(e.target.value) }))
              }
              style={selectStyle}
              aria-label="종료 시간"
            >
              {Array.from(
                { length: 23 - settings.dayStart },
                (_, i) => settings.dayStart + 1 + i
              ).map((h) => (
                <option key={h} value={h}>
                  {pad2(h)}시
                </option>
              ))}
            </select>
            <span style={{ fontSize: 11, color: FAINT }}>
              * 범위를 바꾸면 기존 필기 위치가 어긋날 수 있어요
            </span>
          </div>
        )}
      </div>

      {/* ---------- paper page ---------- */}
      <div
        ref={outerRef}
        onPointerDown={onWrapPointerDown}
        onPointerMove={onWrapPointerMove}
        onPointerUp={onWrapPointerEnd}
        onPointerCancel={onWrapPointerEnd}
        style={{
          padding: "14px 4px 48px",
          overflowX: "auto",
          touchAction: "pan-x pan-y",
        }}
      >
        <div
          style={{
            width: pageW * scale,
            height: pageH * scale,
            margin: "0 auto",
          }}
        >
          <div
            style={{
              width: pageW,
              height: pageH,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              background: PAPER,
              position: "relative",
              border: `1px solid ${HAIR}`,
              borderRadius: 3,
              boxShadow: "0 10px 30px rgba(40,36,28,.07)",
            }}
          >
            {/* paper header */}
            <div
              style={{
                height: HEAD_H,
                display: "flex",
                alignItems: "flex-end",
                padding: "0 20px 10px",
                gap: 14,
              }}
            >
              <div
                style={{
                  fontFamily: 'Georgia, "Times New Roman", serif',
                  fontSize: paperHeader.bigSize || 52,
                  lineHeight: 1,
                  fontWeight: 400,
                  color: INK,
                }}
              >
                {paperHeader.big}
              </div>
              <div style={{ paddingBottom: 4 }}>
                <div style={{ fontSize: 11, letterSpacing: "0.14em", color: FAINT }}>
                  {paperHeader.top}
                </div>
                <div style={{ fontSize: 15, fontWeight: 500, marginTop: 3 }}>
                  {paperHeader.bottom}
                  {paperHeader.holiday && (
                    <span style={{ color: RED, marginLeft: 8, fontSize: 13 }}>
                      {paperHeader.holiday}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ flex: 1 }} />
              {paperHeader.mark && (
                <div
                  style={{
                    paddingBottom: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: RED,
                      display: "block",
                    }}
                  />
                  <span style={{ fontSize: 12, color: FAINT }}>
                    {view === "day" ? "오늘" : view === "week" ? "이번 주" : "이번 달"}
                  </span>
                </div>
              )}
            </div>

            {/* double rule */}
            <div style={{ height: RULE_H, padding: "0 16px" }}>
              <div style={{ borderTop: `1.5px solid ${INK}` }} />
              <div style={{ borderTop: `1px solid ${HAIR}`, marginTop: 3 }} />
            </div>

            {/* ============ DAY VIEW ============ */}
            {view === "day" && (
              <>
                <div
                  style={{
                    height: TODO_LABEL_H,
                    display: "flex",
                    alignItems: "flex-end",
                    padding: "0 18px 6px",
                    fontSize: 11,
                    letterSpacing: "0.16em",
                    color: FAINT,
                  }}
                >
                  TO-DO
                </div>
                {todos.map((td, i) => (
                  <div
                    key={i}
                    style={{
                      height: TODO_ROW_H,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "0 18px",
                      borderBottom: "1px solid #f6f4ee",
                      boxSizing: "border-box",
                    }}
                  >
                    <button
                      disabled={loading}
                      onClick={() =>
                        setTodos((arr) =>
                          arr.map((x, j) =>
                            j === i ? { ...x, done: !x.done } : x
                          )
                        )
                      }
                      aria-label={`할 일 ${i + 1} 완료 표시`}
                      style={{
                        width: 17,
                        height: 17,
                        borderRadius: "50%",
                        flexShrink: 0,
                        border: td.done ? `1.5px solid ${INK}` : "1.5px solid #cfccc2",
                        background: td.done ? INK : "transparent",
                        color: "#fff",
                        fontSize: 10,
                        lineHeight: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      {td.done ? "✓" : ""}
                    </button>
                    <input
                      value={td.t}
                      disabled={loading}
                      onChange={(e) =>
                        setTodos((arr) =>
                          arr.map((x, j) =>
                            j === i ? { ...x, t: e.target.value } : x
                          )
                        )
                      }
                      style={{
                        flex: 1,
                        minWidth: 0,
                        border: "none",
                        outline: "none",
                        background: "transparent",
                        fontSize: 14,
                        fontFamily: "inherit",
                        color: td.done ? FAINT : INK,
                        textDecoration: td.done ? "line-through" : "none",
                      }}
                    />
                  </div>
                ))}
                <div style={{ height: SPACER_H }} />

                <div style={{ borderTop: "1px solid #eceae2" }}>
                  {hours.map((h) => (
                    <div
                      key={h}
                      style={{
                        display: "flex",
                        alignItems: "stretch",
                        height: ROW_H,
                        borderBottom: "1px solid #f1efe9",
                      }}
                    >
                      <div
                        style={{
                          width: 54,
                          display: "flex",
                          justifyContent: "flex-end",
                          alignItems: "flex-start",
                          paddingTop: 8,
                          paddingRight: 10,
                          fontSize: 12,
                          color: FAINT,
                          fontVariantNumeric: "tabular-nums",
                          flexShrink: 0,
                        }}
                      >
                        {pad2(h)}:00
                      </div>
                      <div style={{ width: 1, background: "#eceae2", flexShrink: 0 }} />
                      <textarea
                        value={memos[h] || ""}
                        disabled={loading}
                        onChange={(e) =>
                          setMemos((m) => ({ ...m, [h]: e.target.value }))
                        }
                        style={{
                          flex: 1,
                          height: "100%",
                          boxSizing: "border-box",
                          border: "none",
                          outline: "none",
                          resize: "none",
                          overflowY: "auto",
                          background: "transparent",
                          padding: "8px 14px",
                          fontSize: 14.5,
                          lineHeight: 1.45,
                          color: INK,
                          fontFamily: "inherit",
                          minWidth: 0,
                          display: "block",
                        }}
                      />
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    height: NOTE_LABEL_H,
                    display: "flex",
                    alignItems: "flex-end",
                    padding: "0 18px 8px",
                    fontSize: 11,
                    letterSpacing: "0.16em",
                    color: FAINT,
                  }}
                >
                  MEMO
                </div>
                <textarea
                  value={freeNote}
                  disabled={loading}
                  onChange={(e) => setFreeNote(e.target.value)}
                  style={{
                    display: "block",
                    width: "100%",
                    height: NOTE_H,
                    border: "none",
                    outline: "none",
                    resize: "none",
                    background: "transparent",
                    padding: "4px 18px",
                    fontSize: 15,
                    lineHeight: 1.7,
                    color: INK,
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                  }}
                />
              </>
            )}

            {/* ============ WEEK VIEW (wide: 7-day time grid) ============ */}
            {view === "week" && wide && (
              <>
                <div
                  style={{
                    display: "flex",
                    height: WK_COLHEAD,
                    borderBottom: "1px solid #eceae2",
                  }}
                >
                  <div style={{ width: WK_GUT, flexShrink: 0 }} />
                  {weekDays.map((d) => {
                    const ds = fmt(d);
                    const hol = holidayOf(ds);
                    const today = ds === todayStr;
                    return (
                      <div
                        key={ds}
                        onClick={
                          mode === "text" && !loading ? () => openDay(ds) : undefined
                        }
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "0 8px",
                          borderLeft: "1px solid #f1efe9",
                          background: today ? "#fbf9f1" : "transparent",
                          cursor: mode === "text" ? "pointer" : "default",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'Georgia, "Times New Roman", serif',
                            fontSize: 18,
                            width: 26,
                            height: 26,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            color: today ? "#fff" : hol ? RED : INK,
                            background: today ? RED : "transparent",
                          }}
                        >
                          {d.getDate()}
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <span
                            style={{
                              fontSize: 11,
                              color: hol ? RED : wdColor(d.getDay()),
                              display: "block",
                              lineHeight: 1.2,
                            }}
                          >
                            {WD_SHORT[d.getDay()]}
                          </span>
                          {hol && (
                            <span
                              style={{
                                fontSize: 8.5,
                                color: RED,
                                display: "block",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                lineHeight: 1.3,
                              }}
                            >
                              {hol}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {Array.from({ length: WK_TODO_ROWS }, (_, r) => (
                  <div
                    key={"td" + r}
                    style={{
                      display: "flex",
                      height: WK_TODO_ROW_H,
                      borderBottom:
                        r === WK_TODO_ROWS - 1
                          ? "1px solid #eceae2"
                          : "1px solid #f6f4ee",
                    }}
                  >
                    <div
                      style={{
                        width: WK_GUT,
                        flexShrink: 0,
                        display: "flex",
                        justifyContent: "flex-end",
                        alignItems: "center",
                        paddingRight: 6,
                      }}
                    >
                      {r === 0 && (
                        <span
                          style={{
                            fontSize: 7.5,
                            letterSpacing: "0.08em",
                            color: FAINT,
                          }}
                        >
                          TO-DO
                        </span>
                      )}
                    </div>
                    {weekDays.map((d) => {
                      const ds = fmt(d);
                      const rec = weekDaysData[ds];
                      const td = rec ? rec.todos[r] : null;
                      const today = ds === todayStr;
                      return (
                        <div
                          key={ds}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "0 5px",
                            borderLeft: "1px solid #f1efe9",
                            background: today ? "#fbf9f1" : "transparent",
                          }}
                        >
                          <button
                            disabled={loading || !rec}
                            aria-label="할 일 완료"
                            onClick={() => {
                              weekDirtyRef.current.add(ds);
                              setWeekDaysData((prev) => ({
                                ...prev,
                                [ds]: {
                                  ...prev[ds],
                                  todos: prev[ds].todos.map((x, j) =>
                                    j === r ? { ...x, done: !x.done } : x
                                  ),
                                },
                              }));
                            }}
                            style={{
                              width: 11,
                              height: 11,
                              borderRadius: "50%",
                              flexShrink: 0,
                              padding: 0,
                              cursor: "pointer",
                              border:
                                td && td.done
                                  ? `1.5px solid ${INK}`
                                  : "1.5px solid #cfccc2",
                              background: td && td.done ? INK : "transparent",
                            }}
                          />
                          <input
                            value={(td && td.t) || ""}
                            disabled={loading || !rec}
                            onChange={(ev) => {
                              const v = ev.target.value;
                              weekDirtyRef.current.add(ds);
                              setWeekDaysData((prev) => ({
                                ...prev,
                                [ds]: {
                                  ...prev[ds],
                                  todos: prev[ds].todos.map((x, j) =>
                                    j === r ? { ...x, t: v } : x
                                  ),
                                },
                              }));
                            }}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              border: "none",
                              outline: "none",
                              background: "transparent",
                              fontSize: 10.5,
                              fontFamily: "inherit",
                              color: td && td.done ? FAINT : INK,
                              textDecoration:
                                td && td.done ? "line-through" : "none",
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}

                {hours.map((h) => (
                  <div
                    key={h}
                    style={{
                      display: "flex",
                      height: WK_HR_H,
                      borderBottom: "1px solid #f4f2ec",
                    }}
                  >
                    <div
                      style={{
                        width: WK_GUT,
                        flexShrink: 0,
                        display: "flex",
                        justifyContent: "flex-end",
                        alignItems: "flex-start",
                        paddingRight: 6,
                        paddingTop: 3,
                        fontSize: 10,
                        color: FAINT,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {pad2(h)}
                    </div>
                    {weekDays.map((d) => {
                      const ds = fmt(d);
                      const rec = weekDaysData[ds];
                      const today = ds === todayStr;
                      return (
                        <div
                          key={ds}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            borderLeft: "1px solid #f1efe9",
                            background: today ? "#fbf9f1" : "transparent",
                          }}
                        >
                          <textarea
                            value={(rec && rec.memos[h]) || ""}
                            disabled={loading || !rec}
                            onChange={(ev) => {
                              const v = ev.target.value;
                              weekDirtyRef.current.add(ds);
                              setWeekDaysData((prev) => ({
                                ...prev,
                                [ds]: {
                                  ...prev[ds],
                                  memos: { ...prev[ds].memos, [h]: v },
                                },
                              }));
                            }}
                            style={{
                              width: "100%",
                              height: "100%",
                              boxSizing: "border-box",
                              border: "none",
                              outline: "none",
                              resize: "none",
                              overflowY: "auto",
                              background: "transparent",
                              padding: "3px 6px",
                              fontSize: 10.5,
                              lineHeight: 1.4,
                              color: INK,
                              fontFamily: "inherit",
                              display: "block",
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}

                <div
                  style={{
                    display: "flex",
                    height: WK_NOTE_H,
                    borderTop: "1px solid #eceae2",
                  }}
                >
                  <div
                    style={{
                      width: WK_GUT,
                      flexShrink: 0,
                      display: "flex",
                      justifyContent: "flex-end",
                      paddingRight: 6,
                      paddingTop: 6,
                    }}
                  >
                    <span
                      style={{ fontSize: 8.5, letterSpacing: "0.1em", color: FAINT }}
                    >
                      메모
                    </span>
                  </div>
                  {weekDays.map((d) => {
                    const ds = fmt(d);
                    return (
                      <textarea
                        key={ds}
                        value={weekNotes[ds] || ""}
                        disabled={loading}
                        onChange={(ev) =>
                          setWeekNotes((n) => ({ ...n, [ds]: ev.target.value }))
                        }
                        style={{
                          flex: 1,
                          minWidth: 0,
                          boxSizing: "border-box",
                          border: "none",
                          borderLeft: "1px solid #f1efe9",
                          outline: "none",
                          resize: "none",
                          background: "transparent",
                          padding: "5px 6px",
                          fontSize: 10.5,
                          lineHeight: 1.55,
                          color: INK,
                          fontFamily: "inherit",
                        }}
                      />
                    );
                  })}
                </div>
              </>
            )}

            {/* ============ WEEK VIEW (narrow: vertical rows) ============ */}
            {view === "week" &&
              !wide &&
              weekDays.map((d) => {
                const ds = fmt(d);
                const e = weekIdx[ds];
                const shown = e ? e.p.slice(0, 3) : [];
                const more = e ? e.n - shown.length : 0;
                const today = ds === todayStr;
                const hol = holidayOf(ds);
                return (
                  <div
                    key={ds}
                    style={{
                      display: "flex",
                      height: WEEK_ROW_H,
                      borderBottom: "1px solid #f1efe9",
                    }}
                  >
                    <div
                      onClick={
                        mode === "text" && !loading ? () => openDay(ds) : undefined
                      }
                      style={{
                        width: 64,
                        flexShrink: 0,
                        paddingTop: 14,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 2,
                        cursor: mode === "text" ? "pointer" : "default",
                      }}
                    >
                      <div
                        style={{ fontSize: 11, color: hol ? RED : wdColor(d.getDay()) }}
                      >
                        {WD_SHORT[d.getDay()]}
                      </div>
                      <div
                        style={{
                          fontFamily: 'Georgia, "Times New Roman", serif',
                          fontSize: 24,
                          color: today ? "#fff" : hol ? RED : INK,
                          background: today ? RED : "transparent",
                          borderRadius: "50%",
                          width: 34,
                          height: 34,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {d.getDate()}
                      </div>
                      {hol && (
                        <div
                          style={{
                            fontSize: 8.5,
                            color: RED,
                            maxWidth: 60,
                            textAlign: "center",
                            lineHeight: 1.3,
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {hol}
                        </div>
                      )}
                    </div>
                    <div style={{ width: 1, background: "#eceae2", flexShrink: 0 }} />
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: "12px 14px 8px",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <div style={{ flexShrink: 0 }}>
                        {shown.map((line, i) => (
                          <div
                            key={i}
                            style={{
                              fontSize: 12.5,
                              lineHeight: 1.6,
                              color: "#6f6b62",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {line}
                          </div>
                        ))}
                        {more > 0 && (
                          <div style={{ fontSize: 11, color: FAINT }}>+{more}</div>
                        )}
                      </div>
                      <textarea
                        value={weekNotes[ds] || ""}
                        disabled={loading}
                        onChange={(ev) =>
                          setWeekNotes((n) => ({ ...n, [ds]: ev.target.value }))
                        }
                        placeholder=""
                        style={{
                          flex: 1,
                          width: "100%",
                          boxSizing: "border-box",
                          border: "none",
                          outline: "none",
                          resize: "none",
                          background: "transparent",
                          padding: "4px 0 2px",
                          fontSize: 12.5,
                          lineHeight: 1.6,
                          color: INK,
                          fontFamily: "inherit",
                        }}
                      />
                    </div>
                  </div>
                );
              })}

            {/* ============ MONTH VIEW ============ */}
            {view === "month" && (
              <>
                <div style={{ display: "flex", height: M_WD_H, alignItems: "center" }}>
                  {[0, 1, 2, 3, 4, 5, 6].map((dow) => (
                    <div
                      key={dow}
                      style={{
                        width: `${100 / 7}%`,
                        textAlign: "center",
                        fontSize: 11,
                        letterSpacing: "0.1em",
                        color: wdColor(dow),
                      }}
                    >
                      {WD_SHORT[dow]}
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    borderTop: "1px solid #f1efe9",
                  }}
                >
                  {monthCells.map(({ d, ds, inMonth }, i) => {
                    const e = inMonth ? monthIdx[pad2(d.getDate())] : null;
                    const today = ds === todayStr;
                    const hol = inMonth ? holidayOf(ds) : null;
                    return (
                      <div
                        key={ds + i}
                        onClick={
                          mode === "text" && !loading ? () => openDay(ds) : undefined
                        }
                        style={{
                          width: `${100 / 7}%`,
                          height: M_CELL_H,
                          boxSizing: "border-box",
                          borderBottom: "1px solid #f1efe9",
                          borderRight: i % 7 === 6 ? "none" : "1px solid #f6f4ee",
                          padding: "6px 0 0 8px",
                          cursor: mode === "text" ? "pointer" : "default",
                        }}
                      >
                        <div
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontVariantNumeric: "tabular-nums",
                            color: today
                              ? "#fff"
                              : hol
                              ? RED
                              : inMonth
                              ? INK
                              : "#d5d2c8",
                            background: today ? RED : "transparent",
                          }}
                        >
                          {d.getDate()}
                        </div>
                        {hol && (
                          <div
                            style={{
                              fontSize: 7.5,
                              color: RED,
                              marginTop: 2,
                              paddingLeft: 2,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {hol}
                          </div>
                        )}
                        {e && (
                          <div
                            style={{
                              display: "flex",
                              gap: 3,
                              marginTop: 6,
                              paddingLeft: 6,
                            }}
                          >
                            {Array.from({ length: Math.min(e.n, 3) }).map((_, j) => (
                              <span
                                key={j}
                                style={{
                                  width: 4,
                                  height: 4,
                                  borderRadius: "50%",
                                  background: INK,
                                  opacity: 0.4,
                                  display: "block",
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* handwriting layer (multiply blend: highlighter goes "behind" text) */}
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{
                position: "absolute",
                inset: 0,
                width: pageW,
                height: pageH,
                zIndex: 5,
                mixBlendMode: "multiply",
                pointerEvents: mode === "text" ? "none" : "auto",
                touchAction: mode === "text" ? "auto" : "none",
                cursor: drawMode ? "crosshair" : "default",
              }}
            />

            {loading && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 10,
                  background: "rgba(253,253,251,.65)",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "center",
                  paddingTop: 120,
                  fontSize: 13,
                  color: FAINT,
                }}
              >
                불러오는 중…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
