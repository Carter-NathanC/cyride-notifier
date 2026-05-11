# 🚌 CyRide Shift Notifier

Automatically monitors CyRide's open shift board and emails you when shifts that fit your availability open up.

**Features:**
- Checks for new open shifts every 10 minutes → instant email alert
- Daily digest at 8:30 PM with all matching open shifts for the next 7 days
- Web UI to set your availability windows (per-day, multiple time windows supported)
- Overnight shift support — bus days run 6:00 AM → 5:59 AM the next morning
- Emails via Zoho Mail SMTP

---

## 📁 Project Structure

```
cyride-notifier/
├── .env                  ← Your configuration (DO NOT commit this)
├── docker-compose.yml    ← Docker Compose setup
├── Dockerfile            ← Multi-stage build (frontend + backend)
├── backend/
│   ├── server.js         ← Express API + cron jobs
│   ├── shifts.js         ← Fetch & filter shift logic
│   ├── mailer.js         ← Zoho SMTP email sender
│   ├── db.js             ← SQLite (seen shifts + schedule storage)
│   └── package.json
└── frontend/
    ├── src/
    │   ├── App.jsx       ← Schedule UI + live preview
    │   └── index.css
    ├── index.html
    ├── vite.config.js
    └── package.json
```

---

## ⚙️ Step 1 — Configure Your .env

Open `.env` and fill in your values:

```env
# Where to send notifications
RECIPIENT_EMAIL=your@email.com

# Zoho sender account
ZOHO_FROM_EMAIL=noreply@yourdomain.com
ZOHO_PASSWORD=your_zoho_app_password

# Timing
DAILY_DIGEST_TIME=20:30
CHECK_INTERVAL_MINUTES=10
TZ=America/Chicago
```

---

## 📧 Step 2 — Set Up Zoho Mail Sender

You need a Zoho Mail account (free tier works). Here's how to configure it as an SMTP sender:

### Option A — Personal Zoho account (easiest)

1. **Create or log into** your Zoho Mail account at https://mail.zoho.com
2. Go to **Settings → Security → App Passwords** (if you have 2FA enabled)
   - Click **Generate New App Password**
   - Label it "CyRide Notifier"
   - Copy the generated password → use it as `ZOHO_PASSWORD` in `.env`
3. If 2FA is **disabled**, use your regular Zoho account password as `ZOHO_PASSWORD`
4. Set `ZOHO_FROM_EMAIL` to your Zoho email address

### Option B — Zoho with a custom domain (recommended)

1. Set up a domain in Zoho Mail (e.g. `yourdomain.com`)
2. Create an email like `noreply@yourdomain.com`
3. Follow the same App Password steps above
4. Set `ZOHO_FROM_EMAIL=noreply@yourdomain.com`

### SMTP Settings (pre-filled in .env)
| Setting | Value |
|---------|-------|
| Host | `smtp.zoho.com` |
| Port | `587` (STARTTLS) |
| Auth | Your Zoho email + password/app password |

> **Note:** If you're in Europe or India, Zoho may use `smtp.zoho.eu` or `smtp.zoho.in`. Update `ZOHO_SMTP_HOST` in `.env` accordingly.

### Test your SMTP credentials
After deploying, click **"Send Test Email"** in the web UI. Check your inbox (and spam folder).

---

## 🐳 Step 3 — Deploy with Docker

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) installed
- [Docker Compose](https://docs.docker.com/compose/install/) installed

### Deploy

```bash
# 1. Clone / copy this project to your server
cd cyride-notifier

# 2. Edit your .env file
nano .env

# 3. Build and start
docker compose up -d --build

# 4. Check logs
docker compose logs -f
```

The web UI will be available at **http://your-server-ip:3000**

### Stop / Restart

```bash
docker compose down          # Stop
docker compose up -d         # Start again (no rebuild)
docker compose up -d --build # Rebuild after code changes
```

### View Logs

```bash
docker compose logs -f cyride-notifier
```

---

## 🌐 Step 4 — Configure Your Schedule

1. Open the web UI at `http://localhost:3000` (or your server IP)
2. Enable each day you're available
3. Set your availability time windows
   - You can add **multiple windows per day** (e.g., 6am–10am and 2pm–6pm)
   - Times are in **12-hour format** in the UI
   - Days span **6:00 AM to 5:59 AM** the next morning
4. Click **Save Schedule**
5. Click **Preview Shifts** to see what shifts would match right now

---

## 🔄 Updating the App

To update after making code changes:

```bash
git pull  # if using git
docker compose up -d --build
```

The SQLite database (`cyride-data` Docker volume) is **preserved across rebuilds** — your schedule and seen-shift history are safe.

---

## 🛠 Customization

### Change the daily digest time
Edit `DAILY_DIGEST_TIME` in `.env` (24-hour format), then restart:
```bash
docker compose up -d --build
```

### Change the check interval
Edit `CHECK_INTERVAL_MINUTES` in `.env`. Minimum recommended: 5 minutes.

### Change the CyRide data source
Edit `CYRIDE_JSON_URL` in `.env` if the endpoint changes.

### Run on a different port
Change `WEB_PORT` in `.env`, then `docker compose up -d`.

---

## 🗂 Shift Priority Reference

The notifier automatically filters out internal/placeholder shifts:
- **Priority 0–2**: Regular open shifts → included
- **Priority 3–4**: Internal placeholders (Finals extras, etc.) → excluded

---

## 🆘 Troubleshooting

| Problem | Fix |
|---------|-----|
| No emails arriving | Check spam. Verify ZOHO credentials with "Send Test Email" button. |
| "Connection refused" on SMTP | Try `ZOHO_SMTP_HOST=smtp.zoho.eu` if you're in Europe |
| App not starting | Run `docker compose logs` to see errors |
| Shifts not matching | Check that your schedule is saved and windows cover the shift start+end times |
| Database issues | `docker compose down -v` to wipe the volume and start fresh (loses schedule!) |

---

## 📋 Environment Variable Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `RECIPIENT_EMAIL` | — | Where to send notifications |
| `ZOHO_FROM_EMAIL` | — | Zoho sender address |
| `ZOHO_PASSWORD` | — | Zoho password or app password |
| `ZOHO_SMTP_HOST` | `smtp.zoho.com` | SMTP server |
| `ZOHO_SMTP_PORT` | `587` | SMTP port |
| `CYRIDE_JSON_URL` | `https://cyride.net/sync/open.json` | Data source |
| `WEB_PORT` | `3000` | Web UI port |
| `CHECK_INTERVAL_MINUTES` | `10` | How often to check for new shifts |
| `DAILY_DIGEST_TIME` | `20:30` | Daily digest send time (24h) |
| `TZ` | `America/Chicago` | Your timezone |
| `SECRET_KEY` | — | Session secret (change this!) |
