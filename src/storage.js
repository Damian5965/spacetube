// Local persistence: settings + run archive.

const KEY = 'spacetube.v1';

const DEFAULTS = {
  settings: {
    quality: 'medium',
    volume: 70,
    shake: true,
    reducedFlash: false,
  },
  records: [],
  best: 0,
  runs: 0,
};

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULTS),
      ...parsed,
      settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
      records: Array.isArray(parsed.records) ? parsed.records.slice(0, 10) : [],
    };
  } catch (err) {
    console.warn('[store] unreadable save, starting fresh', err);
    return structuredClone(DEFAULTS);
  }
}

class Store {
  constructor() {
    this.data = read();
    this.watchers = new Set();
  }

  onChange(fn) {
    this.watchers.add(fn);
    return () => this.watchers.delete(fn);
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (err) {
      console.warn('[store] could not save', err);
    }
    this.watchers.forEach((fn) => fn(this.data));
  }

  setSetting(key, value) {
    this.data.settings[key] = value;
    this.save();
  }

  addRun(run) {
    const entries = this.data.records;
    entries.push(run);
    entries.sort((a, b) => b.score - a.score);
    this.data.records = entries.slice(0, 8);
    this.data.runs = (this.data.runs || 0) + 1;
    const isRecord = run.score > this.data.best;
    if (isRecord) this.data.best = run.score;
    this.save();
    return { isRecord, rank: this.data.records.findIndex((r) => r === run) };
  }

  clearRecords() {
    this.data.records = [];
    this.data.best = 0;
    this.save();
  }
}

export const store = new Store();
export const defaultSettings = DEFAULTS.settings;
