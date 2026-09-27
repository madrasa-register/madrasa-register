# Maktab App — Phase 1

This app replaces the paper حاضری رجسٹر of مکتب تعلیم القرآن الکریم, following Master Specification v2. Phase 1 covers branches, classes, teachers, the student master index, and daily student and teacher attendance with the §6 rules and alerts.

## Stack

| Layer | Choice | Why |
|---|---|---|
| UI | React + TypeScript (Vite) | One codebase for the phone app and the head-office web panel |
| Phone app | Capacitor (Android now; iOS can be added with `npx cap add ios`) | Builds a normal APK/AAB for the Play Store |
| Local database | SQLite through the PowerSync Web SDK | Offline-first. Sync to Supabase Postgres (spec §3) plugs into this same database once a Supabase project exists |
| Rules | `src/engine/*.ts`, pure functions with unit tests | Same result on every device, online or offline |
| Languages | Urdu (default, RTL), Arabic (RTL), English (LTR) | Picker in the menu, on the setup screen and in Settings. Arabic strings are in `src/i18n/ar.ts` |
| Fonts | Urdu: Noto Nastaliq Urdu · Arabic: Amiri · English and all digits: Source Sans 3 (all OFL, bundled) | Jameel Noori Nastaleeq is not bundled until its licence is confirmed (spec §12). A maktab that owns the file can load it in Settings, and it stays on that device |

**Why not Flutter:** the spec names Flutter, but this build environment cannot download the Flutter SDK or pub.dev packages. The owner approved using any stack that makes Play Store publishing and phone installs easy (2026-09-26). The spec's data model, engines and sync design (SQLite → PowerSync → Supabase with RLS per branch) are unchanged.

## Commands

```bash
npm install
npm run dev        # develop in the browser
npm test           # rule-engine unit tests
npm run build      # web build in dist/
npm run android    # build + copy into the Android project
```

## Getting an APK

- **Easiest:** push this folder to a GitHub repository. The workflow in `.github/workflows/android.yml` builds `app-debug.apk` on every push; download it from the run's *Artifacts*.
- **On your own computer:** install Android Studio, run `npm run android`, then open the `android/` folder and use Build → Build APK / Generate Signed Bundle (the `.aab` is what the Play Store takes).

## Rules implemented (Spec §6)

- Attendance % = present × 100 ÷ teaching days. Leave (L) counts as absence.
- Attendance marks come from bands. A band is reached only at its lower edge, so 89.6% gives 6. The bands can be edited in Settings.
- Teaching days are the class days where attendance was taken. Holidays are excluded. From Phase 2 the calendar engine supplies these days.
- An alert is raised after 3 consecutive A marks. L breaks the count (approved default; this is a setting). The alert screen can call, WhatsApp or SMS the guardian and records the absence reason on follow-up.
- Below 60%, the student is shown as not entered in the exam. The nazim can record an exception with a reason.
- Nothing is deleted. Withdrawal sets the status to left, with date and reason, and the register shows ✗ and a line through the name. Every correction is stored in `audit_log` with the old value, new value and reason.
- Attendance can be changed freely until "Save register"; after that, a change needs a reason.
- Every threshold is a setting (org → branch). Nothing is hard-coded.

## Phases 2–5 (built)

- **Calendar (§5):** `src/engine/calendar.ts` + `hijri.ts`. Umm al-Qura base with per-month one-day earlier/later buttons. Validated day by day against the printed calendars 2023/24–2025/26 (`calendar.test.ts`).
- **Mark schemes (§7.0):** builder with live totals, validation, copy, versioning (editing creates a new version; past marks never change), scope org → branch → class. Default 200-mark template v1 and the book's ب / م / ک form ship as templates.
- **Scoring (§7):** deduction buttons (every tap is its own row; undo marks a tap void), same tajweed mistake counts once per letter/rule, question-outcome buttons with the easy-question fallback, نمازی ڈائری categories by gender, attendance marks from the exam window, grace marks, hold promotion, makeup exams (no position, no bonus), remarks, class remark, examiner signature, finalize.
- **Grading (§8):** percentage rounded half down; reproduces the book tables for 190/200/500/800. Position with shared ties; عملی کیفیت rule with a one-line reason to override; prize and follow-up lists; public result sheet; ceremony list.
- **Result card (§9):** 2-page card rasterized into a PDF (Nastaliq stays intact). In the phone app the PDF opens the share sheet.
- **Hadiya (§10):** payments ledger with receipts, multi-month and sibling splits, fee amounts per student from a month, exempt/sponsor, admission items, mutthi fund, reversal entries. Head office sees totals only unless the branch allows.
- **Activity log (§11):** six activities per class per month; due months from the calendar; overdue shown.

## Items still marked "to confirm" (configurable, spec defaults)

Hifz question marks split evenly · partly-correct deduction 5 · tie style for positions (1,1,3) · the six guardian instructions of the card (Settings → card.instructions) · Jameel Noori licence · national/local holidays per branch.

## Not yet

Online sync and real login (needs a Supabase project).
