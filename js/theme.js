(function () {
  const THEME_STORAGE_KEY = 'kod-lidy-theme';
  const DEFAULT_THEME = 'classic';
  const THEMES = ['classic', 'light', 'dark'];

  const LANGUAGE_STORAGE_KEY = 'kod-lidy-language';
  const DEFAULT_LANGUAGE = 'ru';
  const LANGUAGES = ['ru', 'be'];

  const THEME_LABELS = {
    classic: 'Классика',
    light: 'Светлая',
    dark: 'Темная'
  };

  const LANGUAGE_LABELS = {
    ru: 'Русский',
    be: 'Беларусский'
  };

  function normalizeTheme(theme) {
    return THEMES.includes(theme) ? theme : DEFAULT_THEME;
  }

  function normalizeLanguage(language) {
    return LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
  }

  function getTheme() {
    try {
      return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME);
    } catch (_error) {
      return DEFAULT_THEME;
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', normalizeTheme(theme));
  }

  function setTheme(theme) {
    const normalized = normalizeTheme(theme);
    applyTheme(normalized);

    try {
      localStorage.setItem(THEME_STORAGE_KEY, normalized);
    } catch (_error) {
      // localStorage can be blocked by privacy settings.
    }

    renderThemeSwitcher();
    document.dispatchEvent(new CustomEvent('kod-lidy-theme-change', { detail: { theme: normalized } }));
    return normalized;
  }

  function getLanguage() {
    try {
      return normalizeLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY) || DEFAULT_LANGUAGE);
    } catch (_error) {
      return DEFAULT_LANGUAGE;
    }
  }

  function applyLanguage(language) {
    document.documentElement.setAttribute('data-language', normalizeLanguage(language));
  }

  function setLanguage(language) {
    const normalized = normalizeLanguage(language);
    applyLanguage(normalized);

    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
    } catch (_error) {
      // localStorage can be blocked by privacy settings.
    }

    renderLanguageSwitcher();
    document.dispatchEvent(new CustomEvent('kod-lidy-language-change', { detail: { language: normalized } }));
    return normalized;
  }

  function closeAllSwitchers() {
    document.querySelectorAll('[data-theme-switcher], [data-language-switcher]').forEach(function (switcher) {
      switcher.classList.remove('is-open');
      const trigger = switcher.querySelector('button[aria-expanded]');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  }

  function bindSwitcherToggle(container, trigger, menu) {
    if (!container || !trigger || !menu) return;

    trigger.addEventListener('click', function (event) {
      event.stopPropagation();
      const shouldOpen = !container.classList.contains('is-open');
      closeAllSwitchers();
      if (shouldOpen) {
        container.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });

    menu.addEventListener('click', function (event) {
      event.stopPropagation();
    });
  }

  function createThemeOption(theme) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'theme-switcher__option';
    option.dataset.theme = theme;
    option.setAttribute('role', 'option');

    option.innerHTML = `
      <span class="theme-switcher__dot theme-switcher__dot_${theme}" aria-hidden="true"></span>
      <span class="theme-switcher__label">${THEME_LABELS[theme]}</span>
    `;

    option.addEventListener('click', function () {
      setTheme(theme);
    });

    return option;
  }

  function createLanguageOption(language) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'language-switcher__option';
    option.dataset.language = language;
    option.setAttribute('role', 'option');

    option.innerHTML = `
      <span class="language-switcher__dot language-switcher__dot_${language}" aria-hidden="true"></span>
      <span class="language-switcher__label">${LANGUAGE_LABELS[language]}</span>
    `;

    option.addEventListener('click', function () {
      setLanguage(language);
    });

    return option;
  }

  function renderThemeSwitcher() {
    const containers = document.querySelectorAll('[data-theme-switcher]');
    if (!containers.length) return;

    const activeTheme = getTheme();

    containers.forEach(function (container) {
      container.classList.add('theme-switcher');

      const options = THEMES.filter(function (theme) {
        return theme !== activeTheme;
      });

      container.innerHTML = `
        <button
          type="button"
          class="theme-switcher__trigger"
          aria-haspopup="listbox"
          aria-expanded="false"
          aria-label="Смена темы"
        >
          <span class="theme-switcher__dot theme-switcher__dot_${activeTheme}" aria-hidden="true"></span>
          <span class="theme-switcher__label">${THEME_LABELS[activeTheme]}</span>
          <span class="theme-switcher__caret" aria-hidden="true">▾</span>
        </button>
        <div class="theme-switcher__menu" role="listbox" aria-label="Темы"></div>
      `;

      const trigger = container.querySelector('.theme-switcher__trigger');
      const menu = container.querySelector('.theme-switcher__menu');
      if (!trigger || !menu) return;

      options.forEach(function (theme) {
        menu.appendChild(createThemeOption(theme));
      });

      bindSwitcherToggle(container, trigger, menu);
    });
  }

  function renderLanguageSwitcher() {
    const containers = document.querySelectorAll('[data-language-switcher]');
    if (!containers.length) return;

    const activeLanguage = getLanguage();

    containers.forEach(function (container) {
      container.classList.add('language-switcher');

      const options = LANGUAGES.filter(function (language) {
        return language !== activeLanguage;
      });

      container.innerHTML = `
        <button
          type="button"
          class="language-switcher__trigger"
          aria-haspopup="listbox"
          aria-expanded="false"
          aria-label="Смена языка"
        >
          <span class="language-switcher__dot language-switcher__dot_${activeLanguage}" aria-hidden="true"></span>
          <span class="language-switcher__label">${LANGUAGE_LABELS[activeLanguage]}</span>
          <span class="language-switcher__caret" aria-hidden="true">▾</span>
        </button>
        <div class="language-switcher__menu" role="listbox" aria-label="Языки"></div>
      `;

      const trigger = container.querySelector('.language-switcher__trigger');
      const menu = container.querySelector('.language-switcher__menu');
      if (!trigger || !menu) return;

      options.forEach(function (language) {
        menu.appendChild(createLanguageOption(language));
      });

      bindSwitcherToggle(container, trigger, menu);
    });
  }

  document.addEventListener('click', function () {
    closeAllSwitchers();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closeAllSwitchers();
    }
  });

  applyTheme(getTheme());
  applyLanguage(getLanguage());

  document.addEventListener('DOMContentLoaded', function () {
    renderThemeSwitcher();
    renderLanguageSwitcher();
  });

  window.getTheme = getTheme;
  window.setTheme = setTheme;
  window.renderThemeSwitcher = renderThemeSwitcher;
  window.getLanguage = getLanguage;
  window.setLanguage = setLanguage;
  window.renderLanguageSwitcher = renderLanguageSwitcher;
})();
