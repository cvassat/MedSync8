# CLAUDE.md — MedSync8

## Project Overview

MedSync8 is a **Medication Sync Calculator** — a Streamlit web application that helps users calculate how many units of each medication they need to refill so that all prescriptions align to a single sync date. It includes user authentication via Supabase and a Stripe-based premium upgrade flow.

## Tech Stack

- **Language**: Python 3.11
- **Web Framework**: [Streamlit](https://streamlit.io/)
- **Backend/Auth**: [Supabase](https://supabase.com/) (authentication + database client)
- **Payments**: Stripe (hosted checkout link for premium upgrade)
- **Dev Environment**: GitHub Codespaces / VS Code Dev Containers

## Repository Structure

```
MedSync8/
├── .devcontainer/
│   └── devcontainer.json        # Dev container config (Python 3.11, auto-starts Streamlit)
├── med_sync_app_with_stripe.py  # Entire application (single-file Streamlit app)
├── requirements.txt             # Python dependencies (streamlit, supabase)
├── README.md                    # Project readme
└── CLAUDE.md                    # This file
```

This is a **single-file application**. All logic — authentication, UI, and calculations — lives in `med_sync_app_with_stripe.py`.

## Running the Application

### Via Dev Container (recommended)

The dev container automatically installs dependencies and starts the app:

```bash
# Handled by devcontainer.json postAttachCommand:
streamlit run med_sync_app_with_stripe.py --server.enableCORS false --server.enableXsrfProtection false
```

The app is served on **port 8501**.

### Manually

```bash
pip install -r requirements.txt
streamlit run med_sync_app_with_stripe.py
```

### Environment Variables

| Variable | Purpose | Default |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL | Hardcoded fallback in source |
| `SUPABASE_KEY` | Supabase anon/public key | Hardcoded fallback in source |

## Architecture & Key Patterns

### Application Flow

1. **Authentication gate**: If no user in `st.session_state`, the login/signup screen is shown (`show_login()`).
2. **Main app**: Authenticated users see the Medication Sync Calculator.
3. **Free vs Premium**: Free users can sync up to 2 medications. Premium unlocks unlimited (tracked via `st.session_state["is_premium"]`).

### Caching

- **`@st.cache_resource`** on `get_supabase_client()` — the Supabase client is created once and reused across reruns.
- **`@st.cache_data`** on `calculate_sync_quantities()` — pure calculation results are cached by input arguments to avoid redundant recomputation.

### Sync Calculation Logic (`calculate_sync_quantities`)

For each existing medication:
- Compute `days_left = remaining // daily_dose`
- Compute `additional_days_needed = days_until_sync - days_left`
- Compute `units_needed = max(additional_days_needed * daily_dose, 0)`

For the new medication:
- `units_needed = daily_dose * days_until_sync`

The function accepts `current_meds` as a **tuple of tuples** (hashable for Streamlit caching) and returns `(results_list, error_string_or_None)`.

### State Management

All state is managed through `st.session_state`:
- `st.session_state['user']` — authenticated user object
- `st.session_state['is_premium']` — premium subscription flag

### Reactivity

The UI shows sync results **live as inputs change** — there is no "Calculate" button. Results appear automatically when all medication names are filled in.

## Code Conventions

- **Single-file architecture**: All code is in one Python file. Keep it that way unless the app grows significantly.
- **No tests currently**: There is no test suite. When adding tests, use `pytest` and consider extracting `calculate_sync_quantities` for unit testing.
- **No linter/formatter configured**: No `.flake8`, `pyproject.toml`, or similar config exists. When writing Python, follow PEP 8 style.
- **Streamlit idioms**: Use `st.cache_resource` for expensive singleton objects, `st.cache_data` for pure functions, and `st.session_state` for cross-rerun state.
- **Error handling**: Wrap Supabase/external calls in try/except and display errors via `st.error()`.

## Dependencies

From `requirements.txt`:
- `streamlit` — web framework
- `supabase` — Python client for Supabase (auth, database)

## Development Guidelines

1. **Keep it simple**: This is a focused, single-file app. Avoid over-engineering.
2. **Preserve caching**: Any new calculation functions that are pure should use `@st.cache_data`. Resource singletons should use `@st.cache_resource`.
3. **Environment variables**: Never hardcode new secrets. Use `os.environ.get()` with sensible defaults.
4. **Streamlit reruns**: Remember that Streamlit re-executes the entire script on every interaction. Design accordingly — avoid side effects outside of cached functions and event handlers.
5. **Premium gating**: Any feature-limited functionality should check `st.session_state["is_premium"]` before allowing access.
6. **Port 8501**: The app runs on Streamlit's default port. The dev container forwards this port automatically.

## Common Tasks

### Adding a new medication field
Add inputs inside the `for i in range(int(num_meds))` loop in the main app section and update the `meds` list dict structure. Update `calculate_sync_quantities` if the calculation changes.

### Modifying the sync calculation
Edit `calculate_sync_quantities()`. Remember it must remain a **pure function** (no side effects) to work with `@st.cache_data`. Input args must be hashable.

### Adding a new page/section
Use Streamlit's layout primitives (`st.tabs`, `st.columns`, `st.expander`, `st.sidebar`). Keep all code in the single file unless a refactor is warranted.
