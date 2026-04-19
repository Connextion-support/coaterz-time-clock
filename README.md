# CoaterZ Time Clock — "The Gold Standard"

Employee time tracking system with GoHighLevel (GHL) integration.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    VERCEL (Hosting)                       │
│                                                          │
│  ┌──────────────┐    ┌──────────────────────────────┐   │
│  │  / (Clock)    │    │  /admin (Admin Panel)         │   │
│  │  Employee     │    │  Dashboard / Employees /      │   │
│  │  Clock In/Out │    │  Reports & Export / Settings  │   │
│  └──────┬───────┘    └──────────┬───────────────────┘   │
│         │                       │                        │
│  ┌──────┴───────────────────────┴───────────────────┐   │
│  │              API Routes (Next.js)                 │   │
│  │                                                   │   │
│  │  POST /api/clock        → Clock in/out            │   │
│  │  GET  /api/clock        → Check employee status   │   │
│  │  GET  /api/employees    → List employees          │   │
│  │  POST /api/employees    → Add/update employee     │   │
│  │  POST /api/webhook      → GHL inbound webhook     │   │
│  │  GET  /api/reports      → JSON/CSV time reports   │   │
│  │  POST /api/auth         → Admin login             │   │
│  └──────────────────────┬────────────────────────────┘   │
│                         │                                │
└─────────────────────────┼────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              │    SUPABASE (DB)       │
              │                        │
              │  employees             │
              │  time_entries          │
              │  app_settings          │
              │  webhook_log           │
              │                        │
              │  Views:                │
              │  • active_sessions     │
              │  • weekly_summary      │
              └───────────┬────────────┘
                          │
              ┌───────────┴───────────┐
              │   GOHIGHLEVEL (GHL)    │
              │                        │
              │  Workflow Trigger       │
              │  → HTTP POST to        │
              │    /api/webhook         │
              │    (sends employees)    │
              │                        │
              │  Inbound Webhook       │
              │  ← Receives clock      │
              │    events from app     │
              └────────────────────────┘
```

---

## Quick Start — Full Deployment (30 minutes)

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Name it `coaterz-timeclock`, pick a strong DB password, select a region
3. Wait for it to finish provisioning (~2 min)
4. Go to **SQL Editor** → **New Query**
5. Paste the entire contents of `supabase/001_schema.sql` and click **Run**
6. You should see "Success" — all tables, indexes, triggers, and policies are created

### Step 2: Get Your Supabase Keys

1. Go to **Settings** → **API** in your Supabase dashboard
2. Copy these three values:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret!)

### Step 3: Deploy to Vercel

**Option A — GitHub (Recommended)**

1. Push this project to a GitHub repo:
   ```bash
   cd coaterz-timeclock
   git init
   git add .
   git commit -m "CoaterZ Time Clock v1.0"
   git remote add origin https://github.com/YOUR_USER/coaterz-timeclock.git
   git push -u origin main
   ```

2. Go to [vercel.com](https://vercel.com) → **Add New Project**
3. Import your GitHub repo
4. In the **Environment Variables** section, add:

   | Variable | Value |
   |----------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxx.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGci...` |
   | `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` |
   | `API_SECRET_KEY` | (generate a random 32-char string) |
   | `ADMIN_PASSWORD` | (your admin password — change from "admin"!) |
   | `GHL_WEBHOOK_URL` | (your GHL inbound webhook URL — optional) |

5. Click **Deploy** — done!

**Option B — Vercel CLI**

```bash
npm i -g vercel
cd coaterz-timeclock
vercel --prod
# Follow prompts, then add env vars in Vercel dashboard
```

### Step 4: Set Your Admin Password

In your Vercel dashboard → **Settings** → **Environment Variables**:
- Set `ADMIN_PASSWORD` to something strong (this replaces the default "admin")

### Step 5: Connect GHL

See the **GHL Integration** section below.

---

## GHL Integration — Two-Way Sync

### A. Send Employees FROM GHL → Time Clock

This automatically creates employees in the time clock when a contact is created or tagged in GHL.

**GHL Workflow Setup:**

1. Open **Automation** → **Workflows** → **Create Workflow**
2. **Trigger**: Choose one of:
   - "Contact Created" (if every new contact is an employee)
   - "Contact Tag Added" → tag: "Employee" (recommended)
   - "Pipeline Stage Changed" → to an "Active Employee" stage
3. **Action**: Add **HTTP Request / Webhook**
   - Method: `POST`
   - URL: `https://YOUR-DOMAIN.vercel.app/api/webhook`
   - Headers: `Content-Type: application/json`
   - Body (JSON):
     ```json
     {
       "fullName": "{{contact.name}}",
       "phone": "{{contact.phone}}",
       "department": "{{contact.custom_field.department}}",
       "hourlyRate": "{{contact.custom_field.hourly_rate}}",
       "ghlContactId": "{{contact.id}}"
     }
     ```
   - Replace custom field keys with your actual GHL custom value names
4. **Save & Publish** the workflow

**To deactivate an employee from GHL:**
Send the same webhook with `"action": "deactivate"` and the phone number.

### B. Send Clock Events FROM Time Clock → GHL

This pushes every clock-in/clock-out event to GHL for workflow automation (notifications, logging, etc).

**Setup:**

1. In GHL, go to **Automation** → **Workflows** → **Create Workflow**
2. **Trigger**: "Inbound Webhook"
3. Copy the webhook URL GHL gives you
4. In your Vercel dashboard, set `GHL_WEBHOOK_URL` to this URL
5. In the GHL workflow, add actions based on the event:
   - `event = "clock_in"` → Send SMS notification, log to custom field, etc.
   - `event = "clock_out"` → Update custom field with hours, send summary, etc.

**Payload sent to GHL on each event:**
```json
{
  "event": "clock_in" | "clock_out",
  "employeeId": "5551234567",
  "fullName": "John Smith",
  "department": "Crew A",
  "clockIn": "2025-01-15T08:00:00.000Z",
  "clockOut": "2025-01-15T17:00:00.000Z",
  "hoursWorked": 9.00,
  "workOrder": "WO-1042",
  "entryId": "uuid-of-entry"
}
```

---

## Embedding in GHL

To embed the time clock as a page inside GHL:

1. In GHL, go to **Sites** → **Funnels/Websites** or use **Custom Menu Links**
2. Add a **Custom iFrame** element or **Custom Menu Link**:
   - Clock page: `https://YOUR-DOMAIN.vercel.app/`
   - Admin page: `https://YOUR-DOMAIN.vercel.app/admin`
3. Set iframe width to `100%`, height to `100vh` or `900px`

You can also add it as a **Tab** in the GHL sidebar:
- Go to **Settings** → **Custom Menu Links**
- URL: `https://YOUR-DOMAIN.vercel.app/admin`
- Icon: Clock icon
- This gives admins one-click access from the GHL dashboard

---

## API Reference

All API routes are under `/api/`. Admin-protected routes require `x-api-key` header.

### Clock In/Out

```
POST /api/clock
Body: { "phone": "5551234567", "workOrder": "WO-1042" }

Response (clock in):
{ "action": "clock_in", "employee": {...}, "entry": {...} }

Response (clock out):
{ "action": "clock_out", "employee": {...}, "entry": {...}, "hoursWorked": 8.5 }
```

### Check Status

```
GET /api/clock?phone=5551234567

Response:
{ "found": true, "employee": {...}, "clockedIn": true, "activeEntry": {...} }
```

### Employees

```
GET  /api/employees                    → List all
POST /api/employees                    → Create/update (GHL or manual)
PUT  /api/employees (x-api-key)        → Update by ID
DELETE /api/employees?id=xxx (x-api-key) → Deactivate
```

### Reports

```
GET /api/reports?period=current_week              → JSON report
GET /api/reports?period=last_week&format=csv      → CSV download
GET /api/reports?period=custom&start=2025-01-05&end=2025-01-11
GET /api/reports?period=current_week&employee_id=uuid
GET /api/reports?period=current_week&overtime_threshold=40
```

### GHL Webhook Receiver

```
POST /api/webhook
Body: { "fullName": "...", "phone": "...", "department": "...", "hourlyRate": 25 }
```

---

## CSV Export Format

The CSV export groups entries by employee with the following columns:

| Column | Description |
|--------|-------------|
| Full Name | Employee's full name |
| Employee ID (Phone) | Formatted phone number |
| Department | Department or crew assignment |
| Hourly Rate | Employee's hourly rate |
| Date | Date of the time entry |
| Clock In | Clock-in time |
| Clock Out | Clock-out time (or "ACTIVE") |
| Hours Worked | Calculated hours for this entry |
| Work Order | Work order/job number if entered |
| Regular Hrs (Period) | Total regular hours (first row per employee) |
| OT Hrs (Period) | Overtime hours beyond threshold (first row) |
| Gross Pay (Period) | Calculated gross pay including 1.5x OT (first row) |

Each employee group ends with a **TOTAL** summary row and a blank separator.

---

## Database Tables

### employees
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| phone | TEXT | Normalized 10-digit phone (unique, serves as employee ID) |
| full_name | TEXT | Employee's full name |
| department | TEXT | Department/crew |
| hourly_rate | DECIMAL | Hourly pay rate |
| notes | TEXT | Admin notes |
| is_active | BOOLEAN | Active status (soft delete) |
| ghl_contact_id | TEXT | GHL contact ID for cross-reference |

### time_entries
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| employee_id | UUID | FK → employees |
| clock_in | TIMESTAMPTZ | Clock-in timestamp |
| clock_out | TIMESTAMPTZ | Clock-out timestamp (null = active) |
| hours_worked | DECIMAL | Auto-calculated on clock-out via trigger |
| work_order | TEXT | Optional work order/job number |
| is_manual | BOOLEAN | Flagged if admin manually edited |

### webhook_log
Full audit trail of all GHL webhook events (inbound and outbound).

---

## Security Notes

- **Change the default admin password** — Set `ADMIN_PASSWORD` env var in Vercel
- **Service role key** — Never expose `SUPABASE_SERVICE_ROLE_KEY` client-side; it's only used in API routes
- **API secret** — Set `API_SECRET_KEY` for admin-protected endpoints
- **RLS enabled** — All tables have Row Level Security; anon key has limited read/write access
- **Webhook endpoint** — `/api/webhook` is open (no auth) by design so GHL can POST to it. Add `API_SECRET_KEY` validation if you want to lock it down

---

## Local Development

```bash
cp .env.example .env.local
# Fill in your Supabase credentials
npm install
npm run dev
# Open http://localhost:3000
```

---

## Project Structure

```
coaterz-timeclock/
├── supabase/
│   └── 001_schema.sql          # Full database schema (run in Supabase SQL Editor)
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Employee clock in/out page
│   │   ├── admin/
│   │   │   └── page.tsx        # Admin panel (dashboard, employees, reports, settings)
│   │   └── api/
│   │       ├── auth/route.ts   # Admin login
│   │       ├── clock/route.ts  # Clock in/out + status check
│   │       ├── employees/route.ts  # Employee CRUD
│   │       ├── reports/route.ts    # Time reports + CSV export
│   │       └── webhook/route.ts    # GHL inbound webhook
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client (browser + server)
│   │   └── helpers.ts          # Shared utilities
│   └── styles/
│       └── globals.css         # Global styles + CoaterZ palette
├── .env.example                # Environment variables template
├── next.config.js
├── package.json
├── tsconfig.json
├── vercel.json
└── README.md
```
