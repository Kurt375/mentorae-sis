# Mentorae Student Information System

This package contains a **fully wired backend and frontend** for the Mentorae SIS —
built from your uploaded prototype, with every page connected to a real
Node.js + Express + MySQL API instead of the placeholder `alert()`/mock-data
logic it shipped with.

```
mentorae-sis/
├── backend/           Node.js + Express + MySQL API
│   ├── server.js
│   ├── config/db.js
│   ├── controllers/   auth, attendance, grades, classes, badges,
│   │                  schedules, announcements, settings, database
│   │                  browser, analytics, user management, reference
│   │                  data, parent
│   ├── routes/        one file per controller, mounted under /api/*
│   ├── middleware/     JWT auth, role guard
│   ├── db/schema.sql   run this once against your MySQL database
│   └── scripts/        CLI helpers (seed the first admin, hash a password)
└── frontend/          Your original pages, now calling the real API
    ├── login.html, config.js, session.js, announcements.html
    ├── Student/, Teacher/, Parent/     role dashboards + sub-pages
    └── dashboard_admin.html, user_management_admin.html,
        announcement_admin.html, system_settings_admin.html,
        database_admin.html, analytics_admin.html,
        schedule_management_admin.html, attendance_scanner_teacher.html
```

## 1. What's implemented

- **Login** — real authentication against MySQL, bcrypt-hashed passwords,
  JWT sessions, account lockout after 5 failed attempts.
- **Forgot password** — the real 3-step OTP flow your login modal already
  has: email a 6-digit code, verify it, set a new password.
- **Scanner Access** — the login page's code box verifies against real
  scanner keys generated in User Management, and opens the QR scanner
  without a personal login.
- **Attendance** — every student's QR code encodes their real, unique
  Student ID (previously every student's QR was the same fixed string —
  see the bug list below). Teachers scan with a real camera feed decoded
  client-side (jsQR) and POSTed to the server; attendance confirmation
  has real schedule-based session locking, so a teacher can only
  confirm/override attendance during their own scheduled period for that
  section.
- **Grades** — Quiz/Activity/Exam entry with live-computed average and
  DepEd-style remarks band, saved per student/subject/term.
- **Badges** — the fixed 10-badge catalog from your design, awardable by
  teachers, with a real per-student activity feed.
- **Schedules** — admin schedule builder with real conflict detection
  (same teacher, overlapping time, same day) and the school-hours/
  duration validation your original page was trying to do before it hit
  a crash bug (see below).
- **Announcements** — auto-classified as event/academic/seminar, with
  batch delete, shared across all four roles via one page.
- **System Settings** — all 4 tabs (General, Notifications, Security,
  Database) persist to the database; "Save All" now genuinely saves all
  tabs, not just whichever one was visible.
- **Database browser** — Students/Subjects/Strands tables, live from
  the database.
- **Analytics** — real Chart.js grade trend and risk-distribution charts,
  and a real at-risk student directory (High risk: grade < 75% or
  attendance < 75%; Medium: grade < 85% or attendance < 90%).
- **User Management** — the auto-generate ID/Email/Scanner-Key buttons
  now do real, collision-checked generation against the database; user
  creation also auto-generates a temporary password (shown once to the
  admin — see "no password field" below) and supports search, filter,
  pagination, and CSV export.

## 2. Bugs found and fixed along the way

Your original package was a polished prototype with almost nothing wired
to a server. Beyond that, these were genuine bugs — not just "missing
backend calls":

1. **Every student's QR code was identical** (`"TSHS-Student-Pass-2026"`,
   hardcoded). Fixed — each student's QR now encodes their own ID number.
2. **Student and Parent dashboard logout buttons didn't log out** — they
   only `console.log`'d. Fixed.
3. **`schedule_management_admin.js` had a live crash bug** — referenced
   an out-of-scope `isSubmit` variable, guaranteed `ReferenceError` the
   moment the form was submitted. Fixed with real validation.
4. **3 pages didn't exist** that the teacher dashboard linked to
   (`analytics_teacher.html`, `announcements_teacher.html`,
   `learning_resources_teacher.html`). Built the first two for real;
   the third is an honest "coming soon" placeholder (see below).
5. **5 of 6 student dashboard cards led nowhere** — their target pages
   (grades, resources, achievements, profile) didn't exist either. Built
   4 of them for real; resources is a placeholder (see below).
6. **`attendance_scanner_teacher.html` linked back to `dashboard_teacher.html`**
   with a broken relative path (the scanner is at the project root, the
   dashboard is in `/Teacher/`). Fixed.
7. **`dashboard_teacher.js`'s logout link had the same broken relative
   path bug.** Fixed.
8. **3 pages referenced a `portal.css` that didn't exist anywhere in the
   package** (`user_management_admin.html`, `announcement_admin.html`,
   `analytics_admin.html`). Harmless — the same rules were duplicated in
   each page's own CSS — but removed the dead reference.
9. **`announcement_admin.html` and `database_admin.html` both had a
   duplicated, malformed `<main>` tag opening** (copy-paste artifact).
   Fixed both.
10. **An entire orphaned draft page** (`attendance_confirmation_teacher.html`
    + its own `.css`/`.js`) sat at the project root, superseded by the
    real version in `/Teacher/`, with nothing in the app ever linking to
    it. Removed.
11. **No password field anywhere in user creation.** Fixed — account
    creation now auto-generates a temporary password, shown once to the
    admin to share with the new user.
12. **The teacher's Confirm/Unconfirm attendance button was explicitly
    fake** (the code's own comment said it only changed color). Fixed —
    it now really updates the attendance record, gated by the real
    session-lock check.
13. **Several missing image/audio assets** referenced but never included
    (`teacher_avatar.png`, `joana_avatar.png`, `sounds/scan-success.mp3`,
    `sounds/scan-fail.mp3`). Replaced avatars with icon placeholders;
    sound elements are left empty and safe to point at real files later.
14. **Inconsistent student ID formats** across the mockup's different
    files (`20231234`, `2024-12345`, `23-15234`). Standardized on one
    real format: `YY-NNNNN` (e.g. `26-00001`), auto-generated.
15. **Authorization gaps found on a follow-up security pass** — several
    endpoints checked *role* (e.g. "is this a teacher?") but not
    *ownership* (e.g. "does this teacher actually teach this specific
    student/section?"). A logged-in teacher or admin could originally
    view any student's grades/attendance/badges, or any section's
    roster, by changing an ID in the request — not through the UI, but
    via a direct API call. Fixed with a shared authorization module
    (`backend/utils/authz.js`) now used by attendance, grades, classes,
    and badges: a teacher must have an actual schedule entry tying them
    to the section/student; a parent must have a `parent_student_links`
    row; a student can only see their own. Admins remain unrestricted
    by design.
16. **Grade/badge writes were unscoped too** — a teacher could
    originally post a grade or award a badge to *any* student ID, not
    just their own students. Same fix applied to the write paths
    (`saveGrade`, `awardBadges`), not just the read paths.

## 3. What's an honest placeholder, not silently missing

- **Learning Resources** (student and teacher pages) — no backend for
  posting/browsing study materials was part of your original design;
  these pages say "Coming Soon" rather than faking data.
- **Predictive/prescriptive analytics** — only descriptive stats
  (average grade, attendance rate, risk classification) are real;
  trend forecasting is not implemented.
- **Automated database backup/restore** (Settings → Database tab) —
  points you to Railway's own MySQL tools instead of building a custom
  backup pipeline.

## 4. Database setup

```bash
mysql -u root -p < backend/db/schema.sql
```
This creates the `mentorae_sis` database, all tables, and seeds the
strands (STEM, ABM, HUMSS, ICT, HE, BE, ASSH, ALS), a starter subject
list, and the 10-badge catalog.

## 5. Deploy — one Railway project covers "online and local"

You already have Railway experience from an earlier build — same
pattern here. **One MySQL database on Railway is both your online
database and your local development database** — there's no need for
two separate databases; you connect to the same Railway instance whether
you're running the backend on your laptop or it's deployed live.

### a) Create the Railway project + MySQL

1. [railway.app](https://railway.app) → New Project → Empty Project
2. **+ New → Database → Add MySQL**
3. On the MySQL service → **Data** tab → paste in the full contents of
   `backend/db/schema.sql` and run it.

### b) Deploy the backend

1. **+ New → GitHub Repo** (push this project to GitHub first) → root
   directory `backend`
2. Confirm `MYSQL_URL` is shared from the MySQL service (Variables tab →
   Add Reference if it's not already there)
3. Add these variables:
   - `JWT_SECRET` — any long random string
   - `OTP_EXPIRES_MIN` — `10`
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`
     — for the forgot-password OTP emails (same Gmail App Password setup
     you used before works here too)
   - `CLIENT_ORIGIN` — your frontend URL once deployed (step d)
4. **Settings → Networking → Generate Domain**, note the URL

### c) Seed your first admin account

```bash
cd backend
npm install
# Point .env at the same MYSQL_URL as Railway (copy from the MySQL
# service's Variables tab), then:
node scripts/add-user.js admin ADMIN-0001 System Administrator admin@talisayshs.edu.ph "ChangeMe123!" 09171234567
```

### d) Deploy the frontend

1. Edit `frontend/config.js`:
   ```js
   window.MENTORAE_CONFIG = {
     API_BASE_URL: "https://your-backend.up.railway.app",
   };
   ```
2. Deploy `frontend/` as a static site — Netlify (drag-and-drop or
   connect the repo, base directory `frontend`) is the easiest option.
3. Back on the Railway backend service, set `CLIENT_ORIGIN` to this
   frontend URL and redeploy.

### e) Test it

1. Log in with your seeded admin account.
2. In **User Management**, create a teacher, a student, and a parent —
   note each generated ID and temporary password.
3. In **Schedule Management**, assign the teacher a subject/section/day/time.
4. Log in as the student → open **Attendance** → their QR code should
   show their own ID number.
5. Log in as the teacher → open the **Attendance Scanner** or
   **Attendance Confirmation** page during (or near) the scheduled
   period → confirm attendance updates for real.
6. Try **Forgot Password** on the login page end-to-end.

## 6. Local development

```bash
cd backend
cp .env.example .env    # fill in local DB creds or Railway's MYSQL_URL
npm install
npm run dev              # http://localhost:5000

cd ../frontend
npx serve .               # any static server works
```

## 7. Next steps worth knowing about

- Grade/attendance/user lists are paginated server-side with a default
  page size — the admin User Management table already supports
  `?page=`/`?limit=`, but the frontend doesn't yet render page controls
  for lists beyond the first page. Worth adding if your user count grows
  past ~25.
- There's no "edit user" (name/email) or "delete user" in this build —
  only create and activate/deactivate. Add these to
  `backend/controllers/userManagementController.js` +
  `user_management_admin.js` following the same pattern as `updateUser`.
- Change the seeded admin password immediately via "Forgot Password"
  after your first login.
