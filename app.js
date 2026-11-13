(() => {
  'use strict';

  const KEY = 'coursekeeper.courses.v1';
  const THEME_KEY = 'coursekeeper.theme.v1';
  const MAX_FILE_BYTES = 2 * 1024 * 1024;
  const MAX_COURSES = 500;
  const $ = id => document.getElementById(id);
  const requiredIds = [
    'courseRows', 'searchInput', 'emptyState', 'courseCount', 'unitCount',
    'loadLabel', 'listSub', 'visibleCount', 'toast', 'dialogTitle', 'submitBtn',
    'courseForm', 'courseCode', 'courseTitle', 'courseUnits', 'courseDialog',
    'cancelBtn', 'addBtn', 'sidebarAdd', 'navAdd', 'exportBtn', 'navSave',
    'importBtn', 'fileInput', 'themeToggle', 'themeIcon', 'themeLabel'
  ];
  const missing = requiredIds.filter(id => !$(id));
  if (missing.length) {
    console.error('Course Keeper could not start. Missing elements:', missing);
    return;
  }

  class Course {
    constructor({ id, code, title, units }) {
      this.id = id || makeId();
      this.code = cleanCode(code);
      this.title = cleanTitle(title);
      this.units = Number(units);
    }
  }

  let courses = [];
  let editingId = null;
  let toastTimer;

  function makeId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    return `course-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function cleanCode(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  }

  function cleanTitle(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ');
  }

  function validateCourse(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Each course must be an object.';
    if (typeof value.code !== 'string' || !cleanCode(value.code)) return 'Course code is required.';
    if (typeof value.title !== 'string' || !cleanTitle(value.title)) return 'Course title is required.';
    const rawUnits = value.units;
    if ((typeof rawUnits !== 'number' && typeof rawUnits !== 'string') || String(rawUnits).trim() === '') return 'Units must be a whole number from 1 to 30.';
    const units = Number(rawUnits);
    if (!Number.isSafeInteger(units) || units < 1 || units > 30) return 'Units must be a whole number from 1 to 30.';
    if (cleanCode(value.code).length > 40) return 'Course code must be 40 characters or fewer.';
    if (cleanTitle(value.title).length > 160) return 'Course title must be 160 characters or fewer.';
    return null;
  }

  function toCourse(value) {
    const error = validateCourse(value);
    if (error) throw new Error(error);
    return new Course(value);
  }

  function duplicateCode(list) {
    const seen = new Set();
    for (const course of list) {
      const code = cleanCode(course.code);
      if (seen.has(code)) return code;
      seen.add(code);
    }
    return null;
  }

  function notify(message) {
    $('toast').textContent = message;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2800);
  }

  function setTheme(theme, save = true) {
    const dark = theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    $('themeIcon').textContent = dark ? '☀' : '☾';
    $('themeLabel').textContent = dark ? 'Light' : 'Dark';
    $('themeToggle').setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
    $('themeToggle').title = `Switch to ${dark ? 'light' : 'dark'} mode`;
    if (save) {
      try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); }
      catch (_)
    }
  }

  function readSaved() {
    let raw;
    try { raw = localStorage.getItem(KEY); }
    catch (_) {
      notify('Browser storage is unavailable. Export a backup to keep your courses.');
      courses = [];
      return;
    }
    if (!raw) { courses = []; return; }
    try {
      const data = JSON.parse(raw);
      if (!Array.isArray(data) || data.length > MAX_COURSES) throw new Error('Saved data has an invalid format.');
      const parsed = data.map(item => toCourse(item));
      const duplicate = duplicateCode(parsed);
      if (duplicate) throw new Error(`Saved data contains duplicate course code ${duplicate}.`);
      courses = parsed;
    } catch (error) {
      courses = [];
      notify('Saved courses could not be read. Load a valid backup file to restore them.');
      console.error('Course Keeper saved data error:', error);
    }
  }

  function persist(nextCourses) {
    try {
      localStorage.setItem(KEY, JSON.stringify(nextCourses));
      courses = nextCourses;
      return true;
    } catch (error) {
      notify('Could not save on this device. Your current list is unchanged; export a backup file.');
      console.error('Course Keeper storage error:', error);
      return false;
    }
  }

  function recursiveUnits(list, index = 0) {
    return index >= list.length ? 0 : list[index].units + recursiveUnits(list, index + 1);
  }

  function render() {
    const query = $('searchInput').value.trim().toLocaleLowerCase();
    const shown = courses.filter(course => course.code.toLocaleLowerCase().includes(query) || course.title.toLocaleLowerCase().includes(query));
    const rows = $('courseRows');
    rows.replaceChildren();
    shown.forEach(course => {
      const tr = document.createElement('tr');
      const codeCell = document.createElement('td');
      const code = document.createElement('span');
      code.className = 'code';
      code.textContent = course.code;
      codeCell.append(code);
      const titleCell = document.createElement('td');
      titleCell.className = 'title-cell';
      titleCell.textContent = course.title;
      const unitCell = document.createElement('td');
      const unit = document.createElement('span');
      unit.className = 'unit';
      unit.textContent = `${course.units} units`;
      unitCell.append(unit);
      const actionCell = document.createElement('td');
      const actions = document.createElement('div');
      actions.className = 'actions';
      const edit = document.createElement('button');
      edit.type = 'button'; edit.className = 'icon-btn edit'; edit.title = 'Edit course'; edit.setAttribute('aria-label', 'Edit course'); edit.textContent = '✎';
      edit.addEventListener('click', () => openForm(course.id));
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'icon-btn delete'; remove.title = 'Remove course'; remove.setAttribute('aria-label', 'Remove course'); remove.textContent = '×';
      remove.addEventListener('click', () => removeCourse(course.id));
      actions.append(edit, remove); actionCell.append(actions); tr.append(codeCell, titleCell, unitCell, actionCell); rows.append(tr);
    });
    const empty = shown.length === 0;
    $('emptyState').style.display = empty ? 'block' : 'none';
    rows.parentElement.style.display = courses.length ? '' : 'block';
    $('courseCount').textContent = String(courses.length);
    const units = recursiveUnits(courses);
    $('unitCount').textContent = String(units);
    $('loadLabel').textContent = units >= 18 ? 'Full' : units >= 10 ? 'Balanced' : 'Light';
    $('listSub').textContent = query ? `${shown.length} result${shown.length === 1 ? '' : 's'} for “${$('searchInput').value.trim()}”` : 'Your semester at a glance';
    $('visibleCount').textContent = `${shown.length} of ${courses.length} course${courses.length === 1 ? '' : 's'}`;
  }

  function openForm(id = null) {
    editingId = id;
    const course = courses.find(item => item.id === id);
    $('dialogTitle').textContent = course ? 'Edit course' : 'Add a course';
    $('submitBtn').textContent = course ? 'Save changes' : 'Add course';
    $('courseForm').reset();
    if (course) {
      $('courseCode').value = course.code;
      $('courseTitle').value = course.title;
      $('courseUnits').value = String(course.units);
    }
    if (typeof $('courseDialog').showModal === 'function') $('courseDialog').showModal();
    else $('courseDialog').setAttribute('open', '');
    setTimeout(() => $('courseCode').focus(), 40);
  }

  function removeCourse(id) {
    const course = courses.find(item => item.id === id);
    if (!course || !confirm(`Remove ${course.code} — ${course.title}?`)) return;
    const next = courses.filter(item => item.id !== id);
    if (!persist(next)) return;
    render();
    notify('Course removed.');
  }

  function saveFile() {
    try {
      const backup = { format: 'coursekeeper', version: 1, courses: courses.map(({ code, title, units }) => ({ code, title, units })) };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'my-courses.json';
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('Course list saved to a file.');
    } catch (error) {
      console.error('Course Keeper export error:', error);
      notify('Could not export the course list. Please try again.');
    }
  }

  function parseImport(data) {
    const list = Array.isArray(data) ? data : data && data.format === 'coursekeeper' && data.version === 1 && Array.isArray(data.courses) ? data.courses : null;
    if (!list) throw new Error('Choose a Course Keeper JSON file.');
    if (list.length > MAX_COURSES) throw new Error(`A backup can contain at most ${MAX_COURSES} courses.`);
    const imported = list.map(item => toCourse(item));
    const duplicate = duplicateCode(imported);
    if (duplicate) throw new Error(`The file has duplicate course code ${duplicate}.`);
    return imported;
  }

  function loadFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { notify('That file is too large. Choose a file smaller than 2 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = parseImport(JSON.parse(String(reader.result)));
        if (!persist(imported)) return;
        render();
        notify(`${courses.length} course${courses.length === 1 ? '' : 's'} loaded.`);
      } catch (error) {
        notify(error instanceof SyntaxError ? 'That file is not valid JSON.' : error.message || 'That file is not a valid course list.');
      }
    };
    reader.onerror = () => notify('Could not read that file. Please choose it again.');
    reader.onabort = () => notify('File loading was cancelled.');
    reader.readAsText(file);
  }

  $('courseForm').addEventListener('submit', event => {
    event.preventDefault();
    const candidate = { code: $('courseCode').value, title: $('courseTitle').value, units: $('courseUnits').value };
    const error = validateCourse(candidate);
    if (error) { notify(error); return; }
    const course = new Course({ ...candidate, id: editingId || undefined });
    if (courses.some(item => item.code === course.code && item.id !== editingId)) {
      notify('A course with that code is already on your list.'); $('courseCode').focus(); return;
    }
    let next;
    if (editingId) {
      if (!courses.some(item => item.id === editingId)) { notify('That course is no longer on your list.'); return; }
      next = courses.map(item => item.id === editingId ? course : item);
    } else {
      if (courses.length >= MAX_COURSES) { notify(`You can save up to ${MAX_COURSES} courses.`); return; }
      next = [...courses, course];
    }
    if (!persist(next)) return;
    render();
    if (typeof $('courseDialog').close === 'function') $('courseDialog').close(); else $('courseDialog').removeAttribute('open');
    notify(editingId ? 'Course updated.' : 'Course added.');
    editingId = null;
  });

  $('cancelBtn').onclick = () => {
    editingId = null;
    if (typeof $('courseDialog').close === 'function') $('courseDialog').close(); else $('courseDialog').removeAttribute('open');
  };
  for (const id of ['addBtn', 'sidebarAdd', 'navAdd']) $(id).onclick = () => openForm();
  $('exportBtn').onclick = saveFile;
  $('navSave').onclick = saveFile;
  $('importBtn').onclick = () => $('fileInput').click();
  $('fileInput').onchange = event => {
    const file = event.target.files && event.target.files[0];
    if (file) loadFile(file);
    event.target.value = '';
  };
  $('searchInput').oninput = render;
  $('themeToggle').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

  try { setTheme(localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light', false); }
  catch (_) { setTheme('light', false); }
  readSaved();
  render();
})();
