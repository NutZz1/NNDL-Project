/**
 * CivicScan Auto-Dispatch Agent
 *
 * Decides, the moment a report is created, who should handle it:
 *   1. the responsible TEAM, from the detected class,
 *   2. a CREW inside that team: a specialist for the class if one exists,
 *      otherwise any crew, and always the one with the fewest open jobs,
 *   3. a PRIORITY score and a target response time from the severity.
 *
 * It is a transparent rule-based agent (no external AI service): every decision
 * carries a plain-English `reason` that is stored on the incident and shown to
 * officers. Detections below the confidence threshold are NOT dispatched; they are
 * held for the Municipal Officer to review, so a doubtful model output never sends a crew out.
 *
 * Environment:
 *   AUTO_DISPATCH=false                  turn the agent off (every report goes to triage)
 *   AUTO_DISPATCH_MIN_CONFIDENCE=0.40    below this, hold for officer review
 */

const { teamForCategory, teamName, crewsFor } = require('./teams');

const SEVERITY = {
  Critical: { weight: 100, hours: 4 },
  High: { weight: 70, hours: 24 },
  Medium: { weight: 40, hours: 72 },
  Low: { weight: 20, hours: 168 },
};

const enabled = () => String(process.env.AUTO_DISPATCH || 'true').toLowerCase() !== 'false';
const minConfidence = () => {
  const v = Number(process.env.AUTO_DISPATCH_MIN_CONFIDENCE);
  return Number.isFinite(v) ? v : 0.4;
};

const humanHours = (h) => (h >= 48 ? `${Math.round(h / 24)} days` : `${h} h`);

const targetFor = (severity, from = new Date()) =>
  new Date(from.getTime() + (SEVERITY[severity] || SEVERITY.Medium).hours * 3600 * 1000);

/**
 * Picks the crew inside a team: specialists for the class first, then the fewest open jobs.
 * Also used when the Municipal Officer moves an item to another team.
 * @returns {Promise<{crew:string, open:number, specialist:boolean}|null>}
 */
const chooseCrew = async (teamKey, category, countOpenJobs) => {
  const crews = crewsFor(teamKey);
  if (!crews.length) return null;
  const specialists = crews.filter((c) => c.handles.includes(category));
  const pool = specialists.length ? specialists : crews;

  const loads = [];
  for (const crew of pool) {
    let open = 0;
    try {
      open = await countOpenJobs(crew.name);
    } catch {
      open = 0;
    }
    loads.push({ crew, open });
  }
  loads.sort((a, b) => a.open - b.open); // stable: ties keep the configured order
  return { crew: loads[0].crew.name, open: loads[0].open, specialist: specialists.length > 0 };
};

/**
 * @param {object}   incident            { category, severity, confidence, label }
 * @param {function} countOpenJobs(crew) -> Promise<number>  jobs the crew still has open
 * @param {object}   opts.review         verdict of the Verification Agent, if it ran
 * @returns decision to merge into the incident (never throws)
 */
const decide = async (incident, countOpenJobs, opts = {}) => {
  const review = opts.review || null;
  const { category, severity = 'Medium', confidence = 0 } = incident;
  const label = incident.label || String(category).replace(/_/g, ' ');
  const team = teamForCategory(category);
  const tName = teamName(team);
  const sev = SEVERITY[severity] || SEVERITY.Medium;
  const confPct = Math.round(confidence * 100);
  const decidedAt = new Date();
  const priority = sev.weight + Math.round(confidence * 10);
  const base = { team, teamName: tName, priority, decidedAt, mode: 'auto' };
  const hold = (reason) => ({ ...base, dispatched: false, needsReview: true, status: 'Needs Review', reason });

  if (!enabled()) return hold('Auto-dispatch is switched off; waiting for the Municipal Officer.');
  if (!team) return hold(`No team handles "${label}"; held for the Municipal Officer.`);

  // What the second AI check said, in words an officer can read
  const verdict = review && review.performed ? review.verdict : null;
  const aiNotes = review && review.notes && review.notes.length ? ` ${review.notes.join(' ')}` : '';
  const corrected = (review?.changes || [])
    .map((c) =>
      c.kind === 'relabeled'
        ? `corrected "${String(c.from).replace(/_/g, ' ')}" to "${String(c.to).replace(/_/g, ' ')}" (${c.reason})`
        : `removed a false "${String(c.from).replace(/_/g, ' ')}" box (${c.reason})`
    )
    .join('; ');
  let verifiedNote = '';
  if (verdict === 'corrected') verifiedNote = ` Second AI check (${review.model}) ${corrected}.`;
  else if (verdict === 'confirmed') verifiedNote = ` Second AI check (${review.model}) confirmed the detection.`;

  // The AI check disagreed but was not sure enough to overrule the detector: a person decides
  if (verdict === 'disputed') {
    return hold(`${label} (${severity}, ${confPct}% confidence).${aiNotes} Held for the Municipal Officer because the two AI opinions differ.`);
  }

  if (confidence < minConfidence()) {
    // A low-confidence detection is dispatched only if the second AI check confirmed or corrected it
    if (verdict !== 'confirmed' && verdict !== 'corrected') {
      let why = '';
      if (verdict === 'unsure') why = ' A second AI check was not certain either.';
      else if (review && !review.performed) why = ' The second AI check could not be completed.';
      return hold(
        `${label} detected with only ${confPct}% confidence (below ${Math.round(minConfidence() * 100)}%).${why}${aiNotes} Held for the Municipal Officer to confirm before a crew is sent.`
      );
    }
    verifiedNote = ` Low detector confidence (${confPct}%), accepted because:${verifiedNote}`;
  }

  const chosen = await chooseCrew(team, category, countOpenJobs);
  if (!chosen) return hold(`No crews configured for ${tName}; held for the Municipal Officer.`);

  const reason =
    `${label} (${severity}, ${confPct}% confidence) -> ${tName} -> ${chosen.crew} ` +
    `(${chosen.specialist ? 'specialist' : 'general'} crew, ${chosen.open} open job${chosen.open === 1 ? '' : 's'}). ` +
    `Target response: ${humanHours(sev.hours)}.${verifiedNote}${aiNotes}`;

  return {
    ...base,
    dispatched: true,
    crew: chosen.crew,
    status: 'Assigned',
    targetBy: targetFor(severity, decidedAt),
    needsReview: false,
    reason,
  };
};

module.exports = { decide, chooseCrew, targetFor, SEVERITY, isEnabled: enabled, getMinConfidence: minConfidence };
