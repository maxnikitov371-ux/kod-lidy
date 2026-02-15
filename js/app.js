/* app.js - логика квеста "Код Лиды"
   Что делает:
   - подгружает данные квеста (QUEST_DATA)
   - отображает карту/точку/источники/финал/бонус
   - проверяет ответы (test/text)
   - хранит прогресс в localStorage
*/

document.addEventListener('DOMContentLoaded', () => {
  try {
    ensureQuestDataLoaded();
  } catch (err) {
    renderFatalError(err);
    return;
  }

  const path = window.location.pathname;

  if (path.endsWith('index.html') || path === '/' || path.endsWith('/index.html')) {
    loadIndexPage();
  } else if (path.endsWith('map.html') || path.endsWith('/map.html')) {
    loadMapPage();
  } else if (path.endsWith('point.html') || path.endsWith('/point.html')) {
    loadPointPage();
  } else if (path.endsWith('progress.html') || path.endsWith('/progress.html')) {
    loadProgressPage();
  } else if (path.endsWith('sources.html') || path.endsWith('/sources.html')) {
    loadSourcesPage();
  } else if (path.endsWith('final.html') || path.endsWith('/final.html')) {
    loadFinalPage();
  } else if (path.endsWith('bonus.html') || path.endsWith('/bonus.html')) {
    loadBonusPage();
  }
});

/** Данные квеста (встроены в js/quest-data.js) */
let QUEST_DATA = null;

function ensureQuestDataLoaded() {
  if (!window.QUEST_DATA || !Array.isArray(window.QUEST_DATA.points)) {
    throw new Error('Не найдены встроенные данные квеста (window.QUEST_DATA).');
  }
  QUEST_DATA = window.QUEST_DATA;
  return QUEST_DATA;
}

function renderFatalError(err) {
  console.error(err);

  const main = document.querySelector('main.container') || document.querySelector('main') || document.body;
  const msg = (err && err.message) ? err.message : String(err);

  const section = document.createElement('section');
  section.className = 'card';

  const h2 = document.createElement('h2');
  h2.textContent = 'Ошибка загрузки данных квеста';

  const p1 = document.createElement('p');
  p1.textContent = `Сайт не смог загрузить файл с вопросами: ${msg}`;

  const p2 = document.createElement('p');
  p2.className = 'muted';
  p2.innerHTML = 'Проверь, что файл <code>js/quest-data.js</code> подключен перед <code>js/app.js</code> и содержит объект <code>window.QUEST_DATA</code>.';

  const ol = document.createElement('ol');
  const li1 = document.createElement('li');
  li1.innerHTML = 'Открой страницу <code>index.html</code> из корня проекта.';
  const li2 = document.createElement('li');
  li2.innerHTML = 'Убедись, что путь к скриптам и папке <code>assets</code> не изменен.';
  ol.append(li1, li2);

  section.append(h2, p1, p2, ol);
  main.innerHTML = '';
  main.appendChild(section);
}

/** === Хранилище прогресса === */
const STORAGE_KEY = 'kod-lidy-progress-v1';

function getEmptyProgress() {
  return {
    completedPoints: {},          // { "1": true, ... }
    pointQuestionIndex: {},       // { "1": 0, ... }
    letters: {},                  // { "1": "К", ... }
    unlockedFinal: false,
    unlockedBonus: false
  };
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getEmptyProgress();
    const parsed = JSON.parse(raw);
    return {
      ...getEmptyProgress(),
      ...parsed,
      completedPoints: parsed.completedPoints || {},
      pointQuestionIndex: parsed.pointQuestionIndex || {},
      letters: parsed.letters || {}
    };
  } catch {
    return getEmptyProgress();
  }
}

function saveProgress(p) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

function resetProgress() {
  localStorage.removeItem(STORAGE_KEY);
}

function computeKeywordFromLetters(p) {
  const letters = [];
  for (let i = 1; i <= 8; i++) {
    const l = p.letters[String(i)];
    if (!l) return null;
    letters.push(l);
  }
  return letters.join('');
}

function recomputeUnlocks(p) {
  const allDone = QUEST_DATA.points.every(pt => p.completedPoints[String(pt.id)]);
  p.unlockedFinal = allDone;
  // бонус открываем только после успешного ключевого слова
  return p;
}

function isPointAvailable(p, id) {
  const sid = String(id);
  if (p.completedPoints[sid]) return true;
  if (id === 1) return true;
  return !!p.completedPoints[String(id - 1)];
}

/** === Нормализация и проверка ответов === */
function normalize(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/["“”'’`]/g, '')
    // всё, что не буквы/цифры - в пробел
    .replace(/[^0-9a-zа-я]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitTextToParagraphs(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return [];

  const manual = raw.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (manual.length > 1) return manual;

  const sentences = raw.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
  if (sentences.length <= 2) return [raw];

  const target = Math.max(Math.ceil(raw.length / 2), 140);
  const paragraphs = [];
  let current = '';

  sentences.forEach((sentence) => {
    const next = current ? `${current} ${sentence}` : sentence;
    if (current && next.length > target && paragraphs.length === 0) {
      paragraphs.push(current);
      current = sentence;
      return;
    }
    current = next;
  });

  if (current) paragraphs.push(current);
  return paragraphs.length ? paragraphs : [raw];
}

function renderParagraphText(container, text) {
  if (!container) return;
  container.innerHTML = '';
  const paragraphs = splitTextToParagraphs(text);

  paragraphs.forEach((paragraph) => {
    const p = document.createElement('p');
    p.textContent = paragraph;
    container.appendChild(p);
  });
}

// Мягкая проверка:
// 1) точное совпадение нормализованных строк
// 2) для фраз - все слова ответа должны встречаться в ответе пользователя
// 3) для коротких ответов - допускаем "содержит" (например, 2008 / гранит)
function answerMatches(userAnswer, allowedAnswers) {
  const ua = normalize(userAnswer);
  if (!ua) return false;

  return (allowedAnswers || []).some((a) => {
    const an = normalize(a);
    if (!an) return false;

    if (an === ua) return true;

    const words = an.split(' ').filter(w => w.length > 1);
    if (words.length >= 2) {
      return words.every(w => ua.includes(w));
    }

    // одиночное слово/число
    if (an.length <= 6) return ua.includes(an);
    return ua.includes(an) || an.includes(ua);
  });
}

/** === Общая загрузка данных === */
function fetchQuest() {
  // Используем встроенные данные из window.QUEST_DATA
  return Promise.resolve(QUEST_DATA);
}

/** === INDEX === */
function loadIndexPage() {
  const p = recomputeUnlocks(loadProgress());
  saveProgress(p);

  const done = Object.keys(p.completedPoints).length;
  const total = QUEST_DATA.points.length;

  const el = document.querySelector('[data-progress]');
  if (el) el.textContent = `${done}/${total}`;

  const progressBar = document.querySelector('.route-progressbar');
  if (progressBar) progressBar.value = done;

  const cont = document.querySelector('[data-letters]');
  if (cont) {
    const letters = [];
    for (let i = 1; i <= total; i++) {
      letters.push(p.letters[String(i)] || '-');
    }
    cont.textContent = letters.join(' ');
  }

  // Подсказка "Следующий шаг"
  const nextEl = document.querySelector('[data-nextstep]');
  if (nextEl) {
    if (done >= total) {
      nextEl.textContent = 'Все точки пройдены - можно переходить в "Финал". Бонус откроется после успешного финала.';
    } else {
      // следующая доступная точка
      let nextPoint = null;
      for (let i = 1; i <= total; i++) {
        if (!p.completedPoints[String(i)] && isPointAvailable(p, i)) {
          nextPoint = QUEST_DATA.points.find(pt => pt.id === i) || null;
          break;
        }
      }

      if (nextPoint) {
        nextEl.textContent = `Следующий шаг: открой карту и выбери точку ${nextPoint.id} - "${nextPoint.title}".`;
      } else {
        nextEl.textContent = 'Следующий шаг: открой карту и выбери доступную точку.';
      }
    }
  }

  const resetBtn = document.querySelector('[data-reset]');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('Сбросить прогресс квеста на этом устройстве?')) {
        resetProgress();
        window.location.reload();
      }
    });
  }

  const listEl = document.querySelector('[data-route-list]');
  const hintEl = document.querySelector('.route-hint');
  if (listEl) {
    fetchQuest()
      .then(() => {
        renderRouteList(listEl, hintEl, p, 'pages/point.html?id=');
      })
      .catch(console.error);
  }
}

/** === MAP === */
function loadMapPage() {
  const p = recomputeUnlocks(loadProgress());
  saveProgress(p);
  toggleNavLocks(p);

  if (window.KodLidyMap && typeof window.KodLidyMap.initMapPage === 'function') {
    window.KodLidyMap.initMapPage({
      questData: QUEST_DATA,
      loadProgress,
      isPointAvailable
    });
  }
}

/** === PROGRESS === */
function loadProgressPage() {
  const p = recomputeUnlocks(loadProgress());
  saveProgress(p);
  toggleNavLocks(p);

  const done = Object.keys(p.completedPoints).length;
  const total = QUEST_DATA.points.length;

  const progEl = document.querySelector('[data-progress]');
  if (progEl) progEl.textContent = `${done}/${total}`;

  const lettersEl = document.querySelector('[data-letters]');
  if (lettersEl) {
    const letters = [];
    for (let i = 1; i <= total; i++) {
      letters.push(p.letters[String(i)] || '-');
    }
    lettersEl.textContent = letters.join(' ');
  }

  const nextEl = document.querySelector('[data-nextstep]');
  if (nextEl) {
    if (done >= total) {
      nextEl.textContent = 'Все точки пройдены - можно переходить в "Финал". Бонус откроется после успешного финала.';
    } else {
      let nextPoint = null;
      for (let i = 1; i <= total; i++) {
        if (!p.completedPoints[String(i)] && isPointAvailable(p, i)) {
          nextPoint = QUEST_DATA.points.find(pt => pt.id === i) || null;
          break;
        }
      }

      if (nextPoint) {
        nextEl.textContent = `Следующий шаг: открой карту и выбери точку ${nextPoint.id} - "${nextPoint.title}".`;
      } else {
        nextEl.textContent = 'Следующий шаг: открой карту и выбери доступную точку.';
      }
    }
  }

  const resetBtn = document.querySelector('[data-reset]');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('Сбросить прогресс квеста на этом устройстве?')) {
        resetProgress();
        window.location.reload();
      }
    });
  }
}

function renderRouteList(listEl, hintEl, p, baseHref) {
  if (!listEl || !QUEST_DATA) return;
  listEl.innerHTML = '';
  if (hintEl) hintEl.textContent = '';
  let hintTimer = null;

  const showHint = (msg) => {
    if (!hintEl) return;
    hintEl.textContent = msg;
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      hintEl.textContent = '';
    }, 3500);
  };

  QUEST_DATA.points.forEach((point, index) => {
    const li = document.createElement('li');
    li.className = 'route-row';

    const num = document.createElement('span');
    num.className = 'route-num';
    num.textContent = String(index + 1);
    li.appendChild(num);

    const title = document.createElement('span');
    title.className = 'route-title';
    title.textContent = point.title;
    li.appendChild(title);

    const available = isPointAvailable(p, point.id);
    const completed = !!p.completedPoints[String(point.id)];

    if (completed) {
      const letter = p.letters[String(point.id)] || point.letter || '';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'route-action-button action-button action-button-neutral';
      btn.setAttribute('aria-disabled', 'true');
      btn.textContent = `Буква: ${letter}`;
      li.appendChild(btn);
      listEl.appendChild(li);
      return;
    }

    if (available) {
      const a = document.createElement('a');
      a.className = 'route-action-button action-button action-button-primary';
      a.href = `${baseHref}${point.id}`;
      a.textContent = 'Пройти тест';
      li.appendChild(a);
      listEl.appendChild(li);
      return;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'route-action-button action-button action-button-muted';
    btn.setAttribute('aria-disabled', 'true');
    btn.textContent = 'Тест закрыт';
    const hintMsg = 'Сначала пройди предыдущую точку маршрута, чтобы открыть эту.';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      showHint(hintMsg);
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showHint(hintMsg);
      }
    });
    li.appendChild(btn);
    listEl.appendChild(li);
  });
}

/** === POINT === */
function loadPointPage() {
  const params = new URLSearchParams(window.location.search);
  const id = parseInt(params.get('id'), 10) || 1;

  const p = recomputeUnlocks(loadProgress());
  saveProgress(p);

  if (!isPointAvailable(p, id)) {
    alert('Эта точка пока закрыта. Пройди предыдущую точку.');
    window.location.href = 'map.html';
    return;
  }

  fetchQuest()
    .then((data) => {
      const point = data.points.find((pt) => pt.id === id);
      if (!point) return;

      const titleEl = document.getElementById('point-title');
      const textEl = document.getElementById('point-text');
      const questionEl = document.getElementById('question-text');

      if (titleEl) titleEl.textContent = point.title ? `${point.title}:` : '';
      renderParagraphText(textEl, point.text);

      
// картинка
const imgEl = document.getElementById('point-image');
if (imgEl) {
  const base = (window.location.pathname || '').includes('/pages/') ? '../' : '';
  if (point.image) {
    imgEl.src = `${base}${point.image}`;
  }
}

// какой вопрос сейчас

      const qIndex = Number(p.pointQuestionIndex[String(id)] || 0);
      const q = point.questions?.[qIndex];
      if (!q) {
        // если вдруг вопросов нет - считаем точку пройденной
        markPointCompleted(p, point);
        saveProgress(p);
        window.location.href = 'map.html';
        return;
      }

      // рендер вопроса
      if (questionEl) questionEl.textContent = q.text;

      const hintEl = document.getElementById('answer-hint');
      if (hintEl) {
        hintEl.textContent = `Вопрос ${qIndex + 1} из ${point.questions.length}`;
      }

      renderAnswerUI(q);

      // сабмит формы
      const form = document.getElementById('answer-form');
      if (!form) return;

      form.addEventListener('submit', (e) => {
        e.preventDefault();

        const res = getUserAnswer(q);
        if (!res.ok) {
          showAnswerMessage('Выбери вариант ответа.', true);
          return;
        }

        const isCorrect = answerMatches(res.value, q.answers);

        if (!isCorrect) {
          showAnswerMessage('Неверно. Попробуй ещё раз.', true);
          return;
        }

        // корректно
        showAnswerMessage('Верно ✅', false);

        // следующий вопрос или завершение точки
        const nextIndex = qIndex + 1;
        if (nextIndex < point.questions.length) {
          p.pointQuestionIndex[String(id)] = nextIndex;
          saveProgress(p);
          // перезагрузим UI под следующий вопрос
          setTimeout(() => window.location.reload(), 300);
        } else {
          // точка пройдена
          markPointCompleted(p, point);
          p.pointQuestionIndex[String(id)] = 0;
          recomputeUnlocks(p);
          saveProgress(p);

          // если открыли финал - предложим перейти
          setTimeout(() => {
            window.location.href = 'map.html';
          }, 350);
        }
      });

      toggleNavLocks(p);
    })
    .catch(console.error);
}

function markPointCompleted(p, point) {
  const sid = String(point.id);
  p.completedPoints[sid] = true;
  p.letters[sid] = point.letter;
}

function renderAnswerUI(q) {
  const textWrap = document.getElementById('answer-text-wrap');
  const input = document.querySelector('#answer-form input[name="answer"]');
  const testWrap = document.getElementById('answer-test-wrap');
  const optWrap = document.getElementById('answer-options');

  if (optWrap) {
    optWrap.innerHTML = '';
    optWrap.dataset.selected = '';
  }

  if (q.type === 'test') {
    // скрываем текстовый блок, показываем 3 кнопки
    if (textWrap) textWrap.classList.add('hidden');
    if (testWrap) testWrap.classList.remove('hidden');
    if (input) input.value = '';

    if (optWrap && Array.isArray(q.options)) {
      q.options.forEach((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'butonn';
        btn.textContent = opt;
        btn.dataset.value = opt;
        btn.addEventListener('click', () => {
          optWrap.dataset.selected = opt;
          // визуально выделяем выбранную кнопку
          Array.from(optWrap.querySelectorAll('button.butonn')).forEach((b) => {
            b.classList.toggle('is-selected', b.dataset.value === opt);
          });
        });
        optWrap.appendChild(btn);
      });
    }
  } else {
    // text
    if (textWrap) textWrap.classList.remove('hidden');
    if (testWrap) testWrap.classList.add('hidden');
    if (input) input.placeholder = 'Введите ответ';
    if (optWrap) optWrap.innerHTML = '';
  }
}

function getUserAnswer(q) {
  if (q.type === 'test') {
    const optWrap = document.getElementById('answer-options');
    const selected = optWrap ? (optWrap.dataset.selected || '') : '';
    if (!selected) return { ok: false, value: '' };
    return { ok: true, value: selected };
  }
  const input = document.querySelector('#answer-form input[name="answer"]');
  return { ok: true, value: input ? input.value : '' };
}

function showAnswerMessage(text, isError) {
  const hintEl = document.getElementById('answer-hint');
  if (!hintEl) return;
  hintEl.textContent = text;
  hintEl.style.opacity = '1';
  hintEl.style.fontWeight = '600';
  hintEl.style.marginTop = '10px';
  hintEl.style.color = isError ? '#b00020' : 'inherit';
}

/** === SOURCES === */
function loadSourcesPage() {
  fetchQuest()
    .then((data) => {
      // если на странице уже ручной контент - ничего не ломаем.
      // но если есть контейнер #sources-list и он пустой/заглушка - заполним авто-версией.
      const list = document.getElementById('sources-list');
      if (!list) return;

      const hasOnlyPlaceholders = list.children.length <= 3 && Array.from(list.children).every(li => /Источник/i.test(li.textContent || ''));
      if (!hasOnlyPlaceholders) return;

      list.innerHTML = '';
      const urlSet = new Set();
      data.points.forEach((p) => p.sources.forEach((url) => urlSet.add(url)));
      if (data.bonus?.sources) data.bonus.sources.forEach((url) => urlSet.add(url));

      urlSet.forEach((url) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = url;
        a.textContent = url;
        a.target = '_blank';
        li.appendChild(a);
        list.appendChild(li);
      });
    })
    .catch(console.error);
}

/** === FINAL === */
function loadFinalPage() {
  const p = recomputeUnlocks(loadProgress());
  saveProgress(p);
  toggleNavLocks(p);

  const lockedSection = document.querySelector('.final-locked');
  const readySection = document.querySelector('.final-ready');

  const showLocked = () => {
    if (lockedSection) {
      lockedSection.hidden = false;
      lockedSection.setAttribute('aria-hidden', 'false');
    }
    if (readySection) {
      readySection.hidden = true;
      readySection.setAttribute('aria-hidden', 'true');
    }
  };

  const showReady = () => {
    if (lockedSection) {
      lockedSection.hidden = true;
      lockedSection.setAttribute('aria-hidden', 'true');
    }
    if (readySection) {
      readySection.hidden = false;
      readySection.setAttribute('aria-hidden', 'false');
    }
  };

  if (!p.unlockedFinal) {
    showLocked();
    return;
  }

  showReady();

  const statusEl = document.getElementById('final-status');
  const assembledEl = document.getElementById('assembled-word');
  const form = document.getElementById('keyword-form');
  const input = form ? form.querySelector('input[name="keyword"]') : null;

  const assembled = computeKeywordFromLetters(p);
  if (assembledEl) assembledEl.textContent = assembled ? assembled : '-';

  if (statusEl) statusEl.textContent = 'Введи ключевое слово. Можно собрать его из букв ниже.';

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const user = normalize(input ? input.value : '');
      const correct = normalize(assembled || '');
      if (!user) {
        setFinalMessage('Введите ключевое слово.', true);
        return;
      }
      if (user !== correct) {
        setFinalMessage('Неверно. Попробуй ещё раз.', true);
        return;
      }
      p.unlockedBonus = true;
      saveProgress(p);
      setFinalMessage('Верно ✅ Бонус открыт!', false);
      setTimeout(() => window.location.href = 'bonus.html', 450);
    });
  }
}

function setFinalMessage(text, isError) {
  const el = document.getElementById('final-message');
  if (!el) return;
  el.textContent = text;
  el.style.fontWeight = '600';
  el.style.color = isError ? '#b00020' : 'inherit';
}

/** === BONUS === */
function loadBonusPage() {
  const p = recomputeUnlocks(loadProgress());
  saveProgress(p);
  toggleNavLocks(p);

  const lockedEl = document.querySelector('.bonus-locked');
  const cardEl = document.querySelector('.bonus-ready');

  if (!p.unlockedBonus) {
    if (lockedEl) {
      lockedEl.hidden = false;
      lockedEl.setAttribute('aria-hidden', 'false');
    }
    if (cardEl) {
      cardEl.hidden = true;
      cardEl.setAttribute('aria-hidden', 'true');
    }
    return;
  }

  if (lockedEl) {
    lockedEl.hidden = true;
    lockedEl.setAttribute('aria-hidden', 'true');
  }
  if (cardEl) {
    cardEl.hidden = false;
    cardEl.setAttribute('aria-hidden', 'false');
  }

  const b = QUEST_DATA.bonus;
  if (!b) return;

  const titleEl = document.getElementById('bonus-title');
  const textEl = document.getElementById('bonus-text');
  if (titleEl) titleEl.textContent = b.title || 'Бонус';
  if (textEl) textEl.textContent = b.text || '';

  const imgEl = document.getElementById('bonus-image');
  if (imgEl) imgEl.src = '../assets/images/bonus/09_bonus_lion_with_keys.png';

  const factsEl = document.getElementById('bonus-facts');
  if (factsEl) {
    factsEl.innerHTML = '';
    const facts = b.facts || {};
    Object.keys(facts).forEach((k) => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${k}:</strong> <span>${facts[k]}</span>`;
      factsEl.appendChild(li);
    });
  }
}

/** === Навигация: прячем Финал/Бонус, пока не открыты === */
function toggleNavLocks(p) {
  return;
}


