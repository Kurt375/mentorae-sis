# Mentorae SIS — implementation status (Aug 2026)

Run `backend/db/migrations/002_feature_additions.sql` against your DB before
testing any of this. Everything below is written, but **untested against a
live server/DB** — this sandbox has no network path to your MySQL instance.
Test locally / in Claude Code and report back anything that breaks.

## All 18 items — what was done

1. **4Ps in role dropdown** — added as a "Program" field next to Role (Role
   ENUM wasn't touched — see note below).
2. **ARAL Program in role dropdown** — same as above.
3. **Teacher scheduling DB** — the `schedules` table already existed;
   extended with `quarter`.
4. **New-account notification** — `createUser` writes an in-app
   `account_created` notification; visible via the bell icon once the new
   user logs in (their own profile-edit page is where they'd add a personal
   email, per your workflow).
5. **"Generate ID" rename** + **Role in front of ID generator** — done.
6. **Sem/year/section/strand/present status on dashboards** — new
   `GET /api/auth/status-summary` endpoint; wired into both student and
   teacher dashboard banners (adds a term line; student's status pill now
   reflects real attendance instead of a hardcoded "Present").
7. **Role dropdown reorder** — done (see #5).
8. **Quarter dropdown in schedule management** — done, full create/list
   round-trip.
9. **Search all columns in User Management** — done (name, email, personal
   email, ID, contact, role, program, active status).
10. **Scanner key 6:00 AM–4:00 PM window** — `verifyScannerKey` now checks
    `system_settings.scanner_key_window_start/end` (or a per-key override).
11. **Student/teacher profile picture upload** — `PATCH /api/auth/profile`
    (`avatarBase64`), new Edit Profile section on `profile_student.html` and
    a brand-new `profile_teacher.html`. **Caveat**: stored as a base64 data
    URL directly in the DB (`users.profile_picture_url MEDIUMTEXT`) since
    there's no object-storage account configured. Fine for a school-scale
    deployment; if you later add S3/Cloudinary, swap this column for a URL.
12. **Secondary "out" scan, 3:30 PM cutoff, excused-if-early** — `scanAttendance`
    now treats a student's 2nd scan of the day as time-out: at/after 3:30 PM
    → `out`, before → `excused` ("left early").
13. **Adviser notified of early leavers** — fires from
    `confirmAttendanceOut` when a teacher verifies an "excused" (early)
    time-out, notifying `sections.adviser_id`.
14. **User profile shown on scanner page** — the scan-ticket now renders the
    student's uploaded photo (falls back to the icon if none), and the
    status pill is color-coded by outcome.
15. **Schedule management working in admin dash** — reviewed the whole
    flow (`schedulesController.js` + `schedule_management_admin.js/html`);
    it's correctly wired end to end, including the quarter field I added.
    I could not reproduce a failure without a live DB — if it's still
    broken for you, send the browser console error and I'll fix the exact
    line.
16. **Only show/allow students under teacher's current subject & time** —
    `scanAttendance` now rejects a teacher's scan of a student whose section
    isn't in one of that teacher's *currently active* scheduled periods
    (reuses the existing session-lock logic). Security/admin scans at the
    gate are exempt.
17. **Parent notified on arrived/late/excused/out — only once teacher
    verifies** — `confirmAttendance` (arrived/late/excused) and the new
    `confirmAttendanceOut` (out/excused-early) both notify every linked
    parent via `parent_student_links`.
18. **Schedule manager working + red/yellow present indicator** — schedule
    manager: see #15. The red/yellow indicator on Attendance Confirmation
    **already existed** in the code before I touched it
    (`bg-danger-subtle` for absent, `bg-warning-subtle` for late, driven by
    the real `attendance_late_cutoff` setting) — I added Late/Excused
    action buttons next to the existing Present/Absent ones so a teacher can
    actually set those states.

## New pieces added to support all of this
- `notifications` table + `backend/utils/notifications.js` (`notify`,
  `notifyMany`) + `GET/PATCH /api/notifications` + a small reusable bell
  widget (`frontend/notifications-widget.js`) wired into the Student,
  Teacher, and Parent dashboards.
- `GET /api/auth/status-summary`, `PATCH /api/auth/profile`.
- `POST /api/attendance/confirm-out`.

## Why 4Ps/ARAL aren't `users.role`
`users.role` is an ENUM every permission check in the app switches on. Adding
`'4ps'`/`'aral'` there would silently strip student permissions from those
students unless ~30 role checks across the codebase were also updated. They're
students *enrolled in* a subsidy/remedial program, not a different access
level, so they're stored as `users.program` and shown right next to Role in
Create Account. Say the word if you actually wanted them as real roles.

## Known limitations / things to verify once you can run this
- `attendance_logs.confirmed_by`/`confirmed_at` is a single pair of columns
  reused by both the arrival-confirm and the out-confirm actions — it will
  reflect whichever was confirmed most recently, not both independently. Fine
  unless you need to audit both confirmations separately; say so and I'll
  split it into two column pairs.
- Base64 profile pictures live directly in the `users` row — large photos
  will bloat that table. Consider capping upload size client-side (a
  `<1MB` check before the base64 conversion) if this becomes an issue.
- Everything here is written against your existing patterns but **not run**.
  Treat this as a strong first pass to test and fix, not a guaranteed-working
  deploy.

## Aug 17 — Learning Resources (module upload + update)

New feature, not part of the original 18. Run
`backend/db/migrations/003_lesson_modules.sql` after 002.

**Upload ("gather and post" modules):** `POST /api/resources` (multipart:
title, description, subjectId, sectionId, quarter, files[]) — a teacher posts
one lesson "module" that can bundle several files at once (handout + slides +
worksheet, etc.). Files land on disk under `backend/uploads/lesson-files`
(not the DB — these can be much bigger than a profile picture), validated by
type (PDF/Word/PowerPoint/Excel/images/text) and capped at 25MB each, 10 per
upload. Students in the target section (or every section the teacher has that
subject with, if no section is picked) get a `lesson_module_posted`
notification.

**Update a lesson file:** `PUT /api/resources/files/:fileId` (multipart:
`file`) — replaces one file's content in place. The old version is archived
to `lesson_module_file_versions` (never deleted from the DB, though the old
copy on disk is removed to save space — comment out that one `fs.unlink` call
in `replaceFile()` if you'd rather keep old files on disk too), the version
number increments, and affected students get a `lesson_module_updated`
notification.

**Also added:** `POST /api/resources/:moduleId/files` (add more files to an
existing module without replacing anything — built but not yet wired into
the UI), `GET /api/resources/files/:fileId/download` (access-controlled —
teacher must own it, student/parent must be able to see the module),
`DELETE /api/resources/:moduleId`, and `GET /api/classes/my-subjects` (feeds
the upload form's Subject dropdown from the teacher's actual schedule).

Frontend: `Teacher/learning_resources_teacher.html/js` (upload form + list
with per-file "Update" buttons) and `Student/resources_student.html/js`
(browse + download, "Updated" badge on recently-replaced files) — both were
"Coming Soon" placeholders before this.

**Tested in this sandbox** (no DB, so this is as far as verification could
go): booted the real server with dummy env vars and confirmed the whole
route graph loads, auth/multer middleware run in the right order, a real
multipart upload is correctly parsed and written to disk, and DB-layer
errors are caught and returned as clean JSON instead of crashing the
process. The actual INSERT/notification logic still needs a real DB to
verify.

**Caveat carried over from the profile-picture note:** `backend/uploads` is
local disk, which is ephemeral on Railway's default filesystem — mount a
persistent volume there (or move to S3/Cloudinary later) before relying on
this in production.

## Aug 20 — Leaderboard + badges on profile

Badge *awarding* already existed before this (teacher picks a student +
badges on Class Management, backend stores it) — that part was already
built. What was missing: badges weren't shown anywhere game-profile-style,
and there was no leaderboard at all (confirmed by searching the whole
codebase for "leaderboard" — zero results before this).

Run `backend/db/migrations/004_leaderboard.sql` after 003. It adds a
`points` column to `badge_catalog` with starting point values per badge
(10–25, editable any time — the leaderboard just sums whatever's there).

**New:** `GET /api/badges/leaderboard?scope=section|school&sectionId=&limit=`
— ranks students by total badge points (ties broken by badge count, then
name). Students/parents default to their own section; teachers can pass
`sectionId` (must teach it) or `scope=school`.

**Frontend:**
- `Student/leaderboard_student.html/js` — new page, My Section / Whole
  School tabs, gold/silver/bronze trophy icons for top 3, highlights the
  logged-in student's own row. Linked from the student dashboard.
- `profile_student.html` — badges now show two places: a small icon strip
  right under the student's name in the banner (the "game profile" look
  that was asked for), and a full badge grid further down with earn dates
  on hover. Both read from the existing `/api/badges/student/:id` endpoint.
- `Teacher/class_management_teacher.html/js` — added a "Section Leaderboard"
  panel (top 5) that updates when the teacher switches sections, so a
  teacher can see standings right where they already award badges.

**Tested the same way as the resources feature:** booted the real server
with dummy env vars, hit `/api/badges/leaderboard` with a real JWT for both
scopes, confirmed the route reaches the controller and the SQL is at least
well-formed enough to get to a (expected, no-DB-here) connection error
rather than crashing. The actual ranking output — does the SUM/GROUP BY
give the right numbers — needs your live DB to confirm.

**One thing worth deciding:** right now school-wide badge point totals are
visible to any student who taps "Whole School." If that's not desired
(e.g. you'd rather keep it section-only, or hide other students' exact
scores from students outright), say so and I'll adjust the scope rules.
