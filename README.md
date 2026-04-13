# Alok LMS — Lead Management System

Lead management system for Alok India covering ~500k leads across eight
industry segments (pumps, valves, pneumatics, defense, stockholders, cnc,
forging, others). FastAPI + MySQL backend, React + Vite frontend, served
behind Nginx at `lms.alokindia.co.in`.

## Stack

- **Backend**: FastAPI, SQLAlchemy 2, PyMySQL, Pandas (for CSV import)
- **Database**: MySQL 8+ / 9.x (external to the compose stack)
- **Frontend**: React 18, Vite, React Router, TanStack Query, Tailwind, Axios
- **Proxy**: Nginx

## Project layout

```
alok_lms/
├── database/schema.sql        # MySQL schema
├── backend/                   # FastAPI app
│   ├── main.py
│   ├── database.py
│   ├── models.py
│   ├── requirements.txt
│   ├── .env.example
│   └── routers/
│       ├── leads.py
│       ├── campaigns.py
│       ├── events.py
│       ├── import_leads.py
│       └── analytics.py
├── frontend/                  # React + Vite app
│   ├── package.json
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── api/index.js
│       ├── components/...
│       └── pages/...
├── nginx/lms.conf
├── docker-compose.yml
└── README.md
```

## 1. Database

MySQL is expected to run outside the compose stack (the same MySQL 9.6
already installed on the host works). Load the schema:

```bash
mysql -u root -p < database/schema.sql
```

Create an application user and grant access:

```sql
CREATE USER 'alok_lms'@'%' IDENTIFIED BY 'change_me';
GRANT ALL PRIVILEGES ON alok_lms.* TO 'alok_lms'@'%';
FLUSH PRIVILEGES;
```

## 2. Backend (local dev)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env     # then edit credentials
uvicorn main:app --reload --port 8000
```

API will be available at `http://localhost:8000`, Swagger at `/docs`.

### Endpoints

- `GET  /leads` — list with filters: `q`, `status`, `industry_segment`, `assigned_sc`, `source`, `min_score`, `dnc`, `bounce`, `page`, `page_size`
- `GET  /leads/{id}` — single lead
- `PATCH /leads/{id}` — update fields (status, score, dnc_flag, bounce_flag, ...)
- `GET/POST/PATCH/DELETE /campaigns[/{id}]`
- `GET/POST /campaigns/{id}/steps`, `PATCH/DELETE /campaigns/{id}/steps/{step_id}`
- `POST /events` — log a touchpoint (`sent`, `opened`, `clicked`, `bounced`, ...)
- `POST /import` — CSV/XLSX upload (`multipart/form-data`, field `file`)
- `GET  /analytics/summary`, `GET /analytics/funnel`, `GET /analytics/segments`

## 3. Backend (Docker)

```bash
cp backend/.env.example backend/.env
docker compose up -d backend
```

The container connects to MySQL on the host via `host.docker.internal`.

## 4. Frontend

```bash
cd frontend
npm install
npm run dev    # → http://localhost:5173
```

Production build:

```bash
npm run build
# copy dist/ contents to the server path referenced in nginx/lms.conf
```

Override the API base URL by setting `VITE_API_URL` before `npm run build`.

## 5. Nginx

Install the site config on the server:

```bash
sudo cp nginx/lms.conf /etc/nginx/sites-available/lms.alokindia.co.in
sudo ln -s /etc/nginx/sites-available/lms.alokindia.co.in /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Then issue a certificate:

```bash
sudo certbot --nginx -d lms.alokindia.co.in
```

Uncomment the HTTPS block in `nginx/lms.conf` once certs are in place.

## CSV import format

The importer auto-maps these header names (case-insensitive):

| Field             | Accepted headers                                  |
|-------------------|---------------------------------------------------|
| company_name      | company, company_name, organization, firm        |
| contact_name      | contact, contact_name, name, person              |
| designation       | designation, title, role                          |
| email             | email, email_id, mail                             |
| phone             | phone, mobile, contact_no                         |
| alt_phone         | alt_phone, phone2, secondary_phone                |
| website           | website, url, site                                |
| city/state/pincode| city / state / pincode, pin, zip                  |
| industry_segment  | segment, industry, industry_segment               |
| source            | source                                            |
| assigned_sc       | sc, assigned_sc, coordinator                      |

Rows without a segment default to `others`. Rows without `company_name`
default to `Unknown` so that they are never silently dropped.

## Notes

- Bulk insert is chunked at 1000 rows per commit for import throughput.
- `leads` is indexed on `status`, `industry_segment`, `assigned_sc`,
  `score`, `source`, `dnc_flag`, `bounce_flag`, `next_action_at`,
  plus a composite `(industry_segment, status)` index for segment funnels.
- `campaign_events` is the audit log for all touchpoints; `lead_drip_state`
  tracks per-lead position in a drip campaign.
# Lead-Gen
