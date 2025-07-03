import { App, Plugin, PluginSettingTab, Setting, Modal, Notice, TFile, WorkspaceLeaf, ItemView, DropdownComponent, normalizePath } from "obsidian";

interface PomodoroSettings {
  workMinutes: number;
  breakMinutes: number;
  logFilePath: string;
  popupMessage: string;
  language: string; // 추가: 언어 코드
}

const DEFAULT_SETTINGS: PomodoroSettings = {
  workMinutes: 25,
  breakMinutes: 5,
  logFilePath: "Pomodoro Log.md",
  popupMessage: "popupMessageDefault", // 다국어 키로 변경
  language: "en" // 기본값
};

type TimerState = "idle" | "running" | "paused";
type TimerMode = "work" | "break";
const VIEW_TYPE_POMODORO = "pomodoro-timer-view";
const SHARED_TIMER_PATH = ".pomodolog-timer.json";

export default class PomodoroPlugin extends Plugin {
  settings: PomodoroSettings = DEFAULT_SETTINGS;
  timerState: TimerState = "idle";
  remainingTime: number = 0;
  currentMode: TimerMode = "work";
  intervalId: number | null = null;
  statusBar: HTMLElement | null = null;
  floatingTimerEl: HTMLElement | null = null;
  breakBgIntervalId: number | null = null;
  rainbowBgIntervalId: number | null = null;
  rainbowColors: string[] = [
    "rgba(255,0,0,0.3)",    // 빨강
    "rgba(255,128,0,0.3)",  // 주황
    "rgba(255,255,0,0.3)",  // 노랑
    "rgba(0,255,0,0.3)",    // 초록
    "rgba(0,128,255,0.3)",  // 파랑
    "rgba(0,0,255,0.3)",    // 남색
    "rgba(128,0,255,0.3)"   // 보라
  ];
  rainbowIdx: number = 0;
  locale: Record<string, string> = {};
  sharedTimerMtime: number = 0;
  timerStartTime: number | null = null;

  async onload() {
    await this.loadSettings();
    await this.loadLocale();
    await this.loadTimerState();
    this.addSettingTab(new PomodoLogSettingTab(this.app, this));
    this.statusBar = this.addStatusBarItem();
    this.updateStatusBar();
    this.registerView(
      VIEW_TYPE_POMODORO,
      (leaf) => new PomodoLogView(leaf, this)
    );
    this.addRibbonIcon("clock", "PomodoLog", () => {
      this.activatePomodoroView();
    });
    this.createFloatingTimer();
    this.updatePauseButtonText(); // 플로팅 타이머 생성 후 버튼 텍스트 동기화
    // 1초마다 상태 저장 및 동기화
    setInterval(() => {
      this.saveTimerState();
      this.syncSharedTimerState();
    }, 1000);
    window.addEventListener("beforeunload", () => {
      this.saveTimerState();
      this.saveSharedTimerState();
    });
    // 포그라운드 복귀 시 타이머 만료 체크
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        this.checkTimerOnForeground();
      }
    });
  }

  // 기존 saveTimerState: 개인 saveData 저장 + 공유 파일 저장
  async saveTimerState() {
    const timerState = {
      timerStartTime: this.timerStartTime,
      timerState: this.timerState,
      remainingTime: this.remainingTime,
      currentMode: this.currentMode,
      lastCheck: Date.now()
    };
    await this.saveData({ ...this.settings, _timerState: timerState });
    await this.saveSharedTimerState();
  }

  // 공유 파일에 타이머 상태 저장
  async saveSharedTimerState() {
    const timerState = {
      timerStartTime: this.timerStartTime,
      timerState: this.timerState,
      remainingTime: this.remainingTime,
      currentMode: this.currentMode,
      lastCheck: Date.now()
    };
    const content = JSON.stringify(timerState);
    const path = normalizePath(SHARED_TIMER_PATH);
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      await this.app.vault.create(path, content);
      this.sharedTimerMtime = Date.now();
    } else if (file instanceof TFile) {
      await this.app.vault.modify(file, content);
      this.sharedTimerMtime = Date.now();
    }
  }

  // 공유 파일에서 타이머 상태 동기화
  async syncSharedTimerState() {
    const path = normalizePath(SHARED_TIMER_PATH);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) return;
    // 파일의 mtime이 내 마지막 저장 시각보다 최신이면 동기화
    const stat = await this.app.vault.adapter.stat(path);
    if (stat && stat.mtime > this.sharedTimerMtime) {
      const content = await this.app.vault.read(file);
      try {
        const t = JSON.parse(content);
        if (t && typeof t === "object" && t.lastCheck && t.lastCheck > 0) {
          // 내 상태보다 더 최신이면 동기화
          if (!this.timerState || t.lastCheck > (this as any)._lastCheckLocal) {
            this.timerState = t.timerState;
            this.remainingTime = t.remainingTime;
            this.currentMode = t.currentMode;
            (this as any)._lastCheckLocal = t.lastCheck;
            this.updateStatusBar();
          }
        }
      } catch {}
      this.sharedTimerMtime = stat.mtime;
    }
  }

  async loadTimerState() {
    const data = await this.loadData();
    if (data && data._timerState) {
      const t = data._timerState;
      // 마지막 체크 이후 경과 시간만큼 remainingTime에서 차감
      if (t.timerState === "running" && t.lastCheck) {
        const elapsed = Math.floor((Date.now() - t.lastCheck) / 1000);
        this.remainingTime = Math.max(0, t.remainingTime - elapsed);
        // running이었던 경우, 남은 시간이 있으면 paused로 복원
        this.timerState = this.remainingTime > 0 ? "paused" : "idle";
        this.currentMode = t.currentMode;
        this.updateStatusBar();
        this.updateFloatingTimerButtons();
      } else {
        this.timerState = t.timerState;
        this.remainingTime = t.remainingTime;
        this.currentMode = t.currentMode;
        this.updateStatusBar();
        this.updateFloatingTimerButtons();
      }
    }
  }

  public async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  public async saveSettings() {
    await this.saveData(this.settings);
  }

  async loadLocale() {
    const lang = this.settings.language || "ko";
    let base = "";
    // Obsidian 플러그인 환경에서의 경로 계산
    if ((this.app.vault.adapter as any).getResourcePath && (this as any).manifest?.dir) {
      base = (this.app.vault.adapter as any).getResourcePath((this as any).manifest.dir + `/locales/${lang}.json`);
    } else {
      base = `locales/${lang}.json`;
    }
    try {
      const res = await fetch(base);
      this.locale = await res.json();
    } catch {
      // fallback: ko
      let fallback = "";
      if ((this.app.vault.adapter as any).getResourcePath && (this as any).manifest?.dir) {
        fallback = (this.app.vault.adapter as any).getResourcePath((this as any).manifest.dir + `/locales/ko.json`);
      } else {
        fallback = `locales/ko.json`;
      }
      try {
        const res = await fetch(fallback);
        this.locale = await res.json();
      } catch {
        this.locale = {};
      }
    }
  }

  t(key: string): string {
    return this.locale[key] || key;
  }

  createFloatingTimer() {
    if (this.floatingTimerEl) this.floatingTimerEl.remove();
    const el = document.createElement("div");
    el.id = "pomodoro-floating-timer";
    el.style.position = "fixed";
    el.style.right = "32px";
    el.style.bottom = "32px";
    el.style.zIndex = "9999";
    el.style.background = "rgba(30,30,30,0.85)";
    el.style.color = "#fff";
    el.style.padding = "18px 24px";
    el.style.borderRadius = "16px";
    el.style.boxShadow = "0 4px 16px rgba(0,0,0,0.2)";
    el.style.display = "flex";
    el.style.flexDirection = "column";
    el.style.alignItems = "center";
    el.style.gap = "10px";
    el.style.fontSize = "1.2em";
    el.style.userSelect = "none";
    el.style.cursor = "move";
    // 타이머 표시
    const timeSpan = document.createElement("span");
    timeSpan.id = "pomodoro-timer-time";
    el.appendChild(timeSpan);
    // 버튼
    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "8px";
    const btnStart = document.createElement("button");
    btnStart.textContent = this.t("start");
    btnStart.onclick = () => this.startTimer();
    const btnPause = document.createElement("button");
    btnPause.textContent = this.t("pause");
    btnPause.onclick = () => this.togglePauseResume(btnPause);
    const btnStop = document.createElement("button");
    btnStop.textContent = this.t("stop");
    btnStop.onclick = () => this.stopTimer();
    // --- 예외처리: paused 상태면 시작 비활성화, 일시정지 버튼은 resume으로 ---
    if (this.timerState === "paused") {
      btnStart.disabled = true;
      btnPause.textContent = this.t("resume");
    }
    // ----------------------------------------------------------
    btnRow.appendChild(btnStart);
    btnRow.appendChild(btnPause);
    btnRow.appendChild(btnStop);
    el.appendChild(btnRow);
    document.body.appendChild(el);
    this.floatingTimerEl = el;
    this.updateFloatingTimer();
    this.updateFloatingTimerButtons();

    // 드래그 이동 기능 추가
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
    el.addEventListener("mousedown", (e) => {
      isDragging = true;
      // 현재 마우스 위치와 엘리먼트의 우측/하단 거리 계산
      offsetX = e.clientX - el.getBoundingClientRect().right;
      offsetY = e.clientY - el.getBoundingClientRect().bottom;
      document.body.style.userSelect = "none";
    });
    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      // 화면 우측/하단 기준으로 위치 계산
      const right = window.innerWidth - e.clientX + offsetX;
      const bottom = window.innerHeight - e.clientY + offsetY;
      el.style.right = right + "px";
      el.style.bottom = bottom + "px";
      el.style.left = "auto";
      el.style.top = "auto";
    });
    document.addEventListener("mouseup", () => {
      isDragging = false;
      document.body.style.userSelect = "";
    });
  }

  // Pomodoro Log 사이드패널 활성화
  activatePomodoroView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_POMODORO);
    if (leaves.length > 0) {
      this.app.workspace.revealLeaf(leaves[0]);
    } else {
      const rightLeaf = this.app.workspace.getRightLeaf(false);
      if (rightLeaf) {
        rightLeaf.setViewState({
          type: VIEW_TYPE_POMODORO,
          active: true
        });
      } else {
        // fallback: 새 leaf 생성
        this.app.workspace.getLeaf(true).setViewState({
          type: VIEW_TYPE_POMODORO,
          active: true
        });
      }
    }
  }

  // floating timer/상태바의 일시정지/재시작 버튼 텍스트 갱신
  updatePauseButtonText() {
    if (!this.floatingTimerEl) return;
    const btns = this.floatingTimerEl.querySelectorAll("button");
    if (btns.length < 2) return;
    const btnPause = btns[1];
    if (this.timerState === "paused") {
      btnPause.textContent = this.t("resume");
    } else {
      btnPause.textContent = this.t("pause");
    }
  }

  // floating timer 버튼 상태/라벨 일관 동기화 함수
  updateFloatingTimerButtons() {
    if (!this.floatingTimerEl) return;
    const btns = this.floatingTimerEl.querySelectorAll("button");
    if (btns.length < 3) return;
    const btnStart = btns[0] as HTMLButtonElement;
    const btnPause = btns[1] as HTMLButtonElement;
    const btnStop = btns[2] as HTMLButtonElement;

    // 모든 버튼 초기화
    btnStart.disabled = false;
    btnPause.disabled = false;
    btnStop.disabled = false;
    btnStart.style.display = "inline-block";
    btnPause.style.display = "inline-block";
    btnStop.style.display = "inline-block";

    // 상태별 버튼 활성/비활성 및 라벨
    if (this.timerState === "idle") {
      // 1. Idle: Start(E), Pause(D), Stop(D)
      btnStart.disabled = false;
      btnPause.disabled = true;
      btnStop.disabled = true;
      btnStart.textContent = this.t("start");
      btnPause.textContent = this.t("pause");
    } else if (this.timerState === "running") {
      // 2. Running: Start(D), Pause(E), Stop(E)
      btnStart.disabled = true;
      btnPause.disabled = false;
      btnStop.disabled = false;
      btnStart.textContent = this.t("start");
      btnPause.textContent = this.t("pause");
    } else if (this.timerState === "paused") {
      // 3. Paused: Start(D), Restart(E), Stop(E)
      btnStart.disabled = true;
      btnPause.disabled = false;
      btnStop.disabled = false;
      btnStart.textContent = this.t("start");
      btnPause.textContent = this.t("restart") || this.t("resume");
    }
    // After popup/idle은 idle과 동일하게 처리됨
  }

  pauseTimer() {
    if (this.timerState !== "running") return;
    this.timerState = "paused";
    if (this.intervalId) window.clearInterval(this.intervalId);
    // 일시정지 시 경과 시간만큼 timerStartTime 보정
    if (this.timerStartTime) {
      const now = Date.now();
      const elapsed = Math.floor((now - this.timerStartTime) / 1000);
      this.timerStartTime = now - elapsed * 1000;
    }
    this.updateStatusBar();
    this.updatePauseButtonText();
    this.updateFloatingTimerButtons();
  }

  resumeTimer() {
    if (this.timerState !== "paused") return;
    this.timerState = "running";
    // 재시작 시 timerStartTime 재설정
    this.timerStartTime = Date.now() - ((this.currentMode === "work" ? this.settings.workMinutes : this.settings.breakMinutes) * 60 - this.remainingTime) * 1000;
    this.intervalId = window.setInterval(() => {
      if (this.remainingTime > 0) {
        this.remainingTime--;
        this.updateStatusBar();
      } else {
        this.finishSession();
      }
    }, 1000);
    this.updateStatusBar();
    this.updatePauseButtonText();
    this.updateFloatingTimerButtons();
  }

  // floating timer의 일시정지/재시작 버튼 토글
  togglePauseResume(btnPause: HTMLButtonElement) {
    if (this.timerState === "running") {
      this.pauseTimer();
      btnPause.textContent = this.t("resume");
    } else if (this.timerState === "paused") {
      this.resumeTimer();
      btnPause.textContent = this.t("pause");
    }
  }

  startTimer() {
    if (this.timerState === "running") return;
    this.timerState = "running";
    this.remainingTime = (this.currentMode === "work" ? this.settings.workMinutes : this.settings.breakMinutes) * 60;
    this.timerStartTime = Date.now();
    this.updateStatusBar();
    if (this.intervalId) window.clearInterval(this.intervalId);
    this.intervalId = window.setInterval(() => {
      // 항상 timerStartTime 기준으로 남은 시간 계산
      if (!this.timerStartTime) return;
      const totalSeconds = (this.currentMode === "work" ? this.settings.workMinutes : this.settings.breakMinutes) * 60;
      const elapsed = Math.floor((Date.now() - this.timerStartTime) / 1000);
      this.remainingTime = Math.max(0, totalSeconds - elapsed);
      this.updateStatusBar();
      if (this.remainingTime <= 0) {
        this.finishSession();
      }
    }, 1000);
    this.updatePauseButtonText();
    this.updateFloatingTimerButtons();
  }

  // 세션 종료 팝업 메시지 생성 (로케일 적용, 시간 포맷 일관)
  makeSessionPopupMsg(start: Date, end: Date): string {
    const pad = (n: number) => n.toString().padStart(2, "0");
    const startHM = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
    const endHM = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
    const mins = Math.round((end.getTime() - start.getTime()) / 60000);
    const timeStr = `${startHM} ~ ${endHM} (${mins} min)`;
    return [
      this.t("sessionFinished"),
      timeStr,
      this.t("pleaseEvaluate")
    ].join("\n");
  }

  // 포그라운드 복귀 시 논리적 만료 체크 및 팝업/로그/초기화
  checkTimerOnForeground() {
    if (this.timerState !== "running" && this.timerState !== "paused") return;
    if (!this.timerStartTime) return;
    const totalSeconds = (this.currentMode === "work" ? this.settings.workMinutes : this.settings.breakMinutes) * 60;
    const elapsed = Math.floor((Date.now() - this.timerStartTime) / 1000);
    if (elapsed >= totalSeconds) {
      // 만료: 팝업 발생, 시작~종료 시각 표시, 로그 작성 요청
      const start = new Date(this.timerStartTime);
      const end = new Date(this.timerStartTime + totalSeconds * 1000);
      const popupMsg = this.makeSessionPopupMsg(start, end);
      new PomodoroModal(this, popupMsg, (content: string, score: number) => {
        this.appendLog(content, score, totalSeconds); // 정확한 경과시간
        new Notice(this.t("logSaved"));
        this.resetTimerState();
        // 사이드패널 강제 새로고침
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_POMODORO);
        if (leaves.length > 0) {
          const view = leaves[0].view as PomodoLogView;
          if (view && typeof view.onOpen === "function") view.onOpen();
        }
      }).open();
      this.resetTimerState();
      this.updateStatusBar();
    } else {
      // 미만: 남은 시간 재계산하여 display
      this.remainingTime = Math.max(0, totalSeconds - elapsed);
      this.updateStatusBar();
    }
  }

  stopTimer() {
    const wasRunning = this.timerState === "running" || this.timerState === "paused";
    let elapsed = 0;
    let startTime = this.timerStartTime;
    if (wasRunning && startTime) {
      elapsed = Math.floor((Date.now() - startTime) / 1000);
    }
    this.timerState = "idle";
    if (this.intervalId) window.clearInterval(this.intervalId);
    this.timerStartTime = null;
    if (wasRunning && elapsed > 0) {
      const start = new Date(startTime!);
      const end = new Date();
      const popupMsg = this.makeSessionPopupMsg(start, end);
      new PomodoroModal(this, popupMsg, (content: string, score: number) => {
        this.appendLog(content, score, elapsed);
        new Notice(this.t("logSaved"));
        this.resetTimerState();
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_POMODORO);
        if (leaves.length > 0) {
          const view = leaves[0].view as PomodoLogView;
          if (view && typeof view.onOpen === "function") view.onOpen();
        }
      }).open();
    }
    this.remainingTime = 0;
    this.updateStatusBar();
    this.updatePauseButtonText();
    this.updateFloatingTimerButtons();
  }

  finishSession() {
    if (this.intervalId) window.clearInterval(this.intervalId);
    this.timerState = "idle";
    const startTime = this.timerStartTime;
    this.timerStartTime = null;
    this.updateStatusBar();
    this.updateFloatingTimerButtons();
    const start = startTime ? new Date(startTime) : new Date();
    const end = new Date();
    const popupMsg = this.makeSessionPopupMsg(start, end);
    new PomodoroModal(this, popupMsg, (content: string, score: number) => {
      const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : undefined;
      this.appendLog(content, score, elapsed);
      new Notice(this.t("logSaved"));
      this.resetTimerState();
      const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_POMODORO);
      if (leaves.length > 0) {
        const view = leaves[0].view as PomodoLogView;
        if (view && typeof view.onOpen === "function") view.onOpen();
      }
    }).open();
  }

  resetTimerState() {
    this.timerState = "idle";
    this.remainingTime = 0;
    this.timerStartTime = null;
    if (this.intervalId) window.clearInterval(this.intervalId);
    this.updateStatusBar();
    this.updatePauseButtonText();
    this.updateFloatingTimerButtons();
  }

  // appendLog에 timerStartTime을 반영하여 실제 시작~종료 시각을 기록
  async appendLog(content: string, score: number, elapsedSeconds?: number) {
    const now = new Date();
    let start: Date;
    if (typeof this.timerStartTime === "number" && this.timerStartTime > 0) {
      start = new Date(this.timerStartTime);
    } else {
      if (elapsedSeconds && elapsedSeconds > 0) {
        start = new Date(now.getTime() - elapsedSeconds * 1000);
      } else {
        start = new Date(now.getTime() - (this.settings.workMinutes * 60 * 1000));
      }
    }
    // 날짜+시간(YYYY-MM-DD HH:MM) 포맷 (초 제외)
    const pad = (n: number) => n.toString().padStart(2, "0");
    const formatDateTime = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const startStr = formatDateTime(start);
    const endStr = formatDateTime(now);
    const logRow = `| ${startStr} | ${endStr} | ${content} | ${score} |\n`;
    let file = this.app.vault.getAbstractFileByPath(this.settings.logFilePath);
    if (!file) {
      await this.app.vault.create(this.settings.logFilePath, `| start | end | desc | rate |\n| --- | --- | --- | --- |\n` + logRow);
    } else if (file instanceof TFile) {
      await this.app.vault.append(file, logRow);
    }
  }

  updateStatusBar() {
    if (!this.statusBar) return;
    let min = Math.floor(this.remainingTime / 60).toString().padStart(2, "0");
    let sec = (this.remainingTime % 60).toString().padStart(2, "0");
    let emoji = this.currentMode === "work" ? "🍅" : "☕";
    let state = this.timerState === "paused" ? `(${this.t("paused")})` : "";
    this.statusBar.setText(`${emoji} ${min}:${sec} ${state}`);
    this.updateFloatingTimer();
    this.saveTimerState(); // 상태 변경 시마다 저장
  }

  updateFloatingTimer() {
    if (!this.floatingTimerEl) return;
    const timeSpan = this.floatingTimerEl.querySelector("#pomodoro-timer-time") as HTMLSpanElement;
    let min = Math.floor(this.remainingTime / 60).toString().padStart(2, "0");
    let sec = (this.remainingTime % 60).toString().padStart(2, "0");
    let emoji = this.currentMode === "work" ? "🍅" : "☕";
    let state = this.timerState === "paused" ? `(${this.t("paused")})` : "";
    timeSpan.textContent = `${emoji} ${min}:${sec} ${state}`;
    this.updateFloatingTimerButtons();
    // 무지개 배경: idle(정지) 상태이거나 타이머 종료 시
    if (this.timerState === "idle") {
      if (!this.rainbowBgIntervalId) {
        this.rainbowBgIntervalId = window.setInterval(() => {
          if (!this.floatingTimerEl) return;
          this.floatingTimerEl.style.background = this.rainbowColors[this.rainbowIdx];
          this.rainbowIdx = (this.rainbowIdx + 1) % this.rainbowColors.length;
        }, 100);
      }
    } else {
      if (this.rainbowBgIntervalId) {
        window.clearInterval(this.rainbowBgIntervalId);
        this.rainbowBgIntervalId = null;
        this.rainbowIdx = 0;
      }
      // break 모드에서 배경 반짝임 효과 (running/paused 모두)
      if (this.currentMode === "break" && (this.timerState === "running" || this.timerState === "paused")) {
        if (!this.breakBgIntervalId) {
          this.breakBgIntervalId = window.setInterval(() => {
            if (!this.floatingTimerEl) return;
            const color = `hsl(${Math.floor(Math.random()*360)},70%,70%)`;
            this.floatingTimerEl.style.background = color;
          }, 120);
        }
      } else {
        if (this.breakBgIntervalId) {
          window.clearInterval(this.breakBgIntervalId);
          this.breakBgIntervalId = null;
        }
        this.floatingTimerEl.style.background = "rgba(30,30,30,0.85)";
      }
    }
  }
}

class PomodoLogSettingTab extends PluginSettingTab {
  plugin: PomodoroPlugin;

  constructor(app: App, plugin: PomodoroPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: this.plugin.t("settingsTitle") });

    new Setting(containerEl)
      .setName(this.plugin.t("workMinutes"))
      .setDesc(this.plugin.t("workMinutesDesc"))
      .addText((text) =>
        text
          .setPlaceholder(this.plugin.t("workMinutesPlaceholder"))
          .setValue(this.plugin.settings.workMinutes.toString())
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num)) {
              this.plugin.settings.workMinutes = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName(this.plugin.t("logFilePath"))
      .setDesc(this.plugin.t("logFilePathDesc"))
      .addText((text) =>
        text
          .setPlaceholder(this.plugin.t("logFilePathPlaceholder"))
          .setValue(this.plugin.settings.logFilePath)
          .onChange(async (value) => {
            this.plugin.settings.logFilePath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(this.plugin.t("language"))
      .setDesc(this.plugin.t("languageDesc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("en", "English")
          .addOption("ko", "한국어")
          .setValue(this.plugin.settings.language)
          .onChange(async (value) => {
            this.plugin.settings.language = value;
            await this.plugin.saveSettings();
            // 언어 변경 시 즉시 반영
            location.reload();
          })
      );
  }
}

class PomodoLogView extends ItemView {
  plugin: PomodoroPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: PomodoroPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_POMODORO;
  }

  getDisplayText() {
    return "Pomodoro Log";
  }

  async onOpen() {
    this.containerEl.empty();
    const today = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    // summaryDiv 생성 및 스타일 지정 (날짜+요약 한 줄)
    const summaryDiv = this.containerEl.createDiv();
    summaryDiv.style.margin = "0 0 18px 0";
    summaryDiv.style.fontWeight = "bold";
    summaryDiv.style.display = "flex";
    summaryDiv.style.alignItems = "center";
    summaryDiv.style.gap = "32px";
    summaryDiv.style.background = "#23272e";
    summaryDiv.style.borderRadius = "8px";
    summaryDiv.style.padding = "8px 16px";
    summaryDiv.style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)";
    this.containerEl.appendChild(summaryDiv);

    // 로그 데이터 로드 및 파싱
    const rows = await this.loadLogRows();
    // 오늘 날짜만 필터 (시작시각이 YYYY-MM-DD HH:MM 형식일 때만)
    const todayRows = rows.filter(cols => {
      if (!cols || cols.length < 4) return false;
      const startCol = (cols[0] || '').trim();
      if (startCol.length < 16) return false;
      const datePart = startCol.slice(0, 10);
      return datePart === todayStr;
    });
    // 총 작업시간(분) 및 평균평점 계산
    let totalMinutes = 0;
    let totalScore = 0;
    let count = 0;
    const processedRows = todayRows.map(cols => {
      // 시작시각, 종료시각: YYYY-MM-DD HH:MM
      const startStr = (cols[0] || '').trim();
      const endStr = (cols[1] || '').trim();
      // HH:MM만 추출
      const startHM = startStr.length >= 16 ? startStr.slice(11, 16) : "-";
      const endHM = endStr.length >= 16 ? endStr.slice(11, 16) : "-";
      // 작업시간(분) 계산
      let mins = 0;
      if (startHM !== "-" && endHM !== "-") {
        const [sh, sm] = startHM.split(":").map(Number);
        const [eh, em] = endHM.split(":").map(Number);
        if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
          mins = (eh * 60 + em) - (sh * 60 + sm);
          if (mins < 0) mins += 24 * 60; // 자정 넘김 보정
        }
      }
      if (mins < 0 || isNaN(mins)) mins = 0;
      totalMinutes += mins;
      const score = Number(cols[3]);
      if (!isNaN(score)) {
        totalScore += score;
        count++;
      }
      return [startHM, endHM, `${mins} min`, cols[2] ? cols[2].trim() : "", isNaN(score) ? "-" : cols[3]];
    });
    // summaryDiv: 날짜+총작업시간+평균평점 한 줄, 달력 이모티콘
    summaryDiv.innerHTML = `
      <span style=\"display: flex; align-items: center; gap: 6px; font-size: 1.1em;\">
        <span style=\"font-size:1.2em; color:#FFD600;\">📅</span>
        <span style=\"color:#FFD600; font-weight:bold;\">${todayStr}</span>
      </span>
      <span style=\"margin: 0 18px; color:#444;\">|</span>
      <span style=\"display: flex; align-items: center; gap: 6px; font-size: 1.1em;\">
        <span style=\"font-size:1.2em; color:#FFD600;\">⏱️</span>
        <span style=\"color:#FFD600; font-weight:bold;\">${totalMinutes}</span>
        <span style=\"color:#aaa; font-size:0.95em;\">min</span>
      </span>
      <span style=\"margin: 0 18px; color:#444;\">|</span>
      <span style=\"display: flex; align-items: center; gap: 6px; font-size: 1.1em;\">
        <span style=\"font-size:1.2em; color:#FFD600;\">★</span>
        <span style=\"color:${count > 0 ? '#FFD600' : '#888'}; font-weight:bold;\">
          ${count > 0 ? (totalScore / count).toFixed(2) : '-'}
        </span>
      </span>
    `;

    // 로그 내용 표시 영역(표)
    const logContainer = this.containerEl.createDiv("pomodoro-log-container");
    logContainer.style.maxHeight = "60vh";
    logContainer.style.overflowY = "auto";
    logContainer.style.padding = "12px 12px 0 12px";

    if (processedRows.length > 0) {
      const table = document.createElement("table");
      table.style.width = "100%";
      table.style.borderCollapse = "collapse";
      table.style.background = "#23272e";
      table.style.borderRadius = "10px";
      table.style.overflow = "hidden";
      table.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)";
      // 헤더
      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      ["▶️", "🏁", "⏱️", "📝", "⭐"].forEach(h => {
        const th = document.createElement("th");
        th.textContent = h;
        th.style.borderBottom = "2px solid #444";
        th.style.padding = "8px 10px";
        th.style.background = "#2d323b";
        th.style.color = "#FFD600";
        th.style.fontWeight = "bold";
        th.style.fontSize = "1em";
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);
      // 바디
      const tbody = document.createElement("tbody");
      processedRows.forEach(cols => {
        if (!cols || cols.length < 5) return;
        const tr = document.createElement("tr");
        tr.style.transition = "background 0.2s";
        tr.onmouseenter = () => tr.style.background = "#31363f";
        tr.onmouseleave = () => tr.style.background = "";
        cols.forEach((col, idx) => {
          const td = document.createElement("td");
          // 작업시간 컬럼(2)에서 'min' 제거
          td.textContent = (idx === 2) ? col.replace(/\s*min\s*/g, "") : col;
          td.style.padding = "6px 10px";
          td.style.borderBottom = "1px solid #333";
          td.style.color = "#eee";
          if (idx === 2 || idx === 4) td.style.textAlign = "center";
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      logContainer.appendChild(table);
    } else {
      logContainer.setText(this.plugin.t("noLogsToday") || "오늘의 로그가 없습니다.");
    }

    // 새로 고침 버튼
    const refreshButton = document.createElement("button");
    refreshButton.textContent = this.plugin.t("refreshLogs") || "Refresh Logs";
    refreshButton.onclick = async () => {
      this.onOpen();
    };
    refreshButton.style.marginTop = "8px";
    this.containerEl.appendChild(refreshButton);
  }

  // 헤더/구분선 무시, 실제 로그 row만 파싱 (더 견고하게 개선)
  async loadLogRows(): Promise<string[][]> {
    const file = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.logFilePath);
    if (!file || !(file instanceof TFile)) return [];
    const content = await this.plugin.app.vault.read(file);
    // |로 시작하는 줄만, 구분선/헤더/빈 줄 제외
    const lines = content.split("\n")
      .map(l => l.trim())
      .filter(l => l.startsWith("|") && !l.includes("---"));
    // 헤더(첫 줄) 제외
    const dataLines = lines.filter((_, idx) => idx !== 0);
    // 각 row: | a | b | c | d | 형태에서 a~d 추출
    const rows = dataLines.map(line =>
      line.split("|").map(s => s.trim()).filter(Boolean)
    );
    // 4개 컬럼만 반환
    return rows.filter(cols => cols.length === 4);
  }
}

class PomodoroModal extends Modal {
  plugin: PomodoroPlugin;
  message: string;
  private _onSubmit: (content: string, score: number) => void;
  constructor(plugin: PomodoroPlugin, message: string, onSubmit: (content: string, score: number) => void) {
    super(plugin.app);
    this.plugin = plugin;
    this.message = message;
    this._onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: this.plugin.t("sessionDone") });
    // 안내 문구를 textarea 위에 출력
    const guideP = contentEl.createEl("p", { text: this.message });
    guideP.style.margin = "8px 0 8px 0";
    guideP.style.color = "#23272e";
    guideP.style.fontWeight = "bold";
    guideP.style.whiteSpace = "pre-line";
    // textarea
    const textarea = contentEl.createEl("textarea");
    textarea.style.width = "100%";
    textarea.style.minHeight = "80px";
    textarea.style.height = "120px";
    textarea.style.boxSizing = "border-box";
    textarea.style.fontSize = "1.1em";
    textarea.style.padding = "10px";
    textarea.style.margin = "8px 0 16px 0";
    textarea.style.resize = "vertical";
    textarea.style.borderRadius = "8px";
    textarea.style.border = "1px solid #888";
    textarea.style.background = "#222";
    textarea.style.color = "#fff";
    // 별점
    const starDiv = contentEl.createEl("div");
    starDiv.style.display = "flex";
    starDiv.style.gap = "4px";
    let selectedScore = 0;
    const stars: HTMLSpanElement[] = [];
    for (let i = 1; i <= 5; i++) {
      const star = contentEl.createEl("span");
      star.textContent = "★";
      star.style.fontSize = "2em";
      star.style.cursor = "pointer";
      star.style.color = "#888";
      star.onclick = () => {
        selectedScore = i;
        stars.forEach((s, idx) => {
          s.style.color = idx < selectedScore ? "#FFD600" : "#888";
        });
        checkValid();
      };
      stars.push(star);
      starDiv.appendChild(star);
    }
    contentEl.appendChild(starDiv);
    // 저장 버튼
    const submitBtn = contentEl.createEl("button", { text: this.plugin.t("save") });
    submitBtn.disabled = true;
    submitBtn.style.marginTop = "12px";
    submitBtn.onclick = () => {
      const content = textarea.value.trim();
      if (content.length === 0 || selectedScore === 0) {
        submitBtn.disabled = true;
        textarea.focus();
        return;
      }
      this.close();
      this._onSubmit(content, selectedScore);
    };
    // 입력값/별점 체크
    const checkValid = () => {
      const content = textarea.value.trim();
      submitBtn.disabled = !(content.length > 0 && selectedScore > 0);
    };
    textarea.addEventListener("input", checkValid);
    // ESC 키로 닫기 방지
    this.scope.register([], "Escape", (evt: KeyboardEvent) => {
      evt.stopPropagation();
      evt.preventDefault();
      return false;
    });
    setTimeout(() => textarea.focus(), 100);
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
  onClickOutside() {
    // 아무 동작도 하지 않음: 바깥 클릭으로 닫히지 않게
    return;
  }
}
