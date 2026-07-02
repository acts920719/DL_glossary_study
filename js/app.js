(function () {
  'use strict';

  const STORAGE_KEY = 'glossary_learned';
  const THEME_KEY = 'glossary_theme';

  const data = window.GLOSSARY_DATA;
  if (!data) {
    document.body.innerHTML = '<p style="padding:2rem;color:#f87171">용어 데이터를 불러올 수 없습니다. data/terms.js 파일을 확인하세요.</p>';
    return;
  }

  let learned = loadLearned();
  let currentChapter = 'all';
  let searchQuery = '';
  let hideLearned = false;
  let currentMode = 'browse';

  let flashIndex = 0;
  let flashDeck = [];
  let flashFlipped = false;

  let quizDeck = [];
  let quizIndex = 0;
  let quizScore = 0;
  let quizActive = false;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function loadLearned() {
    try {
      return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
    } catch {
      return new Set();
    }
  }

  function saveLearned() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...learned]));
    updateStats();
  }

  function getTheme() {
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  }

  function updateThemeToggleUI(theme) {
    const icon = $('#themeIcon');
    const label = $('#themeLabel');
    if (!icon || !label) return;
    if (theme === 'light') {
      icon.textContent = '🌙';
      label.textContent = '다크 모드';
    } else {
      icon.textContent = '☀️';
      label.textContent = '화이트 모드';
    }
  }

  function applyTheme(theme) {
    const next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    updateThemeToggleUI(next);
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const theme = saved === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    updateThemeToggleUI(theme);
  }

  function toggleTheme() {
    applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
  }

  function getAllTerms() {
    return data.chapters.flatMap((ch, ci) =>
      ch.terms.map((t) => ({
        ...t,
        chapterIndex: ci,
        chapterLabel: ch.label,
        chapterTopic: ch.topic,
      }))
    );
  }

  function getFilteredTerms() {
    let terms = getAllTerms();

    if (currentChapter !== 'all') {
      const idx = parseInt(currentChapter, 10);
      terms = terms.filter((t) => t.chapterIndex === idx);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      terms = terms.filter((t) => {
        const blob = [t.title, t.definition, t.easy, t.example, t.industry, t.project, t.chapterTopic]
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      });
    }

    if (hideLearned) {
      terms = terms.filter((t) => !learned.has(t.uid));
    }

    return terms;
  }

  function formatBullets(text) {
    if (!text) return '';
    const lines = text.split('\n').filter(Boolean);
    if (lines.every((l) => !l.startsWith('-'))) {
      return `<p>${escapeHtml(text)}</p>`;
    }
    return `<ul>${lines.map((l) => `<li>${escapeHtml(l.replace(/^-\s*/, ''))}</li>`).join('')}</ul>`;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/'/g, '&#39;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '…' : str;
  }

  function updateStats() {
    const total = data.totalTerms;
    const learnedCount = learned.size;
    $('#statLearned').textContent = learnedCount;
    $('#statTotal').textContent = total;
    $('#progressFill').style.width = `${total ? (learnedCount / total) * 100 : 0}%`;
  }

  function renderChapterNav() {
    const nav = $('#chapterNav');
    nav.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = `chapter-btn${currentChapter === 'all' ? ' active' : ''}`;
    allBtn.innerHTML = '<span class="chapter-label">전체</span>모든 용어 보기';
    allBtn.addEventListener('click', () => {
      currentChapter = 'all';
      renderChapterNav();
      renderBrowse();
      rebuildFlashDeck();
    });
    nav.appendChild(allBtn);

    data.chapters.forEach((ch, i) => {
      const btn = document.createElement('button');
      btn.className = `chapter-btn${currentChapter === String(i) ? ' active' : ''}`;
      btn.innerHTML = `<span class="chapter-label">${escapeHtml(ch.label)}</span>${escapeHtml(ch.topic)} <span style="opacity:0.6">(${ch.terms.length})</span>`;
      btn.addEventListener('click', () => {
        currentChapter = String(i);
        renderChapterNav();
        renderBrowse();
        rebuildFlashDeck();
        syncChapterSelects();
      });
      nav.appendChild(btn);
    });
  }

  function syncChapterSelects() {
    const val = currentChapter === 'all' ? '0' : currentChapter;
    $('#flashChapterSelect').value = val;
    $('#quizChapterSelect').value = val;
  }

  function populateSelects() {
    ['flashChapterSelect', 'quizChapterSelect'].forEach((id) => {
      const sel = $(`#${id}`);
      sel.innerHTML = '';
      data.chapters.forEach((ch, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `${ch.label} — ${ch.topic}`;
        sel.appendChild(opt);
      });
    });
  }

  function renderBrowse() {
    const terms = getFilteredTerms();
    const grid = $('#termGrid');
    const empty = $('#browseEmpty');

    const title =
      currentChapter === 'all'
        ? searchQuery
          ? `검색: "${searchQuery}"`
          : '전체 용어'
        : data.chapters[parseInt(currentChapter, 10)].topic;

    $('#browseTitle').textContent = title;
    $('#browseCount').textContent = `${terms.length}개`;

    if (terms.length === 0) {
      grid.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }

    empty.classList.add('hidden');
    grid.innerHTML = terms
      .map(
        (t) => `
      <article class="term-card${learned.has(t.uid) ? ' learned' : ''}" data-uid="${t.uid}">
        <div class="term-card-num">${escapeHtml(t.chapterLabel)} · #${t.num}</div>
        <h3 class="term-card-title">${escapeHtml(t.title)}</h3>
        <p class="term-card-preview">${escapeHtml(truncate(t.easy || t.definition, 80))}</p>
        <div class="term-card-chapter">${escapeHtml(t.chapterTopic)}</div>
      </article>`
      )
      .join('');

    grid.querySelectorAll('.term-card').forEach((card) => {
      card.addEventListener('click', () => openModal(card.dataset.uid));
    });
  }

  function openModal(uid) {
    const term = getAllTerms().find((t) => t.uid === uid);
    if (!term) return;

    const sections = [
      { key: 'definition', label: '사전용어' },
      { key: 'easy', label: '쉬운 설명' },
      { key: 'example', label: '실생활 예시' },
      { key: 'industry', label: '현업에서는 언제 쓰나' },
      { key: 'project', label: '우리 프로젝트 연결' },
    ];

    const body = sections
      .filter((s) => term[s.key])
      .map(
        (s) => `
      <div class="modal-section">
        <div class="modal-section-title">${s.label}</div>
        <div class="modal-section-body">${formatBullets(term[s.key])}</div>
      </div>`
      )
      .join('');

    const isLearned = learned.has(term.uid);

    $('#modalBody').innerHTML = `
      <h2 class="modal-term-title">${escapeHtml(term.title)}</h2>
      <p class="modal-term-chapter">${escapeHtml(term.chapterLabel)} · ${escapeHtml(term.chapterTopic)}</p>
      ${body}
      <div class="modal-actions">
        <button class="btn btn-primary" id="modalToggleLearned">
          ${isLearned ? '학습 완료 해제' : '학습 완료 ✓'}
        </button>
      </div>`;

    $('#modalToggleLearned').addEventListener('click', () => {
      toggleLearned(term.uid);
      openModal(uid);
      renderBrowse();
    });

    $('#termModal').classList.remove('hidden');
  }

  function closeModal() {
    $('#termModal').classList.add('hidden');
  }

  function toggleLearned(uid) {
    if (learned.has(uid)) learned.delete(uid);
    else learned.add(uid);
    saveLearned();
  }

  function rebuildFlashDeck() {
    const chapterIdx =
      currentMode === 'flashcard'
        ? parseInt($('#flashChapterSelect').value, 10)
        : currentChapter === 'all'
          ? 0
          : parseInt(currentChapter, 10);

    flashDeck = data.chapters[chapterIdx].terms.map((t) => ({
      ...t,
      chapterLabel: data.chapters[chapterIdx].label,
      chapterTopic: data.chapters[chapterIdx].topic,
    }));

    if (flashIndex >= flashDeck.length) flashIndex = 0;
    renderFlashcard();
  }

  function renderFlashcard() {
    if (flashDeck.length === 0) return;

    const term = flashDeck[flashIndex];
    flashFlipped = false;
    $('#flashcard').classList.remove('flipped');

    $('#flashChapter').textContent = `${term.chapterLabel} · ${term.chapterTopic}`;
    $('#flashTitle').textContent = term.title;
    $('#flashProgress').textContent = `${flashIndex + 1} / ${flashDeck.length}`;

    $('#flashEasy').innerHTML = term.easy
      ? `<div class="flash-section-label">쉬운 설명</div><p>${escapeHtml(term.easy)}</p>`
      : term.definition
        ? `<div class="flash-section-label">사전용어</div><p>${escapeHtml(term.definition)}</p>`
        : '';

    $('#flashExample').innerHTML = term.example
      ? `<div class="flash-section-label">실생활 예시</div><p>${escapeHtml(term.example)}</p>`
      : '';
  }

  function flipFlashcard() {
    flashFlipped = !flashFlipped;
    $('#flashcard').classList.toggle('flipped', flashFlipped);
  }

  function nextFlash(delta) {
    flashIndex = (flashIndex + delta + flashDeck.length) % flashDeck.length;
    renderFlashcard();
  }

  function startQuiz() {
    const chapterIdx = parseInt($('#quizChapterSelect').value, 10);
    const terms = [...data.chapters[chapterIdx].terms];
    shuffle(terms);
    quizDeck = terms.slice(0, Math.min(10, terms.length));
    quizIndex = 0;
    quizScore = 0;
    quizActive = true;

    $('#quizStart').classList.add('hidden');
    $('#quizDone').classList.add('hidden');
    $('#quizCard').classList.remove('hidden');
    $('#quizFeedback').classList.add('hidden');
    $('#quizScore').textContent = '0';
    $('#quizTotal').textContent = String(quizDeck.length);

    renderQuizQuestion();
  }

  function renderQuizQuestion() {
    if (quizIndex >= quizDeck.length) {
      finishQuiz();
      return;
    }

    const current = quizDeck[quizIndex];
    const chapterTerms = data.chapters[parseInt($('#quizChapterSelect').value, 10)].terms;
    const others = chapterTerms.filter((t) => t.uid !== current.uid);
    shuffle(others);
    const options = [current, ...others.slice(0, 3)];
    shuffle(options);

    const questionText = current.easy || current.definition;
    $('#quizQuestion').textContent = questionText;

    const optsEl = $('#quizOptions');
    optsEl.innerHTML = options
      .map(
        (o) =>
          `<button class="quiz-option" data-uid="${o.uid}">${escapeHtml(o.title)}</button>`
      )
      .join('');

    optsEl.querySelectorAll('.quiz-option').forEach((btn) => {
      btn.addEventListener('click', () => answerQuiz(btn, current.uid));
    });

    $('#quizFeedback').classList.add('hidden');
  }

  function answerQuiz(btn, correctUid) {
    const chosen = btn.dataset.uid;
    const correct = chosen === correctUid;

    if (correct) quizScore += 1;
    $('#quizScore').textContent = String(quizScore);

    $$('.quiz-option').forEach((b) => {
      b.disabled = true;
      if (b.dataset.uid === correctUid) b.classList.add('correct');
      else if (b.dataset.uid === chosen) b.classList.add('wrong');
    });

    const term = quizDeck[quizIndex];
    $('#quizFeedbackText').textContent = correct
      ? `정답! 🎉 "${term.title}"`
      : `오답. 정답은 "${term.title}" 입니다.`;

    $('#quizFeedback').classList.remove('hidden');
  }

  function finishQuiz() {
    quizActive = false;
    $('#quizCard').classList.add('hidden');
    $('#quizFeedback').classList.add('hidden');
    $('#quizDone').classList.remove('hidden');
    const pct = Math.round((quizScore / quizDeck.length) * 100);
    $('#quizResultText').textContent = `${quizDeck.length}문제 중 ${quizScore}개 정답 (${pct}%)`;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function setMode(mode) {
    currentMode = mode;
    $$('.mode-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.mode === mode);
    });
    $$('.panel').forEach((p) => p.classList.remove('active'));

    if (mode === 'browse') {
      $('#browsePanel').classList.add('active');
    } else if (mode === 'flashcard') {
      $('#flashcardPanel').classList.add('active');
      rebuildFlashDeck();
    } else if (mode === 'quiz') {
      $('#quizPanel').classList.add('active');
      if (!quizActive) {
        $('#quizStart').classList.remove('hidden');
        $('#quizCard').classList.add('hidden');
        $('#quizDone').classList.add('hidden');
      }
    }
  }

  function init() {
    initTheme();
    renderChapterNav();
    populateSelects();
    renderBrowse();
    updateStats();

    $('#searchInput').addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      renderBrowse();
    });

    $('#hideLearned').addEventListener('change', (e) => {
      hideLearned = e.target.checked;
      renderBrowse();
    });

    $$('.mode-tab').forEach((tab) => {
      tab.addEventListener('click', () => setMode(tab.dataset.mode));
    });

    $('#menuToggle').addEventListener('click', () => {
      $('#sidebar').classList.toggle('open');
    });

    $('#themeToggle').addEventListener('click', toggleTheme);

    $('#flashcard').addEventListener('click', flipFlashcard);
    $('#flashPrev').addEventListener('click', () => nextFlash(-1));
    $('#flashNext').addEventListener('click', () => nextFlash(1));
    $('#flashLearned').addEventListener('click', () => {
      if (flashDeck[flashIndex]) {
        toggleLearned(flashDeck[flashIndex].uid);
        nextFlash(1);
      }
    });

    $('#flashChapterSelect').addEventListener('change', () => {
      flashIndex = 0;
      rebuildFlashDeck();
    });

    $('#quizChapterSelect').addEventListener('change', () => {
      if (quizActive) startQuiz();
    });

    $('#quizStartBtn').addEventListener('click', startQuiz);
    $('#quizNext').addEventListener('click', () => {
      quizIndex += 1;
      renderQuizQuestion();
    });
    $('#quizRestart').addEventListener('click', startQuiz);

    $('#modalClose').addEventListener('click', closeModal);
    $('#modalBackdrop').addEventListener('click', closeModal);

    document.addEventListener('keydown', (e) => {
      if (currentMode !== 'flashcard') return;
      if (e.target.matches('input, select, textarea')) return;

      if (e.code === 'Space') {
        e.preventDefault();
        flipFlashcard();
      } else if (e.code === 'ArrowRight') {
        nextFlash(1);
      } else if (e.code === 'ArrowLeft') {
        nextFlash(-1);
      } else if (e.code === 'Enter') {
        if (flashDeck[flashIndex]) toggleLearned(flashDeck[flashIndex].uid);
      }
    });
  }

  init();
})();
