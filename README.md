# Clinic Appointment Booking API

A clinic appointment booking application built with **Node.js, Express, TypeScript, PostgreSQL, and Prisma**. It provides REST API endpoints for managing appointment slots, creating bookings, retrieving booking records, and cancelling appointments.

A simple frontend allows users to view available appointment slots and book an appointment.

## Tech Stack

**Backend**
- Node.js
- Express 5
- TypeScript
- PostgreSQL
- Prisma ORM
- Zod

**Frontend**
- HTML
- CSS
- JavaScript

## Project Structure

```text
clinic-booking/
├── backend/
│   ├── prisma/
│   │   ├── migrations/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── generated/
│   │   ├── middleware/
│   │   ├── routes/
│   │   └── app.ts
│   ├── .env
│   └── package.json
│
└── frontend/
    ├── index.html
    ├── style.css
    ├── script.js
    └── config.js
```

## Getting Started

### Prerequisites

- Node.js 22 or later
- PostgreSQL
- npm

### 1. Clone the repository

```bash
git clone https://github.com/Fa-doon/clinic_booking.git
cd clinic-booking
```

### 2. Set up the backend

```bash
cd backend
npm install
```

Create a `.env` file in the `backend` directory:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/clinic_booking?schema=public"
API_KEY="your-api-key"
```

Replace the database connection details and API key with your own values.

### 3. Generate the Prisma client and run migrations

```bash
npx prisma generate
npx prisma migrate dev
```

### 4. Start the backend

```bash
npm run dev
```

The API will be available at:

```text
http://localhost:3000
```

### 5. Set up the frontend

Update `frontend/config.js`:

```javascript
const API_BASE_URL = "http://localhost:3000";
const API_KEY = "your-api-key";
```

## API Documentation

All API endpoints require an API key supplied through the `x-api-key` request header.

```http
x-api-key: your-api-key
```

### Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/reset` | Delete existing bookings and slots, then create new slots |
| GET | `/slots` | Retrieve appointment slots |
| POST | `/bookings` | Create an appointment booking |
| GET | `/bookings` | Retrieve bookings by email |
| GET | `/bookings/:id` | Retrieve a booking by ID |
| DELETE | `/bookings/:id` | Cancel a booking |

### Reset Slots

`POST /reset`

Replaces all existing slots and bookings with the supplied slots.

Example request:

```json
{
  "slots": [
    {
      "id": "slot-001",
      "provider": "Dr. Bash",
      "start": "2027-01-15T09:00:00.000Z",
      "end": "2027-01-15T09:30:00.000Z"
    }
  ]
}
```

This operation is transactional: if an operation fails, the database changes are rolled back.

**Note:** This endpoint is destructive and deletes all existing bookings and slots.

### Get Slots

`GET /slots`

Returns appointment slots ordered by earliest start time.

Optional query parameter:

- `provider` – filters slots by exact provider name.

Each slot includes an `available` field indicating whether it has an existing confirmed booking.

Example:

```http
GET /slots?provider=Dr.%20Bash
```

### Create Booking

`POST /bookings`

Creates a booking for an available appointment slot.

Example request:

```json
{
  "slot_id": "slot-001",
  "name": "Bella Prince",
  "email": "bella@example.com"
}
```

Optional header:

```http
Idempotency-Key: unique-request-key
```

Features:
- Validates required fields and email format.
- Normalizes email addresses to lowercase.
- Prevents bookings for nonexistent, started, or already-booked slots.
- Uses database-level constraints to prevent multiple confirmed bookings for the same slot.
- Supports idempotent requests to prevent duplicate bookings when requests are retried.
- Limits booking attempts to five per email within a rolling 60-second window.

### Get Bookings

`GET /bookings`

Retrieves bookings belonging to an email address.

Query parameters:

| Parameter | Description |
|---|---|
| `email` | Required email address |
| `limit` | Number of records per page (default: 10, maximum: 50) |
| `cursor` | Booking ID used for cursor-based pagination |

Example:

```http
GET /bookings?email=bella@example.com&limit=10
```

Results are ordered from oldest to newest.

The response includes `next_cursor` when more records are available.

### Get Booking by ID

`GET /bookings/:id`

Retrieves a booking using its unique ID.

Returns `404` if the booking does not exist.

### Cancel Booking

`DELETE /bookings/:id`

Cancels an existing confirmed booking.

- Returns `200` with the updated booking.
- Returns `404` if the booking does not exist.
- Returns `409` if the booking has already been cancelled.

Cancelled bookings are retained in the database, while their appointment slots become available again.

## Error Handling

The API uses appropriate HTTP status codes, including:

| Status | Meaning |
|---|---|
| 200 | Request successful |
| 201 | Booking created |
| 400 | Invalid request |
| 401 | Missing or invalid API key |
| 404 | Resource not found |
| 409 | Booking conflict |
| 422 | Idempotency key reused with a different request body |
| 429 | Booking attempt limit exceeded |
| 500 | Internal server error |

Rate-limited responses include a `Retry-After` header indicating how many seconds to wait before retrying.

## Security and Data Integrity

- API key middleware protects API routes.
- Zod validates booking request data.
- Prisma handles database queries.
- Database transactions maintain consistency during reset and rate-limit operations.
- A PostgreSQL partial unique index ensures that a slot cannot have more than one confirmed booking.
- Idempotency records allow previously completed requests to be replayed safely.

