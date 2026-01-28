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
};

const elements = {
  playerCount: document.getElementById("player-count"),
  playerFields: document.getElementById("player-fields"),
  setupError: document.getElementById("setup-error"),
  launchGame: document.getElementById("launch-game"),
  currentPlayer: document.getElementById("current-player"),
  currentQuestion: document.getElementById("current-question"),
  timerValue: document.getElementById("timer-value"),
  micButton: document.getElementById("mic-button"),
  transcript: document.getElementById("transcript"),
  micStatus: document.getElementById("mic-status"),
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

function updateCountdown() {
  const elapsed = (Date.now() - state.timerStart) / 1000;
  const remaining = Math.max(0, MAX_TIME - elapsed);
  elements.timerValue.textContent = remaining.toFixed(2);
  if (remaining <= 0) {
    stopListening();
    handleAnswer("");
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

function handleAnswer(transcript) {
  stopListening();
  const elapsed = (Date.now() - state.timerStart) / 1000;
  const turn = state.turns[state.currentTurnIndex];
  const isValid = transcript
    ? validateAnswer(turn.question.answer, transcript)
    : false;
  const points = isValid ? computeScore(elapsed) : 0;
  state.players[turn.playerIndex].score += points;
  goToNextTurn();
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
  elements.transcript.textContent = "—";
  elements.micStatus.textContent = "";
  elements.micButton.disabled = false;
  showScreen("game");
}

function showScores() {
  showScreen("scores");
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
    elements.micButton.disabled = true;
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "fr-FR";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    elements.transcript.textContent = transcript;
    handleAnswer(transcript);
  };

  recognition.onerror = (event) => {
    if (event.error === "not-allowed") {
      elements.micStatus.textContent = i18n.fr.errors.micDenied;
    } else {
      elements.micStatus.textContent = "Erreur micro : " + event.error;
    }
    stopListening();
  };

  recognition.onend = () => {
    elements.micButton.disabled = false;
  };

  state.recognition = recognition;
}

function startListening() {
  if (!state.recognition) return;
  elements.micStatus.textContent = "Écoute en cours...";
  elements.micButton.disabled = true;
  startTimer();
  state.recognition.start();
}

function stopListening() {
  if (!state.recognition) return;
  state.recognition.stop();
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
  state.players = [];
  state.turns = [];
  state.currentTurnIndex = 0;
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
  elements.micButton.addEventListener("click", startListening);
  elements.skipButton.addEventListener("click", () => handleAnswer(""));
}

function init() {
  updatePlayerFields();
  setupRecognition();
  bindActions();
  showScreen("home");
}

init();
