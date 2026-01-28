const SCREENS = {
  home: document.getElementById("screen-home"),
  setup: document.getElementById("screen-setup"),
  ad: document.getElementById("screen-ad"),
  game: document.getElementById("screen-game"),
  scores: document.getElementById("screen-scores"),
  legal: document.getElementById("screen-legal"),
};

const i18n = {
  fr: {
    errors: {
      micDenied:
        "Accès au micro refusé. Autorisez le micro dans votre navigateur.",
      micUnavailable:
        "Reconnaissance vocale indisponible dans ce navigateur.",
    },
  },
};

const state = {
  mode: null,
  players: [],
  playerOrder: [],
  questions: [],
  turns: [],
  currentTurnIndex: 0,
  recognition: null,
  timerId: null,
  timerStart: 0,
  countdownId: null,
  isQuestionActive: false,
  isListening: false,
  answerHandled: false,
  micActivated: false,
  restartTimeoutId: null,
};

const elements = {
  playerCount: document.getElementById("player-count"),
  playerFields: document.getElementById("player-fields"),
  setupError: document.getElementById("setup-error"),
  launchGame: document.getElementById("launch-game"),
  currentPlayer: document.getElementById("current-player"),
  currentQuestion: document.getElementById("current-question"),
  timerValue: document.getElementById("timer-value"),
  transcript: document.getElementById("transcript"),
  micStatus: document.getElementById("mic-status"),
  micGate: document.getElementById("mic-gate"),
  micActivate: document.getElementById("mic-activate"),
  micErrorActions: document.getElementById("mic-error-actions"),
  micRetry: document.getElementById("mic-retry"),
  scoresList: document.getElementById("scores-list"),
  skipButton: document.getElementById("skip-button"),
};

const STOPWORDS = new Set([
  "le",
  "la",
  "les",
  "de",
  "du",
  "des",
  "et",
  "a",
  "à",
  "au",
  "aux",
  "un",
  "une",
  "en",
  "dans",
  "sur",
  "pour",
  "par",
  "avec",
  "sans",
  "ce",
  "cet",
  "cette",
  "ces",
  "mon",
  "ton",
  "son",
  "ma",
  "ta",
  "sa",
  "mes",
  "tes",
  "ses",
  "nous",
  "vous",
  "ils",
  "elles",
  "d",
  "l",
]);

const MAX_TIME = 10;

function showScreen(name) {
  Object.values(SCREENS).forEach((screen) =>
    screen.classList.remove("is-active")
  );
  SCREENS[name].classList.add("is-active");
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1)
    .filter((token) => !STOPWORDS.has(token));
}

function validateAnswer(expected, transcript) {
  const expectedTokens = normalizeText(expected);
  const transcriptTokens = new Set(normalizeText(transcript));
  return expectedTokens.every((token) => transcriptTokens.has(token));
}

function computeScore(seconds) {
  if (seconds <= 2) return 10;
  if (seconds <= 4) return 8;
  if (seconds <= 8) return 6;
  if (seconds <= 9) return 4;
  if (seconds <= 10) return 2;
  return 0;
}

function resetTimer() {
  clearInterval(state.timerId);
  clearInterval(state.countdownId);
  state.timerId = null;
  state.countdownId = null;
  elements.timerValue.textContent = MAX_TIME.toFixed(2);
}

function getRemainingSeconds() {
  const elapsed = (Date.now() - state.timerStart) / 1000;
  return Math.max(0, MAX_TIME - elapsed);
}

function updateCountdown() {
  const remaining = getRemainingSeconds();
  elements.timerValue.textContent = remaining.toFixed(2);
  if (remaining <= 0 && !state.answerHandled) {
    handleTimeout();
  }
}

function startTimer() {
  state.timerStart = Date.now();
  updateCountdown();
  state.countdownId = setInterval(updateCountdown, 100);
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length);
  if (!lines.length) return [];
  const separator =
    lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const rows = lines.map((line) =>
    line
      .split(separator)
      .map((cell) => cell.trim())
      .filter((cell) => cell.length)
  );
  const header = rows[0].map((cell) => cell.toLowerCase());
  const hasHeader = header.includes("question") && header.includes("answer");
  const dataRows = hasHeader ? rows.slice(1) : rows;

  return dataRows
    .map((cells) => {
      if (hasHeader) {
        const themeIndex = header.indexOf("theme");
        const questionIndex = header.indexOf("question");
        const answerIndex = header.indexOf("answer");
        return {
          theme: cells[themeIndex] || "",
          question: cells[questionIndex] || "",
          answer: cells[answerIndex] || "",
        };
      }
      return {
        theme: cells[0] || "",
        question: cells[1] || "",
        answer: cells[2] || "",
      };
    })
    .filter((row) => row.question && row.answer);
}

async function loadQuestions() {
  const response = await fetch("assets/questions.csv", { cache: "no-store" });
  const text = await response.text();
  return parseCSV(text);
}

function buildTurns() {
  const totalTurns = state.players.length * 4;
  const shuffledQuestions = shuffle(state.questions).slice(0, totalTurns);
  const playerOrder = shuffle(state.players.map((_, index) => index));
  state.playerOrder = playerOrder;
  const turns = [];
  for (let round = 0; round < 4; round += 1) {
    playerOrder.forEach((playerIndex) => {
      const question = shuffledQuestions[turns.length];
      turns.push({ playerIndex, question });
    });
  }
  state.turns = turns;
}

function setPlayers(names) {
  state.players = names.map((name) => ({ name, score: 0 }));
}

function updatePlayerFields() {
  const count = Number(elements.playerCount.value);
  elements.playerFields.innerHTML = "";
  for (let i = 0; i < count; i += 1) {
    const field = document.createElement("label");
    field.className = "field";
    field.innerHTML = `Pseudo joueur ${i + 1}<input type="text" data-player="${i}" required />`;
    elements.playerFields.appendChild(field);
  }
}

function showError(message) {
  elements.setupError.textContent = message;
}

function clearError() {
  elements.setupError.textContent = "";
}

function resetQuestionUI() {
  elements.transcript.textContent = "—";
  elements.micStatus.textContent = "";
  elements.micErrorActions.hidden = true;
}

function showMicGate() {
  elements.micGate.classList.add("is-active");
}

function hideMicGate() {
  elements.micGate.classList.remove("is-active");
}

function scheduleNextTurn() {
  const delay = 700 + Math.random() * 500;
  setTimeout(goToNextTurn, delay);
}

function finalizeTurn(message) {
  if (state.answerHandled) return;
  state.answerHandled = true;
  state.isQuestionActive = false;
  stopListening();
  elements.micStatus.textContent = message;
  scheduleNextTurn();
}

function handleTimeout() {
  finalizeTurn("Temps écoulé : 0 point.");
}

function startQuestionFlow() {
  resetQuestionUI();
  state.isQuestionActive = true;
  state.answerHandled = false;
  resetTimer();
  startTimer();
  startListeningForCurrentQuestion();
}

function startListeningForCurrentQuestion() {
  if (!state.recognition || state.isListening || !state.isQuestionActive) return;
  const remaining = getRemainingSeconds();
  if (remaining <= 0.5) return;
  try {
    state.isListening = true;
    state.recognition.start();
    elements.micStatus.textContent = "J'écoute...";
  } catch (error) {
    state.isListening = false;
  }
}

function safeRestartListeningIfNeeded() {
  if (!state.isQuestionActive || state.answerHandled) return;
  if (state.restartTimeoutId) return;
  const remaining = getRemainingSeconds();
  if (remaining <= 0.5) return;
  state.restartTimeoutId = setTimeout(() => {
    state.restartTimeoutId = null;
    startListeningForCurrentQuestion();
  }, 200);
}

function handleAnswer(transcript) {
  if (state.answerHandled) return;
  const elapsed = (Date.now() - state.timerStart) / 1000;
  const turn = state.turns[state.currentTurnIndex];
  const isValid = transcript
    ? validateAnswer(turn.question.answer, transcript)
    : false;
  if (!isValid) {
    elements.micStatus.textContent = "Pas encore...";
    return;
  }
  const points = computeScore(elapsed);
  state.players[turn.playerIndex].score += points;
  finalizeTurn(`Validé +${points} points !`);
}

function goToNextTurn() {
  resetTimer();
  state.currentTurnIndex += 1;
  if (state.currentTurnIndex >= state.turns.length) {
    showScores();
    return;
  }
  prepareTurn();
}

function prepareTurn() {
  const turn = state.turns[state.currentTurnIndex];
  elements.currentPlayer.textContent = state.players[turn.playerIndex].name;
  elements.currentQuestion.textContent = turn.question.question;
  resetQuestionUI();
  showScreen("game");
  if (state.micActivated) {
    startQuestionFlow();
  } else {
    showMicGate();
  }
}

function showScores() {
  showScreen("scores");
  stopListening();
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  elements.scoresList.innerHTML = "";
  sorted.forEach((player, index) => {
    const row = document.createElement("div");
    row.className = "score-row";
    row.innerHTML = `
      <span class="score-rank">#${index + 1}</span>
      <span>${player.name}</span>
      <span>${player.score} pts</span>
    `;
    elements.scoresList.appendChild(row);
  });
}

function setupRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    elements.micStatus.textContent = i18n.fr.errors.micUnavailable;
    elements.micErrorActions.hidden = false;
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "fr-FR";
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    state.isListening = true;
  };

  recognition.onresult = (event) => {
    let interimTranscript = "";
    let finalTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (result.isFinal) {
        finalTranscript += result[0].transcript + " ";
      } else {
        interimTranscript += result[0].transcript + " ";
      }
    }
    const combined = (finalTranscript || interimTranscript).trim();
    if (combined) {
      elements.transcript.textContent = combined;
    }
    if (finalTranscript.trim()) {
      handleAnswer(finalTranscript.trim());
    }
  };

  recognition.onerror = (event) => {
    state.isListening = false;
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      elements.micStatus.textContent = i18n.fr.errors.micDenied;
      elements.micErrorActions.hidden = false;
      state.isQuestionActive = false;
      return;
    }
    if (event.error === "no-speech" || event.error === "aborted") {
      safeRestartListeningIfNeeded();
      return;
    }
    elements.micStatus.textContent = "Erreur micro : " + event.error;
    safeRestartListeningIfNeeded();
  };

  recognition.onend = () => {
    state.isListening = false;
    safeRestartListeningIfNeeded();
  };

  state.recognition = recognition;
}

function stopListening() {
  if (!state.recognition) return;
  state.isListening = false;
  try {
    state.recognition.stop();
  } catch (error) {
    // ignore stop errors
  }
}

function setupAdCountdown() {
  let remaining = 5;
  elements.launchGame.disabled = true;
  elements.launchGame.textContent = `Lancer la partie (${remaining}s)`;
  const interval = setInterval(() => {
    remaining -= 1;
    elements.launchGame.textContent =
      remaining > 0
        ? `Lancer la partie (${remaining}s)`
        : "Lancer la partie";
    if (remaining <= 0) {
      clearInterval(interval);
      elements.launchGame.disabled = false;
    }
  }, 1000);
}

async function startGame(mode) {
  state.mode = mode;
  state.currentTurnIndex = 0;
  state.turns = [];
  state.micActivated = false;
  state.questions = await loadQuestions();

  if (!state.questions.length) {
    alert("Aucune question valide dans le CSV.");
    showScreen("home");
    return;
  }

  if (mode === "training") {
    setPlayers(["Joueur solo"]);
  }

  buildTurns();
  prepareTurn();
}

function handleSetupConfirm() {
  const inputs = [...elements.playerFields.querySelectorAll("input")];
  const names = inputs.map((input) => input.value.trim());
  if (names.some((name) => !name)) {
    showError("Tous les pseudos sont obligatoires.");
    return;
  }
  clearError();
  setPlayers(names);
  showScreen("ad");
  setupAdCountdown();
}

function resetGame() {
  resetTimer();
  stopListening();
  hideMicGate();
  state.players = [];
  state.turns = [];
  state.currentTurnIndex = 0;
  state.isQuestionActive = false;
  state.answerHandled = false;
  state.micActivated = false;
  if (state.restartTimeoutId) {
    clearTimeout(state.restartTimeoutId);
    state.restartTimeoutId = null;
  }
}

function bindActions() {
  document.body.addEventListener("click", (event) => {
    const action = event.target.dataset.action;
    if (!action) return;
    switch (action) {
      case "start-challenge":
        showScreen("setup");
        break;
      case "start-training":
        resetGame();
        startGame("training");
        break;
      case "confirm-setup":
        handleSetupConfirm();
        break;
      case "back-home":
        resetGame();
        showScreen("home");
        break;
      case "open-legal":
        showScreen("legal");
        break;
      case "restart":
        resetGame();
        showScreen("home");
        break;
      default:
        break;
    }
  });

  elements.playerCount.addEventListener("change", updatePlayerFields);
  elements.launchGame.addEventListener("click", () => startGame("challenge"));
  elements.micActivate.addEventListener("click", () => {
    state.micActivated = true;
    hideMicGate();
    startQuestionFlow();
  });
  elements.micRetry.addEventListener("click", () => {
    elements.micErrorActions.hidden = true;
    state.micActivated = true;
    hideMicGate();
    startQuestionFlow();
  });
  elements.skipButton.addEventListener("click", () =>
    finalizeTurn("Passé : 0 point.")
  );
}

function init() {
  updatePlayerFields();
  setupRecognition();
  bindActions();
  showScreen("home");
}

init();
