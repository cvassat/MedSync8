# MedSync8

A Streamlit web application for medication synchronization management. MedSync8 helps users calculate how many medication units they need to align multiple medications to a single refill date.

## Features

- **Medication Sync Calculator** — Enter your current medications with remaining units and daily doses, add a new medication, and get a sync plan showing how many additional units you need for each medication to align on a single refill date.
- **User Authentication** — Sign up and log in via Supabase auth.
- **Premium Tier** — Free users can sync up to 2 medications. Premium users (via Stripe) get unlimited access.

## Setup

### Prerequisites

- Python 3.11+
- A [Supabase](https://supabase.com) project (for authentication)
- A [Stripe](https://stripe.com) payment link (optional, for premium tier)

### Installation

```bash
pip install -r requirements.txt
```

### Configuration

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

Required environment variables:

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_KEY` | Your Supabase anon/public API key |
| `STRIPE_PAYMENT_LINK` | (Optional) Stripe payment link for premium upgrades |

### Running

```bash
streamlit run med_sync_app_with_stripe.py
```

The app will be available at `http://localhost:8501`.

### Running with GitHub Codespaces

This project includes a dev container configuration. Open it in GitHub Codespaces and the app starts automatically on port 8501.

## Testing

```bash
python -m unittest discover tests -v
```

## How It Works

1. Log in or sign up.
2. Enter the number of existing medications you want to sync.
3. For each medication, enter its name, daily dose, and remaining units.
4. Enter the new medication's name and daily dose.
5. Pick a desired sync date.
6. Click **Calculate** to see how many additional units of each medication you need to reach the sync date.
