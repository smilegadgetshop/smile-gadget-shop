# SMILE GADGET SHOP — Full-stack website

This is a deployable Node.js + SQLite online shop starter. It includes:
- Public product catalogue in UGX
- Shopping cart and order submission
- Orders stored in a central SQLite database
- WhatsApp handoff to 0704546118
- Public order-reference tracking
- Admin login, product CRUD, stock management and order-status updates
- No customer registration and no online payment processing

## Run locally
1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env`.
3. Change `SESSION_SECRET` and `ADMIN_PASSWORD` to long, private values.
4. In this folder run:
   ```bash
   npm install
   npm start
   ```
5. Open `http://localhost:3000`.

Default local admin username is `admin`; set a strong password in `.env` before using this online. The server creates the admin account the first time it starts. If you later change the environment password, it does not overwrite an existing admin password hash; use a database/admin password reset procedure.

## Hosting / production
Deploy this folder to a Node.js host that supports persistent disk storage. SQLite needs a persistent volume for `data/shop.sqlite`; uploaded product images are stored in `public/uploads`, which also needs persistent storage. Do not deploy to an ephemeral serverless filesystem. Set all `.env` variables in the hosting provider's environment settings:
- `NODE_ENV=production`
- `SESSION_SECRET` = long random secret
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD` = unique strong password
- `WHATSAPP_NUMBER=256704546118`

Enable HTTPS on the hosting provider. Back up `data/shop.sqlite` and `public/uploads` regularly. For multiple server instances or high traffic, migrate SQLite to PostgreSQL and use a shared session store.

## Important
This is a functional starter, not a hosted/live shop yet. It has not been connected to a domain or hosting account. No card/mobile-money payments are taken. The shop confirms payment and delivery arrangements directly with customers. Product entries are sample listings and must be replaced with real products, accurate prices, stock and images before launch.
