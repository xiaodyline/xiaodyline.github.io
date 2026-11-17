"use strict";

(() => {
  const BOARD_SIZE = 15;
  const EMPTY = 0;
  const BLACK = 1;
  const WHITE = 2;
  const MAX_UNDO_PER_PLAYER = 3;
  const CLOCK_TICK_MS = 100;
  const FORBIDDEN_SCAN_SPAN = 6;
  const DIRECTIONS = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1]
  ];

  const LIMITS = {
    gameMinutes: { min: 1, max: 180 },
    moveSeconds: { min: 5, max: 300 }
  };

  const DEFAULT_CONFIG = {
    forbiddenEnabled: true,
    gameMinutes: 20,
    moveSeconds: 30
  };

  const dom = {};

  const state = {
    config: { ...DEFAULT_CONFIG },
    phase: "idle",
    board: createEmptyBoard(),
    currentPlayer: BLACK,
    moveHistory: [],
    winner: null,
    endReason: null,
    endDetail: "",
    timers: {
      blackGameMs: DEFAULT_CONFIG.gameMinutes * 60 * 1000,
      whiteGameMs: DEFAULT_CONFIG.gameMinutes * 60 * 1000,
      currentMoveMs: DEFAULT_CONFIG.moveSeconds * 1000,
      tickId: null,
      lastTs: 0
    },
    undoQuota: {
      black: MAX_UNDO_PER_PLAYER,
      white: MAX_UNDO_PER_PLAYER
    },
    pendingRequest: null,
    modal: {
      visible: false,
      mode: null,
      title: "",
      message: "",
      confirmText: "确认",
      cancelText: "取消"
    },
    message: "未开始，请先设置参数并开始新局。",
    view: {
      size: 0,
      margin: 0,
      cell: 0
    }
  };

  function initApp() {
    cacheDom();
    bindEvents();
    resizeCanvas();
    renderAll();
  }

  function cacheDom() {
    dom.setupForm = document.getElementById("setupForm");
    dom.forbiddenEnabled = document.getElementById("forbiddenEnabled");
    dom.gameMinutes = document.getElementById("gameMinutes");
    dom.moveSeconds = document.getElementById("moveSeconds");
    dom.startBtn = document.getElementById("startBtn");
    dom.formError = document.getElementById("formError");

    dom.phaseText = document.getElementById("phaseText");
    dom.turnText = document.getElementById("turnText");
    dom.blackGameClock = document.getElementById("blackGameClock");
    dom.whiteGameClock = document.getElementById("whiteGameClock");
    dom.moveClock = document.getElementById("moveClock");
    dom.blackUndoQuota = document.getElementById("blackUndoQuota");
    dom.whiteUndoQuota = document.getElementById("whiteUndoQuota");
    dom.messageText = document.getElementById("messageText");

    dom.undoBtn = document.getElementById("undoBtn");
    dom.drawBtn = document.getElementById("drawBtn");
    dom.resignBtn = document.getElementById("resignBtn");

    dom.boardCard = document.getElementById("boardCard");
    dom.boardCanvas = document.getElementById("boardCanvas");
    dom.ctx = dom.boardCanvas.getContext("2d");

    dom.modalOverlay = document.getElementById("modalOverlay");
    dom.modalTitle = document.getElementById("modalTitle");
    dom.modalMessage = document.getElementById("modalMessage");
    dom.modalConfirm = document.getElementById("modalConfirm");
    dom.modalCancel = document.getElementById("modalCancel");
  }

  function bindEvents() {
    dom.setupForm.addEventListener("submit", (event) => {
      event.preventDefault();
      startGameFromForm();
    });

    dom.undoBtn.addEventListener("click", requestUndo);
    dom.drawBtn.addEventListener("click", requestDraw);
    dom.resignBtn.addEventListener("click", resign);

    dom.modalConfirm.addEventListener("click", onModalConfirm);
    dom.modalCancel.addEventListener("click", onModalCancel);

    dom.boardCanvas.addEventListener("click", onCanvasClick);
    window.addEventListener("resize", () => {
      resizeCanvas();
      renderBoard();
    });
  }

  function startGameFromForm() {
    const parsed = parseConfigFromForm();
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }
    setFormError("");
    startGame(parsed.config);
  }

  function parseConfigFromForm() {
    const gameMinutes = Number(dom.gameMinutes.value);
    const moveSeconds = Number(dom.moveSeconds.value);

    if (!Number.isInteger(gameMinutes) || gameMinutes < LIMITS.gameMinutes.min || gameMinutes > LIMITS.gameMinutes.max) {
      return {
        ok: false,
        error: `局时需为 ${LIMITS.gameMinutes.min}-${LIMITS.gameMinutes.max} 分钟的整数。`
      };
    }

    if (!Number.isInteger(moveSeconds) || moveSeconds < LIMITS.moveSeconds.min || moveSeconds > LIMITS.moveSeconds.max) {
      return {
        ok: false,
        error: `步时需为 ${LIMITS.moveSeconds.min}-${LIMITS.moveSeconds.max} 秒的整数。`
      };
    }

    return {
      ok: true,
      config: {
        forbiddenEnabled: dom.forbiddenEnabled.checked,
        gameMinutes,
        moveSeconds
      }
    };
  }

  function setFormError(text) {
    dom.formError.textContent = text || "";
  }

  function startGame(config) {
    state.config = { ...config };
    state.phase = "playing";
    state.board = createEmptyBoard();
    state.currentPlayer = BLACK;
    state.moveHistory = [];
    state.winner = null;
    state.endReason = null;
    state.endDetail = "";
    state.undoQuota = {
      black: MAX_UNDO_PER_PLAYER,
      white: MAX_UNDO_PER_PLAYER
    };
    state.pendingRequest = null;
    closeModal();

    state.timers.blackGameMs = config.gameMinutes * 60 * 1000;
    state.timers.whiteGameMs = config.gameMinutes * 60 * 1000;
    state.timers.currentMoveMs = config.moveSeconds * 1000;

    state.message = `新局开始，${playerName(BLACK)}先行。`;
    startClock();
    renderAll();
  }

  function resetGame() {
    startGame({ ...state.config });
  }

  function startClock() {
    stopClock();
    state.timers.lastTs = performance.now();
    state.timers.tickId = window.setInterval(onTick, CLOCK_TICK_MS);
  }

  function stopClock() {
    if (state.timers.tickId !== null) {
      clearInterval(state.timers.tickId);
      state.timers.tickId = null;
    }
  }

  function onTick() {
    if (state.phase !== "playing") {
      return;
    }

    const now = performance.now();
    let elapsed = now - state.timers.lastTs;
    if (!Number.isFinite(elapsed) || elapsed < 0) {
      elapsed = 0;
    }
    state.timers.lastTs = now;

    if (state.pendingRequest) {
      renderStatus();
      return;
    }

    if (state.currentPlayer === BLACK) {
      state.timers.blackGameMs -= elapsed;
      if (state.timers.blackGameMs <= 0) {
        state.timers.blackGameMs = 0;
        endGame(WHITE, "timeout", "黑方超时，白方获胜。");
        return;
      }
    } else {
      state.timers.whiteGameMs -= elapsed;
      if (state.timers.whiteGameMs <= 0) {
        state.timers.whiteGameMs = 0;
        endGame(BLACK, "timeout", "白方超时，黑方获胜。");
        return;
      }
    }

    state.timers.currentMoveMs -= elapsed;
    if (state.timers.currentMoveMs <= 0) {
      state.timers.currentMoveMs = 0;
      const loser = state.currentPlayer;
      const winner = otherPlayer(loser);
      endGame(winner, "timeout", `${playerName(loser)}步时耗尽，${playerName(winner)}获胜。`);
      return;
    }

    renderStatus();
  }

  function onCanvasClick(event) {
    if (state.phase !== "playing" || state.pendingRequest) {
      return;
    }

    const point = getBoardPointFromEvent(event);
    if (!point) {
      return;
    }
    onBoardClick(point.row, point.col);
  }

  function getBoardPointFromEvent(event) {
    const rect = dom.boardCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const margin = state.view.margin;
    const cell = state.view.cell;

    const col = Math.round((x - margin) / cell);
    const row = Math.round((y - margin) / cell);

    if (!inBounds(row, col)) {
      return null;
    }

    const nearestX = margin + col * cell;
    const nearestY = margin + row * cell;
    const maxOffset = cell * 0.48;

    if (Math.abs(x - nearestX) > maxOffset || Math.abs(y - nearestY) > maxOffset) {
      return null;
    }

    return { row, col };
  }

  function onBoardClick(row, col) {
    if (state.board[row][col] !== EMPTY) {
      state.message = "该位置已有棋子，请选择其他位置。";
      renderStatus();
      return;
    }

    placeStone(row, col, state.currentPlayer);
    if (state.phase === "playing") {
      renderAll();
    }
  }

  function placeStone(row, col, color) {
    state.board[row][col] = color;
    state.moveHistory.push({
      row,
      col,
      color,
      moveNo: state.moveHistory.length + 1
    });
    evaluateMove(row, col, color);
  }

  function evaluateMove(row, col, color) {
    if (state.config.forbiddenEnabled && color === BLACK) {
      const forbiddenResult = checkForbiddenPractical(row, col);
      if (forbiddenResult.forbidden) {
        endGame(WHITE, "forbidden", forbiddenResult.detail);
        return;
      }
    }

    if (checkFive(row, col, color)) {
      endGame(color, "five", `${playerName(color)}达成连五，获胜。`);
      return;
    }

    state.currentPlayer = otherPlayer(color);
    state.timers.currentMoveMs = state.config.moveSeconds * 1000;
    state.timers.lastTs = performance.now();
    state.message = `轮到${playerName(state.currentPlayer)}落子。`;
  }

  function checkFive(row, col, color) {
    for (const [dr, dc] of DIRECTIONS) {
      if (countConnected(row, col, color, dr, dc) >= 5) {
        return true;
      }
    }
    return false;
  }

  function checkForbiddenPractical(row, col) {
    if (isOverline(row, col, BLACK)) {
      return {
        forbidden: true,
        detail: "黑方形成长连禁手（六连及以上），判负。"
      };
    }

    const fourCount = countDirectionalForbidden(row, col, hasFourInDirection);
    if (fourCount >= 2) {
      return {
        forbidden: true,
        detail: "黑方触发四四禁手，判负。"
      };
    }

    const threeCount = countDirectionalForbidden(row, col, hasOpenThreeInDirection);
    if (threeCount >= 2) {
      return {
        forbidden: true,
        detail: "黑方触发三三禁手，判负。"
      };
    }

    return { forbidden: false, detail: "" };
  }

  function isOverline(row, col, color) {
    for (const [dr, dc] of DIRECTIONS) {
      if (countConnected(row, col, color, dr, dc) >= 6) {
        return true;
      }
    }
    return false;
  }

  function countConnected(row, col, color, dr, dc) {
    let count = 1;
    let r = row + dr;
    let c = col + dc;

    while (inBounds(r, c) && state.board[r][c] === color) {
      count += 1;
      r += dr;
      c += dc;
    }

    r = row - dr;
    c = col - dc;
    while (inBounds(r, c) && state.board[r][c] === color) {
      count += 1;
      r -= dr;
      c -= dc;
    }

    return count;
  }

  function countDirectionalForbidden(row, col, checker) {
    let count = 0;
    for (const [dr, dc] of DIRECTIONS) {
      const line = extractBlackLine(row, col, dr, dc, FORBIDDEN_SCAN_SPAN);
      if (checker(line, FORBIDDEN_SCAN_SPAN)) {
        count += 1;
      }
    }
    return count;
  }

  function extractBlackLine(row, col, dr, dc, span) {
    const line = [];
    for (let k = -span; k <= span; k += 1) {
      const r = row + dr * k;
      const c = col + dc * k;
      if (!inBounds(r, c)) {
        line.push(2);
      } else {
        const cell = state.board[r][c];
        if (cell === BLACK) {
          line.push(BLACK);
        } else if (cell === EMPTY) {
          line.push(EMPTY);
        } else {
          line.push(2);
        }
      }
    }
    return line;
  }

  function hasFourInDirection(line, center) {
    if (line[center] !== BLACK) {
      return false;
    }

    for (let start = 0; start <= line.length - 5; start += 1) {
      const end = start + 4;
      if (center < start || center > end) {
        continue;
      }

      let blackCount = 0;
      let emptyCount = 0;
      let blocked = false;

      for (let i = start; i <= end; i += 1) {
        const v = line[i];
        if (v === 2) {
          blocked = true;
          break;
        }
        if (v === BLACK) {
          blackCount += 1;
        } else {
          emptyCount += 1;
        }
      }

      if (!blocked && blackCount === 4 && emptyCount === 1) {
        return true;
      }
    }
    return false;
  }

  function hasOpenThreeInDirection(line, center) {
    if (line[center] !== BLACK) {
      return false;
    }

    for (let start = 0; start <= line.length - 5; start += 1) {
      const end = start + 4;
      if (center < start || center > end) {
        continue;
      }

      let blackCount = 0;
      let emptyCount = 0;
      let blocked = false;
      const emptyIndices = [];

      for (let i = start; i <= end; i += 1) {
        const v = line[i];
        if (v === 2) {
          blocked = true;
          break;
        }
        if (v === BLACK) {
          blackCount += 1;
        } else {
          emptyCount += 1;
          emptyIndices.push(i);
        }
      }

      if (blocked || blackCount !== 3 || emptyCount !== 2) {
        continue;
      }

      for (const idx of emptyIndices) {
        line[idx] = BLACK;
        const createsOpenFour = hasOpenFour(line, center);
        line[idx] = EMPTY;
        if (createsOpenFour) {
          return true;
        }
      }
    }
    return false;
  }

  function hasOpenFour(line, center) {
    for (let start = 0; start <= line.length - 6; start += 1) {
      const end = start + 5;
      if (center < start + 1 || center > end - 1) {
        continue;
      }

      if (
        line[start] === EMPTY &&
        line[start + 1] === BLACK &&
        line[start + 2] === BLACK &&
        line[start + 3] === BLACK &&
        line[start + 4] === BLACK &&
        line[start + 5] === EMPTY
      ) {
        return true;
      }
    }
    return false;
  }

  function requestUndo() {
    if (!canOperateInGame("悔棋")) {
      return;
    }

    if (state.moveHistory.length < 2) {
      state.message = "当前不足两手，无法悔棋。";
      renderStatus();
      return;
    }

    const quotaKey = state.currentPlayer === BLACK ? "black" : "white";
    if (state.undoQuota[quotaKey] <= 0) {
      state.message = `${playerName(state.currentPlayer)}悔棋次数已用完。`;
      renderStatus();
      return;
    }

    const from = state.currentPlayer;
    const to = otherPlayer(from);
    state.pendingRequest = { type: "undo", from, to };
    state.timers.lastTs = performance.now();

    openModal({
      mode: "request_undo",
      title: "悔棋请求",
      message: `${playerName(from)}请求悔棋。${playerName(to)}是否同意？`,
      confirmText: "同意",
      cancelText: "拒绝"
    });

    state.message = `${playerName(from)}发起悔棋请求，等待${playerName(to)}确认。`;
    renderStatus();
  }

  function requestDraw() {
    if (!canOperateInGame("和棋")) {
      return;
    }

    const from = state.currentPlayer;
    const to = otherPlayer(from);
    state.pendingRequest = { type: "draw", from, to };
    state.timers.lastTs = performance.now();

    openModal({
      mode: "request_draw",
      title: "和棋请求",
      message: `${playerName(from)}请求和棋。${playerName(to)}是否同意？`,
      confirmText: "同意",
      cancelText: "拒绝"
    });

    state.message = `${playerName(from)}发起和棋请求，等待${playerName(to)}确认。`;
    renderStatus();
  }

  function canOperateInGame(actionName) {
    if (state.phase !== "playing") {
      state.message = `当前不在对局中，无法${actionName}。`;
      renderStatus();
      return false;
    }
    if (state.pendingRequest) {
      state.message = "已有待确认请求，请先处理。";
      renderStatus();
      return false;
    }
    return true;
  }

  function onModalConfirm() {
    if (!state.modal.visible) {
      return;
    }

    if (state.modal.mode === "confirm_resign") {
      confirmResign();
      return;
    }

    if (state.modal.mode === "request_undo" || state.modal.mode === "request_draw") {
      respondRequest(true);
    }
  }

  function onModalCancel() {
    if (!state.modal.visible) {
      return;
    }

    if (state.modal.mode === "confirm_resign") {
      closeModal();
      state.message = "已取消认输。";
      renderStatus();
      return;
    }

    if (state.modal.mode === "request_undo" || state.modal.mode === "request_draw") {
      respondRequest(false);
    }
  }

  function respondRequest(accepted) {
    const req = state.pendingRequest;
    if (!req) {
      closeModal();
      return;
    }

    if (!accepted) {
      state.pendingRequest = null;
      closeModal();
      state.timers.lastTs = performance.now();
      state.message = req.type === "undo"
        ? `${playerName(req.to)}拒绝悔棋请求。`
        : `${playerName(req.to)}拒绝和棋请求。`;
      renderAll();
      return;
    }

    if (req.type === "undo") {
      applyUndoRound(req.from);
      return;
    }

    if (req.type === "draw") {
      endGame(0, "draw_agreed", `${playerName(req.to)}同意和棋，对局结束。`);
    }
  }

  function applyUndoRound(requester) {
    const quotaKey = requester === BLACK ? "black" : "white";
    state.undoQuota[quotaKey] = Math.max(0, state.undoQuota[quotaKey] - 1);

    for (let i = 0; i < 2; i += 1) {
      const move = state.moveHistory.pop();
      if (!move) {
        break;
      }
      state.board[move.row][move.col] = EMPTY;
    }

    state.pendingRequest = null;
    closeModal();

    if (state.moveHistory.length === 0) {
      state.currentPlayer = BLACK;
    } else {
      const last = state.moveHistory[state.moveHistory.length - 1];
      state.currentPlayer = otherPlayer(last.color);
    }

    state.timers.currentMoveMs = state.config.moveSeconds * 1000;
    state.timers.lastTs = performance.now();
    state.message = `${playerName(requester)}悔棋成功，轮到${playerName(state.currentPlayer)}落子。`;
    renderAll();
  }

  function resign() {
    if (!canOperateInGame("认输")) {
      return;
    }

    openModal({
      mode: "confirm_resign",
      title: "确认认输",
      message: `${playerName(state.currentPlayer)}确认认输吗？确认后对局立即结束。`,
      confirmText: "确认认输",
      cancelText: "取消"
    });
  }

  function confirmResign() {
    if (state.phase !== "playing") {
      closeModal();
      renderModal();
      return;
    }

    const loser = state.currentPlayer;
    const winner = otherPlayer(loser);
    closeModal();
    endGame(winner, "resign", `${playerName(loser)}认输，${playerName(winner)}获胜。`);
  }

  function openModal(options) {
    state.modal.visible = true;
    state.modal.mode = options.mode;
    state.modal.title = options.title;
    state.modal.message = options.message;
    state.modal.confirmText = options.confirmText;
    state.modal.cancelText = options.cancelText;
    renderModal();
  }

  function closeModal() {
    state.modal.visible = false;
    state.modal.mode = null;
    state.modal.title = "";
    state.modal.message = "";
    state.modal.confirmText = "确认";
    state.modal.cancelText = "取消";
    renderModal();
  }

  function endGame(winner, reason, detail) {
    state.phase = "ended";
    state.winner = winner;
    state.endReason = reason;
    state.endDetail = detail || buildEndMessage(winner, reason);
    state.pendingRequest = null;

    closeModal();
    stopClock();

    state.message = state.endDetail;
    renderAll();
  }

  function buildEndMessage(winner, reason) {
    if (winner === 0 || reason === "draw_agreed") {
      return "对局结束：双方和棋。";
    }
    if (reason === "timeout") {
      return `对局结束：${playerName(winner)}因对方超时获胜。`;
    }
    if (reason === "resign") {
      return `对局结束：${playerName(winner)}因对方认输获胜。`;
    }
    if (reason === "forbidden") {
      return `对局结束：${playerName(winner)}因对方禁手获胜。`;
    }
    return `对局结束：${playerName(winner)}获胜。`;
  }

  function renderAll() {
    renderStatus();
    renderBoard();
    renderModal();
  }

  function renderStatus() {
    if (state.phase === "idle") {
      dom.phaseText.textContent = "未开始，请先设置参数并开始新局。";
    } else if (state.phase === "playing") {
      dom.phaseText.textContent = state.pendingRequest
        ? "对局进行中：存在待确认请求，计时已暂停。"
        : "对局进行中。";
    } else {
      dom.phaseText.textContent = `对局结束：${state.endDetail || buildEndMessage(state.winner, state.endReason)}`;
    }

    dom.turnText.textContent = `当前行棋：${playerName(state.currentPlayer)}`;
    dom.turnText.classList.remove("black", "white");
    dom.turnText.classList.add(state.currentPlayer === BLACK ? "black" : "white");

    dom.blackGameClock.textContent = formatClock(state.timers.blackGameMs);
    dom.whiteGameClock.textContent = formatClock(state.timers.whiteGameMs);
    dom.moveClock.textContent = formatClock(
      state.phase === "playing" ? state.timers.currentMoveMs : state.config.moveSeconds * 1000
    );

    dom.blackUndoQuota.textContent = String(state.undoQuota.black);
    dom.whiteUndoQuota.textContent = String(state.undoQuota.white);
    dom.messageText.textContent = state.message;

    const disableOps = state.phase !== "playing" || Boolean(state.pendingRequest);
    dom.undoBtn.disabled = disableOps;
    dom.drawBtn.disabled = disableOps;
    dom.resignBtn.disabled = disableOps;
  }

  function renderModal() {
    if (!state.modal.visible) {
      dom.modalOverlay.classList.add("hidden");
      dom.modalOverlay.setAttribute("aria-hidden", "true");
      return;
    }

    dom.modalTitle.textContent = state.modal.title;
    dom.modalMessage.textContent = state.modal.message;
    dom.modalConfirm.textContent = state.modal.confirmText;
    dom.modalCancel.textContent = state.modal.cancelText;
    dom.modalOverlay.classList.remove("hidden");
    dom.modalOverlay.setAttribute("aria-hidden", "false");
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const available = Math.max(280, Math.min(760, Math.floor((dom.boardCard.clientWidth || 640) - 24)));

    dom.boardCanvas.style.width = `${available}px`;
    dom.boardCanvas.style.height = `${available}px`;
    dom.boardCanvas.width = Math.floor(available * dpr);
    dom.boardCanvas.height = Math.floor(available * dpr);

    dom.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const margin = Math.max(20, Math.round(available * 0.07));
    const cell = (available - margin * 2) / (BOARD_SIZE - 1);
    state.view.size = available;
    state.view.margin = margin;
    state.view.cell = cell;
  }

  function renderBoard() {
    const ctx = dom.ctx;
    const { size, margin, cell } = state.view;

    ctx.clearRect(0, 0, size, size);

    const bgGradient = ctx.createLinearGradient(0, 0, size, size);
    bgGradient.addColorStop(0, "#f6d9ac");
    bgGradient.addColorStop(1, "#e0b379");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = "#5f472f";
    ctx.lineWidth = 1;

    for (let i = 0; i < BOARD_SIZE; i += 1) {
      const pos = margin + i * cell;
      ctx.beginPath();
      ctx.moveTo(margin, pos);
      ctx.lineTo(size - margin, pos);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(pos, margin);
      ctx.lineTo(pos, size - margin);
      ctx.stroke();
    }

    drawStarPoints(ctx, margin, cell);
    drawStones(ctx, margin, cell);
    drawLastMoveMarker(ctx, margin, cell);
  }

  function drawStarPoints(ctx, margin, cell) {
    const points = [3, 7, 11];
    ctx.fillStyle = "#5d432b";
    for (const r of points) {
      for (const c of points) {
        const x = margin + c * cell;
        const y = margin + r * cell;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(2.4, cell * 0.075), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawStones(ctx, margin, cell) {
    const radius = cell * 0.42;
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const cellValue = state.board[row][col];
        if (cellValue === EMPTY) {
          continue;
        }

        const x = margin + col * cell;
        const y = margin + row * cell;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);

        const grad = ctx.createRadialGradient(
          x - radius * 0.35,
          y - radius * 0.35,
          radius * 0.2,
          x,
          y,
          radius
        );

        if (cellValue === BLACK) {
          grad.addColorStop(0, "#6f6f6f");
          grad.addColorStop(1, "#090909");
          ctx.fillStyle = grad;
          ctx.fill();
          ctx.strokeStyle = "#1a1a1a";
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          grad.addColorStop(0, "#ffffff");
          grad.addColorStop(1, "#d8d8d8");
          ctx.fillStyle = grad;
          ctx.fill();
          ctx.strokeStyle = "#a8a8a8";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }

  function drawLastMoveMarker(ctx, margin, cell) {
    if (state.moveHistory.length === 0) {
      return;
    }
    const last = state.moveHistory[state.moveHistory.length - 1];
    const x = margin + last.col * cell;
    const y = margin + last.row * cell;

    ctx.beginPath();
    ctx.arc(x, y, Math.max(2.5, cell * 0.08), 0, Math.PI * 2);
    ctx.fillStyle = "#d12a2a";
    ctx.fill();
  }

  function createEmptyBoard() {
    return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(EMPTY));
  }

  function inBounds(row, col) {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  }

  function otherPlayer(player) {
    return player === BLACK ? WHITE : BLACK;
  }

  function playerName(player) {
    return player === BLACK ? "黑方" : "白方";
  }

  function formatClock(ms) {
    const safe = Math.max(0, ms);
    const totalSeconds = Math.ceil(safe / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
    }
    return `${pad2(minutes)}:${pad2(seconds)}`;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
  } else {
    initApp();
  }

  window.gomokuDebug = {
    state,
    startGame,
    resetGame,
    checkFive,
    checkForbiddenPractical
  };
})();
