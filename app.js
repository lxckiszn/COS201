(() => {
  'use strict';

  const STORAGE_KEY = 'coursekeeper.courses.v1';
  const THEME_KEY = 'coursekeeper.theme.v1';
  const MAX_COURSES = 500;
  const $ = (id) => document.getElementById(id);

  let courses = [];
  let editingId = null;
  let toastTimer = null;

  // Course is the blueprint used to create every course object in the system.
  class Course {
    constructor(id, code, title, units) {
      this.id = id || Course.createId();
      this.code = Course.normalizeCode(code);
      this.title = String(title).trim();
      this.units = Number(units);
    }

    static createId() {
      if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
      }
      return `course-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    static normalizeCode(value) {
      return String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
    }

    static isValid(data) {
      if (!data || typeof data !== 'object') return false;
      const code = Course.normalizeCode(data.code);
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      const units = Number(data.units);
      return code.length > 0 && code.length <= 20 &&
        title.length > 0 && title.length <= 90 &&
        Number.isInteger(units) && units >= 1 && units <= 30;
    }

    static from(data) {
      if (!Course.isValid(data)) throw new Error('Invalid course data');
      return new Course(data.id, data.code, data.title, data.units);
    }

    update(code, title, units) {
      if (!Course.isValid({ code, title, units })) {
        throw new Error('Please enter a valid course code, title and unit value.');
      }
      this.code = Course.normalizeCode(code);
      this.title = String(title).trim();
      this.units = Number(units);
    }

    matches(query) {
      const term = query.toLowerCase();
      return this.code.toLowerCase().includes(term) ||
        this.title.toLowerCase().includes(term);
    }
  }

  function notify(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3000);
  }

  function setTheme(theme, save = true) {
    const dark = theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    $('themeIcon').textContent = dark ? '☀' : '☾';
    $('themeLabel').textContent = dark ? 'Light' : 'Dark';
    const label = `Switch to ${dark ? 'light' : 'dark'} mode`;
    $('themeToggle').setAttribute('aria-label', label);
    $('themeToggle').title = label;
    if (save) {
      try {
        localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
      } catch (error) {
        // Theme still works for this session if browser storage is unavailable.
      }
    }
  }

  function loadTheme() {
    try {
      setTheme(localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light', false);
    } catch (error) {
      setTheme('light', false);
    }
  }

  function persistCourses() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
      return true;
    } catch (error) {
      notify('Browser storage is unavailable or full. Use Save file to back up your courses.');
      return false;
    }
  }

  function readSavedCourses() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(saved)) throw new Error('Saved data is not a list');

      const restored = [];
      const seenCodes = new Set();
      for (const item of saved) {
        if (!Course.isValid(item)) continue;
        const course = Course.from(item);
        const key = course.code.toLowerCase();
        if (seenCodes.has(key)) continue;
        seenCodes.add(key);
        restored.push(course);
        if (restored.length >= MAX_COURSES) break;
      }
      courses = restored;
    } catch (error) {
      courses = [];
      notify('Saved courses could not be read. You can load a JSON backup file.');
    }
  }

  // Recursive calculation: the base case is the end of the list.
  function recursiveUnits(list, index = 0) {
    if (index >= list.length) return 0;
    return list[index].units + recursiveUnits(list, index + 1);
  }

  function render() {
    const searchText = $('searchInput').value.trim();
    const query = searchText.toLowerCase();
    const visibleCourses = courses.filter((course) => course.matches(query));
    const rows = $('courseRows');
    rows.replaceChildren();

    visibleCourses.forEach((course) => {
      const tr = document.createElement('tr');
      const codeCell = document.createElement('td');
      const code = document.createElement('span');
      code.className = 'code';
      code.textContent = course.code;
      codeCell.appendChild(code);

      const titleCell = document.createElement('td');
      titleCell.className = 'title-cell';
      titleCell.textContent = course.title;

      const unitsCell = document.createElement('td');
      const units = document.createElement('span');
      units.className = 'unit';
      units.textContent = `${course.units} units`;
      unitsCell.appendChild(units);

      const actionsCell = document.createElement('td');
      const actions = document.createElement('div');
      actions.className = 'actions';

      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'icon-btn edit';
      editButton.title = `Edit ${course.code}`;
      editButton.setAttribute('aria-label', `Edit ${course.code}`);
      editButton.textContent = '✎';
      editButton.addEventListener('click', () => openForm(course.id));

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'icon-btn delete';
      deleteButton.title = `Remove ${course.code}`;
      deleteButton.setAttribute('aria-label', `Remove ${course.code}`);
      deleteButton.textContent = '×';
      deleteButton.addEventListener('click', () => removeCourse(course.id));

      actions.append(editButton, deleteButton);
      actionsCell.appendChild(actions);
      tr.append(codeCell, titleCell, unitsCell, actionsCell);
      rows.appendChild(tr);
    });

    const noResults = visibleCourses.length === 0;
    $('emptyState').style.display = noResults ? 'block' : 'none';
    rows.parentElement.style.display = courses.length > 0 ? '' : 'block';

    const totalUnits = recursiveUnits(courses);
    $('courseCount').textContent = String(courses.length);
    $('unitCount').textContent = String(totalUnits);
    $('loadLabel').textContent = totalUnits >= 18 ? 'Full' : totalUnits >= 10 ? 'Balanced' : 'Light';
    $('listSub').textContent = query
      ? `${visibleCourses.length} result${visibleCourses.length === 1 ? '' : 's'} for “${searchText}”`
      : 'Your semester at a glance';
    $('visibleCount').textContent =
      `${visibleCourses.length} of ${courses.length} course${courses.length === 1 ? '' : 's'}`;
  }

  function openForm(id = null) {
    editingId = id;
    const course = courses.find((item) => item.id === id);
    $('dialogTitle').textContent = course ? 'Edit course' : 'Add a course';
    $('submitBtn').textContent = course ? 'Save changes' : 'Add course';
    $('courseForm').reset();

    if (course) {
      $('courseCode').value = course.code;
      $('courseTitle').value = course.title;
      $('courseUnits').value = String(course.units);
    }

    if (!$('courseDialog').open) $('courseDialog').showModal();
    window.setTimeout(() => $('courseCode').focus(), 40);
  }

  function closeForm() {
    if ($('courseDialog').open) $('courseDialog').close();
    editingId = null;
  }

  function removeCourse(id) {
    const course = courses.find((item) => item.id === id);
    if (!course) return;
    if (!window.confirm(`Remove ${course.code} — ${course.title}?`)) return;

    courses = courses.filter((item) => item.id !== id);
    persistCourses();
    render();
    notify(`${course.code} was removed.`);
  }

  function saveFile() {
    try {
      const backup = courses.map(({ code, title, units }) => ({ code, title, units }));
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'course-keeper-backup.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('Course backup downloaded.');
    } catch (error) {
      notify('The backup file could not be created.');
    }
  }

  function loadFile(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      notify('That file is too large. Choose a backup under 2 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!Array.isArray(data) || data.length > MAX_COURSES ||
            !data.every(Course.isValid)) {
          throw new Error('Invalid backup structure');
        }

        const imported = data.map((item) => Course.from(item));
        const codes = imported.map((item) => item.code.toLowerCase());
        if (new Set(codes).size !== codes.length) {
          throw new Error('Duplicate course codes');
        }

        const previousCourses = courses;
        courses = imported;
        if (!persistCourses()) {
          courses = previousCourses;
          return;
        }
        render();
        notify(`${courses.length} course${courses.length === 1 ? '' : 's'} loaded.`);
      } catch (error) {
        notify('Invalid backup. Check that it is a Course Keeper JSON file with unique course codes.');
      }
    };
    reader.onerror = () => notify('The selected file could not be read.');
    reader.readAsText(file);
  }

  function handleCourseSubmit(event) {
    event.preventDefault();

    const code = Course.normalizeCode($('courseCode').value);
    const title = $('courseTitle').value.trim();
    const units = Number($('courseUnits').value);

    if (!Course.isValid({ code, title, units })) {
      notify('Enter a course code, a course title and a whole-number unit value from 1 to 30.');
      return;
    }

    const duplicate = courses.some((course) =>
      course.code.toLowerCase() === code.toLowerCase() && course.id !== editingId
    );
    if (duplicate) {
      notify('A course with that code is already on your list.');
      $('courseCode').focus();
      return;
    }

    const wasEditing = Boolean(editingId);
    if (editingId) {
      const existing = courses.find((course) => course.id === editingId);
      if (!existing) {
        notify('That course could not be found. Please try again.');
        closeForm();
        return;
      }
      existing.update(code, title, units);
    } else {
      if (courses.length >= MAX_COURSES) {
        notify(`You can store up to ${MAX_COURSES} courses.`);
        return;
      }
      courses.push(new Course(null, code, title, units));
    }

    const saved = persistCourses();
    render();
    closeForm();
    notify(saved
      ? (wasEditing ? 'Course updated.' : 'Course added.')
      : 'Changes are shown, but could not be saved on this device. Export a backup.');
  }

  function connectEvents() {
    $('courseForm').addEventListener('submit', handleCourseSubmit);
    $('cancelBtn').addEventListener('click', closeForm);
    $('addBtn').addEventListener('click', () => openForm());
    $('sidebarAdd').addEventListener('click', () => openForm());
    $('navAdd').addEventListener('click', () => openForm());
    $('exportBtn').addEventListener('click', saveFile);
    $('navSave').addEventListener('click', saveFile);
    $('importBtn').addEventListener('click', () => $('fileInput').click());
    $('fileInput').addEventListener('change', (event) => {
      loadFile(event.target.files[0]);
      event.target.value = '';
    });
    $('searchInput').addEventListener('input', render);
    $('themeToggle').addEventListener('click', () => {
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });
    $('courseDialog').addEventListener('close', () => {
      editingId = null;
    });
  }

  function initialize() {
    loadTheme();
    connectEvents();
    readSavedCourses();
    render();
  }

  initialize();
})();
