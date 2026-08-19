# Skillzage-auth

Authentication microservice for SkillzAge — Signup & Login with Node.js, Express, PostgreSQL and JWT.

## Folder structure

```
Skillzage-auth/
├── migrations/
│   ├── 001_create_users_table.sql   # SQL migration (up/down)
│   └── migrate.js                   # Migration runner (node migrations/migrate.js up|down)
├── src/
│   ├── config/
│   │   └── db.js                    # PostgreSQL connection pool
│   ├── controllers/
│   │   └── authController.js        # signup / login / me handlers
│   ├── middlewares/
│   │   ├── authMiddleware.js        # requireAuth (JWT verification)
│   │   ├── errorMiddleware.js       # 404 + centralized error handler
│   │   └── validateRequest.js       # express-validator result handler
│   ├── models/
│   │   └── userModel.js             # SQL queries for the users table
│   ├── routes/
│   │   └── authRoutes.js            # /api/auth/* routes
│   ├── utils/
│   │   ├── jwt.js                   # sign / verify helpers
│   │   └── validators.js            # signup/login validation rules
│   ├── app.js                       # Express app (middleware + routes)
│   └── server.js                    # Entry point
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Setup

1. Install dependencies:
   ```
   cd Skillzage-auth
   npm install
   ```

2. Create a PostgreSQL database:
   ```sql
   CREATE DATABASE skillzage_auth;
   ```

3. Copy `.env.example` to `.env` and fill in your real values (never commit `.env`):
   ```
   cp .env.example .env
   ```

4. Run migrations to create the `users` table:
   ```
   npm run migrate:up
   ```
   Roll back the last migration with `npm run migrate:down`.

5. Start the server:
   ```
   npm run dev    # with nodemon
   npm start      # plain node
   ```

Server runs on `http://localhost:5000` by default. Health check: `GET /health`.

## API

### POST /api/auth/signup
Body:
```json
{
  "fullName": "Jane Doe",
  "email": "jane@example.com",
  "password": "Passw0rd123",
  "confirmPassword": "Passw0rd123"
}
```
- `password` must be ≥8 chars with an uppercase letter, a lowercase letter, and a number.
- `confirmPassword` must match `password` (validated server-side before hashing).

Response `201`:
```json
{
  "success": true,
  "message": "Signup successful",
  "data": {
    "user": { "id": "...", "full_name": "Jane Doe", "email": "jane@example.com", "created_at": "...", "updated_at": "..." },
    "token": "<jwt>"
  }
}
```

### POST /api/auth/login
Body:
```json
{ "email": "jane@example.com", "password": "Passw0rd123" }
```
Response `200`: same shape as signup (`user` + `token`).

### GET /api/auth/me
Protected route. Send `Authorization: Bearer <token>`. Returns the current authenticated user account.

### Profile APIs
Profile CRUD lives in the dedicated profile service and is proxied through the gateway at `GET /api/profile`, `PUT /api/profile`, and `DELETE /api/profile`.

## Security notes
- Passwords are hashed with `bcryptjs` (never stored in plain text).
- JWT is signed with `JWT_SECRET` from `.env`; keep it secret and long/random in production.
- `password_hash` is never returned in API responses.
- Duplicate email signups are rejected (unique DB constraint + app-level check).
