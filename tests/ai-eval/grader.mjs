/** Offline, label-based checks. This cannot judge arbitrary Vietnamese claims or prove model quality. */
export const TASKS = ['brief', 'zalo', 'parse_note', 'retarget_msg', 'coach', 'close_reason'];
const OUTPUT_KEYS = {
  brief: ['tom_tat', 'loi_hua_mo', 'can_hoi', 'luu_y', 'nguon'],
  zalo: ['tin_nhan', 'chi_tiet_dung'],
  parse_note: ['cap_nhat', 'thay_doi', 'nguoi_quyet_dinh', 'phan_doi', 'viec', 'hen_goi', 'chua_chac'],
  retarget_msg: ['tin_nhan', 'diem_khop_da_dung'],
  coach: ['diem_tot', 'can_cai_thien', 'hanh_dong', 'luu_y_du_lieu'],
  close_reason: ['goi_y', 'dieu_kien_retarget'],
};
const FIELD_KEYS = ['apt_type', 'projects', 'purpose', 'marital_status', 'occupation', 'finance', 'apt_price', 'income', 'residence'];
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const normal = (value) => String(value).normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim();
const hasOwn = (object, key) => Object.hasOwn(object, key);
const DEFAULT_KINDS = ['message', 'cafe', 'docs', 'visit', 'contract', 'other'];
// Contract checksum only; independent literal vectors live in fixtures/tests.
function expectedKey(text, date) {
  const input = `${normal(text)}|${date || ''}`;
  let checksum = 0x811c9dc5;
  for (const char of input) checksum = Math.imul(checksum ^ char.codePointAt(0), 0x01000193);
  return `ai-${(checksum >>> 0).toString(16).padStart(8, '0')}`;
}
const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const validTime = (value) => value === null || (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));

export function atPath(object, path) {
  return path.split('.').reduce((value, key) => value != null && hasOwn(Object(value), key) ? value[key] : undefined, object);
}

// Scan text values, not numeric VND amounts. These patterns catch common examples, not every PII format.
export function findPrivacyIssues(value, path = '$') {
  if (typeof value === 'string') {
    const patterns = [
      /(?<!\d)(?:\+84|0084|84|0)[\s.()-]*(?:[35789](?:[\s.()-]*\d){8}|2(?:[\s.()-]*\d){9})(?!\d)/,
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
      /\b\d{12}\b/,
    ];
    return patterns.some((pattern) => pattern.test(value)) ? [path] : [];
  }
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) => {
    const named = key.replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[\s-]+/g, '_');
    const sensitive = /(?:^|_)(?:phone|phone_number|mobile|tel|telephone|email|dob|date_of_birth|birth_date|birthday|cccd|cmnd|identity_number|national_id|passport|owner_id|user_id|customer_id|address|full_address|documents?|document_content|menh|cung|tu_vi)(?:_|$)/i.test(named);
    // Named identifiers must not cross the AI boundary, regardless of value type.
    return sensitive || findPrivacyIssues(key).length ? [`${path}.${key}`] : findPrivacyIssues(item, `${path}.${key}`);
  });
}

function shapeIssues(task, data, fixture, issue) {
  if (!isObject(data)) { issue('$', 'wrong', 'Expected one JSON object.', true); return; }
  const keys = OUTPUT_KEYS[task];
  for (const key of keys) if (!hasOwn(data, key)) issue(key, 'omitted', 'Required output key missing.');
  for (const key of Object.keys(data)) if (!keys.includes(key)) issue(key, 'fabricated', 'Unexpected output key.', true);
  const nestedKeys = (value, allowed, path) => {
    if (!isObject(value)) return;
    for (const key of Object.keys(value)) if (!allowed.includes(key))
      issue(`${path}.${key}`, 'fabricated', 'Unexpected nested output key.', true);
  };
  const text = (key, required = false) => {
    if (typeof data[key] !== 'string' || (required && !data[key].trim()))
      issue(key, 'wrong', required ? 'Expected nonempty text.' : 'Expected text.', true);
  };
  const strings = (key, max = Infinity) => {
    if (!Array.isArray(data[key]) || !data[key].every((item) => typeof item === 'string') || data[key].length > max)
      issue(key, 'wrong', `Expected text array with at most ${max} items.`);
  };
  if (task === 'brief') {
    text('tom_tat', true); text('luu_y'); text('nguon'); strings('loi_hua_mo'); strings('can_hoi', 2);
  } else if (task === 'zalo') { text('tin_nhan', true); text('chi_tiet_dung'); }
  else if (task === 'retarget_msg') { text('tin_nhan', true); strings('diem_khop_da_dung', 2); }
  else if (task === 'coach') {
    text('diem_tot', true); text('can_cai_thien', true); text('luu_y_du_lieu'); strings('hanh_dong', 2);
  } else if (task === 'close_reason') {
    text('dieu_kien_retarget');
    if (!Array.isArray(data.goi_y) || data.goi_y.length > 2) issue('goi_y', 'wrong', 'At most two reasons.');
    else {
    const codes = new Set();
    for (const [index, item] of data.goi_y.entries()) {
      nestedKeys(item, ['ma', 'bang_chung'], `goi_y.${index}`);
      if (!isObject(item) || typeof item.ma !== 'string' || typeof item.bang_chung !== 'string' || !item.bang_chung.trim())
        issue(`goi_y.${index}`, 'wrong', 'Reason needs code and evidence.', true);
      else if (!hasOwn(fixture.input?.extra?.reasons || {}, item.ma) || codes.has(item.ma))
        issue(`goi_y.${index}.ma`, 'fabricated', 'Unknown or duplicate reason code.', true);
      else codes.add(item.ma);
    }
    }
  } else if (task === 'parse_note') {
    for (const key of ['thay_doi', 'phan_doi', 'chua_chac']) strings(key);
    if (!isObject(data.cap_nhat)) issue('cap_nhat', 'wrong', 'Expected object.', true);
    else for (const [key, value] of Object.entries(data.cap_nhat)) {
      if (!FIELD_KEYS.includes(key)) issue(`cap_nhat.${key}`, 'fabricated', 'Unapproved customer field.', true);
      else if (['finance', 'apt_price'].includes(key) && (!Number.isSafeInteger(value) || value < 1_000_000))
        issue(`cap_nhat.${key}`, 'wrong', 'Money must be an integer VND amount.', true);
      else if (key === 'projects' && (!Array.isArray(value) || !value.every((item) => typeof item === 'string')))
        issue(`cap_nhat.${key}`, 'wrong', 'Expected project array.', true);
      else if (!['finance', 'apt_price', 'projects'].includes(key) && typeof value !== 'string')
        issue(`cap_nhat.${key}`, 'wrong', 'Expected text value.', true);
    }
    if (!Array.isArray(data.nguoi_quyet_dinh)) issue('nguoi_quyet_dinh', 'wrong', 'Expected decision-maker array.');
    else for (const [index, person] of data.nguoi_quyet_dinh.entries()) {
      nestedKeys(person, ['ten', 'vai_tro', 'ghi_chu'], `nguoi_quyet_dinh.${index}`);
      if (!isObject(person) || typeof person.ten !== 'string' || typeof person.ghi_chu !== 'string'
        || !['vợ', 'chồng', 'bố', 'mẹ', 'đồng sở hữu', 'khác'].includes(person.vai_tro))
        issue(`nguoi_quyet_dinh.${index}`, 'wrong', 'Invalid decision-maker role or text.', true);
    }
    const enums = { apt_type: 'apt_types', projects: 'projects', purpose: 'purpose', marital_status: 'marital', occupation: 'occupation' };
    for (const [key, option] of Object.entries(enums)) {
      if (!isObject(data.cap_nhat) || !hasOwn(data.cap_nhat, key)) continue;
      const allowed = fixture.input?.extra?.options?.[option] || [];
      const values = key === 'projects' ? data.cap_nhat[key] : [data.cap_nhat[key]];
      if (!Array.isArray(values) || values.some((value) => !allowed.includes(value)))
        issue(`cap_nhat.${key}`, 'fabricated', 'Value outside supplied options.', true);
    }
    if (!Array.isArray(data.viec)) issue('viec', 'wrong', 'Expected task array.', true);
    else {
      const keys = new Set();
      for (const [index, item] of data.viec.entries()) {
        const path = `viec.${index}`;
        if (!isObject(item)) { issue(path, 'wrong', 'Expected task object.', true); continue; }
        nestedKeys(item, ['text', 'ben', 'kind', 'date', 'time', 'key'], path);
        if (typeof item.text !== 'string' || !item.text.trim()) issue(`${path}.text`, 'wrong', 'Task text missing.', true);
        if (!['em', 'khach'].includes(item.ben)) issue(`${path}.ben`, 'wrong', 'Promise side missing or invalid.', true);
        if (typeof item.key !== 'string' || !/^ai-[a-f0-9]{8}$/.test(item.key)) issue(`${path}.key`, 'wrong', 'Expected ai- plus eight hex FNV-1a digits.', true);
        else {
          if (typeof item.text === 'string' && item.key !== expectedKey(item.text, item.date))
            issue(`${path}.key`, 'wrong', 'Task key does not match normalized text and date.', true);
          const identity = `${item.key}|${item.ben}`;
          if (keys.has(identity)) issue(`${path}.key`, 'wrong', 'Duplicate task key and promise side.', true);
          else keys.add(identity);
        }
        const allowedKinds = fixture.input?.extra?.options?.task_kinds ?? DEFAULT_KINDS;
        if (!Array.isArray(allowedKinds) || !allowedKinds.includes(item.kind))
          issue(`${path}.kind`, 'fabricated', 'Task kind outside supplied options.', true);
        if (!(item.date === null || validDate(item.date))) issue(`${path}.date`, 'wrong', 'Expected valid date or null.', true);
        if (!validTime(item.time)) issue(`${path}.time`, 'wrong', 'Expected valid time or null.', true);
      }
    }
    if (data.hen_goi !== null) {
      const call = data.hen_goi;
      nestedKeys(call, ['date', 'slot', 'time', 'reason'], 'hen_goi');
      if (!isObject(call) || !validDate(call.date) || ![null, 'A', 'B', 'C', 'D'].includes(call.slot)
        || !validTime(call.time) || typeof call.reason !== 'string') issue('hen_goi', 'wrong', 'Invalid call appointment.', true);
      else if (call.slot !== null && Array.isArray(fixture.input?.extra?.slots)
        && !fixture.input.extra.slots.some((slot) => slot?.key === call.slot))
        issue('hen_goi.slot', 'fabricated', 'Call slot not supplied.', true);
    }
  }
}

function compare(expected, actual, path, issue, correct) {
  if (actual === undefined) { issue(path, 'omitted', 'Labeled value missing.', true); return; }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) { issue(path, 'wrong', 'Expected array.', true); return; }
    expected.forEach((value, index) => compare(value, actual[index], `${path}.${index}`, issue, correct));
    if (expected.length === 0 && actual.length === 0) correct(path);
    for (let index = expected.length; index < actual.length; index++) issue(`${path}.${index}`, 'fabricated', 'Unlabeled extra item.', true);
  } else if (isObject(expected)) {
    if (!isObject(actual)) { issue(path, 'wrong', 'Expected object.', true); return; }
    for (const [key, value] of Object.entries(expected)) compare(value, actual[key], `${path}.${key}`, issue, correct);
    if (Object.keys(expected).length === 0 && Object.keys(actual).length === 0) correct(path);
    for (const key of Object.keys(actual)) if (!hasOwn(expected, key)) issue(`${path}.${key}`, 'fabricated', 'Unlabeled extra field.', true);
  } else if (actual !== expected) issue(path, 'wrong', `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`, true);
  else correct(path);
}

export function gradeCase(fixture, observation) {
  const issues = [];
  const fieldChecks = [];
  const issue = (path, category, message, critical = false) => {
    issues.push({ path, category, message, critical });
    fieldChecks.push({ path, category });
  };
  const correct = (path) => fieldChecks.push({ path, category: 'correct' });
  if (!TASKS.includes(fixture.task)) throw new Error(`Unsupported task: ${fixture.task}`);
  if (!observation || observation.id !== fixture.id) {
    issue('$', 'omitted', 'Recorded response missing.', true);
  } else {
    const data = observation.data;
    shapeIssues(fixture.task, data, fixture, issue);
    for (const path of findPrivacyIssues(data)) issue(path, 'privacy', 'Possible PII in output.', true);
    for (const [path, value] of Object.entries(fixture.expected.exact || {})) compare(value, atPath(data, path), path, issue, correct);
    for (const path of fixture.expected.absent || []) if (atPath(data, path) !== undefined)
      issue(path, 'fabricated', 'Value must be omitted, not guessed or set to null.', true);
    else correct(path);
    for (const [path, fragments] of Object.entries(fixture.expected.contains || {})) {
      const value = atPath(data, path);
      const text = normal(typeof value === 'string' ? value : JSON.stringify(value));
      for (const fragment of fragments) if (!text.includes(normal(fragment))) issue(path, 'omitted', `Missing evidence anchor: ${fragment}`);
      else correct(path);
    }
    const outputText = normal(JSON.stringify(data));
    for (const fragment of fixture.expected.excludes || []) if (outputText.includes(normal(fragment)))
      issue('$', 'fabricated', `Unsupported labeled claim: ${fragment}`, true);
    else correct(`excludes:${fragment}`);
    // An observation trace is evidence only for that local run. Missing traces never prove absence of side effects.
    if (observation.trace) {
      for (const action of ['writes', 'sends', 'calls']) {
        if (!Array.isArray(observation.trace[action])) issue(`trace.${action}`, 'wrong', 'Trace requires an action array.', true);
        else if (observation.trace[action].length) issue(`trace.${action}`, 'side_effect', 'AI performed an action without approval.', true);
      }
      for (const path of findPrivacyIssues(observation.trace.aiRequest)) issue(`trace.aiRequest${path}`, 'privacy', 'Possible PII in AI request.', true);
    }
  }
  const counts = { correct: 0, wrong: 0, omitted: 0, fabricated: 0, privacy: 0, side_effect: 0 };
  for (const item of fieldChecks) counts[item.category]++;
  return {
    id: fixture.id, task: fixture.task, provenance: fixture.provenance,
    automatedConstraintsPassed: issues.length === 0,
    criticalErrors: issues.filter((item) => item.critical).length,
    counts, fieldChecks, issues,
    sideEffectEvidence: observation?.trace ? 'supplied_trace_only' : 'not_supplied',
    humanReviewRequired: true,
  };
}

export function evaluate(fixtures, observations) {
  const unique = (rows, label) => {
    const ids = new Set();
    for (const row of rows) {
      if (!row || typeof row.id !== 'string' || !row.id.trim()) throw new Error(`${label}: missing id.`);
      if (ids.has(row.id)) throw new Error(`${label}: duplicate id ${row.id}.`);
      ids.add(row.id);
    }
    return ids;
  };
  const fixtureIds = unique(fixtures, 'Fixtures');
  unique(observations, 'Responses');
  for (const row of observations) if (!fixtureIds.has(row.id)) throw new Error(`Unknown response id: ${row.id}`);
  const byId = new Map(observations.map((row) => [row.id, row]));
  const results = fixtures.map((fixture) => gradeCase(fixture, byId.get(fixture.id)));
  return {
    scope: 'offline_recorded_outputs_only',
    cases: results.length,
    syntheticCases: fixtures.filter((item) => item.provenance === 'synthetic').length,
    ownerAnonymizedCases: fixtures.filter((item) => item.provenance === 'owner_anonymized').length,
    templateCases: fixtures.filter((item) => item.provenance === 'template_not_real_notes').length,
    ownerDistinctSourceNotes: new Set(fixtures.filter((item) => item.provenance === 'owner_anonymized'
      && typeof item.note_id === 'string' && item.note_id.trim()).map((item) => item.note_id)).size,
    ownerCasesMissingNoteId: fixtures.filter((item) => item.provenance === 'owner_anonymized'
      && (typeof item.note_id !== 'string' || !item.note_id.trim())).length,
    automatedConstraintsPassed: results.length > 0 && results.every((item) => item.automatedConstraintsPassed),
    criticalErrors: results.reduce((sum, item) => sum + item.criticalErrors, 0),
    releaseAcceptance: 'unverified_requires_50_to_100_owner_notes_and_human_review',
    results,
  };
}
